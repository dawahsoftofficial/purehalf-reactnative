/** The value stored/returned when no real FCM token could be obtained. */
export const FCM_TOKEN_PLACEHOLDER = 'FcmToken';

/** True for a real token; false for empty values and the placeholder. */
export function isUsableFcmToken(token: unknown): token is string {
  return (
    typeof token === 'string' &&
    token.trim().length > 0 &&
    token !== FCM_TOKEN_PLACEHOLDER
  );
}

/** The token to send to the API, or `undefined` (omitted) if unusable. */
export function fcmTokenForUpload(token: unknown): string | undefined {
  return isUsableFcmToken(token) ? token : undefined;
}

/**
 * The token to use for this device: Firebase's current token when available,
 * else the stored copy, else the placeholder. The stored copy is only a
 * fallback because Firebase rotates tokens and the cache can go stale.
 */
export function pickFcmToken(fresh: unknown, stored: unknown): string {
  if (isUsableFcmToken(fresh)) return fresh;
  if (isUsableFcmToken(stored)) return stored;
  return FCM_TOKEN_PLACEHOLDER;
}

/**
 * Whether `token` should be uploaded: it is a real token (never the
 * placeholder) and differs from the one last uploaded.
 */
export function shouldUploadFcmToken(
  token: unknown,
  lastUploaded: unknown
): token is string {
  return isUsableFcmToken(token) && token !== lastUploaded;
}
