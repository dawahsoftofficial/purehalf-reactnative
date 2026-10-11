import notifee from '@notifee/react-native';
import { getApp } from '@react-native-firebase/app';
import {
  getInitialNotification,
  getMessaging,
  onNotificationOpenedApp,
} from '@react-native-firebase/messaging';
import { useEffect } from 'react';

import { ApiServices, Firebase } from '../services';
import { openChatFromPush } from './pendingPush';
import { handleNotifeeEvent, handleNotifeePress } from './pushEvents';
import { getChatPushParams } from './pushPayload';

const messaging = getMessaging(getApp());

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

    return () => {
      unsubscribeOpened?.();
      unsubscribeForeground?.();
      unsubscribeToken?.();
    };
  }, []);
}
