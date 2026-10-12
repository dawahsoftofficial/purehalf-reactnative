import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useConversationStore } from '../../stores/conversation-store';
import ApiServices from '../api/Services';
import pusherService from '../pusher/pusher-service';
import { resolveUnreadCounts } from './unreadCounts';

/** Don't refetch more often than this (reconnect flaps, quick app switches). */
const MIN_REFRESH_INTERVAL_MS = 5000;

/**
 * Seeds the unread-chat badge from `/auth/counter` and keeps it honest.
 *
 * The badge is otherwise driven only by Pusher `counterUpdate` events, so it
 * showed 0 after launch and missed anything that happened while the app was in
 * the background or offline. This fetches the real counts on mount, whenever
 * the app returns to the foreground and when Pusher reconnects, and writes
 * them to the same store the Pusher handler writes.
 *
 * Mount once at the app root. Pass `enabled=false` for logged-out users and
 * the guardian role.
 */
export function useChatBadgeSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    let inFlight = false;
    let lastStartedAt = 0;

    const refresh = async () => {
      const now = Date.now();
      if (inFlight || now - lastStartedAt < MIN_REFRESH_INTERVAL_MS) return;
      inFlight = true;
      lastStartedAt = now;

      const before = useConversationStore.getState();
      const snapshot = {
        conversations: before.unreadConversationsCount,
        messages: before.unreadMessagesCount,
      };
      try {
        const results = await ApiServices.getUserStats();
        if (cancelled) return;

        const store = useConversationStore.getState();
        const current = {
          conversations: store.unreadConversationsCount,
          messages: store.unreadMessagesCount,
        };
        // A Pusher counterUpdate that landed while the request was in flight
        // is newer than this response; don't overwrite it.
        if (
          current.conversations !== snapshot.conversations ||
          current.messages !== snapshot.messages
        ) {
          return;
        }

        const next = resolveUnreadCounts(results, current);
        if (next) store.setUnreadCounts(next.conversations, next.messages);
      } catch (error) {
        console.log(
          '[useChatBadgeSync] Could not refresh unread counts',
          error
        );
      } finally {
        inFlight = false;
      }
    };

    void refresh();

    const appStateSubscription = AppState.addEventListener(
      'change',
      (state: AppStateStatus) => {
        if (state === 'active') void refresh();
      }
    );
    const removeConnectionListener = pusherService.addConnectionListener(
      (currentState, previousState) => {
        if (currentState === 'CONNECTED' && previousState !== 'CONNECTED') {
          void refresh();
        }
      }
    );

    return () => {
      cancelled = true;
      appStateSubscription.remove();
      removeConnectionListener();
    };
  }, [enabled]);
}
