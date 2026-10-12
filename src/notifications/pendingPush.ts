/**
 * Defers a push-triggered navigation until the navigator can take it.
 *
 * A cold-start tap is delivered before the navigation tree is mounted (and a
 * logged-out / mid-onboarding user must never be dropped into a chat), so the
 * target is queued and flushed from the navigation container's onReady /
 * onStateChange. Free of React Native imports for plain-jest testing.
 */
import type { ChatRouteParams } from './pushPayload';

export type PushNavigator = {
  isReady: () => boolean;
  navigate: (name: string, params?: object) => void;
  getRootState: () => { routes: { name: string }[] } | undefined;
};

/** Root route present only once a fully set-up member is in the app. */
const APP_ROOT_ROUTE = 'BottomTab';

/** Two entry points can deliver the same tap (e.g. initial + background event). */
const DUPLICATE_WINDOW_MS = 3000;

let navigator: PushNavigator | null = null;
let pending: ChatRouteParams | null = null;
let lastOpened: { key: string; at: number } | null = null;

export function registerPushNavigator(next: PushNavigator | null): void {
  navigator = next;
}

/** Navigates now when possible, else queues. Returns true if navigated. */
export function openChatFromPush(params: ChatRouteParams): boolean {
  const key = String(params.conversationId);
  const now = Date.now();
  if (lastOpened?.key === key && now - lastOpened.at < DUPLICATE_WINDOW_MS) {
    return false;
  }
  lastOpened = { key, at: now };
  pending = params;
  return flushPendingPush();
}

/**
 * Called whenever navigation (re)becomes ready or changes. Navigates the
 * queued chat once the member is inside the app, and drops it if the app
 * settled on an auth / onboarding stack instead.
 */
export function flushPendingPush(): boolean {
  if (!pending || !navigator || !navigator.isReady()) return false;
  const routes = navigator.getRootState()?.routes ?? [];
  if (routes.length === 0) return false;

  const target = pending;
  pending = null;
  if (!routes.some((route) => route.name === APP_ROOT_ROUTE)) {
    return false;
  }
  navigator.navigate('SingleChat', target);
  return true;
}

/** Test helper. */
export function resetPendingPush(): void {
  navigator = null;
  pending = null;
  lastOpened = null;
}
