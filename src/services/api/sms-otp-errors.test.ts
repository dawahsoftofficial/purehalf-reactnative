import {
  shouldFallBackToFirebase,
  SmsOtpError,
  toSmsOtpError,
} from './sms-otp-errors';

const axiosError = (status: number | undefined, data?: unknown) => ({
  isAxiosError: true,
  message: 'Request failed',
  response: status === undefined ? undefined : { status, data },
});

const envelope = (
  errorCode: string | undefined,
  results: unknown = 'Server says no',
  message = 'Error'
) => ({
  message,
  error: true,
  code: 0,
  results,
  ...(errorCode ? { error_code: errorCode } : {}),
});

describe('toSmsOtpError', () => {
  it.each([
    [409, 'PROVIDER_DISABLED'],
    [422, 'VALIDATION'],
    [503, 'SMS_FAILED'],
    [410, 'OTP_EXPIRED'],
    [429, 'OTP_LOCKED'],
    [429, 'OTP_RATE_LIMITED'],
  ])('maps HTTP %s + %s', (status, code) => {
    const err = toSmsOtpError(axiosError(status, envelope(code)));
    expect(err).toBeInstanceOf(SmsOtpError);
    expect(err.code).toBe(code);
    expect(err.status).toBe(status);
    expect(err.message).toBe('Server says no');
  });

  it('reads resend_in for OTP_RESEND_TOO_SOON', () => {
    const err = toSmsOtpError(
      axiosError(429, envelope('OTP_RESEND_TOO_SOON', { resend_in: 42 }))
    );
    expect(err.code).toBe('OTP_RESEND_TOO_SOON');
    expect(err.resendIn).toBe(42);
    // results is an object, so the message comes from `message`.
    expect(err.message).toBe('Error');
  });

  it('reads attempts_left for OTP_INVALID', () => {
    const err = toSmsOtpError(
      axiosError(422, envelope('OTP_INVALID', { attempts_left: 3 }))
    );
    expect(err.code).toBe('OTP_INVALID');
    expect(err.attemptsLeft).toBe(3);
  });

  it('accepts attempts_left of 0 and numeric strings', () => {
    expect(
      toSmsOtpError(
        axiosError(422, envelope('OTP_INVALID', { attempts_left: 0 }))
      ).attemptsLeft
    ).toBe(0);
    expect(
      toSmsOtpError(
        axiosError(429, envelope('OTP_RESEND_TOO_SOON', { resend_in: '15' }))
      ).resendIn
    ).toBe(15);
  });

  it('maps a 401 without error_code (suppressed / banned) to BANNED', () => {
    expect(
      toSmsOtpError(axiosError(401, envelope(undefined, 'Banned'))).code
    ).toBe('BANNED');
    expect(toSmsOtpError(axiosError(403, envelope(undefined))).code).toBe(
      'BANNED'
    );
  });

  it('maps a bare 429 (throttle middleware) to OTP_RATE_LIMITED', () => {
    const err = toSmsOtpError(
      axiosError(429, { message: 'Too Many Attempts.' })
    );
    expect(err.code).toBe('OTP_RATE_LIMITED');
  });

  it('maps an unrecognised error_code to UNKNOWN', () => {
    const err = toSmsOtpError(axiosError(500, envelope('SOMETHING_NEW')));
    expect(err.code).toBe('UNKNOWN');
    expect(err.status).toBe(500);
  });

  it('maps a transport failure to NETWORK', () => {
    expect(toSmsOtpError(axiosError(undefined)).code).toBe('NETWORK');
    expect(toSmsOtpError({ code: 'ECONNABORTED' }).code).toBe('NETWORK');
  });

  it('does not treat a JS error or a cancellation as NETWORK', () => {
    expect(toSmsOtpError(new TypeError('x')).code).toBe('UNKNOWN');
    expect(
      toSmsOtpError({ isAxiosError: true, code: 'ERR_CANCELED' }).code
    ).toBe('UNKNOWN');
    expect(toSmsOtpError(undefined).code).toBe('UNKNOWN');
    expect(toSmsOtpError('').code).toBe('UNKNOWN');
  });

  it('returns an existing SmsOtpError unchanged', () => {
    const original = new SmsOtpError('OTP_LOCKED', 'x', { status: 429 });
    expect(toSmsOtpError(original)).toBe(original);
  });
});

describe('shouldFallBackToFirebase', () => {
  it('falls back for PROVIDER_DISABLED and a missing route (404)', () => {
    expect(
      shouldFallBackToFirebase(new SmsOtpError('PROVIDER_DISABLED', 'x'))
    ).toBe(true);
    expect(
      shouldFallBackToFirebase(new SmsOtpError('UNKNOWN', 'x', { status: 404 }))
    ).toBe(true);
  });

  it('does not fall back for real send failures', () => {
    for (const code of [
      'VALIDATION',
      'SMS_FAILED',
      'OTP_RATE_LIMITED',
      'OTP_RESEND_TOO_SOON',
      'NETWORK',
    ] as const) {
      expect(shouldFallBackToFirebase(new SmsOtpError(code, 'x'))).toBe(false);
    }
    expect(
      shouldFallBackToFirebase(new SmsOtpError('UNKNOWN', 'x', { status: 500 }))
    ).toBe(false);
  });
});
