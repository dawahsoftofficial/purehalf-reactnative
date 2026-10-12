/**
 * notifee press handling shared by the headless background handler
 * (index.js, registered at module scope) and the in-app foreground listener.
 */
import notifee, { type Event, EventType } from '@notifee/react-native';
import { DeviceEventEmitter } from 'react-native';

import { openChatFromPush } from './pendingPush';
import { getChatParamsFromNotifeeData } from './pushPayload';

/** Emitted when a "liked you" notification is tapped; Welcome listens. */
export const LIKED_YOU_PRESS_EVENT = 'purehalf.pressLikedYouNotification';

/**
 * Routes a tapped notifee notification. Chat taps are queued/navigated by
 * pendingPush; "liked you" taps are forwarded to the Welcome screen.
 */
export const handleNotifeePress = async (
  notification: Event['detail']['notification'],
  pressActionId?: string
): Promise<void> => {
  const data = (notification?.data ?? {}) as Record<string, unknown>;
  const action = (data.pressAction as string | undefined) ?? pressActionId;

  if (action === 'openChat') {
    const params = getChatParamsFromNotifeeData({
      ...data,
      pressAction: 'openChat',
    });
    if (params) openChatFromPush(params);
  } else if (action === 'my_liked_you_tab') {
    DeviceEventEmitter.emit(LIKED_YOU_PRESS_EVENT);
  } else {
    return;
  }

  if (notification?.id) {
    try {
      await notifee.cancelNotification(notification.id);
    } catch (error) {
      console.error('[pushEvents] cancelNotification failed:', error);
    }
  }
};

export const handleNotifeeEvent = async ({
  type,
  detail,
}: Event): Promise<void> => {
  if (type !== EventType.PRESS) return;
  await handleNotifeePress(detail?.notification, detail?.pressAction?.id);
};
