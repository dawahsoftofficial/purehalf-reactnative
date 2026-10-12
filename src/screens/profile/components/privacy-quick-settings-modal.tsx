import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ripple from 'react-native-material-ripple';
import { Switch } from 'react-native-switch';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { Button, Text } from '../../../components';
import { hp, Typography, wp } from '../../../global';
import { CheckRtl, LanguageKeys } from '../../../languages';
import { Colors, Fonts } from '../../../res';
import {
  ApiServices,
  flashErrorMessage,
  StorageManager,
  useGlobalContext,
} from '../../../services';
import type { ProfileVisibility } from '../profile-privacy';

type PrivacyQuickSettingsModalProps = {
  visible: boolean;
  onClose: () => void;
};

const PROFILE_VISIBILITY_OPTIONS: Array<{
  value: ProfileVisibility;
  title: string;
  description: string;
}> = [
  {
    value: 'everyone',
    title: LanguageKeys.profileVisibilityEveryone,
    description: LanguageKeys.profileVisibilityEveryoneDesc,
  },
  {
    value: 'liked',
    title: LanguageKeys.profileVisibilityLiked,
    description: LanguageKeys.profileVisibilityLikedDesc,
  },
  {
    value: 'nobody',
    title: LanguageKeys.profileVisibilityNobody,
    description: LanguageKeys.profileVisibilityNobodyDesc,
  },
];

const PrivacyQuickSettingsModal = ({
  visible,
  onClose,
}: PrivacyQuickSettingsModalProps) => {
  const { currentUser, updateCurrentUser } = useGlobalContext();
  const { setData, storageKeys } = StorageManager;
  const Rtl = CheckRtl();

  const [searchVisible, setSearchVisible] = useState(
    currentUser?.search_visibility === 1
  );
  const [profileVisibility, setProfileVisibility] = useState<ProfileVisibility>(
    currentUser?.detail?.profile_visibility ?? 'everyone'
  );
  // Selections are staged locally and only sent to the server when the
  // bottom button is pressed -- tapping an option just updates local state.
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSearchVisible(currentUser?.search_visibility === 1);
    setProfileVisibility(currentUser?.detail?.profile_visibility ?? 'everyone');
  }, [visible, currentUser]);

  const onInvisibleModeChange = (nextInvisible: boolean) => {
    if (saving) return;
    setSearchVisible(!nextInvisible);
  };

  const onProfileVisibilityChange = (next: ProfileVisibility) => {
    if (saving) return;
    setProfileVisibility(next);
  };

  const searchVisibilityChanged =
    searchVisible !== (currentUser?.search_visibility === 1);
  const profileVisibilityChanged =
    profileVisibility !==
    (currentUser?.detail?.profile_visibility ?? 'everyone');
  const hasChanges = searchVisibilityChanged || profileVisibilityChanged;

  const handleSave = useCallback(async () => {
    if (saving) return;
    if (!hasChanges) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      let updatedUser = { ...currentUser };

      if (searchVisibilityChanged) {
        // Send only the flag. Re-sending the profile fields re-parsed the
        // server's YYYY-MM-DD birth date with the wrong format (shifting it)
        // and flagged the profile for re-review.
        await ApiServices.updateUserInfo({
          search_visibility: searchVisible ? 1 : 0,
        });
        updatedUser = {
          ...updatedUser,
          search_visibility: searchVisible ? 1 : 0,
        };
      }

      if (profileVisibilityChanged) {
        const result = await ApiServices.updateProfilePrivacy({
          profile_visibility: profileVisibility,
        });
        const saved = result?.profile_visibility ?? profileVisibility;
        updatedUser = {
          ...updatedUser,
          detail: { ...(updatedUser?.detail ?? {}), profile_visibility: saved },
        };
      }

      updateCurrentUser(updatedUser);
      await setData(storageKeys.USER, updatedUser);
      onClose();
    } catch {
      flashErrorMessage();
    } finally {
      setSaving(false);
    }
  }, [
    saving,
    hasChanges,
    searchVisibilityChanged,
    profileVisibilityChanged,
    searchVisible,
    profileVisibility,
    currentUser,
    updateCurrentUser,
    setData,
    storageKeys.USER,
    onClose,
  ]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={Styles.sheetBackdrop}>
        <Pressable style={Styles.sheetDismissArea} onPress={onClose} />
        <View style={Styles.sheet}>
          <View style={Styles.sheetHandle} />
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            <Text variant="display" style={Styles.sheetTitle}>
              {LanguageKeys.privacySettings}
            </Text>
            <Text style={Styles.sheetLead}>
              {LanguageKeys.privacyQuickSettingsIntro}
            </Text>

            <View
              style={[
                Styles.fieldCon,
                { flexDirection: Rtl ? 'row-reverse' : 'row' },
              ]}
            >
              <View
                style={[
                  Styles.fieldTxtCon,
                  { alignItems: Rtl ? 'flex-end' : 'flex-start' },
                ]}
              >
                <Text style={Styles.fieldTxt}>
                  {LanguageKeys.invisibleMode}
                </Text>
                <Text style={Styles.fieldDesc}>
                  {LanguageKeys.invisibleModeDesc}
                </Text>
              </View>
              <Switch
                testID="quick-privacy-invisible-mode-switch"
                value={!searchVisible}
                onValueChange={onInvisibleModeChange}
                disabled={saving}
                renderActiveText={false}
                renderInActiveText={false}
                circleSize={25}
                backgroundActive={Colors.primary}
                backgroundInactive={Colors.color18}
                innerCircleStyle={Styles.switchInner}
              />
            </View>

            <Text style={[Styles.sectionLabel, Styles.sectionLabelSpaced]}>
              {LanguageKeys.chooseAnOption}
            </Text>
            <View style={Styles.groupCard}>
              {PROFILE_VISIBILITY_OPTIONS.map((option, index) => {
                const selected = profileVisibility === option.value;
                return (
                  <Ripple
                    key={option.value}
                    testID={`quick-privacy-visibility-${option.value}`}
                    accessibilityState={{ selected }}
                    disabled={saving}
                    onPress={() => onProfileVisibilityChange(option.value)}
                    style={[
                      Styles.visibilityOption,
                      index < PROFILE_VISIBILITY_OPTIONS.length - 1 &&
                        Styles.divider,
                      { flexDirection: Rtl ? 'row-reverse' : 'row' },
                    ]}
                  >
                    <View
                      style={[
                        Styles.fieldTxtCon,
                        { alignItems: Rtl ? 'flex-end' : 'flex-start' },
                      ]}
                    >
                      <Text style={Styles.fieldTxt}>{option.title}</Text>
                      <Text style={Styles.fieldDesc}>{option.description}</Text>
                    </View>
                    <Ionicons
                      name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={wp(6)}
                      color={selected ? Colors.primary : Colors.color18}
                    />
                  </Ripple>
                );
              })}
            </View>
            <Button
              onPress={handleSave}
              loading={saving}
              buttonStyle={Styles.understoodBtn}
              text={LanguageKeys.save}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

export default PrivacyQuickSettingsModal;

const Styles = StyleSheet.create({
  sheetBackdrop: {
    flex: 1,
    backgroundColor: Colors.blackRGBA50,
  },
  sheetDismissArea: {
    flex: 1,
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: wp(5),
    paddingTop: hp(1),
    paddingBottom: hp(3),
    maxHeight: hp(85),
  },
  sheetHandle: {
    width: wp(10),
    height: 4,
    borderRadius: 999,
    backgroundColor: Colors.hairline,
    alignSelf: 'center',
    marginBottom: hp(1.5),
  },
  sheetTitle: {
    color: Colors.primary,
    fontSize: Typography.large,
    lineHeight: wp(7.5),
    marginBottom: hp(1),
  },
  sheetLead: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small2,
    lineHeight: wp(5.5),
    marginBottom: hp(1.8),
  },
  fieldCon: {
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.hairline,
    borderRadius: 16,
    paddingVertical: hp(1.8),
    paddingHorizontal: wp(4),
    marginBottom: hp(0.5),
  },
  fieldTxtCon: {
    flex: 1,
    paddingRight: wp(3),
  },
  fieldTxt: {
    fontFamily: Fonts.APPFONT_M,
    fontSize: Typography.small2,
    color: Colors.ink,
  },
  fieldDesc: {
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.tiny2,
    color: Colors.muted,
    marginTop: hp(0.3),
  },
  switchInner: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  sectionLabel: {
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.tiny1,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Colors.muted,
    marginBottom: hp(1),
    marginLeft: wp(1),
  },
  sectionLabelSpaced: {
    marginTop: hp(2),
  },
  groupCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.hairline,
    overflow: 'hidden',
  },
  visibilityOption: {
    alignItems: 'center',
    paddingVertical: hp(1.8),
    paddingHorizontal: wp(4),
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.hairline,
  },
  understoodBtn: {
    marginTop: hp(1.5),
  },
});
