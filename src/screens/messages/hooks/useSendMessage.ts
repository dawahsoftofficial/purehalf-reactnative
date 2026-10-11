import type React from 'react';
import { useRef, useState } from 'react';

import { recordSentMessage } from '@/services/rating/ratingEngagement';

import { LanguageKeys } from '../../../languages';
import { flashErrorMessage } from '../../../services';
import {
  type ChatErrorCode,
  toChatApiError,
} from '../../../services/api/chat-errors';
import messageServices from '../../../services/api/message-services';
import type {
  Conversation,
  Message,
} from '../../../services/api/types/message-types';
import { presentChatCreditsPaywall } from '../../../services/paywall-service';

type OtherUserData = {
  id: number;
  [key: string]: unknown;
};

type UseSendMessageParams = {
  otherUserData: OtherUserData;
  conversationData: Conversation | null | undefined;
  setConversationData: (conversation: Conversation) => void;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  conversationId: string;
  setConversationId: (id: string) => void;
  isBlockedByYou: boolean;
  setInputMessage: (message: string) => void;
  /**
   * Called when the server rejects a send with BLOCKED (either member blocked
   * the other). When omitted the localized message is flashed instead.
   */
  onBlocked?: () => void;
};

// Localized copy per error code. Codes not listed here (VALIDATION, UNKNOWN)
// fall back to the generic error message rather than showing raw server text.
const CHAT_ERROR_MESSAGE_KEYS: Partial<Record<ChatErrorCode, string>> = {
  NO_CHAT_CREDITS: LanguageKeys.chatErrorNoCredits,
  BLOCKED: LanguageKeys.chatErrorBlocked,
  WAIT_FOR_REPLY: LanguageKeys.chatErrorWaitForReply,
  RECIPIENT_UNAVAILABLE: LanguageKeys.chatErrorRecipientUnavailable,
  ACCOUNT_SUSPENDED: LanguageKeys.chatErrorAccountSuspended,
  FORBIDDEN: LanguageKeys.chatErrorForbidden,
  RATE_LIMITED: LanguageKeys.chatErrorRateLimited,
  NETWORK: LanguageKeys.chatErrorNetwork,
};

type SendMessageResult =
  | { type: 'blockedByYou' }
  | { type: 'sent' }
  | { type: 'failed' };

export type AudioSendInput = {
  type: 'audio';
  audio: { uri: string; name: string; type: string };
  duration_seconds: number;
  waveform_peaks?: number[];
};

export type SendMessageInput = string | AudioSendInput;

type UseSendMessageReturn = {
  onSendPress: (input: SendMessageInput) => Promise<SendMessageResult>;
  isSending: boolean;
};

export function useSendMessage({
  otherUserData,
  conversationData,
  setConversationData,
  messages,
  setMessages,
  conversationId,
  setConversationId,
  isBlockedByYou,
  setInputMessage,
  onBlocked,
}: UseSendMessageParams): UseSendMessageReturn {
  const [isSending, setIsSending] = useState(false);
  // Guards against a double-tap/double-Enter firing two overlapping sends
  // before the first request resolves (isSending state updates are async
  // and can't be read synchronously between the two calls).
  const isSendingRef = useRef(false);

  const handleSendError = (error: unknown) => {
    const chatError = toChatApiError(error);

    if (chatError.code === 'BLOCKED' && onBlocked) {
      onBlocked();
      return;
    }

    flashErrorMessage(
      CHAT_ERROR_MESSAGE_KEYS[chatError.code] ?? LanguageKeys.commonErrorMessage
    );

    if (chatError.code === 'NO_CHAT_CREDITS') {
      void presentChatCreditsPaywall();
    }
  };

  const sendMessage = async (input: SendMessageInput): Promise<boolean> => {
    // Preserve the typed text so it can be restored if the send fails —
    // previously it was cleared unconditionally and lost on any error.
    const originalText = typeof input === 'string' ? input : null;
    const restoreInputIfText = () => {
      if (originalText !== null) {
        setInputMessage(originalText);
      }
    };
    setInputMessage('');

    // New conversation - check if conversationData is null/undefined or doesn't have an id
    if (!conversationData || !conversationData.id) {
      if (typeof input !== 'string') {
        flashErrorMessage('Please send a text message before voice notes.');
        return false;
      }

      try {
        const createdConversation: Conversation =
          await messageServices.startConversation({
            receiver_id: otherUserData?.id,
            body: input,
          });

        setConversationId(createdConversation.id.toString());
        setConversationData(createdConversation);

        // Use API message directly without conversion
        const apiMessage: Message | null =
          createdConversation.last_message_detail;
        if (apiMessage) {
          // Sort messages by created_at (newest first)
          const allMessages = [apiMessage, ...messages];
          const sortedMessages = allMessages.sort((a, b) => {
            const timeA = new Date(a.created_at).getTime();
            const timeB = new Date(b.created_at).getTime();
            return timeB - timeA; // Descending order (newest first)
          });
          setMessages(sortedMessages);
        }
        return true;
      } catch (error: unknown) {
        restoreInputIfText();
        handleSendError(error);
        return false;
      }
    }

    // Existing conversation - send message
    if (!conversationId) {
      restoreInputIfText();
      flashErrorMessage('Conversation ID is missing');
      return false;
    }

    try {
      const conversationIdNum = parseInt(conversationId, 10);
      if (isNaN(conversationIdNum)) {
        restoreInputIfText();
        flashErrorMessage('Invalid conversation ID');
        return false;
      }

      const payload = typeof input === 'string' ? { body: input } : input;
      const sentMessage: Message =
        await messageServices.sendConversationMessage(
          conversationIdNum,
          payload
        );

      // Add the new message and sort by created_at (newest first)
      // Use functional update to avoid race conditions
      setMessages((prevMessages: Message[]) => {
        // Check if message already exists (might have come via Pusher)
        const exists = prevMessages.some(
          (msg: Message) => msg.id === sentMessage.id
        );
        if (exists) {
          console.log('[useSendMessage] Message already exists, skipping');
          return prevMessages;
        }

        const allMessages = [sentMessage, ...prevMessages];
        const sortedMessages = allMessages.sort((a, b) => {
          const timeA = new Date(a.created_at).getTime();
          const timeB = new Date(b.created_at).getTime();
          return timeB - timeA; // Descending order (newest first)
        });
        return sortedMessages;
      });
      return true;
    } catch (error: unknown) {
      restoreInputIfText();
      handleSendError(error);
      return false;
    }
  };

  const onSendPress = async (
    input: SendMessageInput
  ): Promise<SendMessageResult> => {
    if (isBlockedByYou) {
      return { type: 'blockedByYou' };
    }

    // A double-tap/double-Enter before the first request resolves would
    // otherwise create two identical messages server-side (they get distinct
    // IDs, so client-side id-based dedup never catches it).
    if (isSendingRef.current) {
      return { type: 'failed' };
    }
    isSendingRef.current = true;
    setIsSending(true);
    try {
      const didSend = await sendMessage(input);
      if (didSend) {
        recordSentMessage();
        return { type: 'sent' };
      }
      return { type: 'failed' };
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
    }
  };

  return { onSendPress, isSending };
}
