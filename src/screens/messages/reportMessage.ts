/**
 * Rules for reporting a chat message (long-press -> Report).
 *
 * Keep this module free of React Native imports so it runs in plain jest.
 */
import LanguageKeys from '../../languages/Keys';
import type { ChatMessage } from './optimisticMessages';

/** Preset reasons: `value` is what the moderators receive, `labelKey` the i18n label. */
export const REPORT_REASONS = [
  { value: 'Spam or scam', labelKey: LanguageKeys.chatReportReasonSpam },
  {
    value: 'Harassment or abuse',
    labelKey: LanguageKeys.chatReportReasonAbuse,
  },
  {
    value: 'Inappropriate content',
    labelKey: LanguageKeys.chatReportReasonInappropriate,
  },
  { value: 'Other', labelKey: LanguageKeys.chatReportReasonOther },
] as const;

/**
 * Only a confirmed message from someone else can be reported: never the
 * member's own messages (the server rejects them) nor an unsent bubble.
 */
export function canReportMessage(
  message: ChatMessage | null | undefined,
  currentUserId: number | string | null | undefined
): boolean {
  if (!message || currentUserId == null) return false;
  if (message.id <= 0 || message.send_status !== undefined) return false;
  const fromMe =
    String(message.sender_id) === String(currentUserId) &&
    (!message.sender_type || message.sender_type.toLowerCase() === 'user');
  return !fromMe;
}
