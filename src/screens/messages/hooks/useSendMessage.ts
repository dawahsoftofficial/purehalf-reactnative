import type React from 'react';
import { useRef } from 'react';

import { recordSentMessage } from '@/services/rating/ratingEngagement';

import LanguageKeys from '../../../languages/Keys';
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
  createInFlightGuard,
  failPending,
  findDeliveredTwin,
  mayHaveReachedServer,
  nextTempId,
  type PendingAudio,
  removePending,
  resolvePending,
  retryPending,
} from '../optimisticMessages';
import {
  type CapturedSendTarget,
  captureSendTarget,
  deliveryTarget,
} from '../SingleChat.routing';
import { startedFreshConversation } from '../waitForReply';

type OtherUserData = {
  id: number;
  [key: string]: unknown;
};

type UseSendMessageParams = {
  /**
   * Which chat the screen shows (`useChatResolution().entryKey`). Changes when
   * a push / banner re-targets the open screen at another chat; work started
   * for the previous entry then stops touching the screen.
   */
  entryKey: string;
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
   * Called when `start` created a brand-new conversation (not when it appended
   * to an existing one), so the screen knows the visible history is complete.
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

/**
 * Captured when the member presses send (or retries): where the message goes
 * and which screen entry it belongs to. Sends are queued, so by the time one
 * runs the screen may show another chat; the message still goes to `target`,
 * and only touches the screen while `generation` is still current.
 */
type SendContext = {
  target: CapturedSendTarget;
  generation: number;
};

const toAudioPayload = (audio: PendingAudio): AudioSendInput => ({
  type: 'audio',
  audio: { uri: audio.uri, name: audio.name, type: audio.type },
  duration_seconds: audio.duration_seconds,
  ...(audio.waveform_peaks ? { waveform_peaks: audio.waveform_peaks } : {}),
});

export function useSendMessage({
  entryKey,
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

  // Bumped whenever the screen is re-targeted at another chat (A -> B -> A
  // too), so a send that settles later knows its bubble is gone.
  const entryRef = useRef({ key: entryKey, generation: 0 });
  if (entryRef.current.key !== entryKey) {
    entryRef.current = {
      key: entryKey,
      generation: entryRef.current.generation + 1,
    };
  }
  const isCurrentEntry = (context: SendContext) =>
    context.generation === entryRef.current.generation;

  // Sends run one after another so messages reach the server in the order they
  // were typed (the first message of a new chat must finish before the next
  // knows its conversation id). The UI never waits for the queue.
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  // Conversations this hook created (or found) per receiver id, before the
  // screen state has caught up with `setConversationId`. Keyed by the
  // receiver captured at send time, so a screen re-targeted at someone else
  // never reuses it, and a follow-up queued for the first receiver still
  // finds it.
  const createdConversationsRef = useRef(new Map<string, number>());

  // Bubbles whose retry is queued or running (a double tap must not send twice).
  const retryGuardRef = useRef(createInFlightGuard());

  const enqueue = (task: () => Promise<void>) => {
    queueRef.current = queueRef.current.then(task, task).catch(() => {});
  };

  /** The screen's send target right now (call at send / retry time only). */
  const captureContext = (): SendContext | null => {
    const latest = latestRef.current;
    const target = captureSendTarget({
      conversationData: latest.conversationData,
      conversationId: latest.conversationId,
      receiverId: latest.otherUserData?.id,
      created: createdConversationsRef.current,
    });
    return target ? { target, generation: entryRef.current.generation } : null;
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

  /**
   * Sends one bubble to its captured target and settles it (resolved or
   * failed). The request always completes for that target; the screen (ids,
   * bubble, error UI) is only touched while it still shows the same entry.
   */
  const deliver = async (
    localId: string,
    outgoing: Outgoing,
    context: SendContext
  ) => {
    try {
      // Resolved again at run time only to follow up in a conversation that
      // an earlier message to the same receiver created meanwhile.
      const target = deliveryTarget(
        context.target,
        createdConversationsRef.current
      );

      if (target.kind === 'new') {
        if (outgoing.kind !== 'text') {
          throw new Error('Voice notes need an existing conversation');
        }
        const createdConversation: Conversation =
          await messageServices.startConversation({
            receiver_id: target.receiverId,
            body: outgoing.body,
          });

        createdConversationsRef.current.set(
          String(target.receiverId),
          createdConversation.id
        );
        recordSentMessage();
        // Re-targeted meanwhile: the chat on screen now must not change.
        if (!isCurrentEntry(context)) return;

        if (startedFreshConversation(createdConversation, currentUserId)) {
          latestRef.current.onConversationStarted?.();
        }
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
        recordSentMessage();
        if (!isCurrentEntry(context)) return;
        setMessages((previous) =>
          resolvePending(previous, localId, sentMessage)
        );
      }
    } catch (error: unknown) {
      // The bubble left the screen with its chat: nothing to mark failed, and
      // the error UI (block bar, wait hint) would land on another chat.
      if (!isCurrentEntry(context)) return;
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
    bubble: ChatMessage,
    context: SendContext
  ): Promise<Message | undefined> => {
    try {
      let id: number | null = null;
      const target = deliveryTarget(
        context.target,
        createdConversationsRef.current
      );
      if (target.kind === 'existing') {
        id = target.conversationId;
      } else {
        // A timed-out "start" may have created the conversation anyway.
        const found = await messageServices.getConversationWithUser(
          target.receiverId
        );
        if (found) {
          createdConversationsRef.current.set(
            String(target.receiverId),
            found.id
          );
          if (isCurrentEntry(context)) {
            setConversationId(found.id.toString());
            setConversationData(found);
          }
          id = found.id;
        }
      }
      if (id === null) return undefined;

      const fetched = await messageServices.getConversationMessages(id, {
        per_page: 50,
        page: 1,
      });
      return findDeliveredTwin(
        bubble,
        fetched,
        isCurrentEntry(context) ? latestRef.current.messages : []
      );
    } catch {
      // Cannot verify (offline): sending is what the member asked for.
      return undefined;
    }
  };

  const onSendPress = (input: SendMessageInput): SendMessageResult => {
    if (isBlockedByYou) {
      return { type: 'blockedByYou' };
    }

    // Fixed now: the message goes here even if the screen is re-targeted
    // at another chat before its turn in the queue comes.
    const context = captureContext();
    if (!context) {
      flashErrorMessage(LanguageKeys.somethingWentWrong);
      return { type: 'failed' };
    }

    if (typeof input !== 'string' && context.target.kind === 'new') {
      flashErrorMessage(LanguageKeys.chatVoiceNeedsText);
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

    enqueue(() => deliver(localId, outgoing, context));
    return { type: 'queued' };
  };

  const retryMessage = (localId: string) => {
    if (isBlockedByYou) return;
    if (!retryGuardRef.current.tryAcquire(localId)) return;
    const bubble = latestRef.current.messages.find(
      (m) => m.local_id === localId && m.send_status === 'failed'
    );
    if (!bubble) {
      retryGuardRef.current.release(localId);
      return;
    }

    const outgoing: Outgoing | null =
      bubble.type === 'audio'
        ? bubble.pending_audio
          ? { kind: 'audio', audio: bubble.pending_audio }
          : null
        : { kind: 'text', body: bubble.body };
    // The bubble is on screen, so it belongs to the chat shown right now.
    const context = outgoing ? captureContext() : null;
    if (!outgoing || !context) {
      retryGuardRef.current.release(localId);
      return;
    }

    setMessages((previous) => retryPending(previous, localId));

    enqueue(async () => {
      try {
        if (bubble.may_have_sent) {
          const twin = await findAlreadyDelivered(bubble, context);
          if (twin) {
            if (isCurrentEntry(context)) {
              setMessages((previous) =>
                resolvePending(previous, localId, twin)
              );
            }
            return;
          }
        }
        await deliver(localId, outgoing, context);
      } finally {
        retryGuardRef.current.release(localId);
      }
    });
  };

  const discardMessage = (localId: string) => {
    setMessages((previous) => removePending(previous, localId));
  };

  return { onSendPress, retryMessage, discardMessage };
}
