import {
  chooseOtpRoute,
  isSettingsStale,
  normalizeSmsOtpProvider,
  resolveSmsOtpProvider,
} from './otp-route';

describe('chooseOtpRoute', () => {
  it('uses the server only for sendpk + a Pakistani number', () => {
    expect(chooseOtpRoute('sendpk', '+923001234567')).toBe('server');
  });

  it('keeps non-Pakistani numbers on Firebase even with sendpk', () => {
    expect(chooseOtpRoute('sendpk', '+447700900123')).toBe('firebase');
    expect(chooseOtpRoute('sendpk', '+19230012345')).toBe('firebase');
  });

  it('keeps Firebase when the provider is firebase or unknown', () => {
    expect(chooseOtpRoute('firebase', '+923001234567')).toBe('firebase');
    expect(chooseOtpRoute(null, '+923001234567')).toBe('firebase');
    expect(chooseOtpRoute(undefined, '+923001234567')).toBe('firebase');
  });

  it('keeps Firebase for an empty or missing number', () => {
    expect(chooseOtpRoute('sendpk', '')).toBe('firebase');
    expect(chooseOtpRoute('sendpk', null)).toBe('firebase');
    expect(chooseOtpRoute('sendpk', '923001234567')).toBe('firebase');
  });
});

describe('normalizeSmsOtpProvider', () => {
  it('accepts sendpk loosely', () => {
    expect(normalizeSmsOtpProvider('sendpk')).toBe('sendpk');
    expect(normalizeSmsOtpProvider(' SendPK ')).toBe('sendpk');
  });

  it('treats everything else as firebase', () => {
    expect(normalizeSmsOtpProvider('firebase')).toBe('firebase');
    expect(normalizeSmsOtpProvider('twilio')).toBe('firebase');
    expect(normalizeSmsOtpProvider(null)).toBe('firebase');
    expect(normalizeSmsOtpProvider(1)).toBe('firebase');
    expect(normalizeSmsOtpProvider({ value: 'sendpk' })).toBe('firebase');
  });
});

describe('isSettingsStale', () => {
  it('is stale when never loaded or older than the max age', () => {
    expect(isSettingsStale(null, 1000)).toBe(true);
    expect(isSettingsStale(1000, 1000 + 10, 5)).toBe(true);
  });

  it('is fresh within the max age', () => {
    expect(isSettingsStale(1000, 1004, 5)).toBe(false);
  });
});

describe('resolveSmsOtpProvider', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses a fresh cached value without refreshing', async () => {
    const refresh = jest.fn();
    await expect(
      resolveSmsOtpProvider({ cached: 'sendpk', fresh: true, refresh })
    ).resolves.toBe('sendpk');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes when nothing is cached', async () => {
    const refresh = jest.fn().mockResolvedValue('sendpk');
    await expect(
      resolveSmsOtpProvider({ cached: null, fresh: false, refresh })
    ).resolves.toBe('sendpk');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes a stale cached value', async () => {
    const refresh = jest.fn().mockResolvedValue('firebase');
    await expect(
      resolveSmsOtpProvider({ cached: 'sendpk', fresh: false, refresh })
    ).resolves.toBe('firebase');
  });

  it('falls back to firebase when the refresh fails and nothing is cached', async () => {
    const refresh = jest.fn().mockRejectedValue('');
    await expect(
      resolveSmsOtpProvider({ cached: null, fresh: false, refresh })
    ).resolves.toBe('firebase');
  });

  it('keeps the last known value when the refresh fails', async () => {
    const refresh = jest.fn().mockRejectedValue(new Error('offline'));
    await expect(
      resolveSmsOtpProvider({ cached: 'sendpk', fresh: false, refresh })
    ).resolves.toBe('sendpk');
  });

  it('gives up on a slow refresh after the timeout', async () => {
    jest.useFakeTimers();
    const refresh = jest.fn(() => new Promise<never>(() => {}));
    const result = resolveSmsOtpProvider({
      cached: null,
      fresh: false,
      refresh,
      timeoutMs: 100,
    });
    jest.advanceTimersByTime(100);
    await expect(result).resolves.toBe('firebase');
  });
});
