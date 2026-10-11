import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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

import { Container } from '../../components';
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
  Message,
  MessageDeliveredEventData,
  MessageReadEventData,
  MessageSentEventData,
  ParticipantBlockedEventData,
} from '../../services/api/types/message-types';
import chatAudioService from '../../services/audio/chat-audio-service';
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
import Styles from './SingleChat.styles';
import SingleChatHeader from './SingleChatHeader';

type ChatAudioPlaybackState = {
  messageId: number | null;
  status: 'idle' | 'loading' | 'playing' | 'paused';
  positionMillis: number;
  durationMillis: number;
};

const MESSAGES_PAGE_SIZE = 50;

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
  const guardian = currentUser?.guardian ? currentUser?.guardian : false;
  const [messages, setMessages] = useState<Message[]>([]);
  // Track messages to avoid race conditions between fetchMessages and Pusher events
  const messagesRef = useRef<Message[]>([]);
  const {
    otherUserData,
    conversationData,
    setConversationData,
    conversationId,
    setConversationId,
    isBlockedByYou,
    setIsBlockedByYou: _setIsBlockedByYou,
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
    },
  });
  // Tell the foreground push banner which chat is on screen so a message for
  // it doesn't pop a banner over the thread being read. Cleared on blur,
  // unmount and when the screen is re-targeted at another conversation.
  useFocusEffect(
    useCallback(() => {
      if (!conversationId) return undefined;
      updateOpenedConversationId?.(conversationId);
      return () => updateOpenedConversationId?.(null);
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
  // Track which messages have been marked as read to avoid duplicate API calls
  const markedAsReadRef = useRef<Set<number>>(new Set());
  // Track which messages have been marked as delivered to avoid duplicate API calls
  const markedAsDeliveredRef = useRef<Set<number>>(new Set());
  // Bulk mark-all-read should fire once per focus session, not on every
  // messages-array change — otherwise every single incoming message while
  // the screen stays focused re-triggers a "mark whole conversation read"
  // round-trip (this was already tripping the 429 handling below).
  const hasMarkedAllOnFocusRef = useRef<boolean>(false);
  const isFetchingMessagesRef = useRef<boolean>(false);
  // Older-message pagination: history was previously capped at whatever the
  // first fetch returned (50 messages) with no way to load anything before that.
  const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false);
  const isLoadingMoreRef = useRef<boolean>(false);
  const hasMoreMessagesRef = useRef<boolean>(true);
  const currentPageRef = useRef<number>(1);
  const audioPlaybackRef = useRef<ChatAudioPlaybackState>(audioPlayback);
  const audioSourceCacheRef = useRef<Map<number, string>>(new Map());

  const [inputMessage, setInputMessage] = useState('');
  const onChangeInputMessage = (text: string) => {
    setInputMessage(text);

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

  // Clear the voice-recording interval if the screen unmounts mid-recording.
  useEffect(() => {
    return () => {
      if (voiceTimerRef.current) {
        clearInterval(voiceTimerRef.current);
        voiceTimerRef.current = null;
      }
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

      // Merge fetched messages with existing messages to avoid losing Pusher messages
      // Get current messages from ref to avoid stale closure
      const currentMessages = messagesRef.current;

      // Create a map of existing messages by ID for quick lookup
      const existingMessagesMap = new Map(
        currentMessages.map((msg) => [msg.id, msg])
      );

      // Add fetched messages, keeping existing ones if they're newer or have updates
      fetchedMessages.forEach((fetchedMsg) => {
        const existingMsg = existingMessagesMap.get(fetchedMsg.id);
        if (!existingMsg) {
          // New message from API, add it
          existingMessagesMap.set(fetchedMsg.id, fetchedMsg);
        } else {
          // Message exists, keep the one with more complete data (prefer existing if it has statuses)
          if (existingMsg.statuses && existingMsg.statuses.length > 0) {
            // Keep existing message but update other fields if needed
            existingMessagesMap.set(fetchedMsg.id, {
              ...fetchedMsg,
              statuses: existingMsg.statuses,
            });
          } else {
            // Use fetched message if it has better data
            existingMessagesMap.set(fetchedMsg.id, fetchedMsg);
          }
        }
      });

      // Convert map back to array and sort by created_at (newest first)
      const mergedMessages = Array.from(existingMessagesMap.values());
      const sortedMessages = mergedMessages.sort((a, b) => {
        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();
        return timeB - timeA; // Descending order (newest first)
      });

      setMessages(sortedMessages);
      messagesRef.current = sortedMessages;
      setLoader(false);
      isFetchingMessagesRef.current = false;

      // Reset the marked as read/delivered tracking when messages are fetched
      // This ensures we can mark messages as read/delivered when screen is focused
      markedAsReadRef.current.clear();
      markedAsDeliveredRef.current.clear();
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

      const currentMessages = messagesRef.current;
      const existingIds = new Set(currentMessages.map((msg) => msg.id));
      const newOlderMessages = olderMessages.filter(
        (msg) => !existingIds.has(msg.id)
      );
      if (newOlderMessages.length === 0) return;

      // Older messages sort to the end of the (newest-first) array.
      const merged = [...currentMessages, ...newOlderMessages].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setMessages(merged);
      messagesRef.current = merged;
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

      // Mark all messages as read after subscription if there are unread messages
      const currentUserId = currentUser?.id;
      const currentUserIdStr =
        currentUserId != null ? String(currentUserId) : null;

      if (currentUserIdStr && conversationData?.participants) {
        const currentUserParticipant = conversationData.participants.find(
          (p: any) => String(p.id) === currentUserIdStr
        );
        // Focus handling batches existing unread messages; avoid a second
        // mark-all-read request during subscription setup.
        const unReadCount = Math.min(
          0,
          currentUserParticipant?.unread_count || 0
        );

        if (unReadCount > 0) {
          console.log(
            '[SingleChat] Marking all messages as read for conversation:',
            conversationId,
            'unread_count:',
            unReadCount
          );
          messageServices
            .markAllMessagesAsRead(parseInt(conversationId, 10))
            .then(() => {
              console.log(
                '[SingleChat] ✅ All messages marked as read for conversation:',
                conversationId
              );
            })
            .catch((error) => {
              console.error(
                '[SingleChat] Error marking all messages as read:',
                error
              );
            });
        }
      }
    } catch (error) {
      console.error('[SingleChat] Error setting up Pusher:', error);
    }
  }, [conversationId, conversationData, currentUser]);

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
      const message: Message = {
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

      // Add new message to list
      setMessages((prevMessages) => {
        // Check if message already exists
        const exists = prevMessages.some((msg) => msg.id === message.id);
        if (exists) {
          console.log('[SingleChat] Message already exists, skipping');
          return prevMessages;
        }

        // Always add the message, even if we're fetching
        // The fetchMessages function will merge and deduplicate
        const newMessages = [message, ...prevMessages];
        const sortedMessages = newMessages.sort((a, b) => {
          const timeA = new Date(a.created_at).getTime();
          const timeB = new Date(b.created_at).getTime();
          return timeB - timeA;
        });

        // Update ref to keep it in sync
        messagesRef.current = sortedMessages;
        return sortedMessages;
      });

      // Mark this specific message as read immediately since user is viewing the chat
      // When User B receives a message from User A while viewing the chat, mark it as read instantly
      if (message.id && !markedAsReadRef.current.has(message.id)) {
        // Add to tracking set immediately to prevent duplicate calls
        markedAsReadRef.current.add(message.id);

        // Call API to mark message as read
        messageServices
          .markMessageAsRead(message.id)
          .then(() => {
            console.log(
              '[SingleChat] ✅ Message marked as read (received while viewing):',
              message.id
            );
          })
          .catch((error) => {
            console.error(
              '[SingleChat] ❌ Error marking message as read:',
              error
            );
            if (!isRateLimitError(error)) {
              // Remove from set on non-throttle errors so we can retry later.
              markedAsReadRef.current.delete(message.id);
            }
          });
      }

      // Mark message as delivered
      if (message.id && !markedAsDeliveredRef.current.has(message.id)) {
        // Add to tracking set immediately to prevent duplicate calls
        markedAsDeliveredRef.current.add(message.id);

        messageServices
          .markMessageDelivered(message.id)
          .then(() => {
            console.log(
              '[SingleChat] ✅ Message marked as delivered (received while viewing):',
              message.id
            );
          })
          .catch((error) => {
            console.error(
              '[SingleChat] ❌ Error marking message as delivered:',
              error
            );
            if (!isRateLimitError(error)) {
              // Remove from set on non-throttle errors so we can retry later.
              markedAsDeliveredRef.current.delete(message.id);
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

  // Handle message read status update
  const handleMessageRead = useCallback((data: MessageReadEventData) => {
    console.log('[SingleChat] Updating message read status:', data);

    const readerId = data.read_by?.id;
    const readAt = data.read_at || new Date().toISOString();

    if (!readerId) {
      console.error('[SingleChat] MessageRead event missing read_by.id');
      return;
    }

    setMessages((prevMessages) =>
      prevMessages.map((msg) => {
        if (msg.id === data.message_id) {
          // Find existing status for this reader or create new one
          const existingStatusIndex = msg.statuses?.findIndex(
            (status) => status.participant_id === readerId
          );

          const updatedStatuses =
            existingStatusIndex !== undefined && existingStatusIndex >= 0
              ? // Update existing status
                msg.statuses?.map((status, index) =>
                  index === existingStatusIndex
                    ? { ...status, read_at: readAt }
                    : status
                ) || []
              : // Create new status entry for this reader
                [
                  ...(msg.statuses || []),
                  {
                    participant_type: data.read_by?.type || 'User',
                    participant_id: readerId,
                    delivered_at: null,
                    read_at: readAt,
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
        _setIsBlockedByYou(data.is_blocked);
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

  const getPreparedAudioSource = useCallback(async (message: any) => {
    if (message.local_uri) return message.local_uri;

    const cachedSource = audioSourceCacheRef.current.get(message.id);
    if (cachedSource) return cachedSource;

    const sourceUrl = (await messageServices.getMessageAudioUrl(message.id))
      .url;
    audioSourceCacheRef.current.set(message.id, sourceUrl);
    return sourceUrl;
  }, []);

  const prepareAudioMessageSource = useCallback(
    async (message: any): Promise<void> => {
      if (!message?.id) return;

      const fallbackDurationMillis = getAudioDurationMillis(message);
      setAudioPlayback({
        messageId: message.id,
        status: 'loading',
        positionMillis: 0,
        durationMillis: fallbackDurationMillis,
      });

      try {
        await getPreparedAudioSource(message);
      } catch (error) {
        console.error('[SingleChat] Error preparing audio:', error);
        flashErrorMessage('Unable to load this voice message.');
      } finally {
        resetAudioPlayback();
      }
    },
    [getAudioDurationMillis, getPreparedAudioSource, resetAudioPlayback]
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

      try {
        const sourceUrl = await getPreparedAudioSource(message);

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
        if (currentPlayback.status === 'playing') {
          void pauseAudioPlayback();
          return;
        }
        if (currentPlayback.status === 'paused') {
          void resumeAudioPlayback();
          return;
        }
      }

      if (
        !message?.local_uri &&
        !audioSourceCacheRef.current.has(message?.id)
      ) {
        void prepareAudioMessageSource(message);
        return;
      }

      void playAudioMessage(message);
    },
    [
      pauseAudioPlayback,
      playAudioMessage,
      prepareAudioMessageSource,
      resumeAudioPlayback,
    ]
  );

  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (nextState !== 'active') {
          void pauseAudioPlayback();
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

  // Mark all unread messages as read individually when screen is focused
  useFocusEffect(
    useCallback(() => {
      if (!conversationId || messages.length === 0) return;

      const currentUserId = currentUser?.id;

      if (!currentUserId) return;

      const unreadMessages = messages.filter((message) => {
        if (message.sender_id === currentUserId || !message.id) return false;
        if (markedAsReadRef.current.has(message.id)) return false;

        return !message.statuses?.some(
          (status) =>
            status.participant_id === currentUserId && status.read_at !== null
        );
      });

      if (unreadMessages.length > 0 && !hasMarkedAllOnFocusRef.current) {
        hasMarkedAllOnFocusRef.current = true;
        unreadMessages.forEach((message) =>
          markedAsReadRef.current.add(message.id)
        );

        messageServices
          .markAllMessagesAsRead(parseInt(conversationId, 10))
          .then(() => {
            console.log(
              '[SingleChat] Marked unread messages as read on focus:',
              unreadMessages.length
            );
          })
          .catch((error) => {
            console.error(
              '[SingleChat] Error marking all messages as read on focus:',
              error
            );

            if (!isRateLimitError(error)) {
              unreadMessages.forEach((message) =>
                markedAsReadRef.current.delete(message.id)
              );
              hasMarkedAllOnFocusRef.current = false;
            }
          });
      }

      // Mark each unread message from other users as read and delivered individually
      messages.forEach((message) => {
        // Only mark messages from other users
        if (message.sender_id !== currentUserId && message.id) {
          // Mark as read if not already read
          if (!markedAsReadRef.current.has(message.id)) {
            // Check if message is already read by checking statuses
            const isAlreadyRead = message.statuses?.some(
              (status) =>
                status.participant_id === currentUserId &&
                status.read_at !== null
            );

            if (!isAlreadyRead) {
              markedAsReadRef.current.add(message.id);
              messageServices
                .markMessageAsRead(message.id)
                .then(() => {
                  console.log(
                    '[SingleChat] ✅ Marked message as read on focus:',
                    message.id
                  );
                })
                .catch((error) => {
                  console.error(
                    '[SingleChat] Error marking message as read on focus:',
                    error
                  );
                  if (!isRateLimitError(error)) {
                    // Remove from set on non-throttle errors so we can retry later.
                    markedAsReadRef.current.delete(message.id);
                  }
                });
            } else {
              // Mark as processed even if already read to avoid duplicate checks
              markedAsReadRef.current.add(message.id);
            }
          }

          // Mark as delivered if not already delivered
          if (!markedAsDeliveredRef.current.has(message.id)) {
            // Check if message is already delivered by checking statuses
            const isAlreadyDelivered = message.statuses?.some(
              (status) =>
                status.participant_id === currentUserId &&
                status.delivered_at !== null
            );

            if (!isAlreadyDelivered) {
              markedAsDeliveredRef.current.add(message.id);
              messageServices
                .markMessageDelivered(message.id)
                .then(() => {
                  console.log(
                    '[SingleChat] ✅ Marked message as delivered on focus:',
                    message.id
                  );
                })
                .catch((error) => {
                  console.error(
                    '[SingleChat] Error marking message as delivered on focus:',
                    error
                  );
                  if (!isRateLimitError(error)) {
                    // Remove from set on non-throttle errors so we can retry later.
                    markedAsDeliveredRef.current.delete(message.id);
                  }
                });
            } else {
              // Mark as processed even if already delivered to avoid duplicate checks
              markedAsDeliveredRef.current.add(message.id);
            }
          }
        }
      });
      // Note: intentionally no cleanup returned here — useFocusEffect
      // re-invokes this callback (and would run any returned cleanup)
      // every time `messages` changes while still focused, since the
      // callback identity is part of its dependency array. Resetting the
      // mark-all-read gate there would refire it on every new message,
      // which is exactly the redundant behavior being fixed. The gate is
      // reset on a real navigation 'blur' instead (see effect below).
    }, [conversationId, messages, currentUser])
  );

  const { onSendPress, isSending } = useSendMessage({
    otherUserData,
    conversationData,
    setConversationData,
    messages,
    setMessages,
    conversationId,
    setConversationId,
    isBlockedByYou,
    setInputMessage,
  });

  useEffect(() => {
    const unsubscribe = props.navigation.addListener('blur', () => {
      void stopAudioPlayback();
      evaluateAndMaybeShowRatingPrompt(
        'chat_activity',
        currentUser?.created_at
      );
      // Allow the bulk mark-all-read to fire again next time this screen
      // regains focus (e.g. messages arrived while the user was elsewhere).
      hasMarkedAllOnFocusRef.current = false;
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

  const onWaliPress = () => {
    props.navigation.navigate('AddWali', { fromSettings: true });
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
    setInputMessage(text);
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

  const handleSubmitEditing = async () => {
    if (inputMessage.trim().length > 0 && !isSending && resolved) {
      const res = await onSendPress(inputMessage);

      if (res?.type === 'blockedByYou') {
        flashErrorMessage(
          `Unblock ${otherUserData?.name || 'this member'} to send a message.`
        );
      }
    }
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
      _setIsBlockedByYou(false);
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
      setIsRecordingVoice(true);
      voiceTimerRef.current = setInterval(() => {
        setVoiceElapsedSeconds((seconds) => {
          if (seconds >= 60) {
            clearVoiceTimer();
            return 60;
          }
          return seconds + 1;
        });
      }, 1000);
    } catch (error) {
      flashErrorMessage(LanguageKeys.microphonePermissionDenied);
    }
  };

  const cancelVoiceRecording = async () => {
    clearVoiceTimer();
    await chatAudioService.cancelRecording();
    setIsRecordingVoice(false);
    setVoiceElapsedSeconds(0);
    setVoiceWaveformPeaks([]);
  };

  const sendVoiceRecording = async () => {
    if (isSendingVoice) return;
    setIsSendingVoice(true);
    clearVoiceTimer();
    try {
      const recording = await chatAudioService.stopRecording(
        Math.max(1, voiceElapsedSeconds)
      );
      await onSendPress({
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
        isPartnerDeleted={isPartnerDeleted}
        setMessages={setMessages}
      />
      <NotificationPermissionBanner />
      <KeyboardAvoidingView
        style={Styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={Styles.innerContainer}>
          {/* Wali/guardian banner hidden for now (comment out only, per
            explicit direction -- guardian is core functionality, not being
            removed).
        {guardian ? (
          <Ripple style={Styles.guardianTextWrapper} onPress={onWaliPress}>
            <Text style={Styles.guardianText}>{t('monitoredByWali')}</Text>
          </Ripple>
        ) : currentUser?.gender === 'female' ? (
          <Ripple style={Styles.guardianTextWrapper} onPress={onWaliPress}>
            <Text style={Styles.guardianText}>{t('addAWali')}</Text>
          </Ripple>
        ) : null} */}

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
                renderItem={({ item, index }) => {
                  const currentUserId = currentUser?.id;

                  return (
                    <MessageBubble
                      item={item}
                      index={index}
                      currentUserId={currentUserId}
                      guardianUserId={currentUser?.user?.id}
                      otherUserId={otherUserData?.id}
                      otherUserImage={otherUserData?.image}
                      isBlockedYou={isBlockedYou}
                      messages={messages}
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
                keyExtractor={(item: any) => String(item.id)}
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
                  {`You blocked ${
                    otherUserData?.name || 'this member'
                  }. Unblock to send messages.`}
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
                  disabled={isSending}
                  onPress={async () => {
                    if (isSending || !resolved) return;
                    if (inputMessage.trim().length === 0) {
                      await startVoiceRecording();
                      return;
                    }
                    const res = await onSendPress(inputMessage);

                    if (res?.type === 'blockedByYou') {
                      flashErrorMessage(
                        `Unblock ${
                          otherUserData?.name || 'this member'
                        } to send a message.`
                      );
                    }
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
    </Container>
  );
};

export default SingleChat;
