import LanguageKeys from '../../languages/Keys';
import {
  type ChatErrorCode,
  toChatApiError,
} from '../../services/api/chat-errors';

// Localized copy per error code. Codes not listed (VALIDATION, UNKNOWN) use
// the generic message rather than surfacing raw server / JS error text.
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

/** i18n key for anything a chat call can throw. Pass it to `t()`/flash helpers. */
export function chatErrorMessageKey(error: unknown): string {
  return (
    CHAT_ERROR_MESSAGE_KEYS[toChatApiError(error).code] ??
    LanguageKeys.commonErrorMessage
  );
}
