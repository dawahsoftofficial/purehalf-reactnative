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
  Alert,
  AppState,
  type AppStateStatus,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  VirtualizedList,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import pusherService from '@/services/pusher';
import { evaluateAndMaybeShowRatingPrompt } from '@/services/rating/ratingEngagement';

import { ButtonPicker, Container } from '../../components';
import { wp } from '../../global';
import { CheckRtl, LanguageKeys } from '../../languages';
import { Colors } from '../../res';
import {
  ApiServices,
  flashErrorMessage,
  flashInfoMessage,
  flashSuccessMessage,
  useGlobalContext,
} from '../../services';
import messageServices from '../../services/api/message-services';
import type {
  MessageDeliveredEventData,
  MessageReadEventData,
  MessageSentEventData,
  ParticipantBlockedEventData,
} from '../../services/api/types/message-types';
import chatAudioService from '../../services/audio/chat-audio-service';
import {
  type CachedAudioUrl,
  isAudioUrlFresh,
  toCachedAudioUrl,
} from './audioUrlCache';
import { chatErrorMessageKey } from './chat-error-messages';
import type { AudioBubblePlayback } from './components/AudioMessageBubble';
import IcebreakerChips from './components/IcebreakerChips';
import MatchIntroCard from './components/MatchIntroCard';
import MessageBubble from './components/MessageBubble';
import NotificationPermissionBanner from './components/notification-permission-banner';
import TypingIndicator from './components/TypingIndicator';
import VoiceRecorderBar from './components/VoiceRecorderBar';
import {
  type ChatResolutionServices,
  useChatResolution,
} from './hooks/useChatResolution';
import { useSendMessage } from './hooks/useSendMessage';
import { mergeNewestPage } from './mergeMessages';
import {
  addServerMessage,
  type ChatMessage,
  sortMessages,
} from './optimisticMessages';
import { applyReadUpTo } from './readReceipts';
import { canReportMessage, REPORT_REASONS } from './reportMessage';
import { getOtherParticipant, getSendTarget } from './SingleChat.routing';
import Styles from './SingleChat.styles';
import { getLastSeenMessageIndex } from './SingleChat.utils';
import SingleChatHeader from './SingleChatHeader';
import { isWaitingForReply } from './waitForReply';

type ChatAudioPlaybackState = {
  messageId: number | null;
  status: 'idle' | 'loading' | 'playing' | 'paused';
  positionMillis: number;
  durationMillis: number;
};

const MESSAGES_PAGE_SIZE = 50;

/** A voice note stops (and is sent) by itself at this length. */
const MAX_VOICE_SECONDS = 60;

/** While Pusher is not connected, poll the open thread this often. */
const OFFLINE_POLL_INTERVAL_MS = 15000;

const isRateLimitError = (error: unknown): boolean => {
  if (typeof error === 'string') {
    return error.toLowerCase().includes('too many attempts');
  }

  if (error && typeof error === 'object') {
    const maybeError = error as { response?: { status?: number } };
    return maybeError.response?.status === 429;
  }

  return false;
};

const chatResolutionServices: ChatResolutionServices = {
  getConversation: (conversationId) =>
    messageServices.getConversation(conversationId),
  getConversationWithUser: (userId) =>
    messageServices.getConversationWithUser(userId),
  getUserDetail: (userId) => ApiServices.getUserDetail(userId),
};

const SingleChat = (props: any) => {
  const Rtl = CheckRtl();
  const flatListRef: any = useRef(null);
  const inputRef: any = useRef(null);
  const { t }: any = useTranslation();
  const { currentUser, updateOpenedConversationId } = useGlobalContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Track messages to avoid race conditions between fetchMessages and Pusher events
  const messagesRef = useRef<ChatMessage[]>([]);
  // True when this screen created the conversation with `start` in this
  // session (drives the client-side "wait for a reply" pre-check, which is
  // only certain for a brand-new chat; see waitForReply.ts).
  const [createdHere, setCreatedHere] = useState(false);
  // The server rejected a send with WAIT_FOR_REPLY; cleared as soon as a reply
  // is on screen (see isWaitingForReply) or the chat changes.
  const [serverSaysWait, setServerSaysWait] = useState(false);
  const {
    otherUserData,
    conversationData,
    setConversationData,
    conversationId,
    setConversationId,
    isBlockedByYou,
    setIsBlockedByYou,
    isBlockedYou,
    setIsBlockedYou,
    loader,
    setLoader,
    resolved,
    loadError,
    setLoadError,
    isPartnerDeleted,
    retryResolution,
  } = useChatResolution({
    routeParams: props?.route?.params,
    currentUserId: currentUser?.id,
    services: chatResolutionServices,
    onEntryChange: () => {
      messagesRef.current = [];
      setMessages([]);
      setCreatedHere(false);
      setServerSaysWait(false);
    },
  });
  // Tell the foreground push banner which chat is on screen so a message for
  // it doesn't pop a banner over the thread being read. Cleared on blur,
  // unmount and when the screen is re-targeted at another conversation.
  // The same effect records whether the thread is on screen: a message that
  // arrives while the member is elsewhere must not be reported as read.
  const isScreenFocusedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      isScreenFocusedRef.current = true;
      if (!conversationId) {
        return () => {
          isScreenFocusedRef.current = false;
        };
      }
      updateOpenedConversationId?.(conversationId);
      return () => {
        isScreenFocusedRef.current = false;
        updateOpenedConversationId?.(null);
      };
    }, [conversationId, updateOpenedConversationId])
  );
  // The conversation id (and entry) currently shown, so a slow fetch for a
  // previous one can be discarded.
  const activeConversationIdRef = useRef(conversationId);
  useEffect(() => {
    activeConversationIdRef.current = conversationId;
  }, [conversationId]);
  const [isUnblocking, setIsUnblocking] = useState(false);
  const [messagePressedId, setMessagePressedId] = useState<number | null>(null);
  const [quote, setQuote] = useState('');

  const [audioPlayback, setAudioPlayback] = useState<ChatAudioPlaybackState>({
    messageId: null,
    status: 'idle',
    positionMillis: 0,
    durationMillis: 0,
  });

  // Pusher real-time features
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsubscribeConversationRef = useRef<(() => void) | null>(null);
  // Bumped on every (re)subscribe and on teardown; see setupPusherListeners.
  const subscribeGenerationRef = useRef(0);
  const lastTypingEventRef = useRef<number>(0);
  // Messages already reported as read (or being reported), so no id is sent
  // twice. mark-all-read fires only when an id NOT in this set shows up, so a
  // stream of incoming messages never re-triggers a whole-conversation call.
  // The server also stamps delivered_at on everything it marks read.
  const markedAsReadRef = useRef<Set<number>>(new Set());
  const isFetchingMessagesRef = useRef<boolean>(false);
  // Older-message pagination: history was previously capped at whatever the
  // first fetch returned (50 messages) with no way to load anything before that.
  const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false);
  const isLoadingMoreRef = useRef<boolean>(false);
  const hasMoreMessagesRef = useRef<boolean>(true);
  const currentPageRef = useRef<number>(1);
  const audioPlaybackRef = useRef<ChatAudioPlaybackState>(audioPlayback);
  const audioSourceCacheRef = useRef<Map<number, CachedAudioUrl>>(new Map());

  const [inputMessage, setInputMessage] = useState('');
  // Mirrors the composer text synchronously so a double tap on send cannot
  // submit the same text twice before the cleared state re-renders.
  const inputMessageRef = useRef('');
  const lastSendAtRef = useRef(0);
  const setInputText = (text: string) => {
    inputMessageRef.current = text;
    setInputMessage(text);
  };
  const onChangeInputMessage = (text: string) => {
    setInputText(text);

    // Throttle: at most one client-typing event every 2s, and only while
    // there's an existing conversation to broadcast on.
    if (conversationId && text.trim().length > 0) {
      const now = Date.now();
      if (now - lastTypingEventRef.current > 2000) {
        lastTypingEventRef.current = now;
        void pusherService.triggerClientEvent(
          `private-conversation.${conversationId}`,
          'client-typing',
          {}
        );
      }
    }
  };

  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceElapsedSeconds, setVoiceElapsedSeconds] = useState(0);
  const [voiceWaveformPeaks, setVoiceWaveformPeaks] = useState<number[]>([]);
  const [isSendingVoice, setIsSendingVoice] = useState(false);
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Drops a recording in progress (assigned below). Used when the screen
  // loses focus, the app goes to the background or the screen unmounts.
  const abortVoiceRecordingRef = useRef<() => Promise<void>>(async () => {});

  // A recording must not outlive the screen: stop the timer and the recorder.
  useEffect(() => {
    return () => {
      void abortVoiceRecordingRef.current();
    };
  }, []);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) return;

    // Prevent duplicate fetches if already fetching
    if (isFetchingMessagesRef.current) {
      console.log('[SingleChat] Already fetching messages, skipping');
      return;
    }

    // Set loader to true when starting to fetch messages
    setLoader(true);
    setLoadError(null);
    isFetchingMessagesRef.current = true;

    try {
      const conversationIdNum = parseInt(conversationId, 10);
      if (isNaN(conversationIdNum)) {
        setLoader(false);
        isFetchingMessagesRef.current = false;
        return;
      }

      const fetchedMessages = await messageServices.getConversationMessages(
        conversationIdNum,
        { per_page: MESSAGES_PAGE_SIZE, page: 1 }
      );
      // The screen moved to another conversation while this was in flight.
      if (activeConversationIdRef.current !== conversationId) return;
      currentPageRef.current = 1;
      hasMoreMessagesRef.current = fetchedMessages.length >= MESSAGES_PAGE_SIZE;

      // Merge into the CURRENT list (functional update) so Pusher messages and
      // unsent bubbles added meanwhile are not lost.
      setMessages((previous) => {
        const merged = mergeNewestPage(previous, fetchedMessages);
        messagesRef.current = merged;
        return merged;
      });
      setLoader(false);
      isFetchingMessagesRef.current = false;

      // Reset the read tracking when messages are fetched so unread ones are
      // reported again when the screen is focused.
      markedAsReadRef.current.clear();
    } catch (error: unknown) {
      console.error('[SingleChat.fetchMessages] Error:', error);
      if (activeConversationIdRef.current !== conversationId) return;
      // Don't present a failed load as an empty chat.
      if (messagesRef.current.length === 0) {
        setLoadError('messages');
      }
      setLoader(false);
      isFetchingMessagesRef.current = false;
    }
  }, [conversationId]);

  // Loads the next older page of history. The API doesn't return a total
  // count, so "more pages exist" is inferred from getting a full page back.
  const loadOlderMessages = useCallback(async () => {
    if (!conversationId) return;
    if (!hasMoreMessagesRef.current) return;
    // Ref check (not just the isLoadingMoreMessages state) guards against two
    // onEndReached firings in the same tick, before either has re-rendered —
    // both would otherwise read the same stale (false) state value.
    if (isFetchingMessagesRef.current || isLoadingMoreRef.current) return;

    const conversationIdNum = parseInt(conversationId, 10);
    if (isNaN(conversationIdNum)) return;

    isLoadingMoreRef.current = true;
    setIsLoadingMoreMessages(true);
    try {
      const nextPage = currentPageRef.current + 1;
      const olderMessages = await messageServices.getConversationMessages(
        conversationIdNum,
        { per_page: MESSAGES_PAGE_SIZE, page: nextPage }
      );

      currentPageRef.current = nextPage;
      hasMoreMessagesRef.current = olderMessages.length >= MESSAGES_PAGE_SIZE;

      if (olderMessages.length === 0) return;

      // Functional update: unsent bubbles and realtime messages added while
      // the page was loading must not be overwritten.
      setMessages((currentMessages) => {
        const existingIds = new Set(currentMessages.map((msg) => msg.id));
        const newOlderMessages = olderMessages.filter(
          (msg) => !existingIds.has(msg.id)
        );
        if (newOlderMessages.length === 0) return currentMessages;

        // Older messages sort to the end of the (newest-first) array.
        const merged = sortMessages([...currentMessages, ...newOlderMessages]);
        messagesRef.current = merged;
        return merged;
      });
    } catch (error: unknown) {
      console.error('[SingleChat.loadOlderMessages] Error:', error);
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMoreMessages(false);
    }
  }, [conversationId]);

  // Catch-up: fetches the newest page and merges it into what is on screen,
  // without touching the loader. Used after the app returns to the foreground,
  // after Pusher reconnects, as an offline poll, and when a pushed message body
  // was truncated. Safe to call any time; overlapping calls collapse.
  const isCatchingUpRef = useRef<boolean>(false);
  // A truncated MessageSent that arrived mid catch-up: that fetch may predate
  // the message, so run exactly one more when it ends.
  const catchUpQueuedRef = useRef<boolean>(false);
  const refreshNewestMessages = useCallback(
    async (options?: { queueIfBusy?: boolean }) => {
      if (!conversationId) return;
      const conversationIdNum = parseInt(conversationId, 10);
      if (isNaN(conversationIdNum)) return;
      if (isCatchingUpRef.current) {
        if (options?.queueIfBusy) catchUpQueuedRef.current = true;
        return;
      }
      // The initial load (or a retry) is already fetching the same page.
      if (isFetchingMessagesRef.current) return;

      isCatchingUpRef.current = true;
      try {
        const fetched = await messageServices.getConversationMessages(
          conversationIdNum,
          { per_page: MESSAGES_PAGE_SIZE, page: 1 }
        );
        // The screen moved to another conversation while this was in flight.
        if (activeConversationIdRef.current !== conversationId) return;
        setMessages((previous) => {
          const merged = mergeNewestPage(previous, fetched);
          messagesRef.current = merged;
          return merged;
        });
      } catch (error: unknown) {
        // Best-effort: the next trigger tries again.
        console.error('[SingleChat.refreshNewestMessages] Error:', error);
      } finally {
        isCatchingUpRef.current = false;
        if (catchUpQueuedRef.current) {
          catchUpQueuedRef.current = false;
          void refreshNewestMessagesRef.current();
        }
      }
    },
    [conversationId]
  );
  const refreshNewestMessagesRef = useRef(refreshNewestMessages);
  useEffect(() => {
    refreshNewestMessagesRef.current = refreshNewestMessages;
  }, [refreshNewestMessages]);

  // Store handler refs (will be initialized after handlers are defined)
  const handleNewMessageRef = useRef<
    ((data: MessageSentEventData['message']) => void) | null
  >(null);
  const handleMessageReadRef = useRef<
    ((data: MessageReadEventData) => void) | null
  >(null);
  const handleMessageDeliveredRef = useRef<
    ((data: MessageDeliveredEventData) => void) | null
  >(null);
  const handleParticipantBlockedRef = useRef<
    ((data: ParticipantBlockedEventData) => void) | null
  >(null);

  // Setup Pusher real-time listeners for this conversation
  const setupPusherListeners = useCallback(async () => {
    if (!conversationId) {
      console.log('[SingleChat] No conversation ID');
      return;
    }
    // Invalidates a still-pending subscribe from an earlier call / screen
    // state, so it unsubscribes itself instead of leaking.
    const generation = (subscribeGenerationRef.current += 1);

    // M6 fix: if a previous subscription is still active (e.g. the screen
    // re-mounted with the same conversationId or the effect re-ran), unsubscribe
    // it first — otherwise the ref gets overwritten and the old subscription
    // becomes an orphan that keeps receiving events.
    if (unsubscribeConversationRef.current) {
      try {
        unsubscribeConversationRef.current();
      } catch (error) {
        console.error(
          '[SingleChat] Error unsubscribing previous channel:',
          error
        );
      }
      unsubscribeConversationRef.current = null;
    }

    try {
      console.log(
        '[SingleChat] Setting up Pusher for conversation:',
        conversationId
      );

      // Subscribe to conversation channel: conversation.{conversation-id}
      const channelName = `private-conversation.${conversationId}`;

      // Requested even before Pusher is connected: pusherService fulfils it
      // on connect / reconnect.
      const unsubscribe = await pusherService.subscribeToChannel(
        channelName,
        (event) => {
          console.log('[SingleChat] Pusher event received:', event.eventName);

          try {
            const rawData =
              typeof event.data === 'string'
                ? JSON.parse(event.data)
                : event.data;

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

            console.log('[SingleChat] Normalized event type:', eventType);

            switch (eventType) {
              case 'MessageSent': {
                // Handle nested structure: {event: 'MessageSent', message: {...}, conversation: {...}}
                const messageData = rawData.message;
                if (!messageData) {
                  console.error(
                    '[SingleChat] MessageSent event missing message data:',
                    rawData
                  );
                  break;
                }
                console.log('[SingleChat] New message received:', messageData);
                // Use handler from closure - will be updated via dependency array
                if (handleNewMessageRef.current) {
                  handleNewMessageRef.current(
                    messageData as MessageSentEventData['message']
                  );
                }
                // The server shortened the body to fit Pusher's size limit;
                // the list endpoint has the full text.
                if (messageData.truncated === true) {
                  void refreshNewestMessagesRef.current({ queueIfBusy: true });
                }
                break;
              }

              case 'MessageRead': {
                // Backend sends: {event: 'MessageRead', message_id: 50, read_by: {id: 3642, type: 'User'}}
                const readData = rawData;
                console.log('[SingleChat] Message read:', readData);
                if (handleMessageReadRef.current) {
                  handleMessageReadRef.current(
                    readData as MessageReadEventData
                  );
                }
                break;
              }

              case 'MessageDelivered': {
                // Backend sends: {event: 'MessageDelivered', message_id: 50, delivered_by: {id: 3642, type: 'User'}}
                const deliveredData = rawData;
                console.log('[SingleChat] Message delivered:', deliveredData);
                if (handleMessageDeliveredRef.current) {
                  handleMessageDeliveredRef.current(
                    deliveredData as MessageDeliveredEventData
                  );
                }
                break;
              }

              case 'ParticipantBlocked': {
                console.log('[SingleChat] Participant blocked:', rawData);
                if (handleParticipantBlockedRef.current) {
                  handleParticipantBlockedRef.current(
                    rawData as ParticipantBlockedEventData
                  );
                }
                break;
              }

              case 'client-typing': {
                // Client events are peer-to-peer via Pusher and never echoed
                // back to the sender, so this only ever fires for the other
                // participant. Auto-clears if no further keystroke event
                // arrives within a few seconds (covers the other user
                // closing the app mid-type without sending a stop signal).
                setIsOtherUserTyping(true);
                if (typingTimeoutRef.current) {
                  clearTimeout(typingTimeoutRef.current);
                }
                typingTimeoutRef.current = setTimeout(() => {
                  setIsOtherUserTyping(false);
                }, 4000);
                break;
              }

              default:
                console.log('[SingleChat] Unhandled event:', eventType);
            }
          } catch (error) {
            console.error('[SingleChat] Error handling Pusher event:', error);
          }
        }
      );

      if (generation !== subscribeGenerationRef.current) {
        unsubscribe();
        return;
      }
      unsubscribeConversationRef.current = unsubscribe;
      console.log('[SingleChat] ✅ Subscribed to conversation channel');
    } catch (error) {
      console.error('[SingleChat] Error setting up Pusher:', error);
    }
  }, [conversationId]);

  // Handle new message from Pusher
  // Note: messageData is the nested message object from MessageSentEventData
  const handleNewMessage = useCallback(
    (messageData: MessageSentEventData['message']) => {
      const currentUserId = currentUser?.id;

      // Don't add message if it's from current user (already added optimistically)
      if (messageData.sender_id === currentUserId) {
        console.log('[SingleChat] Message from current user, skipping');
        return;
      }

      // Transform event data to Message type
      const message: ChatMessage = {
        id: messageData.id,
        conversation_id: messageData.conversation_id,
        body: messageData.body,
        type: messageData.type || 'text',
        sender_type: messageData.sender_type || 'user',
        sender_id: messageData.sender_id,
        created_at: messageData.created_at,
        statuses: messageData.statuses || [],
        audio: messageData.audio || null,
      };

      // Add new message to list (deduped by id)
      setMessages((prevMessages) => {
        const next = addServerMessage(prevMessages, message);
        if (next === prevMessages) {
          console.log('[SingleChat] Message already exists, skipping');
        }
        // Update ref to keep it in sync
        messagesRef.current = next;
        return next;
      });

      // The member is looking at this thread: report the message as read with
      // one single-message call. Off screen or in the background it is left
      // unread, and the focus / foreground handling picks it up later.
      if (
        message.id > 0 &&
        isScreenFocusedRef.current &&
        AppState.currentState === 'active' &&
        !markedAsReadRef.current.has(message.id)
      ) {
        markedAsReadRef.current.add(message.id);

        messageServices.markMessageAsRead(message.id).catch((error) => {
          console.error('[SingleChat] Error marking message as read:', error);
          if (!isRateLimitError(error)) {
            // Allow a later retry (not on throttle errors).
            markedAsReadRef.current.delete(message.id);
          }
        });
      }

      // Clear typing indicator when message is received
      setIsOtherUserTyping(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    },
    [currentUser, conversationId]
  );

  // Handle message read status update. The event names the highest message
  // the reader has read, which covers every older message of this thread too.
  const handleMessageRead = useCallback((data: MessageReadEventData) => {
    console.log('[SingleChat] Updating message read status:', data);

    const readerId = data.read_by?.id;
    if (!readerId) {
      console.error('[SingleChat] MessageRead event missing read_by.id');
      return;
    }

    const readAt = data.read_at || new Date().toISOString();
    setMessages((prevMessages) => {
      const next = applyReadUpTo(prevMessages, {
        messageId: data.message_id,
        readerId,
        readerType: data.read_by?.type,
        readAt,
      });
      if (next !== prevMessages) messagesRef.current = next;
      return next;
    });
  }, []);

  // Handle message delivered status update
  const handleMessageDelivered = useCallback(
    (data: MessageDeliveredEventData) => {
      console.log('[SingleChat] Updating message delivered status:', data);

      const deliveredById = data.delivered_by?.id;
      const deliveredAt = data.delivered_at || new Date().toISOString();

      if (!deliveredById) {
        console.error(
          '[SingleChat] MessageDelivered event missing delivered_by.id'
        );
        return;
      }

      setMessages((prevMessages) =>
        prevMessages.map((msg) => {
          if (msg.id === data.message_id) {
            // Find existing status for this recipient or create new one
            const existingStatusIndex = msg.statuses?.findIndex(
              (status) => status.participant_id === deliveredById
            );

            const updatedStatuses =
              existingStatusIndex !== undefined && existingStatusIndex >= 0
                ? // Update existing status
                  msg.statuses?.map((status, index) =>
                    index === existingStatusIndex
                      ? { ...status, delivered_at: deliveredAt }
                      : status
                  ) || []
                : // Create new status entry for this recipient
                  [
                    ...(msg.statuses || []),
                    {
                      participant_type: data.delivered_by?.type || 'User',
                      participant_id: deliveredById,
                      delivered_at: deliveredAt,
                      read_at: null,
                    },
                  ];

            return {
              ...msg,
              statuses: updatedStatuses,
            };
          }
          return msg;
        })
      );
    },
    []
  );

  // Handle participant blocked event
  const handleParticipantBlocked = useCallback(
    (data: ParticipantBlockedEventData) => {
      console.log('[SingleChat] Participant blocked event:', data);

      const currentUserId = currentUser?.id;

      // The event is broadcast toOthers(), so the actor never receives their
      // own event — in practice only the target (blocked_participant_id) sees
      // this. `is_blocked` carries the new state so both block and unblock are
      // handled by the same event.
      if (data.blocked_participant_id === currentUserId) {
        setIsBlockedYou(data.is_blocked);
        if (data.is_blocked) {
          Alert.alert('Blocked', 'You have been blocked by this user.', [
            { text: 'OK' },
          ]);
        }
      } else if (data.blocked_by_id === currentUserId) {
        // Fallback if the actor ever receives the event (self-view sync).
        setIsBlockedByYou(data.is_blocked);
      }
    },
    [currentUser]
  );

  // Update handler refs when handlers are defined
  useEffect(() => {
    handleNewMessageRef.current = handleNewMessage;
    handleMessageReadRef.current = handleMessageRead;
    handleMessageDeliveredRef.current = handleMessageDelivered;
    handleParticipantBlockedRef.current = handleParticipantBlocked;
  }, [
    handleNewMessage,
    handleMessageRead,
    handleMessageDelivered,
    handleParticipantBlocked,
  ]);

  // Keep messagesRef in sync with messages state
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    audioPlaybackRef.current = audioPlayback;
  }, [audioPlayback]);

  const resetAudioPlayback = useCallback(() => {
    setAudioPlayback({
      messageId: null,
      status: 'idle',
      positionMillis: 0,
      durationMillis: 0,
    });
  }, []);

  const getAudioDurationMillis = useCallback((message: any): number => {
    const seconds =
      message?.audio?.duration_seconds || message?.duration_seconds || 0;
    return Math.max(0, seconds * 1000);
  }, []);

  const getAudioPlayback = useCallback(
    (messageId: number): AudioBubblePlayback => {
      const isActive = audioPlayback.messageId === messageId;
      return {
        status: isActive ? audioPlayback.status : 'idle',
        positionMillis: isActive ? audioPlayback.positionMillis : 0,
        durationMillis: isActive ? audioPlayback.durationMillis : 0,
        isActive,
      };
    },
    [audioPlayback]
  );

  const findNextSeriesAudioMessage = useCallback((message: any) => {
    const currentMessages = messagesRef.current;
    const currentIndex = currentMessages.findIndex(
      (candidate) => candidate.id === message?.id
    );
    if (currentIndex <= 0) return null;

    const nextMessage = currentMessages[currentIndex - 1];
    const sameSender =
      String(nextMessage?.sender_id) === String(message?.sender_id) &&
      String(nextMessage?.sender_type) === String(message?.sender_type);

    return sameSender && nextMessage?.type === 'audio' ? nextMessage : null;
  }, []);

  const stopAudioPlayback = useCallback(async () => {
    try {
      await chatAudioService.stopPlayback();
    } catch (error) {
      console.error('[SingleChat] Error stopping audio playback:', error);
    } finally {
      resetAudioPlayback();
    }
  }, [resetAudioPlayback]);

  const pauseAudioPlayback = useCallback(async () => {
    if (audioPlaybackRef.current.status !== 'playing') return;
    try {
      await chatAudioService.pausePlayback();
      setAudioPlayback((previous) =>
        previous.status === 'playing'
          ? { ...previous, status: 'paused' }
          : previous
      );
    } catch (error) {
      console.error('[SingleChat] Error pausing audio playback:', error);
    }
  }, []);

  const resumeAudioPlayback = useCallback(async () => {
    if (audioPlaybackRef.current.status !== 'paused') return;
    try {
      await chatAudioService.resumePlayback();
      setAudioPlayback((previous) =>
        previous.status === 'paused'
          ? { ...previous, status: 'playing' }
          : previous
      );
    } catch (error) {
      console.error('[SingleChat] Error resuming audio playback:', error);
    }
  }, []);

  // Playback source for a voice note. A cached URL is reused only while it
  // has not (nearly) expired; `refresh` skips the cache and a local recording
  // (used to recover from a playback error).
  const getPreparedAudioSource = useCallback(
    async (message: any, refresh = false): Promise<string> => {
      if (message.local_uri && !refresh) return message.local_uri;

      const cached = audioSourceCacheRef.current.get(message.id);
      if (!refresh && isAudioUrlFresh(cached)) return cached.url;

      const { url, expires_at } = await messageServices.getMessageAudioUrl(
        message.id
      );
      audioSourceCacheRef.current.set(
        message.id,
        toCachedAudioUrl(url, expires_at)
      );
      return url;
    },
    []
  );

  const playAudioMessage = useCallback(
    async (message: any): Promise<void> => {
      if (!message?.id) return;

      const previousMessageId = audioPlaybackRef.current.messageId;
      if (previousMessageId && previousMessageId !== message.id) {
        try {
          await chatAudioService.stopPlayback();
        } catch (error) {
          console.error('[SingleChat] Error stopping previous audio:', error);
        }
      }

      const fallbackDurationMillis = getAudioDurationMillis(message);
      setAudioPlayback({
        messageId: message.id,
        status: 'loading',
        positionMillis: 0,
        durationMillis: fallbackDurationMillis,
      });

      const startPlayback = async (refresh: boolean) => {
        const sourceUrl = await getPreparedAudioSource(message, refresh);

        await chatAudioService.play(sourceUrl, {
          onProgress: ({ currentPosition, duration }) => {
            setAudioPlayback((previous) => {
              if (previous.messageId !== message.id) return previous;
              return {
                ...previous,
                status: 'playing',
                positionMillis: Math.max(0, currentPosition),
                durationMillis:
                  duration > 0 ? duration : fallbackDurationMillis,
              };
            });
          },
          onPlaybackEnd: () => {
            const nextMessage = findNextSeriesAudioMessage(message);
            if (nextMessage) {
              void playAudioMessage(nextMessage);
              return;
            }
            resetAudioPlayback();
          },
        });
      };

      try {
        try {
          await startPlayback(false);
        } catch (firstError) {
          // The signed URL may have expired (or the local file is gone): ask
          // the server for a fresh one and try once more.
          console.warn(
            '[SingleChat] Playback failed, refetching URL:',
            firstError
          );
          await startPlayback(true);
        }

        setAudioPlayback((previous) =>
          previous.messageId === message.id
            ? { ...previous, status: 'playing' }
            : previous
        );
      } catch (error) {
        console.error('[SingleChat] Error playing audio:', error);
        resetAudioPlayback();
        flashErrorMessage('Unable to play this voice message.');
      }
    },
    [
      findNextSeriesAudioMessage,
      getAudioDurationMillis,
      getPreparedAudioSource,
      resetAudioPlayback,
    ]
  );

  const onToggleAudioPlayback = useCallback(
    (message: any) => {
      const currentPlayback = audioPlaybackRef.current;
      if (currentPlayback.messageId === message?.id) {
        // The first tap is still fetching the URL / starting the player.
        if (currentPlayback.status === 'loading') return;
        if (currentPlayback.status === 'playing') {
          void pauseAudioPlayback();
          return;
        }
        if (currentPlayback.status === 'paused') {
          void resumeAudioPlayback();
          return;
        }
      }

      // One tap fetches the URL (when needed) and plays.
      void playAudioMessage(message);
    },
    [pauseAudioPlayback, playAudioMessage, resumeAudioPlayback]
  );

  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (nextState !== 'active') {
          void pauseAudioPlayback();
        }
        // 'background' only: iOS reports 'inactive' while the microphone
        // permission prompt is up, which must not cancel the recording.
        if (nextState === 'background') {
          void abortVoiceRecordingRef.current();
        }
      }
    );

    return () => {
      subscription.remove();
    };
  }, [pauseAudioPlayback]);

  useEffect(() => {
    return () => {
      void chatAudioService.stopPlayback();
    };
  }, []);

  // Initial fetch and setup Pusher
  // Only run when conversationId changes, not when callbacks are recreated
  useEffect(() => {
    if (conversationId) {
      // Reset messages ref and pagination cursor when conversation changes
      messagesRef.current = [];
      currentPageRef.current = 1;
      hasMoreMessagesRef.current = true;
      fetchMessages();
      setupPusherListeners();

      return () => {
        // Cleanup Pusher subscription (and cancel one still being created)
        subscribeGenerationRef.current += 1;
        if (unsubscribeConversationRef.current) {
          unsubscribeConversationRef.current();
          unsubscribeConversationRef.current = null;
        }
        // Clear typing timeout
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        // Reset fetching flag
        isFetchingMessagesRef.current = false;
      };
    }
  }, [conversationId]);

  // Catch up on messages that arrived while the phone was locked/offline:
  // when the app returns to the foreground and when Pusher reconnects.
  useEffect(() => {
    const appStateSubscription = AppState.addEventListener(
      'change',
      (state: AppStateStatus) => {
        if (state === 'active') void refreshNewestMessagesRef.current();
      }
    );
    const removeConnectionListener = pusherService.addConnectionListener(
      (currentState, previousState) => {
        if (currentState === 'CONNECTED' && previousState !== 'CONNECTED') {
          void refreshNewestMessagesRef.current();
        }
      }
    );
    return () => {
      appStateSubscription.remove();
      removeConnectionListener();
    };
  }, []);

  // While this chat is focused and Pusher is not connected, poll the newest
  // page so the thread still updates.
  useFocusEffect(
    useCallback(() => {
      if (!conversationId) return undefined;
      const timer = setInterval(() => {
        if (
          AppState.currentState === 'active' &&
          pusherService.getConnectionState() !== 'CONNECTED'
        ) {
          void refreshNewestMessagesRef.current();
        }
      }, OFFLINE_POLL_INTERVAL_MS);
      return () => clearInterval(timer);
    }, [conversationId])
  );

  // Reports unread messages from the other side with ONE mark-all-read call
  // (the server also stamps them delivered). Runs on focus, when the list
  // gains a message that was not reported yet (e.g. a catch-up fetch) and when
  // the app returns to the foreground; ids already reported are skipped, so
  // each new message costs at most one call.
  const markUnreadMessagesRead = useCallback(
    (list: ChatMessage[]) => {
      const currentUserId = currentUser?.id;
      if (!conversationId || !currentUserId) return;
      if (AppState.currentState !== 'active') return;

      const unreadIds = list
        .filter(
          (message) =>
            message.id > 0 &&
            message.send_status === undefined &&
            message.sender_id !== currentUserId &&
            !markedAsReadRef.current.has(message.id) &&
            !message.statuses?.some(
              (status) =>
                status.participant_id === currentUserId &&
                status.read_at !== null
            )
        )
        .map((message) => message.id);
      if (unreadIds.length === 0) return;

      unreadIds.forEach((id) => markedAsReadRef.current.add(id));

      messageServices
        .markAllMessagesAsRead(parseInt(conversationId, 10))
        .catch((error) => {
          console.error('[SingleChat] Error marking messages as read:', error);
          if (!isRateLimitError(error)) {
            unreadIds.forEach((id) => markedAsReadRef.current.delete(id));
          }
        });
    },
    [conversationId, currentUser?.id]
  );

  useFocusEffect(
    useCallback(() => {
      markUnreadMessagesRead(messages);
    }, [messages, markUnreadMessagesRead])
  );

  // Back from the background while the thread is open: report what arrived.
  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (state: AppStateStatus) => {
        if (state === 'active' && isScreenFocusedRef.current) {
          markUnreadMessagesRead(messagesRef.current);
        }
      }
    );
    return () => subscription.remove();
  }, [markUnreadMessagesRead]);

  // The server refused a send because one side has blocked the other. Swap the
  // composer for the blocked bar at once (generic wording), then ask the
  // server which side it is so "You blocked ..." + Unblock can be shown.
  const onSendBlocked = () => {
    flashErrorMessage(LanguageKeys.chatErrorBlocked);
    setIsBlockedYou(true);

    const partnerId = otherUserData?.id;
    if (!partnerId) return;
    const me = currentUser?.id;
    messageServices
      .getConversationWithUser(partnerId)
      .then((conversation) => {
        if (!conversation) return;
        const myRow = conversation.participants?.find(
          (p) => String(p.id) === String(me)
        );
        const iBlocked = !!getOtherParticipant(conversation, me)?.is_blocked;
        const theyBlocked = !!myRow?.is_blocked;
        if (iBlocked || theyBlocked) {
          setIsBlockedByYou(iBlocked);
          setIsBlockedYou(theyBlocked);
        }
      })
      .catch((error: unknown) => {
        console.error('[SingleChat] Block state lookup failed:', error);
      });
  };

  const { onSendPress, retryMessage, discardMessage } = useSendMessage({
    otherUserData,
    conversationData,
    setConversationData,
    messages,
    setMessages,
    conversationId,
    setConversationId,
    currentUserId: currentUser?.id,
    isBlockedByYou,
    setInputMessage: setInputText,
    onBlocked: onSendBlocked,
    onWaitForReply: () => setServerSaysWait(true),
    onConversationStarted: () => setCreatedHere(true),
  });

  const waitingForReply = isWaitingForReply({
    gender: currentUser?.gender,
    currentUserId: currentUser?.id,
    messages,
    createdHere,
    serverSaysWait,
  });

  // The "seen" avatar sits under one bubble. Computed once per list change
  // here instead of sorting the whole list inside every rendered bubble.
  const lastSeenMessageId = useMemo(() => {
    const index = getLastSeenMessageIndex(
      messages,
      currentUser?.id,
      otherUserData?.id
    );
    return index >= 0 ? messages[index]?.id : null;
  }, [messages, currentUser?.id, otherUserData?.id]);

  const onFailedMessagePress = (message: ChatMessage) => {
    // Still waiting for a reply: a resend would only be rejected again.
    if (waitingForReply && message.failure_code === 'WAIT_FOR_REPLY') return;
    if (message.local_id) retryMessage(message.local_id);
  };

  const onFailedMessageLongPress = (message: ChatMessage) => {
    const localId = message.local_id;
    if (!localId) return;
    Alert.alert(t(LanguageKeys.chatSendFailed), undefined, [
      ...(waitingForReply && message.failure_code === 'WAIT_FOR_REPLY'
        ? []
        : [
            {
              text: t(LanguageKeys.chatRetry),
              onPress: () => retryMessage(localId),
            },
          ]),
      {
        text: t(LanguageKeys.chatDeleteUnsent),
        style: 'destructive',
        onPress: () => discardMessage(localId),
      },
      { text: t(LanguageKeys.cancel), style: 'cancel' },
    ]);
  };

  // Report: long-press a received message -> pick a reason -> send.
  const [reportTarget, setReportTarget] = useState<ChatMessage | null>(null);
  const isSupportChat =
    conversationData?.type === 'support' || otherUserData?.type === 'Admin';

  const closeReportPicker = () => setReportTarget(null);

  const onReportReasonPress = async (item: { value?: string }) => {
    const target = reportTarget;
    if (!target || !item?.value || item.value === 'cancel') return;
    try {
      await messageServices.reportMessage(target.id, { reason: item.value });
      flashSuccessMessage(LanguageKeys.chatReportSent);
    } catch (error: unknown) {
      flashErrorMessage(chatErrorMessageKey(error));
    }
  };

  const reportPickerData = [
    ...REPORT_REASONS.map((reason) => ({
      label: t(reason.labelKey),
      value: reason.value,
    })),
    { label: t(LanguageKeys.cancel), value: 'cancel' },
  ];

  useEffect(() => {
    const unsubscribe = props.navigation.addListener('blur', () => {
      void stopAudioPlayback();
      evaluateAndMaybeShowRatingPrompt(
        'chat_activity',
        currentUser?.created_at
      );
      // A half-recorded voice note is dropped when the member leaves.
      void abortVoiceRecordingRef.current();
    });
    return unsubscribe;
  }, [props.navigation, currentUser?.created_at, stopAudioPlayback]);

  useEffect(() => {
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
    // Some locales have untranslated ("not available") advice entries —
    // never surface those as the rotating quote.
    const availableQuotes = quotes.filter(
      (candidate) => candidate && candidate !== 'not available'
    );
    setQuote([...availableQuotes].sort(() => Math.random() - 0.5)[0] ?? '');
  }, []);

  const onMessagePress = (messageId: number) => {
    if (messageId === messagePressedId) {
      setMessagePressedId(null);
    } else {
      setMessagePressedId(messageId);
    }
  };

  const onInputFocus = () => {
    if (flatListRef?.current) {
      flatListRef?.current?.scrollToOffset({ offset: 0, animated: true });
    }
  };

  const onScrollBegin = () => {
    if (inputRef.current && inputRef.current.isFocused()) {
      inputRef.current.blur();
    }
  };

  const onDisabledInputPress = () => {
    flashInfoMessage(LanguageKeys.disabledChatDescription);
  };

  const onViewProfilePress = () => {
    props.navigation.navigate('UserProfile', { userData: otherUserData });
  };

  const onRetryLoad = () => {
    if (conversationId) {
      void fetchMessages();
    } else {
      retryResolution();
    }
  };

  const onIcebreakerSelect = (text: string) => {
    setInputText(text);
    inputRef.current?.focus();
  };

  // Offer greeting suggestions only before the very first message — never
  // once any chat history exists. The intro panel follows the same rule.
  const showIcebreakers =
    !loader &&
    !loadError &&
    resolved &&
    messages.length === 0 &&
    !isBlockedYou &&
    !isBlockedByYou &&
    !isPartnerDeleted;

  const renderThreadIntro = () => (
    <MatchIntroCard
      otherUserData={otherUserData}
      isBlockedYou={isBlockedYou}
      onViewProfilePress={isPartnerDeleted ? undefined : onViewProfilePress}
      quote={quote || undefined}
    />
  );

  // Sends whatever is in the composer. Returns right away: the message shows
  // up as a bubble immediately and the request settles in the background.
  const submitComposerText = () => {
    const text = inputMessageRef.current;
    if (text.trim().length === 0 || !resolved || waitingForReply) return;

    lastSendAtRef.current = Date.now();
    const res = onSendPress(text);

    if (res.type === 'blockedByYou') {
      flashErrorMessage(
        `Unblock ${otherUserData?.name || 'this member'} to send a message.`
      );
    }
  };

  const handleSubmitEditing = () => {
    submitComposerText();
  };

  // Unblock directly from the inline composer bar shown when you've blocked
  // this member. Clears the conversation pivot so messaging resumes.
  const onUnblockFromComposer = async () => {
    if (isUnblocking) return;
    const conversationIdNum = parseInt(conversationId, 10);
    if (!conversationId || isNaN(conversationIdNum) || !otherUserData?.id) {
      flashErrorMessage(LanguageKeys.somethingWentWrong);
      return;
    }
    setIsUnblocking(true);
    try {
      await messageServices.unblockConversationParticipant(
        conversationIdNum,
        otherUserData.id
      );
      setIsBlockedByYou(false);
      flashSuccessMessage(LanguageKeys.unBlocked);
    } catch (error: unknown) {
      flashErrorMessage(chatErrorMessageKey(error));
    } finally {
      setIsUnblocking(false);
    }
  };

  const clearVoiceTimer = () => {
    if (voiceTimerRef.current) {
      clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
  };

  const startVoiceRecording = async () => {
    if (!resolved) return;
    await stopAudioPlayback();

    const hasPermission = await chatAudioService.requestRecordPermission();
    if (!hasPermission) {
      flashErrorMessage(LanguageKeys.microphonePermissionDenied);
      return;
    }

    try {
      setVoiceElapsedSeconds(0);
      setVoiceWaveformPeaks([]);
      await chatAudioService.startRecording({
        onWaveformPeak: (peak) => {
          setVoiceWaveformPeaks((previous) => {
            const next = [...previous, peak];
            return next.slice(-24);
          });
        },
      });
      // The member left (or the app was backgrounded) while the recorder was
      // starting: do not leave it running unseen.
      if (
        !isScreenFocusedRef.current ||
        AppState.currentState === 'background'
      ) {
        await chatAudioService.cancelRecording();
        return;
      }
      setIsRecordingVoice(true);
      // Capped here; the auto-stop effect below ends the note at the cap.
      voiceTimerRef.current = setInterval(() => {
        setVoiceElapsedSeconds((seconds) =>
          Math.min(seconds + 1, MAX_VOICE_SECONDS)
        );
      }, 1000);
    } catch (error) {
      flashErrorMessage(LanguageKeys.microphonePermissionDenied);
    }
  };

  const cancelVoiceRecording = async () => {
    clearVoiceTimer();
    setIsRecordingVoice(false);
    setVoiceElapsedSeconds(0);
    setVoiceWaveformPeaks((previous) => (previous.length ? [] : previous));
    try {
      await chatAudioService.cancelRecording();
    } catch (error) {
      console.error('[SingleChat] Error cancelling recording:', error);
    }
  };

  const sendVoiceRecording = async () => {
    if (isSendingVoice) return;
    // A voice note cannot open a chat: drop the recording and close the bar.
    if (getSendTarget(conversationData, conversationId).kind === 'new') {
      await cancelVoiceRecording();
      flashErrorMessage(LanguageKeys.chatVoiceNeedsText);
      return;
    }
    setIsSendingVoice(true);
    clearVoiceTimer();
    try {
      const recording = await chatAudioService.stopRecording(
        Math.max(1, voiceElapsedSeconds)
      );
      // The recording is handed to a bubble that keeps the file: if the upload
      // fails the member taps it to retry instead of re-recording.
      onSendPress({
        type: 'audio',
        audio: {
          uri: recording.uri,
          name: recording.name,
          type: recording.type,
        },
        duration_seconds: recording.duration_seconds,
        waveform_peaks: recording.waveform_peaks,
      });
      setIsRecordingVoice(false);
      setVoiceElapsedSeconds(0);
      setVoiceWaveformPeaks([]);
    } finally {
      setIsSendingVoice(false);
    }
  };

  // Always the latest versions, for callers that outlive a render.
  const sendVoiceRecordingRef = useRef(sendVoiceRecording);
  useEffect(() => {
    abortVoiceRecordingRef.current = cancelVoiceRecording;
    sendVoiceRecordingRef.current = sendVoiceRecording;
  });

  // A voice note stops by itself at the length cap and is sent.
  useEffect(() => {
    if (isRecordingVoice && voiceElapsedSeconds >= MAX_VOICE_SECONDS) {
      void sendVoiceRecordingRef.current();
    }
  }, [isRecordingVoice, voiceElapsedSeconds]);

  return (
    <Container>
      {/* {(currentUser?.membership_status === 0 ||
        currentUser?.membership_status === null) && (
        <PremiumButton
          heading={LanguageKeys.goPremiumButtonHeadingOne}
          description={LanguageKeys.goPremiumButtonHeadingTwo}
        />
      )} */}

      <SingleChatHeader
        navigation={props?.navigation}
        otherUserData={otherUserData}
        messages={messages}
        conversationData={conversationData}
        conversationId={conversationId}
        currentUserId={currentUser?.id}
        isBlockedByYou={isBlockedByYou}
        isBlockedYou={isBlockedYou}
        onBlockedByYouChange={setIsBlockedByYou}
        isPartnerDeleted={isPartnerDeleted}
        setMessages={setMessages}
      />
      <NotificationPermissionBanner />
      <KeyboardAvoidingView
        style={Styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={Styles.innerContainer}>
          {/* Typing Indicator */}
          {isOtherUserTyping && (
            <TypingIndicator userName={otherUserData?.name} />
          )}

          <View style={Styles.chatBody}>
            {loader ? (
              <ActivityIndicator
                color={Colors.primary}
                size={'small'}
                style={Styles.chatLoader}
              />
            ) : loadError ? (
              <View
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: wp(8),
                  gap: wp(4),
                }}
              >
                <Text
                  style={{
                    color: Colors.muted,
                    fontSize: wp(3.6),
                    textAlign: 'center',
                  }}
                >
                  {t(LanguageKeys.chatLoadFailed)}
                </Text>
                <TouchableOpacity
                  onPress={onRetryLoad}
                  style={{
                    paddingVertical: wp(2.5),
                    paddingHorizontal: wp(6),
                    borderRadius: wp(6),
                    backgroundColor: Colors.primary,
                  }}
                >
                  <Text
                    style={{
                      color: Colors.color2,
                      fontWeight: '600',
                      fontSize: wp(3.6),
                    }}
                  >
                    {t(LanguageKeys.tryAgain)}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : messages?.length ? (
              <VirtualizedList
                onScrollBeginDrag={onScrollBegin}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={
                  Platform.OS === 'ios' ? 'interactive' : 'on-drag'
                }
                initialNumToRender={10}
                windowSize={15}
                ref={flatListRef}
                data={messages}
                inverted
                style={Styles.messagesList}
                renderItem={({ item }) => {
                  const currentUserId = currentUser?.id;

                  return (
                    <MessageBubble
                      item={item}
                      currentUserId={currentUserId}
                      guardianUserId={currentUser?.user?.id}
                      otherUserId={otherUserData?.id}
                      otherUserImage={otherUserData?.image}
                      isBlockedYou={isBlockedYou}
                      isLastSeenMessage={item.id === lastSeenMessageId}
                      isWaitingForReply={waitingForReply}
                      onFailedPress={onFailedMessagePress}
                      onFailedLongPress={onFailedMessageLongPress}
                      onReportPress={
                        !isSupportChat && canReportMessage(item, currentUserId)
                          ? setReportTarget
                          : undefined
                      }
                      messagePressedId={messagePressedId}
                      onMessagePress={onMessagePress}
                      getAudioPlayback={getAudioPlayback}
                      onToggleAudioPlayback={onToggleAudioPlayback}
                      Styles={Styles}
                    />
                  );
                }}
                contentContainerStyle={Styles.messagesListContainer}
                getItem={(data, index) => data[index]}
                getItemCount={(data) => data.length}
                // Stable across the bubble -> server message hand-over (which changes
                // `id` but keeps `local_id`), so the row is not remounted.
                keyExtractor={(item: ChatMessage) =>
                  item.local_id ?? String(item.id)
                }
                onEndReached={loadOlderMessages}
                onEndReachedThreshold={0.5}
                ListFooterComponent={
                  isLoadingMoreMessages ? (
                    <ActivityIndicator
                      color={Colors.primary}
                      size={'small'}
                      style={{ marginVertical: wp(4) }}
                    />
                  ) : null
                }
              />
            ) : (
              <View style={Styles.threadIntroEmptyWrapper}>
                {renderThreadIntro()}
              </View>
            )}
          </View>
          <View style={Styles.composerArea}>
            {showIcebreakers && !isRecordingVoice && (
              <IcebreakerChips onSelect={onIcebreakerSelect} rtl={Rtl} />
            )}
            {loadError === 'resolve' ? null : isPartnerDeleted ? (
              // The member's account is gone: history stays readable, but
              // there is no one to message.
              <View
                style={{
                  flexDirection: Rtl ? 'row-reverse' : 'row',
                  alignItems: 'center',
                  paddingVertical: wp(3.5),
                  paddingHorizontal: wp(4),
                  borderTopWidth: 1,
                  borderTopColor: Colors.hairline,
                  gap: wp(3),
                }}
              >
                <Ionicons
                  name="information-circle-outline"
                  size={wp(5)}
                  color={Colors.muted}
                />
                <Text
                  style={{
                    flex: 1,
                    color: Colors.muted,
                    fontSize: wp(3.4),
                    textAlign: Rtl ? 'right' : 'left',
                  }}
                  numberOfLines={2}
                >
                  {t(LanguageKeys.chatPartnerUnavailable)}
                </Text>
              </View>
            ) : isRecordingVoice ? (
              <VoiceRecorderBar
                elapsedSeconds={voiceElapsedSeconds}
                isSending={isSendingVoice}
                waveformPeaks={voiceWaveformPeaks}
                onCancel={cancelVoiceRecording}
                onSend={sendVoiceRecording}
              />
            ) : isBlockedByYou ? (
              // You've blocked this member — replace the composer with a clear
              // inline bar + one-tap Unblock, instead of a native alert on send.
              <View
                style={{
                  flexDirection: Rtl ? 'row-reverse' : 'row',
                  alignItems: 'center',
                  paddingVertical: wp(3),
                  paddingHorizontal: wp(4),
                  borderTopWidth: 1,
                  borderTopColor: Colors.hairline,
                  gap: wp(3),
                }}
              >
                <Ionicons name="ban" size={wp(5)} color={Colors.muted} />
                <Text
                  style={{
                    flex: 1,
                    color: Colors.muted,
                    fontSize: wp(3.4),
                    textAlign: Rtl ? 'right' : 'left',
                  }}
                  numberOfLines={2}
                >
                  {t(LanguageKeys.chatYouBlockedMember, {
                    name: otherUserData?.name || 'this member',
                  })}
                </Text>
                <TouchableOpacity
                  onPress={onUnblockFromComposer}
                  disabled={isUnblocking}
                  style={{
                    paddingVertical: wp(2),
                    paddingHorizontal: wp(4.5),
                    borderRadius: wp(6),
                    backgroundColor: isUnblocking
                      ? Colors.primaryLite
                      : Colors.primary,
                  }}
                >
                  <Text
                    style={{
                      color: Colors.color2,
                      fontWeight: '600',
                      fontSize: wp(3.4),
                    }}
                  >
                    {t(LanguageKeys.unBlock)}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : isBlockedYou ? (
              // The other member blocked you (or the server refused a send):
              // nothing to unblock from here, just say so.
              <View
                style={{
                  flexDirection: Rtl ? 'row-reverse' : 'row',
                  alignItems: 'center',
                  paddingVertical: wp(3.5),
                  paddingHorizontal: wp(4),
                  borderTopWidth: 1,
                  borderTopColor: Colors.hairline,
                  gap: wp(3),
                }}
              >
                <Ionicons name="ban" size={wp(5)} color={Colors.muted} />
                <Text
                  style={{
                    flex: 1,
                    color: Colors.muted,
                    fontSize: wp(3.4),
                    textAlign: Rtl ? 'right' : 'left',
                  }}
                  numberOfLines={2}
                >
                  {t(LanguageKeys.chatErrorBlocked)}
                </Text>
              </View>
            ) : waitingForReply ? (
              // Men must wait for the first reply before sending again.
              <View
                style={{
                  flexDirection: Rtl ? 'row-reverse' : 'row',
                  alignItems: 'center',
                  paddingVertical: wp(3.5),
                  paddingHorizontal: wp(4),
                  borderTopWidth: 1,
                  borderTopColor: Colors.hairline,
                  gap: wp(3),
                }}
              >
                <Ionicons
                  name="time-outline"
                  size={wp(5)}
                  color={Colors.muted}
                />
                <Text
                  style={{
                    flex: 1,
                    color: Colors.muted,
                    fontSize: wp(3.4),
                    textAlign: Rtl ? 'right' : 'left',
                  }}
                  numberOfLines={2}
                >
                  {t(LanguageKeys.chatWaitForReplyHint)}
                </Text>
              </View>
            ) : (
              <View
                style={{
                  ...Styles.messageInputOuter,
                  flexDirection: Rtl ? 'row-reverse' : 'row',
                }}
              >
                <TextInput
                  ref={inputRef}
                  style={{
                    ...Styles.messageInput,
                    textAlign: Rtl ? 'right' : 'left',
                  }}
                  placeholder={t('message')}
                  placeholderTextColor={Colors.muted}
                  value={inputMessage}
                  onChangeText={onChangeInputMessage}
                  onFocus={onInputFocus}
                  onSubmitEditing={handleSubmitEditing}
                  maxLength={350}
                  submitBehavior="blurAndSubmit"
                  returnKeyType="send"
                />
                <TouchableOpacity
                  style={{
                    ...Styles.sendBtn,
                    backgroundColor:
                      inputMessage.trim().length === 0
                        ? Colors.primaryLite
                        : Colors.primary,
                  }}
                  onPress={async () => {
                    if (!resolved) return;
                    if (inputMessageRef.current.trim().length === 0) {
                      // A second tap right after a send must not start a
                      // recording (the icon is still 'send' until re-render).
                      if (Date.now() - lastSendAtRef.current < 600) return;
                      await startVoiceRecording();
                      return;
                    }
                    submitComposerText();
                  }}
                >
                  <Ionicons
                    name={inputMessage.trim().length === 0 ? 'mic' : 'send'}
                    size={wp(4.6)}
                    color={Colors.color2}
                    style={{
                      marginLeft: Rtl ? 0 : wp(0.5),
                      marginRight: Rtl ? wp(0.5) : 0,
                      transform: Rtl ? [{ scaleX: -1 }] : [],
                    }}
                  />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
      <ButtonPicker
        visible={!!reportTarget}
        data={reportPickerData}
        headerTitle={t(LanguageKeys.chatReportReasonTitle)}
        onButtonPress={onReportReasonPress}
        onClose={closeReportPicker}
      />
    </Container>
  );
};

export default SingleChat;
