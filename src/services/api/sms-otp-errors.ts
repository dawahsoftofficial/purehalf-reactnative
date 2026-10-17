/**
 * Coded errors for the server SMS sign-in code calls (sms-otp.ts).
 *
 * /otp/send and /otp/verify return `{message, error, code, results,
 * error_code}` on failure. `toSmsOtpError` normalises anything those calls can
 * throw into an SmsOtpError so callers branch on `code`, like chat-errors.ts.
 *
 * Keep this module free of React Native imports so it runs in plain jest.
 */

export type SmsOtpErrorCode =
  | 'PROVIDER_DISABLED'
  | 'VALIDATION'
  | 'OTP_RESEND_TOO_SOON'
  | 'OTP_RATE_LIMITED'
  | 'SMS_FAILED'
  | 'OTP_INVALID'
  | 'OTP_EXPIRED'
  | 'OTP_LOCKED'
  | 'BANNED'
  | 'NETWORK'
  | 'UNKNOWN';

export class SmsOtpError extends Error {
  code: SmsOtpErrorCode;
  status?: number;
  /** Seconds until a new code may be requested (OTP_RESEND_TOO_SOON). */
  resendIn?: number;
  /** Wrong-code attempts left before the code is burned (OTP_INVALID). */
  attemptsLeft?: number;
  /** Seconds until requests are allowed again (OTP_RATE_LIMITED). */
  retryAfter?: number;
  /** The server's own text, when it sent one (shown for BANNED). */
  serverMessage?: string;

  constructor(
    code: SmsOtpErrorCode,
    message: string,
    extra: {
      status?: number;
      resendIn?: number;
      attemptsLeft?: number;
      retryAfter?: number;
      serverMessage?: string;
    } = {}
  ) {
    super(message);
    this.name = 'SmsOtpError';
    this.code = code;
    this.status = extra.status;
    this.resendIn = extra.resendIn;
    this.attemptsLeft = extra.attemptsLeft;
    this.retryAfter = extra.retryAfter;
    this.serverMessage = extra.serverMessage;
    // Keep instanceof working when compiled down to ES5-style classes.
    Object.setPrototypeOf(this, SmsOtpError.prototype);
  }
}

const SERVER_CODES: ReadonlySet<string> = new Set<SmsOtpErrorCode>([
  'PROVIDER_DISABLED',
  'VALIDATION',
  'OTP_RESEND_TOO_SOON',
  'OTP_RATE_LIMITED',
  'SMS_FAILED',
  'OTP_INVALID',
  'OTP_EXPIRED',
  'OTP_LOCKED',
]);

const NETWORK_ERROR_CODES: ReadonlySet<string> = new Set([
  'ECONNABORTED',
  'ERR_NETWORK',
  'ETIMEDOUT',
]);

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';
const NETWORK_MESSAGE = 'Network error. Please check your connection.';

const nonEmptyString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

export const nonNegativeInt = (value: unknown): number | undefined => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0
    ? Math.floor(n)
    : undefined;
};

export const resultsField = (results: unknown, field: string): unknown =>
  results && typeof results === 'object'
    ? (results as Record<string, unknown>)[field]
    : undefined;

// axios lower-cases header names; AxiosHeaders also exposes get().
const headerValue = (headers: unknown, name: string): unknown => {
  if (!headers || typeof headers !== 'object') return undefined;
  const h = headers as Record<string, unknown> & {
    get?: (key: string) => unknown;
  };
  if (typeof h.get === 'function') {
    const value = h.get(name);
    if (value !== undefined && value !== null) return value;
  }
  return h[name] ?? h[name.replace(/(^|-)([a-z])/g, (m) => m.toUpperCase())];
};

export function toSmsOtpError(error: unknown): SmsOtpError {
  if (error instanceof SmsOtpError) {
    return error;
  }

  const err = error as
    | {
        isAxiosError?: unknown;
        code?: unknown;
        response?: {
          status?: number;
          data?: Record<string, unknown> | null;
          headers?: unknown;
        };
      }
    | null
    | undefined;

  if (!err || typeof err !== 'object') {
    return new SmsOtpError('UNKNOWN', GENERIC_MESSAGE);
  }

  const response = err.response;
  if (!response) {
    const isTransportFailure =
      NETWORK_ERROR_CODES.has(err.code as string) ||
      (err.isAxiosError === true && err.code !== 'ERR_CANCELED');
    return isTransportFailure
      ? new SmsOtpError('NETWORK', NETWORK_MESSAGE)
      : new SmsOtpError('UNKNOWN', GENERIC_MESSAGE);
  }

  const status = response.status;
  const data =
    response.data && typeof response.data === 'object' ? response.data : {};
  const serverMessage =
    nonEmptyString(data.results) ?? nonEmptyString(data.message) ?? undefined;
  const message = serverMessage ?? GENERIC_MESSAGE;
  const extra = {
    status,
    serverMessage,
    resendIn: nonNegativeInt(resultsField(data.results, 'resend_in')),
    attemptsLeft: nonNegativeInt(resultsField(data.results, 'attempts_left')),
    retryAfter:
      nonNegativeInt(resultsField(data.results, 'retry_after')) ??
      nonNegativeInt(headerValue(response.headers, 'retry-after')),
  };

  const serverCode = nonEmptyString(data.error_code);
  if (serverCode && SERVER_CODES.has(serverCode)) {
    return new SmsOtpError(serverCode as SmsOtpErrorCode, message, extra);
  }

  // Suppressed / banned numbers get the same 401 (no error_code) that
  // /authenticate returns; 403 is treated the same way.
  if (status === 401 || status === 403) {
    return new SmsOtpError('BANNED', message, extra);
  }

  if (status === 429) {
    return new SmsOtpError('OTP_RATE_LIMITED', message, extra);
  }

  return new SmsOtpError('UNKNOWN', message, extra);
}

/**
 * True when the phone screen should quietly use Firebase instead: the server
 * says SMS codes are off for this number, or (an older server) has no
 * /otp/send route at all.
 */
export function shouldFallBackToFirebase(error: SmsOtpError): boolean {
  return (
    error.code === 'PROVIDER_DISABLED' ||
    (error.code === 'UNKNOWN' && error.status === 404)
  );
}
