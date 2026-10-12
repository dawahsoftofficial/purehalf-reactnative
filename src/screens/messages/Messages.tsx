import { useFocusEffect } from '@react-navigation/native';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  Dimensions,
  Image,
  StyleSheet,
  Text as ReactText,
  View,
  VirtualizedList,
} from 'react-native';
import Ripple from 'react-native-material-ripple';
import AntDesign from 'react-native-vector-icons/AntDesign';
import Ionicons from 'react-native-vector-icons/Ionicons';

import ChatCreditsBadge from '@/components/badges/chat-credits-badge';
import pusherService from '@/services/pusher';

import {
  AnimatedLoader,
  Container,
  Header,
  ProfilePhotoPlaceholder,
  PurchaseSuccessModal,
  Text,
} from '../../components';
import { hp, Typography, wp } from '../../global';
import { CheckRtl, LanguageKeys } from '../../languages';
import { Colors, Fonts, Images } from '../../res';
import {
  capitalizeName,
  flashErrorMessage,
  formatDate,
  StorageManager,
  useGlobalContext,
} from '../../services';
import messageServices from '../../services/api/message-services';
import type {
  Conversation,
  ConversationUpdatedEventData,
  NewConversationCreatedEventData,
} from '../../services/api/types/message-types';
import { presentChatCreditsPaywall } from '../../services/paywall-service';
import NotificationPermissionBanner from './components/notification-permission-banner';
import {
  appendInboxPage,
  hasMoreInboxPages,
  INBOX_PAGE_SIZE,
  mergeFirstInboxPage,
} from './inboxPaging';
import { isLastMessageReadByParticipant } from './SingleChat.utils';

type MessagesProps = {
  navigation: {
    navigate: (screen: string, params?: unknown) => void;
    dispatch: (action: unknown) => void;
  };
};

/** Minimum gap between foreground / reconnect inbox refetches. */
const CATCH_UP_THROTTLE_MS = 3000;

const isSupportConversation = (conversation: Conversation) =>
  conversation.type === 'support' ||
  conversation.participants?.some(
    (participant) => participant.type === 'Admin'
  );

const Messages = (props: MessagesProps) => {
  const { t } = useTranslation();
  const Rtl = CheckRtl();
  const [quote, setQuote] = useState('');
  const [chatCreditsSuccessModalVisible, setChatCreditsSuccessModalVisible] =
    useState<boolean>(false);
  const [isChatCreditsLoading, setIsChatCreditsLoading] =
    useState<boolean>(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const { setData, storageKeys } = StorageManager;
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  // The list endpoint has no total: a full page means "maybe another page".
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const isLoadingMoreRef = useRef<boolean>(false);
  const hasMorePagesRef = useRef<boolean>(false);
  const nextPageRef = useRef<number>(2);
  const { currentUser, updateCurrentUser, language } = useGlobalContext();

  const pinnedConversations = useMemo(() => {
    const supportConversations: Conversation[] = [];
    const otherConversations: Conversation[] = [];

    conversations.forEach((conversation) => {
      if (isSupportConversation(conversation)) {
        supportConversations.push(conversation);
      } else {
        otherConversations.push(conversation);
      }
    });

    return [...supportConversations, ...otherConversations];
  }, [conversations]);

  // Loads (or refreshes) the newest page. Pages already loaded below it stay.
  const fetchConversations = useCallback(async () => {
    try {
      const data = await messageServices.getConversationsList({
        page: 1,
        per_page: INBOX_PAGE_SIZE,
      });
      setConversations((previous) =>
        mergeFirstInboxPage(previous, data, INBOX_PAGE_SIZE)
      );
      if (!hasMoreInboxPages(data.length, INBOX_PAGE_SIZE)) {
        // The whole inbox fits one page: nothing to page through.
        hasMorePagesRef.current = false;
        nextPageRef.current = 2;
      } else if (nextPageRef.current <= 2) {
        // Only the first page is loaded so far: more may follow.
        hasMorePagesRef.current = true;
      }
      setIsLoading(false);
    } catch (error: unknown) {
      console.error('[Messages.fetchConversations] Error:', error);
      setIsLoading(false);
    }
  }, []);

  // Next older page, requested when the list is scrolled near its end.
  const loadMoreConversations = useCallback(async () => {
    if (!hasMorePagesRef.current || isLoadingMoreRef.current) return;

    const page = nextPageRef.current;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      const data = await messageServices.getConversationsList({
        page,
        per_page: INBOX_PAGE_SIZE,
      });
      setConversations((previous) => appendInboxPage(previous, data));
      nextPageRef.current = page + 1;
      hasMorePagesRef.current = hasMoreInboxPages(data.length, INBOX_PAGE_SIZE);
    } catch (error: unknown) {
      // Stays loadable: scrolling to the end again retries the same page.
      console.error('[Messages.loadMoreConversations] Error:', error);
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, []);

  // Handle new conversation created event
  const handleNewConversationCreated = useCallback(
    (data: NewConversationCreatedEventData) => {
      const conversationData = data.conversation;

      console.log('[Messages] New conversation created:', conversationData.id);

      // Check if conversation has participants, if not, fetch full list
      if (
        !conversationData.participants ||
        conversationData.participants.length === 0
      ) {
        console.log(
          '[Messages] New conversation missing participants, fetching conversations'
        );
        fetchConversations();
        return;
      }

      setConversations((prevConversations) => {
        // Check if conversation already exists
        const exists = prevConversations.some(
          (c) => c.id === conversationData.id
        );

        if (exists) {
          console.log(
            '[Messages] Conversation already exists, updating:',
            conversationData.id
          );
          return prevConversations
            .map((c) => (c.id === conversationData.id ? conversationData : c))
            .sort((a, b) => {
              // Sort by last message time (most recent first)
              const timeA = new Date(a.last_message_at).getTime();
              const timeB = new Date(b.last_message_at).getTime();
              return timeB - timeA;
            });
        }

        // Add new conversation at the top
        console.log(
          '[Messages] Adding new conversation to list:',
          conversationData.id
        );
        return [conversationData, ...prevConversations].sort((a, b) => {
          // Sort by last message time (most recent first)
          const timeA = new Date(a.last_message_at).getTime();
          const timeB = new Date(b.last_message_at).getTime();
          return timeB - timeA;
        });
      });
    },
    [fetchConversations]
  );

  // Handle conversation updated event
  const handleConversationUpdated = useCallback(
    (data: ConversationUpdatedEventData) => {
      const conversationData = data.conversation;

      setConversations((prevConversations) => {
        // Check if conversation already exists
        const exists = prevConversations.some(
          (c) => c.id === conversationData.id
        );

        if (exists) {
          // Update existing conversation
          console.log(
            '[Messages] Updating existing conversation:',
            conversationData.id,
            'update_type:',
            data.update_type
          );
          return prevConversations
            .map((c) => (c.id === conversationData.id ? conversationData : c))
            .sort((a, b) => {
              // Sort by last message time (most recent first)
              const timeA = new Date(a.last_message_at).getTime();
              const timeB = new Date(b.last_message_at).getTime();
              return timeB - timeA;
            });
        }

        // Add new conversation at the top
        console.log('[Messages] Adding new conversation:', conversationData.id);
        return [conversationData, ...prevConversations].sort((a, b) => {
          // Sort by last message time (most recent first)
          const timeA = new Date(a.last_message_at).getTime();
          const timeB = new Date(b.last_message_at).getTime();
          return timeB - timeA;
        });
      });
    },
    []
  );

  // Extract userId using useMemo to avoid unnecessary re-renders
  const userId = useMemo(() => {
    return currentUser?.id;
  }, [currentUser?.id]);

  // Inbox events. Unread counters are NOT handled here: the app-wide
  // useUserCountersChannel owns them (and the inbox channel never carries
  // them).
  const handleInboxEvent = useCallback(
    (event: { eventName: string; data?: unknown }) => {
      try {
        const rawData =
          typeof event.data === 'string' ? JSON.parse(event.data) : event.data;

        // Extract event type from Laravel event class name or from data.event
        let eventType = event.eventName;
        if (eventType.includes('\\')) {
          // Laravel event class name format: App\Events\Conversation\MessageSent
          eventType = eventType.split('\\').pop() || eventType;
        }

        // If data has an 'event' field, use that as the event type
        if (rawData?.event) {
          eventType = rawData.event;
        }

        if (eventType === 'NewConversationCreated') {
          handleNewConversationCreated(
            rawData as NewConversationCreatedEventData
          );
        } else if (eventType === 'ConversationUpdated') {
          handleConversationUpdated(rawData as ConversationUpdatedEventData);
        }
      } catch (error) {
        console.error('[Messages] Error handling Pusher event:', error);
      }
    },
    [handleNewConversationCreated, handleConversationUpdated]
  );

  // Subscribe to the user inbox channel: private-user.inbox.{userId}.
  // The subscription is requested even before Pusher is connected (it is
  // fulfilled when it connects / reconnects), and the exact subscriber is
  // removed on cleanup so nothing leaks across unmounts or user changes.
  useEffect(() => {
    if (!userId) return undefined;

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    pusherService
      .subscribeToChannel(`private-user.inbox.${userId}`, handleInboxEvent)
      .then((remove) => {
        if (cancelled) {
          remove();
        } else {
          unsubscribe = remove;
        }
      })
      .catch((error) => {
        console.error('[Messages] Error setting up Pusher:', error);
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
      unsubscribe = null;
    };
  }, [userId, handleInboxEvent]);

  // Catch up on anything missed while backgrounded or offline. Coming back to
  // the foreground and the Pusher reconnect that follows it would otherwise
  // fetch twice, so background-triggered refetches are throttled.
  useEffect(() => {
    let lastCatchUpAt = 0;
    const catchUp = () => {
      const now = Date.now();
      if (now - lastCatchUpAt < CATCH_UP_THROTTLE_MS) return;
      lastCatchUpAt = now;
      void fetchConversations();
    };
    const appStateSubscription = AppState.addEventListener(
      'change',
      (state: AppStateStatus) => {
        if (state === 'active') catchUp();
      }
    );
    const removeConnectionListener = pusherService.addConnectionListener(
      (currentState, previousState) => {
        if (currentState === 'CONNECTED' && previousState !== 'CONNECTED') {
          catchUp();
        }
      }
    );
    return () => {
      appStateSubscription.remove();
      removeConnectionListener();
    };
  }, [fetchConversations]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetchConversations();
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchConversations]);

  useFocusEffect(
    React.useCallback(() => {
      // Fetch conversations on focus
      fetchConversations();

      const quotes = [
        t('adviceOneText'),
        t('adviceTwoText'),
        t('adviceThreeText'),
        t('adviceFourText'),
        t('adviceFiveText'),
        t('adviceSixText'),
        t('adviceSevenText'),
        t('adviceEightText'),
        t('adviceNineText'),
        t('adviceTenText'),
        t('adviceElevenText'),
        t('adviceTwelveText'),
        t('adviceThirteenText'),
      ];
      setQuote([...quotes].sort(() => Math.random() - 0.5)[0]);
    }, [fetchConversations, t])
  );

  const onChatCreditsPress = async () => {
    setIsChatCreditsLoading(true);
    try {
      const result = await presentChatCreditsPaywall();
      if (result.success) {
        setChatCreditsSuccessModalVisible(true);
      } else if (
        result.error &&
        result.error !== 'Purchase cancelled by user'
      ) {
        flashErrorMessage(result.error || 'Failed to purchase chat bundle');
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to purchase chat bundle';
      flashErrorMessage(errorMessage);
    } finally {
      setIsChatCreditsLoading(false);
    }
  };

  const onChatCreditsSuccessCollect = () => {
    setChatCreditsSuccessModalVisible(false);
  };

  const onItemPress = (item: Conversation) => {
    const currentUserId = currentUser?.id;
    const currentUserIdStr =
      currentUserId != null ? String(currentUserId) : null;

    const otherParticipant = item?.participants?.find(
      (p) => String(p.id) !== currentUserIdStr
    );

    props.navigation.navigate('SingleChat', {
      conversationData: item,
      otherUserData: otherParticipant,
      from: 'messages',
    });
  };

  const renderConversations = ({ item }: { item: Conversation }) => {
    const currentUserId = currentUser?.id;
    const currentUserIdStr =
      currentUserId != null ? String(currentUserId) : null;

    const otherParticipant = item?.participants?.find(
      (p) => String(p.id) !== currentUserIdStr
    );

    if (!otherParticipant) {
      return null;
    }

    const formattedDate = formatDate(item.last_message_at);
    // Get unread count from current user's participant object
    const currentUserParticipant = item?.participants?.find(
      (p) => String(p.id) === currentUserIdStr
    );
    const unReadCount = currentUserParticipant?.unread_count || 0;
    // Hide the avatar whenever the thread is blocked in EITHER direction:
    // the other participant's row blocked => I blocked them; my own row
    // blocked => they blocked me. (Previously only the former was checked and
    // it was mislabeled `isBlockedYou`.)
    const isBlocked =
      !!otherParticipant?.is_blocked || !!currentUserParticipant?.is_blocked;

    // Pure Half Customer Support thread — same detection as SingleChatHeader.
    const isSupport = isSupportConversation(item);

    const previewText =
      item.last_message_detail?.type === 'audio'
        ? t(LanguageKeys.voiceMessage)
        : item.last_message;

    const hasLastMessage = !!previewText && previewText.trim() !== '';

    const isLastMessageSeen = isLastMessageReadByParticipant(
      item.last_message_detail,
      otherParticipant,
      currentUserId
    );

    const isUnread = unReadCount > 0;
    return (
      <Ripple
        style={[
          Styles.itemContainer,
          { flexDirection: Rtl ? 'row-reverse' : 'row' },
        ]}
        onPress={() => onItemPress(item)}
        rippleColor={Colors.primary}
      >
        <View style={Styles.profilePictureCon}>
          {isSupport ? (
            <Image
              source={Images.logoWithoutTextBlack}
              resizeMode="contain"
              style={Styles.supportLogo}
            />
          ) : otherParticipant?.image && !isBlocked ? (
            <Image
              source={{ uri: otherParticipant.image }}
              resizeMode="cover"
              style={Styles.image}
            />
          ) : (
            <ProfilePhotoPlaceholder
              name={otherParticipant?.name}
              size={AVATAR / 2}
              centeredInitials
            />
          )}
        </View>
        <View
          style={[
            Styles.middleCon,
            { alignItems: Rtl ? 'flex-end' : 'flex-start' },
          ]}
        >
          <Text
            variant="display"
            style={Styles.itemHeading}
            numberOfLines={1}
            translate={false}
          >
            {capitalizeName(otherParticipant.name)}
          </Text>
          {hasLastMessage && (
            <Text
              style={[Styles.itemMessage, isUnread && Styles.itemMessageUnread]}
              numberOfLines={1}
              translate={false}
            >
              {previewText}
            </Text>
          )}
        </View>
        <View style={Styles.rightCon}>
          {hasLastMessage && (
            <ReactText style={Styles.timeTxt}>{formattedDate}</ReactText>
          )}
          {isUnread ? (
            <View style={Styles.unReadCountCon}>
              <ReactText style={Styles.unReadCount}>{unReadCount}</ReactText>
            </View>
          ) : isLastMessageSeen ? (
            <Ionicons
              name="checkmark-done"
              size={wp(4)}
              color={Colors.primaryMid}
              style={Styles.seenTick}
            />
          ) : null}
        </View>
      </Ripple>
    );
  };

  const renderEmptyList = () => {
    const quoteMain = quote?.split('|')[0];
    const quoteAttr = quote?.split('|')[1];
    return (
      <View style={Styles.textContainer}>
        <View style={Styles.emptyIconCircle}>
          <Ionicons
            name="chatbubbles-outline"
            size={wp(11)}
            color={Colors.primaryLite}
          />
        </View>
        <Text variant="display" style={Styles.emptyTitle}>
          {LanguageKeys.noConversationsYet}
        </Text>
        {quoteMain ? <Text style={Styles.quoteText}>{quoteMain}</Text> : null}
        {quoteAttr ? (
          <Text style={[Styles.quoteText, Styles.quoteAttr]}>{quoteAttr}</Text>
        ) : null}
        <Ripple
          style={[
            Styles.emptyCtaBtn,
            { flexDirection: Rtl ? 'row-reverse' : 'row' },
          ]}
          onPress={onFindMatchPress}
          rippleColor={Colors.color2}
        >
          <Ionicons name="search" size={wp(4.4)} color={Colors.color2} />
          <Text style={Styles.emptyCtaTxt}>{LanguageKeys.discoverMatches}</Text>
        </Ripple>
      </View>
    );
  };

  const keyExtractor = (item: Conversation) => item.id.toString();

  const onFindMatchPress = () => {
    props.navigation.navigate('SearchProfiles');
    // props.navigation.navigate('SingleChat', {
    //   conversationData: null,
    //   otherUserData: { id: 3640 },
    //   from: 'messages',
    // });
  };

  return (
    <Container>
      <Header
        navigation={props.navigation}
        title={LanguageKeys.messages}
        titleVariant="display"
        customConponent={() => (
          <View
            style={[
              Styles.headerRightContainer,
              { flexDirection: Rtl ? 'row-reverse' : 'row' },
            ]}
          >
            <ChatCreditsBadge
              onPress={onChatCreditsPress}
              disabled={isChatCreditsLoading}
              credits={currentUser?.chat_credits || 0}
            />
          </View>
        )}
      />
      <NotificationPermissionBanner />
      <PurchaseSuccessModal
        visible={chatCreditsSuccessModalVisible}
        onCollect={onChatCreditsSuccessCollect}
        title="Chats added!"
        message="Your chat bundle is ready."
      />
      <View style={Styles.contentContainer}>
        {isLoading ? (
          <AnimatedLoader
            text={LanguageKeys.loading}
            visible={true}
            style={{ height: hp(60) }}
          />
        ) : (
          <VirtualizedList
            initialNumToRender={10}
            windowSize={15}
            data={pinnedConversations}
            getItemCount={(data) => data.length}
            getItem={(data, index) => data[index]}
            renderItem={renderConversations}
            ListEmptyComponent={renderEmptyList}
            keyExtractor={keyExtractor}
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            onEndReached={loadMoreConversations}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              isLoadingMore ? (
                <ActivityIndicator
                  color={Colors.primary}
                  size={'small'}
                  style={{ marginVertical: wp(4) }}
                />
              ) : null
            }
            contentContainerStyle={
              pinnedConversations.length ? undefined : Styles.emptyListContent
            }
          />
        )}
      </View>
      <Ripple style={Styles.btnPlus} onPress={onFindMatchPress}>
        <AntDesign name="plus" size={wp(8)} color={Colors.color2} />
      </Ripple>
    </Container>
  );
};

export default Messages;

const { width } = Dimensions.get('window');
const AVATAR = width * 0.135;

const Styles = StyleSheet.create({
  contentContainer: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  // keeps the empty state centred while the list is still pull-to-refreshable
  emptyListContent: {
    flexGrow: 1,
  },
  // conversation row
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.hairline,
    paddingHorizontal: wp(4),
    paddingVertical: hp(1.5),
  },
  profilePictureCon: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.lavender,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  supportLogo: {
    width: '76%',
    height: '76%',
  },
  middleCon: {
    flex: 1,
    marginHorizontal: wp(3),
    justifyContent: 'center',
  },
  itemHeading: {
    color: Colors.ink,
    fontSize: Typography.small3,
    includeFontPadding: false,
  },
  itemMessage: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small,
    includeFontPadding: false,
    marginTop: hp(0.3),
  },
  itemMessageUnread: {
    color: Colors.ink,
    fontFamily: Fonts.APPFONT_M,
  },
  rightCon: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: wp(13),
  },
  timeTxt: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.tiny2,
    includeFontPadding: false,
  },
  seenTick: {
    marginTop: hp(0.6),
  },
  unReadCountCon: {
    marginTop: hp(0.6),
    minWidth: wp(5),
    height: wp(5),
    borderRadius: wp(2.5),
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: wp(1.4),
  },
  unReadCount: {
    color: Colors.color2,
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.tiny2,
    includeFontPadding: false,
  },
  // header right
  headerRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  gaurdianHeader: {
    paddingHorizontal: wp(1),
  },
  menuBtn: {
    width: wp(8),
    height: hp(3.5),
    resizeMode: 'contain',
  },
  menuOptionsContainer: {
    borderRadius: 14,
    paddingVertical: hp(0.6),
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.hairline,
    marginTop: hp(1),
  },
  destructiveOption: {
    backgroundColor: Colors.surface,
  },
  // empty state
  textContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: wp(8),
  },
  emptyIconCircle: {
    width: wp(22),
    height: wp(22),
    borderRadius: wp(11),
    backgroundColor: Colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp(2.2),
  },
  emptyTitle: {
    color: Colors.ink,
    fontSize: Typography.medium,
    alignSelf: 'center',
    textAlign: 'center',
    marginBottom: hp(1.4),
    includeFontPadding: false,
  },
  quoteText: {
    alignSelf: 'stretch',
    textAlign: 'center',
    fontSize: Typography.small1,
    fontFamily: Fonts.APPFONT_R,
    color: Colors.muted,
    fontStyle: 'italic',
    lineHeight: wp(5.6),
  },
  quoteAttr: {
    fontFamily: Fonts.APPFONT_SB,
    color: Colors.ink,
    fontStyle: 'normal',
    marginTop: hp(0.8),
  },
  emptyCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: wp(2),
    backgroundColor: Colors.primary,
    borderRadius: 999,
    paddingVertical: hp(1.3),
    paddingHorizontal: wp(7),
    marginTop: hp(3.2),
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  emptyCtaTxt: {
    color: Colors.color2,
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small2,
    alignSelf: 'center',
    includeFontPadding: false,
  },
  // FAB
  btnPlus: {
    position: 'absolute',
    bottom: hp(2.5),
    right: wp(6),
    backgroundColor: Colors.primary,
    borderRadius: wp(8),
    width: wp(15),
    height: wp(15),
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 1000,
  },
});
