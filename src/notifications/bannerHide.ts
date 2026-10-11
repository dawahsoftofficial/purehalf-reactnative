/**
 * Guard for the foreground banner's slide-out.
 *
 * Hiding runs an animation and clears the banner state when it ends. If a new
 * message arrives mid-animation, the new banner's slide-in interrupts it (the
 * callback fires with `finished: false`) and the stale callback must not clear
 * the newcomer. So clear only while the message that was being hidden is still
 * the one on screen. Keep this module free of React Native imports.
 */
export function shouldClearBannerAfterHide(
  hiddenMessage: unknown,
  currentMessage: unknown
): boolean {
  return (
    hiddenMessage !== null &&
    hiddenMessage !== undefined &&
    hiddenMessage === currentMessage
  );
}
