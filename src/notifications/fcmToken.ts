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
 * Whether `token` should be uploaded: it is a real token (never the
 * placeholder) and differs from the one last uploaded.
 */
export function shouldUploadFcmToken(
  token: unknown,
  lastUploaded: unknown
): token is string {
  return isUsableFcmToken(token) && token !== lastUploaded;
}
