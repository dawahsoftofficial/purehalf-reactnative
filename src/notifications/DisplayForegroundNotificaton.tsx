import { getApp } from '@react-native-firebase/app';
import { getMessaging, onMessage } from '@react-native-firebase/messaging';
import { useNavigation } from '@react-navigation/native';
import { CommonActions as CommonActionsNav } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ripple from 'react-native-material-ripple';
import { SafeAreaView } from 'react-native-safe-area-context';

import { openAppStore } from '@/lib/utils/rate-app';

import { hp, Typography, wp } from '../global';
import { Colors, Fonts } from '../res';
import {
  ApiServices,
  cleanupSession,
  StorageManager,
  useGlobalContext,
} from '../services';
import { useNotificationStore, usePremiumStore } from '../stores';
import { shouldClearBannerAfterHide } from './bannerHide';
import { parsePushData, shouldSuppressChatBanner } from './pushPayload';
import { routeNotification } from './routeNotification';
import { showNotificationMembership } from './showNotificationMembership';
import { usePushHandlers } from './usePushHandlers';

/** How long a foreground banner stays up before hiding itself. */
const BANNER_AUTO_HIDE_MS = 4000;

/** Slides the banner off-screen, then runs the callback. */
const slideOut = (animation: Animated.Value, callback: () => void) => {
  Animated.timing(animation, {
    toValue: -Dimensions.get('window').height,
    duration: 500,
    easing: Easing.linear,
    useNativeDriver: true,
  }).start(callback);
};

const firebaseApp = getApp();
const messaging = getMessaging(firebaseApp);

const DisplayForegroundNotification = () => {
  const { setData, storageKeys } = StorageManager;
  const { currentUser, updateCurrentUser, language, openedConversationId } =
    useGlobalContext();
  // The listener below is bound once, so read the open chat through a ref.
  const openedConversationIdRef = useRef(openedConversationId);
  useEffect(() => {
    openedConversationIdRef.current = openedConversationId;
  }, [openedConversationId]);
  usePushHandlers();
  const navigation: any = useNavigation();
  // One state object so the banner's message, parsed data and image always
  // change (and clear) together.
  const [banner, setBanner] = useState<{
    message: any;
    data: any;
    image: string;
  } | null>(null);
  const remoteMessage = banner?.message ?? null;
  const remoteMessageData = banner?.data ?? null;
  const bannerImage = banner?.image ?? '';
  const [slideAnimation] = useState(
    new Animated.Value(Dimensions.get('window').height)
  );

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: (_, gestureState) => {
      const { dx, dy } = gestureState;
      if (dy < 0 && Math.abs(dy) > Math.abs(dx)) {
        // Upward swipe
        Animated.timing(slideAnimation, {
          toValue: 0, // Slide up to the top
          duration: 500,
          easing: Easing.linear,
          useNativeDriver: true,
        }).start();
      } else if (Math.abs(dx) > Math.abs(dy)) {
        // Left or right swipe
        dismissBanner();
      }
    },
  });

  const showNotification = () => {
    Animated.timing(slideAnimation, {
      toValue: 0, // Slide up to show
      duration: 500,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  };

  // Slides `hidden` off-screen, then clears it. A message that arrives during
  // the slide-out interrupts it (callback gets finished:false) and must not be
  // swallowed, so only clear while `hidden` is still the message on screen.
  const hideBanner = useCallback(
    (hidden: unknown) => {
      slideOut(slideAnimation, () => {
        // Functional update: judged against the banner on screen NOW.
        setBanner((current) =>
          shouldClearBannerAfterHide(hidden, current?.message) ? null : current
        );
      });
    },
    [slideAnimation]
  );

  const dismissBanner = () => hideBanner(remoteMessage);

  const handleOnMessage = (data: any, remoteMessage: any) => {
    // Resolved once here, not during render. Chat pushes carry the sender in
    // `user`; other pushes nest it one level deeper in `data.data`.
    const nested = data?.data ? parsePushData(data.data) : null;
    const image = data?.user?.image || nested?.user?.image || '';
    setBanner({
      message: remoteMessage,
      data,
      image: typeof image === 'string' ? image : '',
    });
    showNotification();
    if (data?.notification_type && data?.notification_type !== 'new_message') {
      useNotificationStore.getState().increment();
    }
  };

  const onLogoutPress = async () => {
    // Best-effort server-side logout — failure here shouldn't block the local
    // teardown (server may already have invalidated the session if this was
    // triggered by an account_suspended push).
    try {
      await ApiServices.logout();
    } catch (error) {
      console.log('[DisplayForegroundNotification] ApiServices.logout:', error);
    }
    // Full session teardown — same helper used by handleLogout and account
    // deletion. Preserves language and firebase verification id.
    await cleanupSession({ language });
    updateCurrentUser(null);
    navigation.dispatch(
      CommonActionsNav.reset({
        index: 1,
        routes: [{ name: 'AuthWelcome' }],
      })
    );
  };

  // Auto-hide. The timer belongs to the shown message: it restarts for a new
  // one, and is cleared on tap / swipe (the message is nulled) and unmount.
  useEffect(() => {
    if (!remoteMessage) return undefined;
    const timer = setTimeout(
      () => hideBanner(remoteMessage),
      BANNER_AUTO_HIDE_MS
    );
    return () => clearTimeout(timer);
  }, [remoteMessage, hideBanner]);

  useEffect(() => {
    // Subscribe to foreground FCM messages. The listener needs cleaning up
    // on unmount (M4 audit finding) — otherwise the callback closes over
    // stale handlers after user-switch and never stops firing.
    const unsubscribe = onMessage(messaging, async (remoteMessage: any) => {
      const pressAction = remoteMessage?.data?.pressAction;

      // Parse the payload exactly once. Re-parsing the already-parsed
      // object (as the old code did) throws "[object Object]" errors and
      // silently dropped most non-openChat notifications.
      const data: any = parsePushData(remoteMessage?.data?.data);

      if (pressAction === 'openChat') {
        // Already reading this conversation: no banner over the thread.
        if (!shouldSuppressChatBanner(openedConversationIdRef.current, data)) {
          handleOnMessage(data, remoteMessage);
        }
      } else if (data?.notification_type === 'account_suspended') {
        handleOnMessage(data, remoteMessage);
        onLogoutPress();
      } else if (
        data?.notification_type === 'membership_extended' ||
        data?.notification_type === 'payment_received'
      ) {
        handleOnMessage(data, remoteMessage);
        navigation.reset({
          index: 0,
          routes: [
            {
              name: 'MembershipCongrats',
              params: {
                date_of_expiry: data?.date_of_expiry,
                amount: data?.amount,
                localizedPrice: data?.formatted_amount,
                currencyCode: data?.currency_code,
                title: data?.title,
              },
            },
          ],
        });
      } else {
        handleOnMessage(data, remoteMessage);
      }
    });

    return () => {
      try {
        unsubscribe?.();
      } catch (error) {
        console.error(
          '[DisplayForegroundNotification] Failed to unsubscribe FCM listener:',
          error
        );
      }
    };
    // Intentionally not depending on currentUser / navigation — the listener
    // reads navigation and dispatcher functions that are stable across renders,
    // and we don't want to re-bind the FCM listener on every profile update.
  }, []);

  const onNotificationPress = async () => {
    const type = remoteMessageData?.notification_type;
    const data = remoteMessageData;

    dismissBanner();

    await routeNotification(navigation, type, {
      data,
      currentUserId: currentUser?.id,
      isPremium: usePremiumStore.getState().isPremium(),
      deps: {
        onMembershipRequired: () => showNotificationMembership(navigation),
        onLogout: onLogoutPress,
        openAppStore,
        onProfilePictureUpdateRequired: async () => {
          const updatedUser = {
            ...currentUser,
            primary_image_to_show: null,
          };
          updateCurrentUser(updatedUser);
          await setData(storageKeys.USER, updatedUser);
        },
      },
    });
  };

  // return null;
  return remoteMessage ? (
    <SafeAreaView style={Styles.container} {...panResponder.panHandlers}>
      <Ripple onPress={onNotificationPress}>
        <Animated.View
          style={[
            Styles.innerContainer,
            { transform: [{ translateY: slideAnimation }] },
          ]}
        >
          {bannerImage ? (
            <View style={Styles.profilePictureCon}>
              <Image
                source={{ uri: bannerImage }}
                style={Styles.image}
                resizeMode="cover"
              />
              {/* :
            <FontAwesome5
              name='user-alt'
              size={wp(7)}
              color={Colors.color7}
              style={{ marginTop: hp(1) }}
            /> */}
            </View>
          ) : null}
          <View style={Styles.nameMsgCon}>
            <Text numberOfLines={2} style={Styles.name}>
              {remoteMessage?.data?.title ?? remoteMessage?.notification?.title}
            </Text>
            <Text numberOfLines={4} style={Styles.message}>
              {remoteMessage?.data?.body ?? remoteMessage?.notification?.body}
            </Text>
          </View>
        </Animated.View>
      </Ripple>
    </SafeAreaView>
  ) : null;
};

export default DisplayForegroundNotification;

const { width } = Dimensions.get('window');
const Styles = StyleSheet.create({
  container: {
    paddingVertical: hp(2),
    position: 'absolute',
    alignSelf: 'center',
    marginHorizontal: wp(8),
    top: 0,
    zIndex: 10000,
    elevation: 20,
    width: wp(95),
  },
  innerContainer: {
    paddingHorizontal: wp(2.5),
    paddingVertical: hp(1),
    borderRadius: 10,
    flexDirection: 'row',
    backgroundColor: Colors.blackRGBA90,
  },
  image: {
    width: width * 0.1,
    height: width * 1 * 0.1,
    borderRadius: (width * 1 * 0.1) / 2,
  },
  nameMsgCon: {
    width: wp(90),
    paddingHorizontal: wp(1),
  },
  name: {
    fontFamily: Fonts.APPFONT_B,
    fontSize: Typography.small3,
    color: Colors.color2,
    includeFontPadding: false,
  },
  message: {
    color: Colors.color2,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small1,
    includeFontPadding: false,
    paddingTop: 5,
  },
  profilePictureCon: {
    borderWidth: 2,
    borderColor: Colors.color7,
    width: width * 0.1,
    height: width * 1 * 0.1,
    borderRadius: (width * 1 * 0.1) / 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.color18,
    overflow: 'hidden',
  },
});
