import 'react-native-gesture-handler';

import notifee from '@notifee/react-native';
import { getApp } from '@react-native-firebase/app';
import {
  getMessaging,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';
import React from 'react';
import { AppRegistry } from 'react-native';

import App from './App';
import { name as appName } from './app.json';
import { handleNotifeeEvent } from './src/notifications/pushEvents';
import { shouldDisplayBackgroundNotification } from './src/notifications/pushPayload';
import { Images } from './src/res';
import { AppProvider, isIOS } from './src/services';

// In release builds, silence verbose console output (log/info/debug/trace) so
// message content, user IDs, and payloads never reach logcat / the device
// console. `error` and `warn` are kept for Crashlytics and diagnostics.
if (!__DEV__) {
  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.debug = noop;
  console.trace = noop;
}

const firebaseApp = getApp();
const messaging = getMessaging(firebaseApp);

const createChannelId = async () => {
  const channelId = await notifee.createChannel({
    id: 'default',
    name: 'Default Channel',
  });
  return channelId;
};

if (!isIOS) {
  createChannelId();
}

// Must be registered at module scope (not in a component) so notification
// taps are delivered when the app was in the background or killed.
notifee.onBackgroundEvent(handleNotifeeEvent);

const onMessageReceived = async (message) => {
  // A message with a `notification` block is already drawn by the system tray
  // (Android shows it automatically); displaying it again would duplicate it.
  // Only data-only messages are drawn here.
  if (!shouldDisplayBackgroundNotification(message)) {
    return;
  }

  const { title, body, pressAction } = message.data || {};

  // Parse nested data field - handle double-stringified JSON
  let data = {};
  if (message?.data?.data) {
    try {
      const dataString = message.data.data;
      // Check if it's a string that needs parsing
      if (typeof dataString === 'string') {
        // Try parsing once - if it's still a string, parse again (double-stringified)
        let parsed = JSON.parse(dataString);
        if (typeof parsed === 'string') {
          // Double-stringified, parse again
          parsed = JSON.parse(parsed);
        }
        // Ensure parsed result is an object
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          data = parsed;
        }
      } else if (dataString && typeof dataString === 'object') {
        // Already an object
        data = dataString;
      }
    } catch (error) {
      console.error(
        '[onMessageReceived] Error parsing notification data:',
        error
      );
      // Keep data as empty object if parsing fails
      data = {};
    }
  }

  // Ensure data is always an object (notifee requirement)
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    data = {};
  }

  // Add pressAction to data object
  if (pressAction) {
    data.pressAction = pressAction;
  }

  await notifee.displayNotification({
    title: `${title || ''} ${pressAction === 'openChat' ? '💬' : pressAction === 'my_liked_you_tab' ? '👍' : ''}`,
    body: body || '',
    data: data,
    android: {
      channelId: 'default',
      pressAction: {
        id: pressAction || 'default',
        launchActivity: 'default',
      },
      // Use ic_notification drawable (references monochrome icon for proper notification display)
      smallIcon: 'ic_launcher',
      largeIcon: data?.user?.image ? data?.user?.image : Images.userTwo,
      circularLargeIcon: true,
      vibrate: true,
    },
  });
};

setBackgroundMessageHandler(messaging, onMessageReceived);

const Initial = () => {
  return (
    <AppProvider>
      <App />
    </AppProvider>
  );
};

AppRegistry.registerComponent(appName, () => Initial);
