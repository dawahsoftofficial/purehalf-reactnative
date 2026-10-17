import i18next from 'i18next';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { Animation } from '../../animations';
import { CountryPicker, SlideShowContainer, Text } from '../../components';
import { Button } from '../../components';
import { hp, Typography, wp } from '../../global';
import { CheckRtl, LanguageKeys } from '../../languages';
import { Colors, Fonts } from '../../res';
import {
  checkEmpty,
  Firebase,
  flashErrorMessage,
  isIOS,
  setRevenueCat,
} from '../../services';
import { StorageManager, useGlobalContext } from '../../services';
import { ApiServices } from '../../services/api';
import {
  isSettingsStale,
  resolveSmsOtpProvider,
  type SmsOtpProvider,
} from '../../services/api/otp-route';
import { sendServerOtp } from '../../services/api/sms-otp';
import { type SettingsResponse, useSettingsStore } from '../../stores';
import { flashSmsOtpMessage } from '../otp/flash-sms-otp-message';
import { startPhoneLogin } from '../otp/server-otp-flow';
import Data from '../profile/Data';
import PhoneHeader from './components/phone-header';
import PhoneLogoSection from './components/phone-logo-section';
import PhoneNumberInput from './components/phone-number-input';

type Country = {
  code: string;
  dial_code: string;
  flag: string;
  name: string;
};

type User = {
  id?: string;
  first_name?: string;
  latitude?: number;
  longitude?: number;
  primary_image_to_show?: string;
  membership_status?: number | null;
  results?: {
    first_name?: string;
    primary_image_to_show?: string;
    membership_status?: number | null;
  };
};

type PhoneNumberProps = {
  navigation: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    goBack: () => void;
    reset: (config: {
      index: number;
      routes: Array<{ name: string; params?: Record<string, unknown> }>;
    }) => void;
  };
};

function PhoneNumber({ navigation }: PhoneNumberProps) {
  const { top, bottom } = useSafeAreaInsets();
  const Rtl = CheckRtl();
  const { getData, setData, storageKeys } = StorageManager;
  const { updateCurrentUser, updateDirection } = useGlobalContext();
  const [loading, setLoading] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState(__DEV__ ? '3048700192' : '');
  const [selectedCountry, setSelectedCountry] = useState<Country>({
    code: 'PK',
    dial_code: '+92',
    flag: '🇵🇰',
    name: 'Pakistan',
  });
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);

  const onPressFlagBtn = useCallback(() => {
    setCountryPickerVisible(true);
  }, []);

  const closeCountryPicker = useCallback(() => {
    setCountryPickerVisible(false);
  }, []);

  const onSelectCountry = useCallback((item: Country) => {
    setSelectedCountry(item);
    setCountryPickerVisible(false);
  }, []);

  const onChangePhoneNumber = useCallback((text: string) => {
    setPhoneNumber(text);
  }, []);

  const onLanguagePress = useCallback(() => {
    navigation.navigate('Languages');
  }, [navigation]);

  const navigateTo = useCallback(
    (route: string) => {
      navigation.reset({
        index: 0,
        routes: [{ name: route }],
      });
    },
    [navigation]
  );

  const navigateAfterLogin = useCallback(
    (user: User) => {
      if (!user?.results?.first_name) {
        navigateTo('Location');
        return;
      }

      const hasPrimaryImage =
        user?.results?.primary_image_to_show &&
        user.results.primary_image_to_show.length > 0;

      if (!hasPrimaryImage) {
        navigateTo('ProfilePicture');
        return;
      }

      if (
        user?.results?.membership_status === null ||
        user?.results?.membership_status === 0
      ) {
        navigation.reset({
          index: 0,
          routes: [
            {
              name: 'ProFeaturesPromotion',
              params: {
                navigateTo: 'BottomTab',
                from: 'SignUp',
              },
            },
          ],
        });
        return;
      }

      navigateTo('BottomTab');
    },
    [navigateTo, navigation]
  );

  const onLoggedIn = useCallback(
    async (currentUser: User) => {
      try {
        if (currentUser?.id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setRevenueCat(currentUser.id as any);
        }
        const userData = await ApiServices.getCurrentUserDetail();
        const user: User = {
          ...userData,
          id: userData.id?.toString(),
        };
        const mergedUser = {
          ...(currentUser as Record<string, unknown>),
          ...(user as Record<string, unknown>),
        };
        updateCurrentUser(mergedUser);
        navigateAfterLogin(currentUser);
      } catch (error) {
        console.error('Error in onLoggedIn:', error);
      }
    },
    [navigateAfterLogin, updateCurrentUser]
  );

  const hideLoading = useCallback(() => setLoading(false), []);

  const validatePhoneNumber = useCallback(() => {
    if (
      selectedCountry.dial_code === '+92' &&
      (phoneNumber.length < 10 || phoneNumber.length > 12)
    ) {
      return false;
    }
    if (selectedCountry.dial_code !== '+92' && phoneNumber.length < 6) {
      return false;
    }
    return true;
  }, [selectedCountry.dial_code, phoneNumber.length]);

  // Re-fetches /settings into the store and returns the SMS code provider.
  const refreshSmsOtpProvider = useCallback(async () => {
    const response = (await ApiServices.getAppSettings()) as SettingsResponse;
    useSettingsStore.getState().setSettings(response);
    return useSettingsStore.getState().getSmsOtpProvider();
  }, []);

  // Which service sends the code: the cached /settings value while fresh,
  // else a quick refresh; Firebase whenever nothing can be read.
  const resolveProvider = useCallback((): Promise<SmsOtpProvider> => {
    const state = useSettingsStore.getState();
    return resolveSmsOtpProvider({
      cached: state.loaded ? state.getSmsOtpProvider() : null,
      fresh: state.loaded && !isSettingsStale(state.loadedAt, Date.now()),
      refresh: refreshSmsOtpProvider,
    });
  }, [refreshSmsOtpProvider]);

  // Warm the settings while the member types, so Continue rarely waits.
  useEffect(() => {
    const { loaded, loadedAt } = useSettingsStore.getState();
    if (loaded && !isSettingsStale(loadedAt, Date.now())) return;
    refreshSmsOtpProvider().catch((error) => {
      console.log('Error refreshing app settings:', error);
    });
  }, [refreshSmsOtpProvider]);

  const startFirebaseLogin = useCallback(
    (phoneNumberWithCode: string) => {
      ApiServices.authenticateUser(
        phoneNumberWithCode,
        (currentUser: User) => onLoggedIn(currentUser),
        false
      )
        .then((res: unknown) => {
          const response = res as { verificationRes?: unknown };
          if (response?.verificationRes) {
            setLoading(false);
            navigation.navigate('Otp', {
              phoneNumber: phoneNumberWithCode,
              phoneNumberFirebaseRes: response.verificationRes,
            });
          }
        })
        .catch((error) => {
          console.error('Error in authentication:', error);
          hideLoading();
        });
    },
    [onLoggedIn, hideLoading, navigation]
  );

  const onContinuePress = useCallback(async () => {
    if (!validatePhoneNumber()) {
      return flashErrorMessage(LanguageKeys.invalidPhoneNumber);
    }

    setLoading(true);
    const phoneNumberWithCode =
      selectedCountry.dial_code +
      (phoneNumber[0] === '0' ? phoneNumber.slice(1) : phoneNumber);

    const start = await startPhoneLogin(phoneNumberWithCode, {
      resolveProvider,
      send: sendServerOtp,
    });

    if (start.route === 'firebase') {
      startFirebaseLogin(phoneNumberWithCode);
      return;
    }

    hideLoading();
    if (start.route === 'server') {
      navigation.navigate('Otp', {
        phoneNumber: phoneNumberWithCode,
        otpRoute: 'server',
        resendIn: start.resendIn,
      });
    } else {
      flashSmsOtpMessage(start.message);
    }
  }, [
    validatePhoneNumber,
    selectedCountry.dial_code,
    phoneNumber,
    resolveProvider,
    startFirebaseLogin,
    hideLoading,
    navigation,
  ]);

  const saveDataLocal = useCallback(async () => {
    try {
      await setData(storageKeys.PROFILE_DETAIL_LOCAL, Data);
    } catch (error) {
      console.error('Error saving profile data locally:', error);
    }
  }, [setData, storageKeys.PROFILE_DETAIL_LOCAL]);

  const getToken = useCallback(async () => {
    try {
      const res = await getData(storageKeys.FCM_TOKEN);
      if (!res) {
        const isEmulator = await DeviceInfo.isEmulator();
        if (isEmulator && isIOS) {
          await setData(storageKeys.FCM_TOKEN, 'FcmToken');
        } else {
          const token = await Firebase.getFcmToken();
          await setData(storageKeys.FCM_TOKEN, token || 'FcmToken');
        }
      }
    } catch (error) {
      console.error('Error getting FCM token:', error);
    }
  }, [getData, setData, storageKeys.FCM_TOKEN]);

  useEffect(() => {
    saveDataLocal();
    getToken();
    if (Rtl) {
      i18next.changeLanguage('en').then(() => {
        updateDirection('ltr', 'en');
      });
    }
  }, [Rtl, saveDataLocal, getToken, updateDirection]);

  const handleGoBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const scrollViewContentStyle = useMemo(
    () => ({
      flexGrow: 1,
      justifyContent: 'center' as const,
      paddingBottom: bottom,
    }),
    [bottom]
  );

  const isButtonDisabled = useMemo(
    () => checkEmpty(phoneNumber) || loading,
    [phoneNumber, loading]
  );

  return (
    <SlideShowContainer disabled>
      <View style={Styles.container}>
        <PhoneHeader top={top + hp(1.5)} onGoBack={handleGoBack} />

        <KeyboardAwareScrollView
          enableOnAndroid
          enableAutomaticScroll
          keyboardShouldPersistTaps="handled"
          extraScrollHeight={isIOS ? 20 : 10}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={scrollViewContentStyle}
        >
          <PhoneLogoSection />
          <Animation style={[Styles.phoneNumberSectionCon, { bottom }]}>
            <Text style={Styles.getStarted}>getStarted</Text>
            <PhoneNumberInput
              phoneNumber={phoneNumber}
              selectedCountry={selectedCountry}
              onPhoneNumberChange={onChangePhoneNumber}
              onCountryPress={onPressFlagBtn}
            />
            <Button
              text={LanguageKeys.continue}
              onPress={onContinuePress}
              loading={loading}
              loadingMessage="Submitting..."
              disabled={isButtonDisabled}
              icon={
                <MaterialCommunityIcons
                  name="logout-variant"
                  size={wp(5)}
                  color={Colors.color2}
                />
              }
            />
          </Animation>
        </KeyboardAwareScrollView>

        <CountryPicker
          visible={countryPickerVisible}
          onClose={closeCountryPicker}
          onPress={onSelectCountry}
        />
      </View>
    </SlideShowContainer>
  );
}

export default PhoneNumber;

const Styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: Colors.color2,
  },
  phoneNumberSectionCon: {
    zIndex: 1,
    width: wp(100),
    position: 'absolute',
    paddingBottom: hp(1.5),
    paddingHorizontal: wp(4),
  },
  getStarted: {
    color: Colors.color1,
    fontFamily: Fonts.APPFONT_SB,
    includeFontPadding: false,
    fontSize: Typography.medium2,
  },
});
