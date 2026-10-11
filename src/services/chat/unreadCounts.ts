/**
 * Pure mapping of the server's unread-chat counters onto the values held by
 * the conversation store. Shared by the `/auth/counter` seed and the Pusher
 * `counterUpdate` handler. Keep this module free of React Native imports.
 */

export type UnreadCounts = {
  conversations: number;
  messages: number;
};

const toCount = (value: unknown): number => {
  const parsed =
    typeof value === 'string' && value.trim() !== ''
      ? Number(value)
      : typeof value === 'number'
        ? value
        : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

const has = (source: Record<string, unknown>, key: string): boolean =>
  source[key] !== undefined;

/**
 * Reads `unread_conversations_count` / `unread_messages_count` from `source`
 * (a `/auth/counter` result or a `counterUpdate` participant). A key that is
 * absent keeps its `current` value; a present but invalid value counts as 0.
 * Returns `null` when neither key is present, meaning "leave the store alone".
 */
export function resolveUnreadCounts(
  source: unknown,
  current: UnreadCounts
): UnreadCounts | null {
  if (!source || typeof source !== 'object') return null;
  const record = source as Record<string, unknown>;
  const hasConversations = has(record, 'unread_conversations_count');
  const hasMessages = has(record, 'unread_messages_count');
  if (!hasConversations && !hasMessages) return null;

  return {
    conversations: hasConversations
      ? toCount(record.unread_conversations_count)
      : current.conversations,
    messages: hasMessages
      ? toCount(record.unread_messages_count)
      : current.messages,
  };
}
