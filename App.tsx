/// <reference path="./src/types/env.d.ts" />
import React, { useEffect, type JSX } from 'react';
import FlashMessage from 'react-native-flash-message';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MenuProvider } from 'react-native-popup-menu';

import ErrorBoundary from './src/components/ErrorBoundary';
import { REVENUECAT_ENTITLEMENT_ID } from './src/global/Entitlements';
import { Initialization } from './src/initialization';
import { usePremiumStore } from './src/stores';
import Purchases, { CustomerInfo } from 'react-native-purchases';
import { AppState } from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useChatBadgeSync } from './src/services/chat/useChatBadgeSync';
import { usePusher, useUserCountersChannel } from './src/services/pusher';
import { PUSHER_API_KEY, PUSHER_CLUSTER, PUSHER_AUTH_ENDPOINT } from '@env';
import { requestNotificationPermission } from './src/notifications';
import { useGlobalContext } from './src/services';

const AppContent = (): JSX.Element => {
  const { top } = useSafeAreaInsets();
  const { refresh, revenueCatConfigured } = usePremiumStore();
  const { currentUser, updateCurrentUser } = useGlobalContext();

  // Initialize Pusher
  // Note: AuthEndpoint is required for private channels
  const pusherConfig =
    PUSHER_API_KEY && PUSHER_CLUSTER
      ? {
          apiKey: PUSHER_API_KEY,
          cluster: PUSHER_CLUSTER,
          authEndpoint: PUSHER_AUTH_ENDPOINT || undefined, // Required for private channels
        }
      : null;

  usePusher(pusherConfig);

  // Subscribe to user counters channel globally
  useUserCountersChannel(currentUser, updateCurrentUser);

  // Seed the unread badge from the API (launch, foreground, reconnect)
  useChatBadgeSync(!!currentUser?.id && currentUser.id !== 'guardian');

  // Request notification permissions on app start
  useEffect(() => {
    const requestPermissions = async () => {
      try {
        await requestNotificationPermission();
      } catch (error) {
        console.error('Failed to request notification permissions:', error);
      }
    };

    requestPermissions();
  }, []);

  useEffect(() => {
    // Only set up RevenueCat listeners after it's configured
    if (!revenueCatConfigured) {
      return;
    }

    // Real-time listener
    const listener = (ci: CustomerInfo) => {
      const isPremiumFromRevenueCat =
        ci.entitlements.active[REVENUECAT_ENTITLEMENT_ID]?.isActive === true;
      usePremiumStore.setState({
        premium: isPremiumFromRevenueCat,
        loaded: true,
        customerInfo: ci,
      });
    };

    try {
      Purchases.addCustomerInfoUpdateListener(listener);
    } catch (error) {
      console.warn('Failed to add RevenueCat listener:', error);
    }

    // Initial fetch after configuration
    refresh();

    // App foreground handling
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && revenueCatConfigured) {
        refresh();
      }
    });

    return () => {
      try {
        Purchases.removeCustomerInfoUpdateListener(listener);
      } catch {
        // Listener might not have been added
      }
      sub.remove();
    };
  }, [refresh, revenueCatConfigured]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <MenuProvider>
        <Initialization />
        <FlashMessage position="top" statusBarHeight={top} />
      </MenuProvider>
    </GestureHandlerRootView>
  );
};

const App = (): JSX.Element => {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AppContent />
      </SafeAreaProvider>
    </ErrorBoundary>
  );
};
export default App;
