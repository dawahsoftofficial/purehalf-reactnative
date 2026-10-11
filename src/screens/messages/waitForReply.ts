/**
 * Client-side mirror of the server's "wait for a reply" rule, so the composer
 * can say so BEFORE the member types and sends - but only where the client can
 * be certain.
 *
 * Server rule (ConversationService::canSendMessage): a MALE sender may not send
 * another message until someone other than him has sent at least one message
 * in the conversation; once anyone else has replied it is unlocked forever. It
 * counts ALL messages, while the message listing hides everything before the
 * member's Clear chat / Delete chat, so the visible history can lack a reply
 * the server knows about. Therefore the lock is pre-computed ONLY for a
 * conversation this screen itself created through `start` in this session
 * (`createdHere`): there the visible history is the whole history. Everywhere
 * else the client never pre-blocks and relies on the server's WAIT_FOR_REPLY
 * error (`serverSaysWait`), which holds until a message from the other side is
 * on screen or the screen is re-entered.
 *
 * Keep this module free of React Native imports so it runs in plain jest.
 */
import type { Conversation } from '../../services/api/types/message-types';
import type { ChatMessage } from './optimisticMessages';

export type WaitForReplyInput = {
  gender: string | null | undefined;
  currentUserId: string | number | null | undefined;
  /** Messages on screen, including unsent bubbles. */
  messages: ChatMessage[];
  /** This screen created the conversation with `start` (brand-new chat). */
  createdHere: boolean;
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
  if (!input.createdHere) return false;
  // Something of his is out there (or on its way): the next send must wait.
  // A bubble that definitely never reached the server does not count.
  return input.messages.some(
    (m) =>
      isMine(m, input.currentUserId) &&
      !(m.send_status === 'failed' && !m.may_have_sent)
  );
}

/**
 * Whether the conversation `start` returned was just created (as opposed to
 * `start` appending to an existing - possibly cleared/deleted - one; the
 * response carries no flag). The caller only asks when the screen had no
 * conversation id, i.e. the lookup found none; on top of that, in a brand-new
 * conversation nobody has read anything, so any other participant with a
 * `last_read_message_id` proves the conversation already existed. Best effort:
 * a first message racing another device of the same member is not detected.
 */
export function startedFreshConversation(
  conversation: Conversation | null | undefined,
  currentUserId: string | number | null | undefined
): boolean {
  const others = (conversation?.participants ?? []).filter(
    (p) => String(p.id) !== String(currentUserId)
  );
  if (others.length === 0) return false;
  return others.every(
    (p) =>
      p.last_read_message_id === null || p.last_read_message_id === undefined
  );
}
