/**
 * Freshness rule for cached voice-message playback URLs.
 *
 * `GET messages/{id}/audio-url` returns a signed URL with an `expires_at`. A
 * cached URL is reused only while it still has a safety margin left; past that
 * (or after a playback error) the URL is fetched again.
 *
 * Keep this module free of React Native imports so it runs in plain jest.
 */
export type CachedAudioUrl = {
  url: string;
  /** ms epoch, or null when the server gave no (parsable) expiry. */
  expiresAtMs: number | null;
};

/** Refetch this long before the real expiry so playback never starts on a dying URL. */
export const AUDIO_URL_EXPIRY_MARGIN_MS = 30000;

export function toCachedAudioUrl(
  url: string,
  expiresAt: string | null | undefined
): CachedAudioUrl {
  const parsed = expiresAt ? Date.parse(expiresAt) : NaN;
  return { url, expiresAtMs: Number.isNaN(parsed) ? null : parsed };
}

export function isAudioUrlFresh(
  entry: CachedAudioUrl | undefined,
  nowMs: number = Date.now(),
  marginMs: number = AUDIO_URL_EXPIRY_MARGIN_MS
): entry is CachedAudioUrl {
  if (!entry) return false;
  // No known expiry: keep it; a playback error still triggers one refetch.
  if (entry.expiresAtMs === null) return true;
  return entry.expiresAtMs - marginMs > nowMs;
}
