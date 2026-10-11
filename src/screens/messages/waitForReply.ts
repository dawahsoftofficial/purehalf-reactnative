/**
 * Client-side mirror of the server's "wait for a reply" rule, so the composer
 * can say so BEFORE the member types and sends.
 *
 * Server rule (ConversationService::canSendMessage): a MALE sender may not send
 * another message until someone other than him has sent at least one message
 * in the conversation; once anyone else has replied it is unlocked forever.
 * The first message of a conversation is always allowed.
 *
 * The client can only be sure when it has seen the whole history. When older
 * pages are not loaded and no reply is in the loaded part, it does NOT block
 * (a reply may be further back) and relies on the server's WAIT_FOR_REPLY
 * error, reported here via `serverSaysWait`.
 *
 * Keep this module free of React Native imports so it runs in plain jest.
 */
import type { ChatMessage } from './optimisticMessages';

export type WaitForReplyInput = {
  gender: string | null | undefined;
  currentUserId: string | number | null | undefined;
  /** Messages on screen, including unsent bubbles. */
  messages: ChatMessage[];
  /** True once every page of history is loaded (no older page exists). */
  historyComplete: boolean;
  /** The server rejected a send with WAIT_FOR_REPLY since the last reply. */
  serverSaysWait: boolean;
};

const isMine = (
  message: ChatMessage,
  currentUserId: string | number | null | undefined
): boolean =>
  currentUserId != null &&
  String(message.sender_id) === String(currentUserId) &&
  (!message.sender_type || message.sender_type.toLowerCase() === 'user');

/** True when anyone other than the member has a confirmed message in the chat. */
export function hasOtherReplied(
  messages: ChatMessage[],
  currentUserId: string | number | null | undefined
): boolean {
  return messages.some(
    (m) => m.send_status === undefined && !isMine(m, currentUserId)
  );
}

export function isWaitingForReply(input: WaitForReplyInput): boolean {
  if (input.gender !== 'male') return false;
  if (hasOtherReplied(input.messages, input.currentUserId)) return false;
  if (input.serverSaysWait) return true;
  if (!input.historyComplete) return false;
  // Something of his is out there (or on its way): the next send must wait.
  // A bubble that definitely never reached the server does not count.
  return input.messages.some(
    (m) =>
      isMine(m, input.currentUserId) &&
      !(m.send_status === 'failed' && !m.may_have_sent)
  );
}
