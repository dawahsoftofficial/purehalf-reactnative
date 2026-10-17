import { SmsOtpError } from '../../services/api/sms-otp-errors';
import { serverVerifyFailure, smsOtpErrorMessage } from './sms-otp-messages';

const err = (
  code: ConstructorParameters<typeof SmsOtpError>[0],
  extra: ConstructorParameters<typeof SmsOtpError>[2] = {}
) => new SmsOtpError(code, 'raw server text', extra);

describe('smsOtpErrorMessage', () => {
  it.each([
    ['OTP_EXPIRED', 'smsOtpErrorExpired'],
    ['OTP_LOCKED', 'smsOtpErrorLocked'],
    ['OTP_RATE_LIMITED', 'smsOtpErrorRateLimited'],
    ['SMS_FAILED', 'smsOtpErrorSmsFailed'],
    ['VALIDATION', 'invalidPhoneNumber'],
    ['BANNED', 'accountSuspended'],
    ['NETWORK', 'smsOtpErrorNetwork'],
    ['UNKNOWN', 'commonErrorMessage'],
    ['PROVIDER_DISABLED', 'commonErrorMessage'],
  ] as const)('maps %s to %s', (code, key) => {
    expect(smsOtpErrorMessage(err(code))).toEqual({ key });
  });

  it('shows the attempts left for a wrong code', () => {
    expect(smsOtpErrorMessage(err('OTP_INVALID', { attemptsLeft: 3 }))).toEqual(
      {
        key: 'smsOtpErrorInvalidCodeAttempts',
        options: { attempts: 3 },
      }
    );
  });

  it('uses the plain wrong-code message when attempts are unknown', () => {
    expect(smsOtpErrorMessage(err('OTP_INVALID'))).toEqual({
      key: 'smsOtpErrorInvalidCode',
    });
  });

  it('treats a wrong code with no attempts left as locked', () => {
    expect(
      smsOtpErrorMessage(err('OTP_INVALID', { attemptsLeft: 0 })).key
    ).toBe('smsOtpErrorLocked');
  });

  it('shows the wait for OTP_RESEND_TOO_SOON', () => {
    expect(
      smsOtpErrorMessage(err('OTP_RESEND_TOO_SOON', { resendIn: 40 }))
    ).toEqual({ key: 'smsOtpErrorResendTooSoon', options: { seconds: 40 } });
    expect(smsOtpErrorMessage(err('OTP_RESEND_TOO_SOON')).key).toBe(
      'smsOtpErrorRateLimited'
    );
  });

  it('classifies raw axios errors', () => {
    expect(
      smsOtpErrorMessage({
        isAxiosError: true,
        response: { status: 410, data: { error_code: 'OTP_EXPIRED' } },
      }).key
    ).toBe('smsOtpErrorExpired');
  });
});

describe('smsOtpErrorMessage (as-built server responses)', () => {
  it('shows the server text for a banned / suppressed number', () => {
    expect(
      smsOtpErrorMessage(
        err('BANNED', { status: 401, serverMessage: 'You are banned.' })
      )
    ).toEqual({ key: 'accountSuspended', text: 'You are banned.' });
  });

  it('shows the wait for OTP_RATE_LIMITED with retry_after', () => {
    expect(
      smsOtpErrorMessage(err('OTP_RATE_LIMITED', { retryAfter: 45 }))
    ).toEqual({
      key: 'smsOtpErrorRateLimitedSeconds',
      options: { seconds: 45 },
    });
    expect(
      smsOtpErrorMessage(err('OTP_RATE_LIMITED', { retryAfter: 3500 }))
    ).toEqual({
      key: 'smsOtpErrorRateLimitedMinutes',
      options: { minutes: 59 },
    });
  });
});

describe('serverVerifyFailure', () => {
  it('clears a wrong code but keeps the countdown', () => {
    expect(
      serverVerifyFailure(err('OTP_INVALID', { attemptsLeft: 2 }))
    ).toMatchObject({ clearCode: true, allowResendNow: false });
  });

  it.each(['OTP_EXPIRED', 'OTP_LOCKED'] as const)(
    'clears the code and offers resend at once for %s',
    (code) => {
      expect(serverVerifyFailure(err(code))).toMatchObject({
        clearCode: true,
        allowResendNow: true,
      });
    }
  );

  it('offers resend at once when no attempts are left', () => {
    expect(
      serverVerifyFailure(err('OTP_INVALID', { attemptsLeft: 0 }))
    ).toMatchObject({ clearCode: true, allowResendNow: true });
  });

  it('keeps the typed code on a network failure', () => {
    expect(serverVerifyFailure(err('NETWORK'))).toEqual({
      key: 'smsOtpErrorNetwork',
      clearCode: false,
      allowResendNow: false,
    });
  });
});
