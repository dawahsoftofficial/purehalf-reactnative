import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Ripple from 'react-native-material-ripple';
import { Switch } from 'react-native-switch';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { Container, Header, ModalLoader, Text } from '../../components';
import { hp, Typography, wp } from '../../global';
import { CheckRtl, LanguageKeys } from '../../languages';
import { Colors, Fonts } from '../../res';
import {
  ApiServices,
  flashSuccessMessage,
  useGlobalContext,
} from '../../services';
import { StorageManager } from '../../services';
import ProfileData from '../profile/Data';
import {
  type FieldVisibilityLevel,
  normalizeProfilePrivacyKey,
  type ProfileFieldVisibility,
  type ProfilePrivacyResponse,
  type ProfileVisibility,
} from '../profile/profile-privacy';

type ProfileFieldDefinition = {
  apiKey?: string;
  title?: string;
  viewTitle?: string;
};
type PrivacyField = {
  apiKey: string;
  title: string;
};

const PROFILE_PRIVACY_GROUPS = [
  {
    title: LanguageKeys.basicSettings,
    fields: [
      { apiKey: 'tagline', title: LanguageKeys.tagline },
      {
        apiKey: 'interest_id',
        title: LanguageKeys.myInterestAndHobbies,
      },
    ],
  },
  {
    title: LanguageKeys.appearanceHealth,
    fields: ProfileData.appearanceAndHealth,
  },
  {
    title: LanguageKeys.familyBackground,
    fields: ProfileData.familyBackground,
  },
  { title: LanguageKeys.lifeStyle, fields: ProfileData.lifeStyle },
  {
    title: LanguageKeys.personalityRequirements,
    fields: ProfileData.personalityRequirements,
  },
  { title: LanguageKeys.islamicValues, fields: ProfileData.islamicValues },
  { title: LanguageKeys.futurePlans, fields: ProfileData.futurePlan },
].map((group) => ({
  ...group,
  fields: group.fields
    .filter((field: ProfileFieldDefinition) => Boolean(field.apiKey))
    .map((field: ProfileFieldDefinition) => {
      const apiKey = field.apiKey as string;

      return {
        apiKey: normalizeProfilePrivacyKey(apiKey),
        title: field.viewTitle ?? field.title ?? '',
      };
    }),
}));

const PrivacySettings = (props: any) => {
  const { setData, storageKeys } = StorageManager;
  const [loader, setLoader] = useState({
    visible: false,
    message: 'Loading...',
  });
  const { currentUser, updateCurrentUser } = useGlobalContext();

  const Rtl = CheckRtl();
  const [searchVisibility, setSearchVisibility] = useState(
    currentUser?.search_visibility === 1 ? true : false
  );
  const [inAppNotification, setInAppNotification] = useState(
    currentUser?.in_app_notifications === 1 ? true : false
  );
  const [emailNotification, setEmailNotification] = useState(
    currentUser?.email_notification === 1 ? true : false
  );
  const [smsNotification, setSMSNotification] = useState(
    currentUser?.sms_notification === 1 ? true : false
  );
  const [profileVisibility, setProfileVisibility] = useState<ProfileVisibility>(
    currentUser?.detail?.profile_visibility ?? 'everyone'
  );
  const [profileFieldVisibility, setProfileFieldVisibility] =
    useState<ProfileFieldVisibility>(
      currentUser?.detail?.profile_field_visibility ?? {}
    );

  const profileVisibilityOptions: Array<{
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
      value: 'active_chat',
      title: LanguageKeys.profileVisibilityActiveChat,
      description: LanguageKeys.profileVisibilityActiveChatDesc,
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

  const hideFromSearchToggle = (hidden: boolean) => {
    const nextSearchVisibility = !hidden;
    setSearchVisibility(nextSearchVisibility);
    const params = {
      search_visibility: nextSearchVisibility ? 1 : 0,
      in_app_notifications: inAppNotification ? 1 : 0,
    };
    updateToggle(params);
  };

  const inAppNotificationToggle = () => {
    setInAppNotification(!inAppNotification);
    const params = {
      in_app_notifications: !inAppNotification ? 1 : 0,
      search_visibility: searchVisibility ? 1 : 0,
    };
    updateToggle(params);
  };

  const emailNotificationToggle = () => {
    setEmailNotification(!emailNotification);
    const params = {
      in_app_notifications: inAppNotification ? 1 : 0,
      search_visibility: searchVisibility ? 1 : 0,
      email_notification: !emailNotification ? 1 : 0,
      sms_notification: smsNotification ? 1 : 0,
    };
    updateToggle(params);
  };

  const smsNotificationToggle = () => {
    setSMSNotification(!smsNotification);
    const params = {
      in_app_notifications: inAppNotification ? 1 : 0,
      search_visibility: searchVisibility ? 1 : 0,
      email_notification: emailNotification ? 1 : 0,
      sms_notification: !smsNotification ? 1 : 0,
    };
    updateToggle(params);
  };

  const hideLoader = () =>
    setLoader({
      visible: false,
      message: '',
    });

  const updateToggle = (params: Record<string, number>) => {
    setLoader({
      visible: true,
      message: 'Updating...',
    });
    // Send only the changed flag. Re-sending the profile fields re-parsed the
    // server's YYYY-MM-DD birth date with the wrong format (shifting it) and
    // flagged the profile for re-review.
    ApiServices.updateUserInfo(params)
      .then(async () => {
        const updatedUser = { ...currentUser, ...params };
        updateCurrentUser(updatedUser);
        await setData(storageKeys.USER, updatedUser);
        flashSuccessMessage(LanguageKeys.updated);
        hideLoader();
      })
      .catch(hideLoader);
  };

  const toggleProfileField = (field: string) => {
    const previous = profileFieldVisibility[field] ?? 'public';
    const next: FieldVisibilityLevel =
      previous === 'private' ? 'public' : 'private';
    const optimistic = { ...profileFieldVisibility, [field]: next };

    setProfileFieldVisibility(optimistic);
    setLoader({ visible: true, message: 'Updating...' });

    ApiServices.updateProfilePrivacy({ visibility: { [field]: next } })
      .then(async (result: ProfilePrivacyResponse) => {
        const savedVisibility = result?.profile_field_visibility ?? optimistic;
        const updatedUser = {
          ...currentUser,
          detail: {
            ...(currentUser?.detail ?? {}),
            profile_field_visibility: savedVisibility,
          },
        };

        setProfileFieldVisibility(savedVisibility);
        updateCurrentUser(updatedUser);
        await setData(storageKeys.USER, updatedUser);
        flashSuccessMessage(LanguageKeys.updated);
      })
      .catch(() => {
        setProfileFieldVisibility({
          ...profileFieldVisibility,
          [field]: previous,
        });
      })
      .finally(hideLoader);
  };

  const updateProfileVisibility = (next: ProfileVisibility) => {
    if (next === profileVisibility) return;

    const previous = profileVisibility;
    setProfileVisibility(next);
    setLoader({ visible: true, message: 'Updating...' });

    ApiServices.updateProfilePrivacy({ profile_visibility: next })
      .then(async (result: ProfilePrivacyResponse) => {
        const savedVisibility = result?.profile_visibility ?? next;
        const updatedUser = {
          ...currentUser,
          detail: {
            ...(currentUser?.detail ?? {}),
            profile_visibility: savedVisibility,
          },
        };

        setProfileVisibility(savedVisibility);
        updateCurrentUser(updatedUser);
        await setData(storageKeys.USER, updatedUser);
        flashSuccessMessage(LanguageKeys.updated);
      })
      .catch(() => setProfileVisibility(previous))
      .finally(hideLoader);
  };

  const RenderField = ({
    heading,
    description,
    switchEnabled,
    onChangeSwitch,
    showDivider = false,
  }: any) => (
    <View
      style={[
        Styles.fieldCon,
        showDivider && Styles.divider,
        { flexDirection: Rtl ? 'row-reverse' : 'row' },
      ]}
    >
      <View
        style={[
          Styles.fieldTxtCon,
          { alignItems: Rtl ? 'flex-end' : 'flex-start' },
        ]}
      >
        <Text style={Styles.fieldTxt}>{heading}</Text>
        {description ? (
          <Text style={Styles.fieldDesc}>{description}</Text>
        ) : null}
      </View>
      <Switch
        value={switchEnabled}
        onValueChange={onChangeSwitch}
        renderActiveText={false}
        renderInActiveText={false}
        circleSize={25}
        backgroundActive={Colors.primary}
        backgroundInactive={Colors.color18}
        innerCircleStyle={Styles.switchInner}
      />
    </View>
  );
  return (
    <Container style={Styles.screen}>
      <Header
        title={LanguageKeys.privacySettings}
        navigation={props.navigation}
        titleVariant="display"
      />
      <ModalLoader visible={loader.visible} message={loader.message} />

      <ScrollView
        contentContainerStyle={Styles.innerCon}
        showsVerticalScrollIndicator={false}
      >
        <Text style={Styles.sectionLabel}>{LanguageKeys.discoverySection}</Text>
        <View style={Styles.groupCard}>
          <RenderField
            heading={LanguageKeys.searchVisibility}
            description={LanguageKeys.searchVisibilityDesc}
            switchEnabled={!searchVisibility}
            onChangeSwitch={hideFromSearchToggle}
          />
        </View>

        <Text style={[Styles.sectionLabel, Styles.sectionLabelSpaced]}>
          {LanguageKeys.overallProfileVisibility}
        </Text>
        <Text style={Styles.privacyIntro}>
          {LanguageKeys.overallProfileVisibilityDesc}
        </Text>
        <View style={Styles.groupCard}>
          {profileVisibilityOptions.map((option, index) => {
            const selected = profileVisibility === option.value;

            return (
              <Ripple
                key={option.value}
                onPress={() => updateProfileVisibility(option.value)}
                style={[
                  Styles.visibilityOption,
                  index < profileVisibilityOptions.length - 1 && Styles.divider,
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

        <Text style={[Styles.sectionLabel, Styles.sectionLabelSpaced]}>
          {LanguageKeys.profileInformationSection}
        </Text>
        <Text style={Styles.privacyIntro}>
          {LanguageKeys.profileInformationPrivacyDesc}
        </Text>
        {PROFILE_PRIVACY_GROUPS.map((group, groupIndex) => (
          <View
            key={group.title}
            style={groupIndex === 0 ? undefined : Styles.profileGroupSpacing}
          >
            <Text style={Styles.profileGroupTitle}>{group.title}</Text>
            <View style={Styles.groupCard}>
              {group.fields.map((field: PrivacyField, index: number) => {
                const isVisible =
                  profileFieldVisibility[field.apiKey] !== 'private';

                return (
                  <RenderField
                    key={field.apiKey}
                    heading={field.title}
                    description={
                      isVisible
                        ? LanguageKeys.profileFieldVisible
                        : LanguageKeys.profileFieldPrivate
                    }
                    switchEnabled={isVisible}
                    onChangeSwitch={() => toggleProfileField(field.apiKey)}
                    showDivider={index < group.fields.length - 1}
                  />
                );
              })}
            </View>
          </View>
        ))}

        <Text style={[Styles.sectionLabel, Styles.sectionLabelSpaced]}>
          {LanguageKeys.notificationsSection}
        </Text>
        <View style={Styles.groupCard}>
          <RenderField
            heading={LanguageKeys.inAppNotifications}
            description={LanguageKeys.inAppNotificationsDesc}
            switchEnabled={inAppNotification}
            onChangeSwitch={inAppNotificationToggle}
            showDivider
          />
          <RenderField
            heading={LanguageKeys.emailNotifications}
            description={LanguageKeys.emailNotificationsDesc}
            switchEnabled={emailNotification}
            onChangeSwitch={emailNotificationToggle}
            showDivider
          />
          <RenderField
            heading={LanguageKeys.smsNotifications}
            description={LanguageKeys.smsNotificationsDesc}
            switchEnabled={smsNotification}
            onChangeSwitch={smsNotificationToggle}
          />
        </View>
      </ScrollView>
    </Container>
  );
};

export default PrivacySettings;

const Styles = StyleSheet.create({
  screen: {
    backgroundColor: Colors.appBg,
  },
  innerCon: {
    paddingTop: hp(2),
    paddingHorizontal: wp(4),
    paddingBottom: hp(3),
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
    marginTop: hp(3),
  },
  privacyIntro: {
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.tiny2,
    color: Colors.muted,
    lineHeight: 20,
    marginBottom: hp(2),
    marginHorizontal: wp(1),
  },
  profileGroupTitle: {
    fontFamily: Fonts.APPFONT_M,
    fontSize: Typography.tiny1,
    color: Colors.ink,
    marginBottom: hp(0.8),
    marginLeft: wp(1),
  },
  profileGroupSpacing: {
    marginTop: hp(2),
  },
  groupCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.hairline,
    overflow: 'hidden',
  },
  fieldCon: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: hp(1.8),
    paddingHorizontal: wp(4),
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.hairline,
  },
  visibilityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: hp(1.8),
    paddingHorizontal: wp(4),
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
});
