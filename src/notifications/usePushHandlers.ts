import notifee from '@notifee/react-native';
import { getApp } from '@react-native-firebase/app';
import {
  getInitialNotification,
  getMessaging,
  onNotificationOpenedApp,
} from '@react-native-firebase/messaging';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { ApiServices, Firebase, StorageManager } from '../services';
import { shouldUploadFcmToken } from './fcmToken';
import { getNotificationPermissionStatus } from './NotificationPermissions';
import { openChatFromPush } from './pendingPush';
import { handleNotifeeEvent, handleNotifeePress } from './pushEvents';
import { getChatPushParams } from './pushPayload';

const messaging = getMessaging(getApp());

/**
 * Uploads the device's FCM token when notifications are allowed and it differs
 * from the one last confirmed by the backend (rotated while the app was closed,
 * or never uploaded). `always` skips the "unchanged" shortcut: the server can
 * drop a token on its side (rejected send, a login elsewhere), so the app
 * re-registers once per launch instead of trusting its local copy forever.
 * Best-effort and silent: ApiServices.syncFcmToken does nothing when signed
 * out and never sends the 'FcmToken' placeholder.
 */
async function syncFcmTokenIfChanged(always = false): Promise<void> {
  try {
    if ((await getNotificationPermissionStatus()) !== 'granted') return;
    const token = await Firebase.getFcmToken();
    const lastUploaded = always
      ? null
      : await StorageManager.getData(
          StorageManager.storageKeys.FCM_TOKEN_UPLOADED
        );
    if (!shouldUploadFcmToken(token, lastUploaded)) return;
    await ApiServices.syncFcmToken(token);
  } catch (error) {
    console.log('[usePushHandlers] FCM token sync skipped:', error);
  }
}

const openFromRemoteMessage = (message: unknown) => {
  const params = getChatPushParams(
    message as Parameters<typeof getChatPushParams>[0]
  );
  if (params) openChatFromPush(params);
};

/**
 * Wires push taps to navigation and keeps the FCM token fresh. Mount once
 * under the NavigationContainer.
 *
 * - System-tray notifications drawn by FCM itself (messages with a
 *   `notification` block): `onNotificationOpenedApp` (background) and
 *   `getInitialNotification` (cold start).
 * - notifee notifications (data-only messages): foreground press events here;
 *   background presses are handled by index.js.
 * - Cold-start taps are queued by pendingPush until navigation is ready.
 */
export function usePushHandlers() {
  useEffect(() => {
    const unsubscribeOpened = onNotificationOpenedApp(
      messaging,
      openFromRemoteMessage
    );
    getInitialNotification(messaging)
      .then((message) => {
        if (message) openFromRemoteMessage(message);
      })
      .catch((error) =>
        console.error('[usePushHandlers] FCM initial notification:', error)
      );

    notifee
      .getInitialNotification()
      .then((initial) => {
        if (initial?.notification) {
          const pressAction = initial.pressAction?.id;
          if (pressAction === 'openChat') {
            return handleNotifeePress(initial.notification, pressAction);
          }
        }
        return undefined;
      })
      .catch((error) =>
        console.error('[usePushHandlers] notifee initial notification:', error)
      );
    const unsubscribeForeground = notifee.onForegroundEvent(handleNotifeeEvent);

    const unsubscribeToken = Firebase.onFcmTokenRefresh((token) => {
      void ApiServices.syncFcmToken(token);
    });

    // Always on start; on returning to the foreground only if it changed.
    void syncFcmTokenIfChanged(true);
    const appStateSubscription = AppState.addEventListener(
      'change',
      (state: AppStateStatus) => {
        if (state === 'active') void syncFcmTokenIfChanged();
      }
    );

    return () => {
      unsubscribeOpened?.();
      unsubscribeForeground?.();
      unsubscribeToken?.();
      appStateSubscription.remove();
    };
  }, []);
}
