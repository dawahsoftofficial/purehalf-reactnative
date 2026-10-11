import { useFocusEffect } from '@react-navigation/native';
import React, { memo, useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Modal, StyleSheet, View } from 'react-native';
import Ripple from 'react-native-material-ripple';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { Text } from '../../../components';
import { hp, Typography, wp } from '../../../global';
import { CheckRtl, LanguageKeys } from '../../../languages';
import {
  getNotificationPermissionStatus,
  type NotificationPermissionStatus,
  openNotificationSettings,
  requestNotificationPermission,
} from '../../../notifications';
import { Colors, Fonts } from '../../../res';
import { ApiServices } from '../../../services';

function NotificationPermissionBanner() {
  const Rtl = CheckRtl();
  const { t } = useTranslation();
  const [permissionStatus, setPermissionStatus] = useState<
    NotificationPermissionStatus | 'checking'
  >('checking');
  const [isRequesting, setIsRequesting] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);

  // Last status seen, to spot the moment permission flips to granted.
  const lastStatusRef = useRef<NotificationPermissionStatus | null>(null);

  // Permission just became granted (prompt accepted, or enabled from device
  // settings): the token may never have been uploaded, so fetch and upload it.
  const noteStatus = useCallback((status: NotificationPermissionStatus) => {
    const previous = lastStatusRef.current;
    lastStatusRef.current = status;
    if (status === 'granted' && previous !== null && previous !== 'granted') {
      void ApiServices.syncFcmToken();
    }
  }, []);

  const refreshPermissionStatus = useCallback(async () => {
    const status = await getNotificationPermissionStatus();
    setPermissionStatus(status);
    noteStatus(status);

    if (status === 'granted') {
      setSettingsModalVisible(false);
    }
  }, [noteStatus]);

  useFocusEffect(
    useCallback(() => {
      refreshPermissionStatus();

      // Opening device settings does not blur the navigation screen. Recheck
      // when the app becomes active so the banner disappears immediately.
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          refreshPermissionStatus();
        }
      });

      return () => subscription.remove();
    }, [refreshPermissionStatus])
  );

  const handleBannerPress = useCallback(() => {
    setSettingsModalVisible(true);
  }, []);

  const handlePrimaryAction = useCallback(async () => {
    if (isRequesting) return;

    if (permissionStatus === 'blocked') {
      try {
        await openNotificationSettings();
        setSettingsModalVisible(false);
      } catch (error) {
        console.error('Failed to open notification settings:', error);
      }
      return;
    }

    setIsRequesting(true);
    try {
      const requestedStatus = await requestNotificationPermission();
      setPermissionStatus(requestedStatus);
      noteStatus(requestedStatus);

      if (requestedStatus === 'granted') {
        setSettingsModalVisible(false);
        await refreshPermissionStatus();
      }
    } finally {
      setIsRequesting(false);
    }
  }, [isRequesting, noteStatus, permissionStatus, refreshPermissionStatus]);

  if (
    permissionStatus === 'checking' ||
    permissionStatus === 'granted' ||
    permissionStatus === 'error'
  ) {
    return null;
  }

  return (
    <>
      <Ripple
        style={[Styles.banner, { flexDirection: Rtl ? 'row-reverse' : 'row' }]}
        onPress={handleBannerPress}
        disabled={isRequesting}
        rippleColor={Colors.primaryMid}
        accessibilityRole="button"
        accessibilityLabel={t(LanguageKeys.turnOnNotifications)}
      >
        <View style={Styles.bannerIcon}>
          <Ionicons
            name="notifications-outline"
            size={wp(5.5)}
            color={Colors.primary}
          />
        </View>
        <View style={Styles.bannerCopy}>
          <Text style={Styles.bannerTitle}>
            {LanguageKeys.notificationPermissionOffTitle}
          </Text>
          <Text style={Styles.bannerDescription} numberOfLines={2}>
            {LanguageKeys.notificationsBannerDescription}
          </Text>
        </View>
        <Ionicons
          name={Rtl ? 'chevron-back' : 'chevron-forward'}
          size={wp(4.5)}
          color={Colors.primaryMid}
        />
      </Ripple>

      <Modal
        visible={settingsModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setSettingsModalVisible(false)}
      >
        <View style={Styles.modalOverlay}>
          <View style={Styles.modalCard}>
            <View style={Styles.modalIcon}>
              <Ionicons
                name="notifications-off-outline"
                size={wp(8)}
                color={Colors.primary}
              />
            </View>
            <Text variant="display" style={Styles.modalTitle}>
              {LanguageKeys.notificationPermissionOffTitle}
            </Text>
            <Text style={Styles.modalDescription}>
              {LanguageKeys.notificationPermissionOffDescription}
            </Text>

            <Ripple
              style={Styles.settingsButton}
              onPress={handlePrimaryAction}
              disabled={isRequesting}
              rippleColor={Colors.color2}
              accessibilityRole="button"
            >
              <Ionicons
                name={
                  permissionStatus === 'blocked'
                    ? 'settings-outline'
                    : 'notifications-outline'
                }
                size={wp(4.5)}
                color={Colors.color2}
              />
              <Text style={Styles.settingsButtonText}>
                {permissionStatus === 'blocked'
                  ? LanguageKeys.openSettings
                  : LanguageKeys.turnOnNotifications}
              </Text>
            </Ripple>

            <Ripple
              style={Styles.notNowButton}
              onPress={() => setSettingsModalVisible(false)}
              accessibilityRole="button"
            >
              <Text style={Styles.notNowText}>{LanguageKeys.notNow}</Text>
            </Ripple>
          </View>
        </View>
      </Modal>
    </>
  );
}

export default memo(NotificationPermissionBanner);

const Styles = StyleSheet.create({
  banner: {
    alignItems: 'center',
    backgroundColor: Colors.lavender,
    borderBottomColor: Colors.primaryLite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: wp(4),
    paddingVertical: hp(1.25),
  },
  bannerIcon: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: wp(5),
    height: wp(10),
    justifyContent: 'center',
    width: wp(10),
  },
  bannerCopy: {
    flex: 1,
    marginHorizontal: wp(3),
  },
  bannerTitle: {
    color: Colors.ink,
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small2,
    includeFontPadding: false,
  },
  bannerDescription: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.tiny2,
    includeFontPadding: false,
    lineHeight: wp(4.2),
    marginTop: hp(0.2),
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: Colors.blackRGBA70,
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: wp(6),
  },
  modalCard: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: wp(5),
    paddingBottom: hp(2),
    paddingHorizontal: wp(6),
    paddingTop: hp(3),
    width: '100%',
  },
  modalIcon: {
    alignItems: 'center',
    backgroundColor: Colors.primaryRGBA12,
    borderRadius: wp(8),
    height: wp(16),
    justifyContent: 'center',
    marginBottom: hp(2),
    width: wp(16),
  },
  modalTitle: {
    alignSelf: 'center',
    color: Colors.ink,
    fontSize: Typography.medium,
    includeFontPadding: false,
    marginBottom: hp(1),
    textAlign: 'center',
  },
  modalDescription: {
    alignSelf: 'center',
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small2,
    includeFontPadding: false,
    lineHeight: hp(2.6),
    marginBottom: hp(2.5),
    textAlign: 'center',
  },
  settingsButton: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 999,
    flexDirection: 'row',
    gap: wp(2),
    justifyContent: 'center',
    paddingHorizontal: wp(7),
    paddingVertical: hp(1.4),
    width: '100%',
  },
  settingsButtonText: {
    alignSelf: 'center',
    color: Colors.color2,
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small2,
    includeFontPadding: false,
  },
  notNowButton: {
    marginTop: hp(1),
    paddingHorizontal: wp(6),
    paddingVertical: hp(1),
  },
  notNowText: {
    alignSelf: 'center',
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_M,
    fontSize: Typography.small2,
    includeFontPadding: false,
  },
});
