import {
  chooseOtpRoute,
  isSettingsStale,
  normalizeSmsOtpIntlProvider,
  normalizeSmsOtpProvider,
  normalizeSmsOtpProviders,
  resolveSmsOtpProviders,
  type SmsOtpIntlProvider,
  type SmsOtpProvider,
  type SmsOtpProviders,
} from './otp-route';

const providers = (
  pk: SmsOtpProvider,
  intl: SmsOtpIntlProvider
): SmsOtpProviders => ({ pk, intl });

const PK = '+923001234567';
const UK = '+447700900123';
const US = '+12025550123';

describe('chooseOtpRoute', () => {
  it('uses the server for sendpk + a Pakistani number', () => {
    expect(chooseOtpRoute(providers('sendpk', 'firebase'), PK)).toBe('server');
  });

  it('keeps a Pakistani number on Firebase when its provider is firebase', () => {
    expect(chooseOtpRoute(providers('firebase', 'firebase'), PK)).toBe(
      'firebase'
    );
  });

  it('uses the server for bird + an international number', () => {
    expect(chooseOtpRoute(providers('firebase', 'bird'), UK)).toBe('server');
    expect(chooseOtpRoute(providers('firebase', 'bird'), US)).toBe('server');
  });

  it('keeps an international number on Firebase when its provider is firebase', () => {
    expect(chooseOtpRoute(providers('firebase', 'firebase'), UK)).toBe(
      'firebase'
    );
  });

  it('looks only at the setting that matches the number (mixed settings)', () => {
    // SendPK on, Bird off: Pakistan on the server, everyone else Firebase.
    expect(chooseOtpRoute(providers('sendpk', 'firebase'), PK)).toBe('server');
    expect(chooseOtpRoute(providers('sendpk', 'firebase'), UK)).toBe(
      'firebase'
    );
    // A +1 number containing 92 is still international.
    expect(
      chooseOtpRoute(providers('sendpk', 'firebase'), '+19230012345')
    ).toBe('firebase');
    // Bird on, SendPK off: Pakistan on Firebase, everyone else the server.
    expect(chooseOtpRoute(providers('firebase', 'bird'), PK)).toBe('firebase');
    expect(chooseOtpRoute(providers('firebase', 'bird'), UK)).toBe('server');
    // Both on: everyone on the server.
    expect(chooseOtpRoute(providers('sendpk', 'bird'), PK)).toBe('server');
    expect(chooseOtpRoute(providers('sendpk', 'bird'), UK)).toBe('server');
  });

  it('keeps Firebase when the providers are unknown', () => {
    expect(chooseOtpRoute(null, PK)).toBe('firebase');
    expect(chooseOtpRoute(undefined, UK)).toBe('firebase');
  });

  it('keeps Firebase for an empty, missing or non-E.164 number', () => {
    const all = providers('sendpk', 'bird');
    expect(chooseOtpRoute(all, '')).toBe('firebase');
    expect(chooseOtpRoute(all, null)).toBe('firebase');
    expect(chooseOtpRoute(all, '923001234567')).toBe('firebase');
    expect(chooseOtpRoute(all, '447700900123')).toBe('firebase');
    expect(chooseOtpRoute(all, '+0447700900123')).toBe('firebase');
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
    expect(normalizeSmsOtpProvider('bird')).toBe('firebase');
    expect(normalizeSmsOtpProvider(null)).toBe('firebase');
    expect(normalizeSmsOtpProvider(1)).toBe('firebase');
    expect(normalizeSmsOtpProvider({ value: 'sendpk' })).toBe('firebase');
  });
});

describe('normalizeSmsOtpIntlProvider', () => {
  it('accepts bird loosely', () => {
    expect(normalizeSmsOtpIntlProvider('bird')).toBe('bird');
    expect(normalizeSmsOtpIntlProvider(' Bird ')).toBe('bird');
  });

  it('treats everything else as firebase', () => {
    expect(normalizeSmsOtpIntlProvider('firebase')).toBe('firebase');
    expect(normalizeSmsOtpIntlProvider('sendpk')).toBe('firebase');
    expect(normalizeSmsOtpIntlProvider(undefined)).toBe('firebase');
    expect(normalizeSmsOtpIntlProvider(true)).toBe('firebase');
  });
});

describe('normalizeSmsOtpProviders', () => {
  it('keeps known values and defaults the rest to firebase', () => {
    expect(normalizeSmsOtpProviders({ pk: 'sendpk', intl: 'bird' })).toEqual(
      providers('sendpk', 'bird')
    );
    expect(normalizeSmsOtpProviders({ pk: 'bird', intl: 'sendpk' })).toEqual(
      providers('firebase', 'firebase')
    );
    expect(normalizeSmsOtpProviders({ intl: 'bird' })).toEqual(
      providers('firebase', 'bird')
    );
    expect(normalizeSmsOtpProviders(null)).toEqual(
      providers('firebase', 'firebase')
    );
    expect(normalizeSmsOtpProviders('sendpk')).toEqual(
      providers('firebase', 'firebase')
    );
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

describe('resolveSmsOtpProviders', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  const FIREBASE = providers('firebase', 'firebase');

  it('uses fresh cached values without refreshing', async () => {
    const refresh = jest.fn();
    await expect(
      resolveSmsOtpProviders({
        cached: providers('sendpk', 'bird'),
        fresh: true,
        refresh,
      })
    ).resolves.toEqual(providers('sendpk', 'bird'));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes when nothing is cached', async () => {
    const refresh = jest.fn().mockResolvedValue(providers('firebase', 'bird'));
    await expect(
      resolveSmsOtpProviders({ cached: null, fresh: false, refresh })
    ).resolves.toEqual(providers('firebase', 'bird'));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes stale cached values', async () => {
    const refresh = jest.fn().mockResolvedValue(FIREBASE);
    await expect(
      resolveSmsOtpProviders({
        cached: providers('sendpk', 'bird'),
        fresh: false,
        refresh,
      })
    ).resolves.toEqual(FIREBASE);
  });

  it('normalises a malformed refresh result to firebase', async () => {
    const refresh = jest.fn().mockResolvedValue({ pk: 'twilio' });
    await expect(
      resolveSmsOtpProviders({ cached: null, fresh: false, refresh })
    ).resolves.toEqual(FIREBASE);
  });

  it('falls back to firebase when the refresh fails and nothing is cached', async () => {
    const refresh = jest.fn().mockRejectedValue('');
    await expect(
      resolveSmsOtpProviders({ cached: null, fresh: false, refresh })
    ).resolves.toEqual(FIREBASE);
  });

  it('keeps the last known values when the refresh fails', async () => {
    const refresh = jest.fn().mockRejectedValue(new Error('offline'));
    await expect(
      resolveSmsOtpProviders({
        cached: providers('firebase', 'bird'),
        fresh: false,
        refresh,
      })
    ).resolves.toEqual(providers('firebase', 'bird'));
  });

  it('gives up on a slow refresh after the timeout', async () => {
    jest.useFakeTimers();
    const refresh = jest.fn(() => new Promise<never>(() => {}));
    const result = resolveSmsOtpProviders({
      cached: null,
      fresh: false,
      refresh,
      timeoutMs: 100,
    });
    jest.advanceTimersByTime(100);
    await expect(result).resolves.toEqual(FIREBASE);
  });

  it('keeps the last known values on a slow refresh', async () => {
    jest.useFakeTimers();
    const refresh = jest.fn(() => new Promise<never>(() => {}));
    const result = resolveSmsOtpProviders({
      cached: providers('sendpk', 'bird'),
      fresh: false,
      refresh,
      timeoutMs: 100,
    });
    jest.advanceTimersByTime(100);
    await expect(result).resolves.toEqual(providers('sendpk', 'bird'));
  });
});
