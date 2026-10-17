import LanguageKeys from '../../languages/Keys';
import {
  type SmsOtpError,
  type SmsOtpErrorCode,
  toSmsOtpError,
} from '../../services/api/sms-otp-errors';

export type SmsOtpMessage = {
  /** i18n key; pass it with `options` to `t()` / flashErrorMessage. */
  key: string;
  options?: Record<string, number>;
  /**
   * The server's own wording, shown instead of `key` when present. Only used
   * for suppressed / banned numbers, matching how /authenticate reports them.
   */
  text?: string;
};

// Localized copy per error code. Codes not listed (UNKNOWN, PROVIDER_DISABLED
// reaching the user) use the generic message rather than raw server text.
const SMS_OTP_MESSAGE_KEYS: Partial<Record<SmsOtpErrorCode, string>> = {
  VALIDATION: LanguageKeys.invalidPhoneNumber,
  OTP_EXPIRED: LanguageKeys.smsOtpErrorExpired,
  OTP_LOCKED: LanguageKeys.smsOtpErrorLocked,
  OTP_RATE_LIMITED: LanguageKeys.smsOtpErrorRateLimited,
  SMS_FAILED: LanguageKeys.smsOtpErrorSmsFailed,
  BANNED: LanguageKeys.accountSuspended,
  NETWORK: LanguageKeys.smsOtpErrorNetwork,
};

/** Friendly, translatable message for anything the server OTP calls throw. */
export function smsOtpErrorMessage(error: unknown): SmsOtpMessage {
  const err = toSmsOtpError(error);

  if (err.code === 'OTP_INVALID') {
    if (err.attemptsLeft === 0) return { key: LanguageKeys.smsOtpErrorLocked };
    return err.attemptsLeft === undefined
      ? { key: LanguageKeys.smsOtpErrorInvalidCode }
      : {
          key: LanguageKeys.smsOtpErrorInvalidCodeAttempts,
          options: { attempts: err.attemptsLeft },
        };
  }

  if (err.code === 'BANNED') {
    return err.serverMessage
      ? { key: LanguageKeys.accountSuspended, text: err.serverMessage }
      : { key: LanguageKeys.accountSuspended };
  }

  if (err.code === 'OTP_RATE_LIMITED' && err.retryAfter) {
    return err.retryAfter < 120
      ? {
          key: LanguageKeys.smsOtpErrorRateLimitedSeconds,
          options: { seconds: err.retryAfter },
        }
      : {
          key: LanguageKeys.smsOtpErrorRateLimitedMinutes,
          options: { minutes: Math.ceil(err.retryAfter / 60) },
        };
  }

  if (err.code === 'OTP_RESEND_TOO_SOON') {
    return err.resendIn
      ? {
          key: LanguageKeys.smsOtpErrorResendTooSoon,
          options: { seconds: err.resendIn },
        }
      : { key: LanguageKeys.smsOtpErrorRateLimited };
  }

  return {
    key: SMS_OTP_MESSAGE_KEYS[err.code] ?? LanguageKeys.commonErrorMessage,
  };
}

export type ServerVerifyFailure = SmsOtpMessage & {
  /** Empty the 6 boxes so the member can type a fresh code. */
  clearCode: boolean;
  /** The code is dead: show "Resend Code" now instead of the countdown. */
  allowResendNow: boolean;
};

/** What the OTP screen does after /otp/verify fails. */
export function serverVerifyFailure(error: unknown): ServerVerifyFailure {
  const err: SmsOtpError = toSmsOtpError(error);
  const codeIsDead =
    err.code === 'OTP_EXPIRED' ||
    err.code === 'OTP_LOCKED' ||
    (err.code === 'OTP_INVALID' && err.attemptsLeft === 0);
  return {
    ...smsOtpErrorMessage(err),
    clearCode: codeIsDead || err.code === 'OTP_INVALID',
    allowResendNow: codeIsDead,
  };
}
