/**
 * Which service sends and checks the phone sign-in code.
 *
 * The admin `sms_otp_provider` setting (public /settings list) picks the
 * provider: `firebase` (default) or `sendpk` (our own server sends the SMS).
 * SendPK only covers Pakistan, so the server route is used only for +92
 * numbers; everything else, and any missing or unreadable setting, stays on
 * Firebase phone auth. The server re-checks this and answers
 * PROVIDER_DISABLED, so a client with a stale setting falls back to Firebase.
 *
 * Keep this module free of React Native imports so it runs in plain jest.
 */

export type SmsOtpProvider = 'firebase' | 'sendpk';
export type OtpRoute = 'server' | 'firebase';

export const SMS_OTP_PROVIDER_SETTING_KEY = 'sms_otp_provider';
export const SERVER_OTP_COUNTRY_CODE = '+92';

/** How long a /settings copy is trusted at the phone screen before a refresh. */
export const SMS_OTP_SETTINGS_MAX_AGE_MS = 5 * 60 * 1000;
/** How long Continue waits for a /settings refresh before using what it has. */
export const SMS_OTP_SETTINGS_TIMEOUT_MS = 4000;

/** Anything other than an explicit `sendpk` means Firebase. */
export function normalizeSmsOtpProvider(value: unknown): SmsOtpProvider {
  return typeof value === 'string' && value.trim().toLowerCase() === 'sendpk'
    ? 'sendpk'
    : 'firebase';
}

export function chooseOtpRoute(
  provider: SmsOtpProvider | null | undefined,
  e164Phone: string | null | undefined
): OtpRoute {
  if (provider !== 'sendpk') return 'firebase';
  const phone = (e164Phone ?? '').trim();
  return phone.startsWith(SERVER_OTP_COUNTRY_CODE) ? 'server' : 'firebase';
}

export function isSettingsStale(
  loadedAt: number | null | undefined,
  now: number,
  maxAgeMs: number = SMS_OTP_SETTINGS_MAX_AGE_MS
): boolean {
  return !loadedAt || now - loadedAt > maxAgeMs;
}

type ResolveSmsOtpProviderInput = {
  /** Provider from the settings store, or null when nothing has loaded. */
  cached: SmsOtpProvider | null;
  /** Whether the cached copy is fresh enough to use without a refresh. */
  fresh: boolean;
  /** Re-fetches /settings and returns the provider it now holds. */
  refresh: () => Promise<SmsOtpProvider>;
  timeoutMs?: number;
};

/**
 * Provider to use for this sign-in. A fresh cached value is used as is;
 * otherwise /settings is re-fetched (bounded by a timeout). If that fails the
 * last known value is used, and with nothing known it is Firebase.
 */
export async function resolveSmsOtpProvider({
  cached,
  fresh,
  refresh,
  timeoutMs = SMS_OTP_SETTINGS_TIMEOUT_MS,
}: ResolveSmsOtpProviderInput): Promise<SmsOtpProvider> {
  if (cached && fresh) return cached;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('settings timeout')),
        timeoutMs
      );
    });
    return normalizeSmsOtpProvider(await Promise.race([refresh(), timeout]));
  } catch {
    return cached ?? 'firebase';
  } finally {
    if (timer) clearTimeout(timer);
  }
}
