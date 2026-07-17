import {
  type NavigationProp,
  type ParamListBase,
  useFocusEffect,
} from '@react-navigation/native';
import moment from 'moment';
import type { ReactElement } from 'react';
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
  Dimensions,
  Image,
  Modal,
  StatusBar,
  type StyleProp,
  StyleSheet,
  Text as ReactText,
  TextInput,
  type TextStyle,
  View,
} from 'react-native';
import CircularProgress from 'react-native-circular-progress-indicator';
import Ripple from 'react-native-material-ripple';
import AntDesign from 'react-native-vector-icons/AntDesign';
import Entypo from 'react-native-vector-icons/Entypo';
import Ionicons from 'react-native-vector-icons/Ionicons';

import {
  Button,
  CheckMembershipStatus,
  LinearGradient,
  ProfileBadges,
  ProfilePhotoPlaceholder,
  TesterProfileTools,
  Text,
} from '../../components';
import ChatCreditsBadge from '../../components/badges/chat-credits-badge';
import { hp, Typography, wp } from '../../global';
import Constants from '../../global/Constants';
import { CheckRtl, LanguageKeys } from '../../languages';
import { Colors, Fonts } from '../../res';
import {
  ApiServices,
  capitalizeName,
  flashErrorMessage,
  flashSuccessMessage,
  isIOS,
  StorageManager,
  useGlobalContext,
} from '../../services';
import messageServices from '../../services/api/message-services';
import type { Conversation as ApiConversation } from '../../services/api/types/message-types';
import { presentChatCreditsPaywall } from '../../services/paywall-service';
import { useSettingsStore } from '../../stores';
import GiftBadge from './components/gift-badge';
import GiftClaimModal from './components/gift-claim-modal';
import PrivacyQuickSettingsModal from './components/privacy-quick-settings-modal';
import ProfileGiftInfoModal, {
  type ProfileGiftInfoVariant,
} from './components/profile-gift-info-modal';
import { buildUpdatedUserAfterGiftClaim } from './gift-claim-outcome';

const { width, height } = Dimensions.get('window');

type FcmToken = { fcm_token?: string | null };

type UserMedia = {
  primary_image?: string | null;
  cover_image?: string | null;
  public_gallery?: string[] | null;
  private_photo_count?: number | null;
  youtube_url?: string | null;
  un_blur_primary_image?: string | null;
  intro_video?: string | null;
  intro_video_status?: 'pending' | 'approved' | 'rejected' | null;
  intro_video_rejection_reason?: string | null;
  intro_voice?: string | null;
  intro_voice_status?: 'pending' | 'approved' | 'rejected' | null;
  intro_voice_rejection_reason?: string | null;
};

type User = {
  id?: number;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  age?: number;
  city?: string;
  country?: string;
  last_online_at?: string;
  liked?: boolean;
  membership_expiry?: string | null;
  media?: UserMedia | null;
  primary_image_to_show?: string;
  match_percentage?: number | null;
  fcm_token?: FcmToken[];
  gender?: string;
  is_blur?: boolean;
  blur_allowed_you?: boolean;
  block_by_you?: number;
  blocked?: number;
};

type Conversation = {
  convDetails: {
    id?: string;
  };
  messages: unknown[];
};

type HeaderProps = {
  navigation: NavigationProp<ParamListBase>;
  userData: User;
  onLikeUnlikePress?: (liked: boolean) => void;
  onBlockPress?: () => void;
  fromUserProfile?: boolean;
  isBlockedYou?: boolean;
  profileStrength?: number;
  tagline?: string;
  taglineEditing?: boolean;
  taglineInput?: string;
  onTaglineChange?: (text: string) => void;
  onTaglineSubmit?: () => void;
  onTaglineEditPress?: () => void;
  onTaglineCancel?: () => void;
};

type NameRowProps = {
  firstName?: string;
  lastName?: string;
  showStatus: boolean;
  statusColor: string;
  statusLabel?: string;
  rtl: boolean;
};

const NameRow = React.memo(function NameRow({
  firstName,
  lastName,
  showStatus,
  statusColor,
  statusLabel,
  rtl,
}: NameRowProps): ReactElement {
  return (
    <View
      style={{
        ...Styles.nameCon,
        flexDirection: 'column',
        alignItems: rtl ? 'flex-end' : 'flex-start',
      }}
    >
      <ReactText
        style={[Styles.name, !rtl ? { fontFamily: Fonts.DISPLAY } : null]}
        numberOfLines={1}
      >
        {capitalizeName([firstName, lastName].filter(Boolean).join(' '))}
      </ReactText>
      {showStatus && (
        <View
          style={{
            flexDirection: rtl ? 'row-reverse' : 'row',
            alignItems: 'center',
            marginTop: hp(0.6),
          }}
        >
          <View
            style={{
              ...Styles.onlineStatus,
              backgroundColor: statusColor,
            }}
          />
          {statusLabel ? (
            <ReactText style={Styles.cardLastSeenTxt} numberOfLines={1}>
              {statusLabel}
            </ReactText>
          ) : null}
        </View>
      )}
    </View>
  );
});

type MetaLineProps = {
  age?: number;
  city?: string;
  country?: string;
  style?: StyleProp<TextStyle>;
};

const MetaLine = React.memo(function MetaLine({
  age,
  city,
  country,
  style,
}: MetaLineProps): ReactElement {
  const location = [city, country].filter(Boolean).join(', ');
  const parts = [typeof age === 'number' ? `${age}` : '', location].filter(
    Boolean
  );
  return (
    <ReactText style={[Styles.location, style]} numberOfLines={2}>
      {parts.join('  ·  ')}
    </ReactText>
  );
});

type MatchScoreBadgeProps = {
  score?: number | null;
};

const MatchScoreBadge = React.memo(function MatchScoreBadge({
  score,
}: MatchScoreBadgeProps): ReactElement | null {
  if (score === null || score === undefined) {
    return null;
  }

  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
  const activeColor =
    normalizedScore === 0 ? Colors.primaryMid : Colors.primary;

  return (
    <View style={Styles.matchScoreWrap}>
      <CircularProgress
        key={`match-score-${normalizedScore}`}
        initialValue={0}
        value={normalizedScore}
        maxValue={100}
        radius={wp(7)}
        duration={900}
        activeStrokeWidth={wp(1)}
        inActiveStrokeWidth={wp(1)}
        activeStrokeColor={activeColor}
        inActiveStrokeColor={Colors.lavender}
        progressValueColor={Colors.primary}
        progressValueStyle={Styles.matchScoreValue}
        valueSuffix="%"
        valueSuffixStyle={Styles.matchScoreSuffix}
        showProgressValue
      />
      <ReactText style={Styles.matchScoreLabel} numberOfLines={1}>
        Common
      </ReactText>
    </View>
  );
});

type ActionButtonsProps = {
  rtl: boolean;
  onMessagePress: () => void;
  onLikePress: () => void;
  messageButtonLoader: boolean;
  liked: boolean;
};

const ActionButtons = React.memo(function ActionButtons({
  rtl,
  onMessagePress,
  onLikePress,
  messageButtonLoader,
  liked,
}: ActionButtonsProps): ReactElement {
  return (
    <View
      style={{
        ...Styles.actionBtnCon,
        flexDirection: rtl ? 'row-reverse' : 'row',
      }}
    >
      <Ripple
        style={[
          Styles.actionPill,
          Styles.messagePill,
          { flexDirection: rtl ? 'row-reverse' : 'row' },
        ]}
        onPress={onMessagePress}
        disabled={messageButtonLoader}
        rippleColor={Colors.color2}
      >
        {messageButtonLoader ? (
          <ActivityIndicator color={Colors.color2} size={'small'} />
        ) : (
          <>
            <Ionicons
              name="chatbubble-ellipses"
              color={Colors.color2}
              size={wp(4.8)}
            />
            <Text
              style={[Styles.actionPillTxt, Styles.messagePillTxt]}
              numberOfLines={1}
            >
              {LanguageKeys.message}
            </Text>
          </>
        )}
      </Ripple>

      <Ripple
        style={[
          Styles.actionPill,
          Styles.likePill,
          { flexDirection: rtl ? 'row-reverse' : 'row' },
        ]}
        onPress={onLikePress}
        rippleColor={Colors.primaryLite}
      >
        <Ionicons
          name={liked ? 'heart' : 'heart-outline'}
          color={Colors.primary}
          size={wp(4.8)}
        />
        <Text
          style={[Styles.actionPillTxt, Styles.likePillTxt]}
          numberOfLines={1}
        >
          {LanguageKeys.like}
        </Text>
      </Ripple>
    </View>
  );
});

const Header = ({
  navigation,
  fromUserProfile = false,
  onBlockPress = () => null,
  isBlockedYou = false,
  userData: initialUserData,
  onLikeUnlikePress,
  profileStrength,
  tagline,
  taglineEditing = false,
  taglineInput = '',
  onTaglineChange = () => null,
  onTaglineSubmit = () => null,
  onTaglineEditPress = () => null,
  onTaglineCancel = () => null,
}: HeaderProps) => {
  const { currentUser, updateCurrentUser } = useGlobalContext();
  const { t } = useTranslation();
  const [userConversation, setUserConversation] = useState<Conversation | null>(
    null
  );
  const [liked, setLiked] = useState<boolean>(Boolean(initialUserData?.liked));
  const [profileImageLoader, setProfileImageLoader] = useState(false);
  const [profileImageError, setProfileImageError] = useState(false);
  const [userData, setUserData] = useState<User>(initialUserData);
  const [isPremiumMember, setIsPremiumMember] = useState<boolean>(false);
  const [messageButtonLoader, setMessageButtonLoader] = useState(true);
  const [isChatCreditsLoading, setIsChatCreditsLoading] = useState(false);
  const [giftModalVisible, setGiftModalVisible] = useState(false);
  const [giftInfoVariant, setGiftInfoVariant] =
    useState<ProfileGiftInfoVariant | null>(null);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [privacySettingsVisible, setPrivacySettingsVisible] = useState(false);
  const giftThreshold =
    useSettingsStore().getProfileCompletionThresholdPercent();
  const giftCredits = useSettingsStore().getProfileCompletionGiftCredits();
  const giftClaimed = Boolean(
    (currentUser as any)?.profile_finish_bonus_awarded
  );
  const giftEligible =
    !giftClaimed &&
    typeof profileStrength === 'number' &&
    profileStrength >= giftThreshold;

  const chatUserData = useMemo(
    () => ({
      ...userData,
      id: userData?.id,
      name: userData?.full_name,
      image: userData?.primary_image_to_show,
      token:
        userData?.fcm_token
          ?.map((item) => item?.fcm_token)
          .filter((token): token is string => Boolean(token)) ?? [],
    }),
    [userData]
  );

  useFocusEffect(
    React.useCallback(() => {
      setIsPremiumMember(
        currentUser?.membership_status === 0 ||
          currentUser?.membership_status === null
          ? false
          : true
      );
      const updatedUserData = {
        ...initialUserData,
        is_blur:
          currentUser?.id === initialUserData?.id
            ? currentUser?.is_blur
            : initialUserData?.is_blur,
      };
      setUserData(updatedUserData);
      setLiked(Boolean(initialUserData?.liked));
      // Reset image loader states when user data changes
      setProfileImageLoader(false);
      setProfileImageError(false);
    }, [initialUserData, currentUser])
  );

  const getUserConversation = useCallback(() => {
    const currentUserId =
      currentUser?.id === 'guardian' ? currentUser?.user?.id : currentUser?.id;
    const otherUserId = userData?.id;

    if (!currentUserId || !otherUserId) {
      setMessageButtonLoader(false);
      return;
    }

    // Always fetch from API to get the latest conversation data
    messageServices
      .getConversationsList()
      .then((apiConversations: ApiConversation[]) => {
        // Filter conversations where the other user is a participant
        const foundConversation = apiConversations.find((conv) => {
          return conv.participants?.some(
            (participant) => participant.id === otherUserId
          );
        });

        if (foundConversation) {
          // Convert API Conversation to the expected format
          setUserConversation(foundConversation as unknown as Conversation);
        } else {
          // No conversation found - will be null, allowing new conversation creation
          setUserConversation(null);
        }
        setMessageButtonLoader(false);
      })
      .catch((error) => {
        console.error(
          '[Header.getUserConversation] Error fetching conversations:',
          error
        );
        setMessageButtonLoader(false);
      });
  }, [currentUser?.id, currentUser?.user?.id, userData?.id]);

  useFocusEffect(
    React.useCallback(() => {
      if (fromUserProfile) {
        getUserConversation();
      }
    }, [fromUserProfile, getUserConversation])
  );

  const navigateToChat = useCallback(() => {
    navigation.navigate('SingleChat', {
      otherUserData: chatUserData,
      conversationData: userConversation,
      fromProfile: true,
    });
  }, [chatUserData, navigation, userConversation]);

  const onMessagePress = useCallback(async () => {
    // Check if this is a new conversation (no existing conversation)
    // userConversation can be Conversation (old) or ApiConversation (new) type
    const conversationId = userConversation
      ? (userConversation as unknown as ApiConversation)?.id ||
        (userConversation as Conversation)?.convDetails?.id
      : null;
    const isNewConversation = !conversationId;

    // If it's a new conversation, check if user has sufficient credits (50 credits required)
    if (isNewConversation) {
      const chatCredits =
        (currentUser as { chat_credits?: number })?.chat_credits ?? 0;
      const requiredCredits = 50;

      if (chatCredits < requiredCredits) {
        // User doesn't have enough credits, show paywall
        try {
          const result = await presentChatCreditsPaywall();
          if (result.success) {
            // User purchased credits, refresh user data and try again
            try {
              const refreshedUser =
                (await ApiServices.getCurrentUserDetail()) as unknown as User;
              updateCurrentUser(refreshedUser);
              const refreshedCredits =
                (refreshedUser as { chat_credits?: number })?.chat_credits ?? 0;
              if (refreshedCredits >= requiredCredits) {
                navigateToChat();
              } else {
                flashErrorMessage(
                  'You need a chat bundle to start a new conversation.'
                );
              }
            } catch (error) {
              console.error('Error refreshing user data:', error);
              flashErrorMessage(
                'Failed to refresh your chats. Please try again.'
              );
            }
          } else if (
            result.error &&
            result.error !== 'Purchase cancelled by user'
          ) {
            flashErrorMessage(result.error || 'Failed to purchase chat bundle');
          }
        } catch (error) {
          console.error('Error presenting chat credits paywall:', error);
          flashErrorMessage('Failed to open chat bundles');
        }
        return;
      }
    }

    // User has sufficient credits or it's an existing conversation, proceed to chat
    navigateToChat();
  }, [currentUser, navigateToChat, updateCurrentUser, userConversation]);

  const Rtl = CheckRtl();

  const minutesSinceLastOnline = useMemo(() => {
    if (!userData?.last_online_at) {
      return Number.POSITIVE_INFINITY;
    }
    return moment().diff(moment(userData.last_online_at), 'minutes');
  }, [userData?.last_online_at]);

  const onlineStatusColor = useMemo(() => {
    // Green when online now (same <5min threshold as relativeLastSeen's
    // "Online now"), yellow when active within the last 12 hours, grey
    // otherwise. Previously only an exact 1-hour bucket turned green, so a
    // member online right now (0 hours) showed grey.
    if (minutesSinceLastOnline < 5) {
      return Colors.color10;
    }
    if (minutesSinceLastOnline <= 12 * 60) {
      return Colors.color19;
    }
    return Colors.color15;
  }, [minutesSinceLastOnline]);

  const isSelf = currentUser?.id === userData?.id;
  const profileDisplayName =
    userData?.full_name ||
    [userData?.first_name, userData?.last_name].filter(Boolean).join(' ');
  const showMatchScore =
    fromUserProfile &&
    !isBlockedYou &&
    userData?.match_percentage !== null &&
    userData?.match_percentage !== undefined;

  const onEditPress = useCallback(() => {
    navigation.navigate('PhotosAndVideos');
  }, [navigation]);

  const handleLikeToggle = useCallback(() => {
    setLiked((prev) => {
      const next = !prev;
      if (onLikeUnlikePress) {
        onLikeUnlikePress(next);
      }
      return next;
    });
  }, [onLikeUnlikePress]);

  const onSeeAllPicPress = useCallback(() => {
    if (!fromUserProfile) {
      navigation.navigate('PhotosAndVideos');
      return;
    }
    navigation.navigate('ImageViewer', { userData });
  }, [fromUserProfile, navigation, userData]);

  const onBackPress = useCallback(() => navigation.goBack(), [navigation]);

  // Same route + params as Settings' "Profile" row, so both entry points land on
  // the identical screen. Only wired up on the self header — see renderSelfHeader.
  const onNamePress = useCallback(
    () => navigation.navigate('UserInput', { fromSettings: true }),
    [navigation]
  );

  // The kebab opens the block/report/unblock picker directly. Previously it
  // opened its own RN Modal menu that then handed off to the picker (a second,
  // react-native-modal) — presenting the picker while the menu was still
  // dismissing raced and silently no-opped on iOS, so "Block" did nothing.

  const onChatCreditsPress = useCallback(async () => {
    setIsChatCreditsLoading(true);
    try {
      const result = await presentChatCreditsPaywall();
      if (result.success) {
        const refreshedUser =
          (await ApiServices.getCurrentUserDetail()) as unknown as User;
        updateCurrentUser(refreshedUser);
        flashSuccessMessage(t(LanguageKeys.chatCreditsPurchaseSuccess));
      } else if (
        result.error &&
        result.error !== 'Purchase cancelled by user'
      ) {
        flashErrorMessage(
          result.error || t(LanguageKeys.chatCreditsPurchaseError)
        );
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : t(LanguageKeys.chatCreditsPurchaseError);
      flashErrorMessage(errorMessage);
    } finally {
      setIsChatCreditsLoading(false);
    }
  }, [updateCurrentUser, t]);

  const closeGiftModal = useCallback(() => setGiftModalVisible(false), []);
  const closeGiftInfo = useCallback(() => setGiftInfoVariant(null), []);

  // Sticky fallback for the variant prop below: on iOS, RN's Modal keeps
  // rendering children through the fade-out animation until the native
  // onDismiss fires, so the instant closeGiftInfo() nulls giftInfoVariant,
  // a literal 'locked' fallback would visibly swap claimed's copy/buttons to
  // locked's while the popup is still fading out. Tracking the last non-null
  // variant keeps the closing popup showing what it was showing.
  const lastGiftInfoVariant = useRef<ProfileGiftInfoVariant>('locked');
  if (giftInfoVariant !== null) {
    lastGiftInfoVariant.current = giftInfoVariant;
  }

  // `from: 'Home'` is what makes OnboardingProfile's exitFlow/bailFlow reset to
  // BottomTab when the user leaves it, rather than continuing down the signup
  // chain to ProfilePicture — correct for a flow entered from inside the app.
  const onGiftInfoStart = useCallback(() => {
    setGiftInfoVariant(null);
    navigation.navigate('OnboardingProfile', { from: 'Home' });
  }, [navigation]);

  // GiftBadge is tappable in all three states; only the eligible tap opens
  // the claim modal — locked/claimed taps open the explainer popup instead.
  const onGiftBadgePress = useCallback(() => {
    if (giftClaimed) {
      setGiftInfoVariant('claimed');
      return;
    }
    if (!giftEligible) {
      setGiftInfoVariant('locked');
      return;
    }
    setGiftModalVisible(true);
  }, [giftClaimed, giftEligible]);

  // Services.tsx's Promise executors are untyped (bare `Promise<unknown>`),
  // so callers cast at the call site — matching the existing
  // `as unknown as User` idiom already used elsewhere in this file
  // (getCurrentUserDetail, a few lines up) rather than a bare `as`, which TS
  // rejects between unrelated types.
  const claimGift = useCallback(
    () =>
      ApiServices.claimProfileGift() as unknown as Promise<{
        status: string;
        awarded: number;
        new_balance: number;
        multiplier: number;
      }>,
    []
  );

  const onGiftClaimed = useCallback(
    (result: any) => {
      // GiftClaimModal shows its own "You earned" confirmation
      // before calling this (for a fresh claim) or hands off immediately
      // (for an already-claimed race) — either way, no separate toast here,
      // just persisting the result on currentUser.
      setGiftModalVisible(false);
      const { setData, storageKeys } = StorageManager;
      const updatedUser = buildUpdatedUserAfterGiftClaim(currentUser, result);
      setData(storageKeys.USER, updatedUser);
      updateCurrentUser(updatedUser);
    },
    [currentUser, updateCurrentUser]
  );

  const onProfileImageLoadStart = useCallback(
    () => setProfileImageLoader(true),
    []
  );
  const onProfileImageLoadEnd = useCallback(
    () => setProfileImageLoader(false),
    []
  );
  const onProfileImageError = useCallback(() => {
    setProfileImageError(true);
    setProfileImageLoader(false);
  }, []);

  // Determine which image to show based on isSelf
  const profileImageUri = useMemo(() => {
    if (!isSelf) {
      return userData?.primary_image_to_show;
    }
    return userData?.media?.un_blur_primary_image;
  }, [
    isSelf,
    userData?.primary_image_to_show,
    userData?.media?.un_blur_primary_image,
  ]);

  // Reset loader when image URI changes
  useEffect(() => {
    setProfileImageLoader(false);
    setProfileImageError(false);
  }, [profileImageUri]);

  // A friendly relative "last seen" line — "Online now" when very recent,
  // otherwise "Active 5 hours ago". Clearer than a full date + time stamp.
  const relativeLastSeen = useMemo(() => {
    if (!userData?.last_online_at) {
      return '';
    }
    const minutesAgo = moment().diff(
      moment(userData.last_online_at),
      'minutes'
    );
    if (minutesAgo < 5) {
      return t(LanguageKeys.onlineNow);
    }
    return `${t(LanguageKeys.active)} ${moment(userData.last_online_at).fromNow()}`;
  }, [userData?.last_online_at, t]);

  // Full-bleed photo hero shared by both the self and other-user headers.
  // The info card is rendered as a sibling below it and pulled up to overlap.
  const renderHeroPhoto = ({
    showBack,
    showMenu,
    showSettings,
    showCameraButton = false,
  }: {
    showBack: boolean;
    showMenu: boolean;
    showSettings: boolean;
    showCameraButton?: boolean;
  }) => (
    <View style={Styles.heroWrap}>
      {profileImageUri && profileImageUri.length !== 0 && !profileImageError ? (
        <Image
          style={StyleSheet.absoluteFill}
          source={{ uri: profileImageUri }}
          resizeMode="cover"
          onLoadStart={onProfileImageLoadStart}
          onLoadEnd={onProfileImageLoadEnd}
          onError={onProfileImageError}
        />
      ) : (
        <ProfilePhotoPlaceholder
          name={profileDisplayName}
          size={wp(24)}
          centeredInitials
          style={Styles.heroFallback}
        />
      )}
      {profileImageLoader && !profileImageError && (
        <View style={Styles.imageLoader}>
          <ActivityIndicator color={Colors.color2} size={wp(8)} />
        </View>
      )}
      <LinearGradient
        colors={['rgba(0,0,0,0.42)', 'rgba(0,0,0,0.0)', 'rgba(0,0,0,0.16)']}
        style={StyleSheet.absoluteFill}
      />
      {showBack && (
        <Ripple
          style={[
            Styles.navButton,
            {
              left: Rtl ? undefined : wp(4),
              right: Rtl ? wp(4) : undefined,
            },
          ]}
          hitSlop={20}
          rippleColor={Colors.theme}
          onPress={onBackPress}
        >
          <AntDesign
            name={Rtl ? 'arrowright' : 'arrowleft'}
            color={Colors.color2}
            size={wp(5)}
          />
        </Ripple>
      )}
      {showMenu && (
        <View
          style={[
            Styles.heroMenuContainer,
            {
              left: Rtl ? wp(4) : undefined,
              right: Rtl ? undefined : wp(4),
            },
          ]}
        >
          <Ripple
            style={Styles.overflowBtn}
            onPress={onBlockPress}
            hitSlop={12}
            rippleColor={Colors.color2}
          >
            <Ionicons
              name="ellipsis-vertical"
              color={Colors.color2}
              size={wp(5)}
            />
          </Ripple>
        </View>
      )}
      {showSettings && (
        <View
          style={[
            Styles.heroMenuContainer,
            {
              left: Rtl ? wp(4) : undefined,
              right: Rtl ? undefined : wp(4),
            },
          ]}
        >
          <Ripple
            style={Styles.overflowBtn}
            onPress={() => setPrivacySettingsVisible(true)}
            hitSlop={12}
            rippleColor={Colors.color2}
            accessibilityRole="button"
            accessibilityLabel={t(LanguageKeys.privacySettings)}
          >
            <Entypo name="eye" color={Colors.color2} size={wp(5)} />
          </Ripple>
          <Ripple
            style={Styles.overflowBtn}
            onPress={() => navigation.navigate('Settings')}
            hitSlop={12}
            rippleColor={Colors.color2}
          >
            <Ionicons
              name="settings-outline"
              color={Colors.color2}
              size={wp(5)}
            />
          </Ripple>
        </View>
      )}
      {showCameraButton && (
        <Ripple
          style={Styles.heroCameraButton}
          onPress={onEditPress}
          hitSlop={12}
          rippleColor={Colors.color2}
          accessibilityRole="button"
          accessibilityLabel={t(LanguageKeys.myPhotos)}
        >
          <View style={Styles.heroCameraIcon}>
            <Ionicons name="camera" size={wp(4.6)} color={Colors.color2} />
          </View>
          <Text style={Styles.heroCameraLabel}>{LanguageKeys.myPhotos}</Text>
        </Ripple>
      )}
    </View>
  );

  const renderSelfHeader = () => (
    <>
      {renderHeroPhoto({
        showBack: true,
        showMenu: false,
        showSettings: true,
        showCameraButton: true,
      })}
      <View style={Styles.infoCard}>
        <View style={Styles.profileSummaryRow}>
          <View style={Styles.profileIdentity}>
            <View
              style={[
                Styles.nameBadgeRow,
                {
                  flexDirection: Rtl ? 'row-reverse' : 'row',
                  justifyContent: 'space-between',
                },
              ]}
            >
              {userData?.first_name || userData?.last_name ? (
                <Ripple
                  style={Styles.nameShrink}
                  onPress={onNamePress}
                  rippleColor={Colors.primaryRGBA12}
                  accessibilityRole="button"
                  accessibilityLabel={t(LanguageKeys.basicSettings)}
                >
                  <NameRow
                    firstName={userData?.first_name}
                    lastName={userData?.last_name}
                    showStatus={false}
                    statusColor={onlineStatusColor}
                    rtl={Rtl}
                  />
                </Ripple>
              ) : null}
              <View
                style={{
                  flexDirection: Rtl ? 'row-reverse' : 'row',
                  alignItems: 'center',
                  gap: wp(2),
                }}
              >
                <ChatCreditsBadge
                  credits={currentUser?.chat_credits ?? 0}
                  onPress={onChatCreditsPress}
                  disabled={isChatCreditsLoading}
                />
                {!currentUser?.is_approved ? (
                  <Ripple
                    style={Styles.reviewStatusIcon}
                    onPress={() => setReviewModalVisible(true)}
                    rippleColor={Colors.primaryRGBA12}
                    accessibilityRole="button"
                    accessibilityLabel={t(LanguageKeys.profileInReview)}
                  >
                    <Ionicons
                      name="time-outline"
                      size={wp(4)}
                      color="#F2994A"
                    />
                  </Ripple>
                ) : null}
              </View>
            </View>
            <View
              style={[
                Styles.cardBadgeRow,
                {
                  flexDirection: Rtl ? 'row-reverse' : 'row',
                  flexWrap: 'wrap',
                  alignItems: Rtl ? 'flex-end' : 'flex-start',
                  gap: wp(2),
                  marginTop: hp(0.8),
                },
              ]}
            >
              <ProfileBadges
                isSelf={isSelf}
                variant="pill"
                userData={userData}
                containerStyle={Styles.inlineBadges}
              />
            </View>
            <MetaLine
              age={userData?.age}
              city={userData?.city}
              country={userData?.country}
            />
          </View>
        </View>
        <Ripple
          style={Styles.taglineEditRow}
          onPress={onTaglineEditPress}
          rippleColor={Colors.lavender}
        >
          <Entypo name="pencil" size={wp(3.8)} color={Colors.primaryMid} />
          {tagline && tagline.trim().length ? (
            <ReactText
              style={[
                Styles.cardTagline,
                { textAlign: Rtl ? 'right' : 'left', flex: 1 },
              ]}
              numberOfLines={2}
            >
              {`“${tagline}”`}
            </ReactText>
          ) : (
            <Text
              style={[Styles.cardTagline, Styles.cardTaglineMuted, { flex: 1 }]}
              numberOfLines={2}
            >
              {LanguageKeys.enterTagline}
            </Text>
          )}
        </Ripple>
        {typeof profileStrength === 'number' ? (
          <View style={Styles.strengthWrap}>
            <View
              style={[
                Styles.strengthRow,
                { flexDirection: Rtl ? 'row-reverse' : 'row' },
              ]}
            >
              <ReactText style={Styles.strengthLabel}>
                {t(LanguageKeys.profileStrength)}
                <ReactText
                  style={Styles.strengthPct}
                >{` ${profileStrength}%`}</ReactText>
              </ReactText>
              <GiftBadge
                eligible={giftEligible}
                claimed={giftClaimed}
                onPress={onGiftBadgePress}
              />
            </View>
            <View style={Styles.strengthTrackWrap}>
              <View style={Styles.strengthTrack}>
                <View
                  style={[
                    Styles.strengthFill,
                    {
                      width: `${Math.max(0, Math.min(100, profileStrength))}%`,
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </>
  );

  return (
    <View style={fromUserProfile ? Styles.container : Styles.selfContainer}>
      {isPremiumMember && <StatusBar backgroundColor={Colors.primary} />}

      {!fromUserProfile ? (
        renderSelfHeader()
      ) : (
        <>
          <CheckMembershipStatus />
          {renderHeroPhoto({
            showBack: true,
            showMenu: !isSelf && !isBlockedYou,
            showSettings: false,
            showCameraButton: isSelf,
          })}
          {currentUser?.tester_mode_enabled === true &&
            currentUser?.is_tester &&
            userData?.id && (
              <View style={Styles.testerToolsWrap}>
                <TesterProfileTools
                  navigation={navigation}
                  userId={userData?.id}
                />
              </View>
            )}
          <View style={Styles.infoCard}>
            <View
              style={[
                Styles.profileSummaryRow,
                { flexDirection: Rtl ? 'row-reverse' : 'row' },
              ]}
            >
              <View style={Styles.profileIdentity}>
                <NameRow
                  firstName={userData?.first_name}
                  lastName={userData?.last_name}
                  showStatus={!isBlockedYou}
                  statusColor={onlineStatusColor}
                  statusLabel={relativeLastSeen}
                  rtl={Rtl}
                />
                <View
                  style={[
                    Styles.cardBadgeRow,
                    { alignItems: Rtl ? 'flex-end' : 'flex-start' },
                  ]}
                >
                  <ProfileBadges
                    isSelf={isSelf}
                    variant="pill"
                    userData={userData}
                  />
                </View>
                <MetaLine
                  age={userData?.age}
                  city={userData?.city}
                  country={userData?.country}
                />
              </View>
              {showMatchScore ? (
                <MatchScoreBadge score={userData?.match_percentage} />
              ) : null}
            </View>
            {!isBlockedYou && tagline && tagline.trim().length ? (
              <ReactText
                style={[
                  Styles.cardTagline,
                  { marginTop: hp(1), textAlign: Rtl ? 'right' : 'left' },
                ]}
                numberOfLines={2}
              >
                {`“${tagline}”`}
              </ReactText>
            ) : null}
            {!isBlockedYou && (
              <>
                <View style={Styles.cardActions}>
                  <ActionButtons
                    rtl={Rtl}
                    onMessagePress={onMessagePress}
                    onLikePress={handleLikeToggle}
                    messageButtonLoader={messageButtonLoader}
                    liked={liked}
                  />
                </View>
                {(Boolean(userData?.media?.public_gallery?.length) ||
                  (userData?.media?.private_photo_count ?? 0) > 0) && (
                  <Ripple
                    style={[
                      Styles.seeAllRow,
                      { flexDirection: Rtl ? 'row-reverse' : 'row' },
                    ]}
                    onPress={onSeeAllPicPress}
                    rippleColor={Colors.primaryLite}
                  >
                    <View style={Styles.seeAllIcon}>
                      <Ionicons
                        name="images-outline"
                        size={wp(4.6)}
                        color={Colors.primary}
                      />
                    </View>
                    <Text style={Styles.seeAllTxt}>
                      {LanguageKeys.seeAllPictures}
                    </Text>
                  </Ripple>
                )}
              </>
            )}
          </View>
        </>
      )}

      <Modal
        transparent
        visible={Boolean(taglineEditing)}
        animationType="fade"
        onRequestClose={onTaglineCancel}
      >
        <View style={Styles.taglineModalWrap}>
          <View style={Styles.taglineModalCard}>
            <Text style={Styles.taglineModalTitle}>{LanguageKeys.tagline}</Text>
            <TextInput
              style={Styles.taglineModalInput}
              placeholder={t(LanguageKeys.enterTagline)}
              placeholderTextColor={Colors.muted}
              value={taglineInput}
              onChangeText={onTaglineChange}
              multiline
              maxLength={30}
            />
            <ReactText style={Styles.taglineCounter}>
              {`${taglineInput.length}/30`}
            </ReactText>
            <View style={Styles.blurModalButtons}>
              <Button
                onPress={onTaglineCancel}
                buttonStyle={[
                  Styles.blurModalButton,
                  Styles.blurModalButtonSecondary,
                ]}
                text={LanguageKeys.cancel}
                textStyle={Styles.blurModalButtonTextSecondary}
              />
              <Button
                onPress={onTaglineSubmit}
                buttonStyle={[
                  Styles.blurModalButton,
                  Styles.blurModalButtonPrimary,
                ]}
                text={LanguageKeys.update}
                textStyle={Styles.blurModalButtonTextPrimary}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={reviewModalVisible}
        animationType="fade"
        onRequestClose={() => setReviewModalVisible(false)}
      >
        <View style={Styles.taglineModalWrap}>
          <View style={[Styles.taglineModalCard, Styles.reviewModalCard]}>
            <View style={Styles.reviewModalIcon}>
              <Ionicons name="time-outline" size={wp(15)} color="#F2994A" />
            </View>
            <Text style={[Styles.taglineModalTitle, Styles.reviewModalTitle]}>
              {LanguageKeys.profileInReview}
            </Text>
            <Text style={Styles.reviewModalBody}>
              {LanguageKeys.profileInReviewDesc}
            </Text>
            <Button
              onPress={() => setReviewModalVisible(false)}
              buttonStyle={Styles.reviewModalButton}
              text={LanguageKeys.gotIt}
            />
          </View>
        </View>
      </Modal>

      <GiftClaimModal
        visible={giftModalVisible}
        giftCredits={giftCredits}
        onClose={closeGiftModal}
        onClaimed={onGiftClaimed}
        claim={claimGift}
      />
      <ProfileGiftInfoModal
        visible={giftInfoVariant !== null}
        variant={giftInfoVariant ?? lastGiftInfoVariant.current}
        percent={giftThreshold}
        credits={giftCredits}
        onClose={closeGiftInfo}
        onStart={onGiftInfoStart}
      />
      <PrivacyQuickSettingsModal
        visible={privacySettingsVisible}
        onClose={() => setPrivacySettingsVisible(false)}
      />
    </View>
  );
};

export default Header;

const Styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.appBg,
  },
  selfContainer: {
    backgroundColor: Colors.appBg,
  },
  heroWrap: {
    height: height * 0.42 * 0.8,
    backgroundColor: Colors.primaryPress,
    overflow: 'hidden',
  },
  heroFallback: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  testerToolsWrap: {
    marginBottom: hp(4.5),
  },
  infoCard: {
    marginTop: -hp(4.5),
    marginHorizontal: wp(4),
    marginBottom: hp(1.5),
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.hairline,
    paddingHorizontal: wp(4.5),
    paddingTop: hp(2),
    paddingBottom: hp(2.2),
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
  },
  profileSummaryRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: wp(3),
  },
  profileIdentity: {
    flex: 1,
    minWidth: 0,
  },
  cardBadgeRow: {
    width: '100%',
  },
  nameBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(2),
  },
  nameShrink: {
    flexShrink: 1,
    minWidth: 0,
  },
  inlineBadges: {
    marginTop: 0,
    flexShrink: 1,
  },
  matchScoreWrap: {
    width: wp(17),
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: hp(-0.2),
  },
  matchScoreValue: {
    color: Colors.primary,
    fontFamily: Fonts.APPFONT_B,
    fontSize: Typography.tiny1,
    includeFontPadding: false,
  },
  matchScoreSuffix: {
    color: Colors.primary,
    fontFamily: Fonts.APPFONT_B,
    fontSize: Typography.tiny2,
    includeFontPadding: false,
  },
  matchScoreLabel: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_M,
    fontSize: Typography.tiny2,
    includeFontPadding: false,
    marginTop: hp(0.25),
    textAlign: 'center',
  },
  cardTagline: {
    color: Colors.primaryPress,
    fontFamily: Fonts.APPFONT_R,
    fontStyle: 'italic',
    fontSize: Typography.small1,
    lineHeight: wp(5.4),
    includeFontPadding: false,
  },
  cardTaglineMuted: {
    color: Colors.muted,
  },
  taglineEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(2),
    marginTop: hp(1.6),
    flex: 1,
  },
  reviewStatusIcon: {
    width: wp(7),
    height: wp(7),
    borderRadius: wp(3.5),
    backgroundColor: '#FCEDE1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLastSeenTxt: {
    color: Colors.primaryMid,
    fontFamily: Fonts.APPFONT_M,
    fontSize: Typography.small3,
    includeFontPadding: false,
    alignSelf: 'center',
  },
  strengthWrap: {
    marginTop: hp(1.6),
  },
  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: hp(1),
  },
  strengthLabel: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_M,
    fontSize: Typography.small3,
    includeFontPadding: false,
  },
  strengthPct: {
    color: Colors.primary,
    fontFamily: Fonts.APPFONT_B,
    fontSize: Typography.small3,
    includeFontPadding: false,
  },
  strengthTrackWrap: {
    position: 'relative',
  },
  strengthTrack: {
    height: hp(0.85),
    borderRadius: 999,
    backgroundColor: Colors.lavender,
    overflow: 'hidden',
  },
  strengthFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  cardActions: {
    marginTop: hp(1.8),
  },
  seeAllRow: {
    marginTop: hp(1.2),
    backgroundColor: Colors.lavender,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: wp(2),
    paddingVertical: hp(1.25),
  },
  seeAllIcon: {
    width: wp(7),
    height: wp(7),
    alignItems: 'center',
    justifyContent: 'center',
  },
  seeAllTxt: {
    color: Colors.primaryPress,
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small2,
    includeFontPadding: false,
    marginBottom: Constants.fontFamilyMarginBottom,
  },
  selfHeader: {
    paddingTop: hp(2.5),
    paddingBottom: hp(3),
    paddingHorizontal: wp(6),
    alignItems: 'center',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  avatarBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp(1.4),
  },
  avatarTap: {
    borderRadius: wp(16),
  },
  avatarInner: {
    width: wp(26),
    height: wp(26),
    borderRadius: wp(13),
    backgroundColor: Colors.lavender,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLoader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strengthChip: {
    position: 'absolute',
    bottom: -hp(1),
    backgroundColor: Colors.surface,
    borderRadius: 999,
    paddingHorizontal: wp(2.6),
    paddingVertical: hp(0.35),
    shadowColor: Colors.color1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 4,
  },
  strengthChipTxt: {
    color: Colors.primary,
    fontFamily: Fonts.APPFONT_B,
    fontSize: Typography.tiny1,
    includeFontPadding: false,
  },
  taglinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: wp(1.8),
    marginTop: hp(1.4),
    maxWidth: '92%',
    backgroundColor: Colors.whiteRGBA18,
    borderRadius: 999,
    paddingVertical: hp(0.7),
    paddingHorizontal: wp(3.5),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  taglineTxt: {
    color: Colors.whiteRGBA90,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small1,
    fontStyle: 'italic',
    includeFontPadding: false,
    flexShrink: 1,
  },
  taglineModalWrap: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: wp(6),
  },
  taglineModalCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: wp(4),
    padding: wp(5),
  },
  taglineModalTitle: {
    fontFamily: Fonts.APPFONT_B,
    fontSize: Typography.medium1,
    color: Colors.ink,
    marginBottom: hp(1.5),
  },
  reviewModalCard: {
    alignItems: 'center',
  },
  reviewModalIcon: {
    width: wp(15),
    height: wp(15),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp(1.5),
  },
  reviewModalTitle: {
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  reviewModalBody: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small2,
    lineHeight: wp(5.5),
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  reviewModalButton: {
    alignSelf: 'stretch',
    marginTop: hp(2.5),
  },
  taglineModalInput: {
    minHeight: hp(7),
    borderWidth: 1,
    borderColor: Colors.hairline,
    borderRadius: 12,
    padding: wp(3.5),
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small2,
    color: Colors.ink,
    textAlignVertical: 'top',
    marginBottom: hp(0.8),
  },
  taglineCounter: {
    alignSelf: 'flex-end',
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.tiny1,
    marginBottom: hp(1.6),
  },
  selfName: {
    color: Colors.color2,
    fontFamily: Fonts.APPFONT_B,
    fontSize: Typography.large1,
    marginTop: hp(1.6),
    textAlign: 'center',
    includeFontPadding: false,
  },
  selfMeta: {
    textAlign: 'center',
    marginTop: hp(0.6),
  },
  selfBadges: {
    marginTop: hp(1.2),
    flexDirection: 'row',
    justifyContent: 'center',
  },
  selfActions: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    marginTop: hp(2.4),
    gap: wp(3),
  },
  selfBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: wp(1.6),
    paddingVertical: hp(1.15),
    paddingHorizontal: wp(2),
    borderRadius: 30,
  },
  selfBtnSolid: {
    backgroundColor: Colors.surface,
  },
  selfBtnGlass: {
    backgroundColor: Colors.whiteRGBA18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  selfBtnTxt: {
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small,
    alignSelf: 'center',
    includeFontPadding: false,
  },
  selfBtnTxtSolid: {
    color: Colors.primary,
  },
  selfBtnTxtGlass: {
    color: Colors.color2,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: hp(1),
  },
  navButton: {
    width: wp(9),
    height: wp(9),
    borderRadius: wp(4.5),
    backgroundColor: Colors.blackRGBA38,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    left: wp(4),
    top: wp(5),
    zIndex: 10,
  },
  surface: {
    padding: wp(4),
  },
  profileRow: {
    width: '100%',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  nameWrapper: {
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: hp(0.5),
  },
  heroMenuContainer: {
    position: 'absolute',
    top: wp(5),
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(1.5),
  },
  heroCameraButton: {
    position: 'absolute',
    bottom: hp(6),
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(1.8),
    height: wp(9),
    paddingHorizontal: wp(3.5),
    borderRadius: wp(4.5),
    backgroundColor: Colors.blackRGBA38,
    zIndex: 10,
  },
  heroCameraIcon: {
    width: wp(4.6),
    height: wp(4.6),
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCameraLabel: {
    alignSelf: 'center',
    color: Colors.color2,
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small2,
    includeFontPadding: false,
  },
  infoChip: {
    padding: wp(2),
    borderRadius: 12,
    backgroundColor: Colors.color3,
    borderWidth: 1,
    borderColor: Colors.color8,
  },
  infoIconSmall: {
    width: 20,
    height: 20,
  },
  actionsWrapper: {
    flexDirection: 'column',
    alignItems: 'stretch',
    marginTop: hp(1.2),
    marginBottom: hp(2),
    width: '100%',
    gap: hp(1.2),
  },
  onlineStatus: {
    width: width * 0.04,
    height: width * 0.04 * 1,
    borderRadius: (width * 0.04 * 1) / 2,
    marginTop: hp(0.1),
    marginRight: wp(1),
  },
  videoVoiceContainer: {
    width: '100%',
    paddingHorizontal: wp(4),
    paddingTop: hp(2),
  },
  videoVoiceIconWrapper: {
    backgroundColor: Colors.color47,
    padding: wp(1),
    borderRadius: 50,
    alignItems: 'center',
  },
  contentContainer: {
    width: '100%',
    paddingHorizontal: wp(4),
    paddingVertical: hp(2),
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  contentContainerInner: {
    width: wp(50),
    justifyContent: 'flex-end',
  },
  rowCon: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  blurContainer: {
    justifyContent: 'center',
    marginLeft: 10,
  },
  blurText: {
    color: Colors.color2,
    fontFamily: Fonts.APPFONT_R,
    includeFontPadding: false,
    fontSize: Typography.small2,
  },
  nameCon: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '100%',
  },
  name: {
    flexShrink: 1,
    color: Colors.ink,
    fontFamily: Fonts.APPFONT_B,
    fontSize: Typography.large,
    includeFontPadding: false,
  },
  location: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_R,
    includeFontPadding: false,
    fontSize: Typography.small2,
    marginTop: hp(0.8),
  },
  imageLoader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  allPhotosBtn: {
    justifyContent: 'space-between',
    borderRadius: 30,
    paddingVertical: hp(1),
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: wp(4),
    backgroundColor: Colors.blackRGBA38,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  allPhotosBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  galleryIcon: {
    width: wp(4),
    height: hp(3),
  },
  allPhotosTxt: {
    color: Colors.color2,
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small,
    marginBottom: Constants.fontFamilyMarginBottom,
    marginHorizontal: wp(0.4),
  },
  actionBtnCon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(2.5),
    width: '100%',
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: wp(2),
    paddingVertical: hp(1.15),
    borderRadius: 16,
  },
  messagePill: {
    flex: 2,
    backgroundColor: Colors.primary,
  },
  likePill: {
    flex: 1,
    backgroundColor: Colors.color2,
    borderWidth: 1,
    borderColor: Colors.hairline,
  },
  actionPillTxt: {
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small,
    alignSelf: 'center',
    includeFontPadding: false,
  },
  messagePillTxt: {
    color: Colors.color2,
  },
  likePillTxt: {
    color: Colors.primary,
  },
  overflowBtn: {
    width: wp(9),
    height: wp(9),
    borderRadius: wp(4.5),
    backgroundColor: Colors.blackRGBA38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lastSeenChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(1.4),
    marginTop: hp(0.8),
    backgroundColor: Colors.whiteRGBA18,
    borderRadius: 999,
    paddingVertical: hp(0.5),
    paddingHorizontal: wp(2.6),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  lastSeenTxt: {
    color: Colors.color2,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small3,
    includeFontPadding: false,
    alignSelf: 'center',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  menuCard: {
    marginTop: hp(7),
    marginHorizontal: wp(4),
    minWidth: wp(42),
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.hairline,
    paddingVertical: hp(0.4),
    shadowColor: Colors.color1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(3),
    paddingVertical: hp(1.4),
    paddingHorizontal: wp(4),
  },
  menuItemTxt: {
    color: Colors.ink,
    fontFamily: Fonts.APPFONT_M,
    fontSize: Typography.small1,
    alignSelf: 'center',
  },
  shadow: {
    shadowColor: Colors.color1,
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2,
  },
  profileImageCon: {
    alignSelf: 'flex-start',
    width: width * 0.3,
    height: width * 0.3 * 1,
    borderRadius: (width * 0.3 * 1) / 6,
    marginHorizontal: wp(3),
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.color2,
  },
  profileImage: {
    width: width * 0.3,
    height: width * 0.3 * 1,
    borderRadius: (width * 0.3 * 1) / 6,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  youtubeIcon: {
    alignSelf: 'flex-end',
    marginHorizontal: wp(5),
    marginBottom: hp(-0.6),
  },
  gradientView: {
    position: 'absolute',
    bottom: 0,
    width: wp(100),
    height: hp(30),
  },
  modalWrapper: {
    flex: 1,
    padding: 10,
    backgroundColor: Colors.color2,
  },
  tooltipWrapper: {
    position: 'absolute',
    left: 125,
    top: -10,
    zIndex: 9,
    backgroundColor: Colors.color2,
    borderRadius: 25,
    // padding: 7,
  },
  infoIcon: {
    width: 30,
    height: 30,
  },
  quotesIcon: {
    width: 80,
    height: 80,
    opacity: 0.3,
  },
  tootltipTextWrapper: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  closeWrapper: {
    alignSelf: 'flex-end',
    paddingRight: 10,
    marginTop: isIOS ? 40 : 2,
  },
  tootltipTitle: {
    color: Colors.color1,
    fontFamily: Fonts.APPFONT_B,
    fontSize: Typography.medium,
    marginTop: 20,
  },
  description: {
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small2,
    color: Colors.color1,
  },
  tootltipText: {
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small2,
    color: Colors.color1,
  },
  closeBtn: {
    backgroundColor: Colors.color2,
    borderWidth: 1,
    borderColor: Colors.greyRGBA61,
    marginBottom: hp(2),
    marginHorizontal: wp(5),
  },
  closeBtnText: {
    color: Colors.blackRGBA70,
  },
  italic: { fontStyle: 'italic' },
  userIcon: {
    marginTop: hp(3),
  },
  profileCameraIcon: {
    position: 'absolute',
    bottom: hp(-0.2),
    backgroundColor: '#D9DADF',
    width: width * 0.1,
    height: width * 0.1 * 1,
    borderRadius: (width * 0.1 * 1) / 2,
    justifyContent: 'center',
    alignItems: 'center',
    right: wp(-3),
  },
  coverCameraIcon: {
    position: 'absolute',
    bottom: hp(-0.5),
    right: wp(4),
    backgroundColor: '#D9DADF',
    width: width * 0.1,
    height: width * 0.1 * 1,
    borderRadius: (width * 0.1 * 1) / 2,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  premiumBadge: {
    width: width * 0.07,
    height: width * 0.07,
    borderRadius: 50,
    backgroundColor: Colors.color47,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    bottom: -7,
    left: 100,
  },
  premiumBadgeIcon: {
    width: 14,
    height: 14,
  },
  blurModalButtons: {
    flexDirection: 'row',
    gap: wp(3),
  },
  blurModalButton: {
    flex: 1,
    paddingVertical: hp(1.5),
  },
  blurModalButtonPrimary: {
    backgroundColor: Colors.theme,
  },
  blurModalButtonSecondary: {
    backgroundColor: Colors.color2,
    borderWidth: 1,
    borderColor: Colors.color8,
  },
  blurModalButtonTextPrimary: {
    color: Colors.color2,
    // fontFamily: Fonts.APPFONT_B,
    fontSize: Typography.small2,
  },
  blurModalButtonTextSecondary: {
    color: Colors.color1,
    // fontFamily: Fonts.APPFONT_B,
    fontSize: Typography.small2,
  },
});
