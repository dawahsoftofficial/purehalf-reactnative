/**
 * Which service sends and checks the phone sign-in code.
 *
 * Two admin settings (public /settings list) pick the provider:
 *   - `sms_otp_provider` for Pakistani (+92) numbers: `firebase` (default) or
 *     `sendpk`;
 *   - `sms_otp_provider_intl` for every other number: `firebase` (default) or
 *     `bird`.
 * The server route (our server sends and checks the code) is used when the
 * setting matching the number is switched on; everything else, and any
 * missing or unreadable setting, stays on Firebase phone auth. The server
 * re-checks this and answers PROVIDER_DISABLED, so a client with a stale
 * setting falls back to Firebase.
 *
 * Keep this module free of React Native imports so it runs in plain jest.
 */

/** Provider for Pakistani (+92) numbers. */
export type SmsOtpProvider = 'firebase' | 'sendpk';
/** Provider for international (non-+92) numbers. */
export type SmsOtpIntlProvider = 'firebase' | 'bird';
export type SmsOtpProviders = {
  pk: SmsOtpProvider;
  intl: SmsOtpIntlProvider;
};
export type OtpRoute = 'server' | 'firebase';

export const SMS_OTP_PROVIDER_SETTING_KEY = 'sms_otp_provider';
export const SMS_OTP_PROVIDER_INTL_SETTING_KEY = 'sms_otp_provider_intl';
export const SERVER_OTP_COUNTRY_CODE = '+92';

/** Both providers on Firebase: the answer whenever nothing can be read. */
export const firebaseOnlyProviders = (): SmsOtpProviders => ({
  pk: 'firebase',
  intl: 'firebase',
});

/** How long a /settings copy is trusted at the phone screen before a refresh. */
export const SMS_OTP_SETTINGS_MAX_AGE_MS = 5 * 60 * 1000;
/** How long Continue waits for a /settings refresh before using what it has. */
export const SMS_OTP_SETTINGS_TIMEOUT_MS = 4000;

const isSetTo = (value: unknown, expected: string) =>
  typeof value === 'string' && value.trim().toLowerCase() === expected;

/** Anything other than an explicit `sendpk` means Firebase. */
export function normalizeSmsOtpProvider(value: unknown): SmsOtpProvider {
  return isSetTo(value, 'sendpk') ? 'sendpk' : 'firebase';
}

/** Anything other than an explicit `bird` means Firebase. */
export function normalizeSmsOtpIntlProvider(
  value: unknown
): SmsOtpIntlProvider {
  return isSetTo(value, 'bird') ? 'bird' : 'firebase';
}

/** Both providers from an untrusted value; anything unreadable is Firebase. */
export function normalizeSmsOtpProviders(value: unknown): SmsOtpProviders {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<
    Record<keyof SmsOtpProviders, unknown>
  >;
  return {
    pk: normalizeSmsOtpProvider(raw.pk),
    intl: normalizeSmsOtpIntlProvider(raw.intl),
  };
}

/**
 * Server when (+92 and `sendpk`) or (any other E.164 number and `bird`);
 * otherwise Firebase. A number without a leading `+country` is Firebase.
 */
export function chooseOtpRoute(
  providers: SmsOtpProviders | null | undefined,
  e164Phone: string | null | undefined
): OtpRoute {
  if (!providers) return 'firebase';
  const phone = (e164Phone ?? '').trim();
  if (!/^\+[1-9]/.test(phone)) return 'firebase';
  if (phone.startsWith(SERVER_OTP_COUNTRY_CODE)) {
    return providers.pk === 'sendpk' ? 'server' : 'firebase';
  }
  return providers.intl === 'bird' ? 'server' : 'firebase';
}

export function isSettingsStale(
  loadedAt: number | null | undefined,
  now: number,
  maxAgeMs: number = SMS_OTP_SETTINGS_MAX_AGE_MS
): boolean {
  return !loadedAt || now - loadedAt > maxAgeMs;
}

type ResolveSmsOtpProvidersInput = {
  /** Providers from the settings store, or null when nothing has loaded. */
  cached: SmsOtpProviders | null;
  /** Whether the cached copy is fresh enough to use without a refresh. */
  fresh: boolean;
  /** Re-fetches /settings and returns the providers it now holds. */
  refresh: () => Promise<SmsOtpProviders>;
  timeoutMs?: number;
};

/**
 * Providers to use for this sign-in. A fresh cached value is used as is;
 * otherwise /settings is re-fetched (bounded by a timeout). If that fails the
 * last known values are used, and with nothing known both are Firebase.
 */
export async function resolveSmsOtpProviders({
  cached,
  fresh,
  refresh,
  timeoutMs = SMS_OTP_SETTINGS_TIMEOUT_MS,
}: ResolveSmsOtpProvidersInput): Promise<SmsOtpProviders> {
  if (cached && fresh) return normalizeSmsOtpProviders(cached);

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('settings timeout')),
        timeoutMs
      );
    });
    return normalizeSmsOtpProviders(await Promise.race([refresh(), timeout]));
  } catch {
    return cached ? normalizeSmsOtpProviders(cached) : firebaseOnlyProviders();
  } finally {
    if (timer) clearTimeout(timer);
  }
}
