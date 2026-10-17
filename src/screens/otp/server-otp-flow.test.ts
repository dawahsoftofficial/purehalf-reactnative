import { SmsOtpError } from '../../services/api/sms-otp-errors';
import {
  initialResendSeconds,
  otpScreenRoute,
  resendServerCode,
  startPhoneLogin,
} from './server-otp-flow';

const PK = '+923001234567';
const UK = '+447700900123';

const sendOk = (resendIn = 60) => jest.fn().mockResolvedValue({ resendIn });
const sendFails = (error: unknown) => jest.fn().mockRejectedValue(error);

describe('startPhoneLogin', () => {
  it('sends a server code for sendpk + a Pakistani number', async () => {
    const send = sendOk(45);
    await expect(
      startPhoneLogin(PK, { resolveProvider: async () => 'sendpk', send })
    ).resolves.toEqual({ route: 'server', resendIn: 45 });
    expect(send).toHaveBeenCalledWith(PK);
  });

  it('stays on Firebase when the provider is firebase', async () => {
    const send = sendOk();
    await expect(
      startPhoneLogin(PK, { resolveProvider: async () => 'firebase', send })
    ).resolves.toEqual({ route: 'firebase' });
    expect(send).not.toHaveBeenCalled();
  });

  it('stays on Firebase for a non-Pakistani number', async () => {
    const send = sendOk();
    await expect(
      startPhoneLogin(UK, { resolveProvider: async () => 'sendpk', send })
    ).resolves.toEqual({ route: 'firebase' });
    expect(send).not.toHaveBeenCalled();
  });

  it('stays on Firebase when the provider cannot be read', async () => {
    const send = sendOk();
    await expect(
      startPhoneLogin(PK, {
        resolveProvider: () => Promise.reject(new Error('offline')),
        send,
      })
    ).resolves.toEqual({ route: 'firebase' });
    expect(send).not.toHaveBeenCalled();
  });

  it('silently falls back to Firebase on PROVIDER_DISABLED', async () => {
    await expect(
      startPhoneLogin(PK, {
        resolveProvider: async () => 'sendpk',
        send: sendFails(
          new SmsOtpError('PROVIDER_DISABLED', 'x', { status: 409 })
        ),
      })
    ).resolves.toEqual({ route: 'firebase' });
  });

  it('falls back to Firebase when the server has no /otp/send (404)', async () => {
    await expect(
      startPhoneLogin(PK, {
        resolveProvider: async () => 'sendpk',
        send: sendFails({
          isAxiosError: true,
          response: { status: 404, data: { message: 'Not Found' } },
        }),
      })
    ).resolves.toEqual({ route: 'firebase' });
  });

  it('goes to the OTP screen when a code was sent moments ago', async () => {
    await expect(
      startPhoneLogin(PK, {
        resolveProvider: async () => 'sendpk',
        send: sendFails(
          new SmsOtpError('OTP_RESEND_TOO_SOON', 'x', { resendIn: 20 })
        ),
      })
    ).resolves.toEqual({ route: 'server', resendIn: 20 });
  });

  it.each([
    ['SMS_FAILED', 'smsOtpErrorSmsFailed'],
    ['OTP_RATE_LIMITED', 'smsOtpErrorRateLimited'],
    ['VALIDATION', 'invalidPhoneNumber'],
    ['NETWORK', 'smsOtpErrorNetwork'],
  ] as const)('reports %s instead of falling back', async (code, key) => {
    await expect(
      startPhoneLogin(PK, {
        resolveProvider: async () => 'sendpk',
        send: sendFails(new SmsOtpError(code, 'x')),
      })
    ).resolves.toEqual({ route: 'error', message: { key } });
  });
});

describe('resendServerCode', () => {
  it('restarts the countdown from resend_in', async () => {
    await expect(resendServerCode(PK, sendOk(60))).resolves.toEqual({
      kind: 'sent',
      resendIn: 60,
    });
  });

  it('waits out OTP_RESEND_TOO_SOON', async () => {
    await expect(
      resendServerCode(
        PK,
        sendFails(new SmsOtpError('OTP_RESEND_TOO_SOON', 'x', { resendIn: 12 }))
      )
    ).resolves.toEqual({
      kind: 'wait',
      resendIn: 12,
      message: { key: 'smsOtpErrorResendTooSoon', options: { seconds: 12 } },
    });
  });

  it('switches to Firebase when the provider was turned off', async () => {
    await expect(
      resendServerCode(PK, sendFails(new SmsOtpError('PROVIDER_DISABLED', 'x')))
    ).resolves.toEqual({ kind: 'firebase' });
  });

  it('reports other failures', async () => {
    await expect(
      resendServerCode(PK, sendFails(new SmsOtpError('SMS_FAILED', 'x')))
    ).resolves.toEqual({
      kind: 'error',
      message: { key: 'smsOtpErrorSmsFailed' },
    });
  });
});

describe('otpScreenRoute', () => {
  it('runs the server route only when asked', () => {
    expect(otpScreenRoute('server', undefined)).toBe('server');
    expect(otpScreenRoute('firebase', undefined)).toBe('firebase');
    expect(otpScreenRoute(undefined, '')).toBe('firebase');
  });

  it('keeps account deletion on Firebase', () => {
    expect(otpScreenRoute('server', 'AccountDeletion')).toBe('firebase');
  });
});

describe('initialResendSeconds', () => {
  it('keeps the 30 s Firebase countdown', () => {
    expect(initialResendSeconds('firebase', 90)).toBe(30);
  });

  it('uses the server resend_in, defaulting to 60', () => {
    expect(initialResendSeconds('server', 45)).toBe(45);
    expect(initialResendSeconds('server', undefined)).toBe(60);
    expect(initialResendSeconds('server', -5)).toBe(0);
  });
});
