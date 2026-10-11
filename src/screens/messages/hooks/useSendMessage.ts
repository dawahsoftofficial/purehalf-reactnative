import type React from 'react';
import { useRef } from 'react';

import { recordSentMessage } from '@/services/rating/ratingEngagement';

import { flashErrorMessage } from '../../../services';
import { toChatApiError } from '../../../services/api/chat-errors';
import messageServices from '../../../services/api/message-services';
import type {
  Conversation,
  Message,
} from '../../../services/api/types/message-types';
import { presentChatCreditsPaywall } from '../../../services/paywall-service';
import { chatErrorMessageKey } from '../chat-error-messages';
import {
  addPending,
  type ChatMessage,
  failPending,
  findDeliveredTwin,
  mayHaveReachedServer,
  nextTempId,
  type PendingAudio,
  removePending,
  resolvePending,
  retryPending,
} from '../optimisticMessages';
import { getSendTarget } from '../SingleChat.routing';

type OtherUserData = {
  id: number;
  [key: string]: unknown;
};

type UseSendMessageParams = {
  otherUserData: OtherUserData;
  conversationData: Conversation | null | undefined;
  setConversationData: (conversation: Conversation) => void;
  /** Messages on screen; read when a failed bubble is retried. */
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  conversationId: string;
  setConversationId: (id: string) => void;
  /** The signed-in member (sender of every optimistic bubble). */
  currentUserId: number | string | null | undefined;
  isBlockedByYou: boolean;
  setInputMessage: (message: string) => void;
  /**
   * Called when the server rejects a send with BLOCKED (either member blocked
   * the other). When omitted the localized message is flashed instead.
   */
  onBlocked?: () => void;
  /**
   * Called when the server rejects a send with WAIT_FOR_REPLY, so the screen
   * can lock the composer with its hint. Nothing is flashed in that case.
   */
  onWaitForReply?: () => void;
  /**
   * Called when the first message created a brand-new conversation, so the
   * screen knows the whole history is just that message.
   */
  onConversationStarted?: () => void;
};

type SendMessageResult =
  | { type: 'blockedByYou' }
  /** Accepted: the bubble is on screen and the request is queued. */
  | { type: 'queued' }
  | { type: 'failed' };

export type AudioSendInput = {
  type: 'audio';
  audio: { uri: string; name: string; type: string };
  duration_seconds: number;
  waveform_peaks?: number[];
};

export type SendMessageInput = string | AudioSendInput;

type UseSendMessageReturn = {
  onSendPress: (input: SendMessageInput) => SendMessageResult;
  /** Re-sends a failed bubble (tap to retry). */
  retryMessage: (localId: string) => void;
  /** Removes a failed bubble the member does not want to send any more. */
  discardMessage: (localId: string) => void;
};

/** Request body for a bubble (text, or the recorded voice note). */
type Outgoing =
  | { kind: 'text'; body: string }
  | { kind: 'audio'; audio: PendingAudio };

const toAudioPayload = (audio: PendingAudio): AudioSendInput => ({
  type: 'audio',
  audio: { uri: audio.uri, name: audio.name, type: audio.type },
  duration_seconds: audio.duration_seconds,
  ...(audio.waveform_peaks ? { waveform_peaks: audio.waveform_peaks } : {}),
});

export function useSendMessage({
  otherUserData,
  conversationData,
  setConversationData,
  messages,
  setMessages,
  conversationId,
  setConversationId,
  currentUserId,
  isBlockedByYou,
  setInputMessage,
  onBlocked,
  onWaitForReply,
  onConversationStarted,
}: UseSendMessageParams): UseSendMessageReturn {
  // Always the latest props, for work that finishes after later renders.
  const latestRef = useRef({
    conversationData,
    conversationId,
    messages,
    otherUserData,
    onBlocked,
    onWaitForReply,
    onConversationStarted,
  });
  latestRef.current = {
    conversationData,
    conversationId,
    messages,
    otherUserData,
    onBlocked,
    onWaitForReply,
    onConversationStarted,
  };

  // Sends run one after another so messages reach the server in the order they
  // were typed (the first message of a new chat must finish before the next
  // knows its conversation id). The UI never waits for the queue.
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  // A conversation this hook just created (or found), before the screen state
  // has caught up with `setConversationId`. Tied to the member it is with, so
  // a screen re-targeted at someone else never reuses it.
  const createdConversationRef = useRef<{
    receiverId: number;
    id: number;
  } | null>(null);

  const enqueue = (task: () => Promise<void>) => {
    queueRef.current = queueRef.current.then(task, task).catch(() => {});
  };

  const currentTarget = () => {
    const latest = latestRef.current;
    const target = getSendTarget(
      latest.conversationData,
      latest.conversationId
    );
    const created = createdConversationRef.current;
    if (
      target.kind === 'new' &&
      created &&
      created.receiverId === latest.otherUserData?.id
    ) {
      return { kind: 'existing' as const, conversationId: created.id };
    }
    return target;
  };

  const handleSendError = (chatError: ReturnType<typeof toChatApiError>) => {
    const { onBlocked: blockedHandler, onWaitForReply: waitHandler } =
      latestRef.current;

    if (chatError.code === 'WAIT_FOR_REPLY') {
      // The screen locks the composer with a hint instead of a toast.
      waitHandler?.();
      return;
    }

    if (chatError.code === 'BLOCKED' && blockedHandler) {
      blockedHandler();
      return;
    }

    // The failed bubble already says "not sent - tap to retry"; a second
    // "network problem" toast on top of it is noise.
    if (chatError.code !== 'NETWORK') {
      flashErrorMessage(chatErrorMessageKey(chatError));
    }

    if (chatError.code === 'NO_CHAT_CREDITS') {
      void presentChatCreditsPaywall();
    }
  };

  /** Sends one bubble to the server and settles it (resolved or failed). */
  const deliver = async (localId: string, outgoing: Outgoing) => {
    try {
      const target = currentTarget();

      if (target.kind === 'new') {
        if (outgoing.kind !== 'text') {
          throw new Error('Voice notes need an existing conversation');
        }
        const createdConversation: Conversation =
          await messageServices.startConversation({
            receiver_id: latestRef.current.otherUserData?.id,
            body: outgoing.body,
          });

        createdConversationRef.current = {
          receiverId: latestRef.current.otherUserData?.id,
          id: createdConversation.id,
        };
        latestRef.current.onConversationStarted?.();
        setConversationId(createdConversation.id.toString());
        setConversationData(createdConversation);

        const apiMessage: Message | null =
          createdConversation.last_message_detail;
        setMessages((previous) =>
          apiMessage
            ? resolvePending(previous, localId, apiMessage)
            : // Nothing to show yet; the thread's own fetch brings it in.
              removePending(previous, localId)
        );
      } else {
        const payload =
          outgoing.kind === 'text'
            ? { body: outgoing.body }
            : toAudioPayload(outgoing.audio);
        const sentMessage: Message =
          await messageServices.sendConversationMessage(
            target.conversationId,
            payload
          );
        setMessages((previous) =>
          resolvePending(previous, localId, sentMessage)
        );
      }

      recordSentMessage();
    } catch (error: unknown) {
      const chatError = toChatApiError(error);
      setMessages((previous) =>
        failPending(previous, localId, {
          code: chatError.code,
          mayHaveSent: mayHaveReachedServer(chatError),
        })
      );
      handleSendError(chatError);
    }
  };

  /**
   * Best-effort duplicate guard before re-sending a bubble whose request timed
   * out (the server has no client-message-id idempotency): refetch the newest
   * page and look for the bubble's twin. Returns it when it was delivered.
   */
  const findAlreadyDelivered = async (
    bubble: ChatMessage
  ): Promise<Message | undefined> => {
    try {
      let id: number | null = null;
      const target = currentTarget();
      if (target.kind === 'existing') {
        id = target.conversationId;
      } else {
        // A timed-out "start" may have created the conversation anyway.
        const found = await messageServices.getConversationWithUser(
          latestRef.current.otherUserData?.id
        );
        if (found) {
          createdConversationRef.current = {
            receiverId: latestRef.current.otherUserData?.id,
            id: found.id,
          };
          setConversationId(found.id.toString());
          setConversationData(found);
          id = found.id;
        }
      }
      if (id === null) return undefined;

      const fetched = await messageServices.getConversationMessages(id, {
        per_page: 50,
        page: 1,
      });
      return findDeliveredTwin(bubble, fetched, latestRef.current.messages);
    } catch {
      // Cannot verify (offline): sending is what the member asked for.
      return undefined;
    }
  };

  const onSendPress = (input: SendMessageInput): SendMessageResult => {
    if (isBlockedByYou) {
      return { type: 'blockedByYou' };
    }

    if (typeof input !== 'string' && currentTarget().kind === 'new') {
      flashErrorMessage('Please send a text message before voice notes.');
      return { type: 'failed' };
    }

    const audio: PendingAudio | undefined =
      typeof input === 'string'
        ? undefined
        : {
            uri: input.audio.uri,
            name: input.audio.name,
            type: input.audio.type,
            duration_seconds: input.duration_seconds,
            waveform_peaks: input.waveform_peaks,
          };
    const outgoing: Outgoing = audio
      ? { kind: 'audio', audio }
      : { kind: 'text', body: input as string };

    // The text now lives in the bubble: clear the composer, and never touch it
    // again if the send fails (the member may already be typing the next one).
    setInputMessage('');

    const { id, localId } = nextTempId();
    setMessages((previous) =>
      addPending(previous, {
        id,
        localId,
        conversationId: Number(latestRef.current.conversationId) || 0,
        senderId: Number(currentUserId),
        body: outgoing.kind === 'text' ? outgoing.body : '',
        audio,
      })
    );

    enqueue(() => deliver(localId, outgoing));
    return { type: 'queued' };
  };

  const retryMessage = (localId: string) => {
    if (isBlockedByYou) return;
    const bubble = latestRef.current.messages.find(
      (m) => m.local_id === localId && m.send_status === 'failed'
    );
    if (!bubble) return;

    const outgoing: Outgoing | null =
      bubble.type === 'audio'
        ? bubble.pending_audio
          ? { kind: 'audio', audio: bubble.pending_audio }
          : null
        : { kind: 'text', body: bubble.body };
    if (!outgoing) return;

    setMessages((previous) => retryPending(previous, localId));

    enqueue(async () => {
      if (bubble.may_have_sent) {
        const twin = await findAlreadyDelivered(bubble);
        if (twin) {
          setMessages((previous) => resolvePending(previous, localId, twin));
          return;
        }
      }
      await deliver(localId, outgoing);
    });
  };

  const discardMessage = (localId: string) => {
    setMessages((previous) => removePending(previous, localId));
  };

  return { onSendPress, retryMessage, discardMessage };
}
