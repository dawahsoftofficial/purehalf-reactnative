/**
 * Coded chat errors.
 *
 * The chat endpoints return `{message, error, code, results, error_code}` on
 * failure. `toChatApiError` normalises anything a chat service call can throw
 * (axios errors, plain strings, existing ChatApiErrors) into a ChatApiError so
 * callers branch on `code` instead of string-matching English text.
 *
 * Keep this module free of React Native imports so it runs in plain jest.
 */

export type ChatErrorCode =
  | 'NO_CHAT_CREDITS'
  | 'BLOCKED'
  | 'WAIT_FOR_REPLY'
  | 'RECIPIENT_UNAVAILABLE'
  | 'ACCOUNT_SUSPENDED'
  | 'VALIDATION'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'NETWORK'
  | 'UNKNOWN';

export class ChatApiError extends Error {
  constructor(
    public code: ChatErrorCode,
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = 'ChatApiError';
    // Keep instanceof working when compiled down to ES5-style classes.
    Object.setPrototypeOf(this, ChatApiError.prototype);
  }
}

const SERVER_CODES: ReadonlySet<string> = new Set<ChatErrorCode>([
  'NO_CHAT_CREDITS',
  'BLOCKED',
  'WAIT_FOR_REPLY',
  'RECIPIENT_UNAVAILABLE',
  'ACCOUNT_SUSPENDED',
  'VALIDATION',
  'FORBIDDEN',
]);

const LEGACY_NO_CREDITS_TEXT = 'you have no chat credits left';
const GENERIC_MESSAGE = 'Something went wrong. Please try again.';
const NETWORK_MESSAGE = 'Network error. Please check your connection.';
const RATE_LIMITED_MESSAGE = 'Too many requests. Please slow down.';

const isLegacyNoCredits = (text: unknown): boolean =>
  typeof text === 'string' &&
  text.toLowerCase().includes(LEGACY_NO_CREDITS_TEXT);

const nonEmptyString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

export function toChatApiError(error: unknown): ChatApiError {
  if (error instanceof ChatApiError) {
    return error;
  }

  if (typeof error === 'string') {
    return new ChatApiError(
      isLegacyNoCredits(error) ? 'NO_CHAT_CREDITS' : 'UNKNOWN',
      nonEmptyString(error) ?? GENERIC_MESSAGE
    );
  }

  const err = error as
    | {
        message?: unknown;
        response?: { status?: number; data?: Record<string, unknown> | null };
      }
    | null
    | undefined;

  if (!err || typeof err !== 'object') {
    return new ChatApiError('UNKNOWN', GENERIC_MESSAGE);
  }

  const response = err.response;

  // No response at all: offline, DNS failure or the request timed out.
  if (!response) {
    return new ChatApiError('NETWORK', NETWORK_MESSAGE);
  }

  const status = response.status;
  const data =
    response.data && typeof response.data === 'object' ? response.data : {};
  const message =
    nonEmptyString(data.results) ??
    nonEmptyString(data.message) ??
    GENERIC_MESSAGE;

  const serverCode = nonEmptyString(data.error_code);
  if (serverCode && SERVER_CODES.has(serverCode)) {
    return new ChatApiError(serverCode as ChatErrorCode, message, status);
  }

  if (status === 429) {
    return new ChatApiError(
      'RATE_LIMITED',
      nonEmptyString(data.results) ?? RATE_LIMITED_MESSAGE,
      status
    );
  }

  if (isLegacyNoCredits(data.results) || isLegacyNoCredits(data.message)) {
    return new ChatApiError('NO_CHAT_CREDITS', message, status);
  }

  return new ChatApiError('UNKNOWN', message, status);
}
