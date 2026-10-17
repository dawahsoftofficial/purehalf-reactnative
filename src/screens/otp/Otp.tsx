import { getApp } from '@react-native-firebase/app';
import {
  type FirebaseAuthTypes,
  getAuth,
  onAuthStateChanged,
} from '@react-native-firebase/auth';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Animation } from '../../animations';
import { SlideShowContainer } from '../../components';
import { Button } from '../../components/buttons';
import { hp, wp } from '../../global';
import { LanguageKeys } from '../../languages';
import { postSignupMembershipRoute } from '../../navigation/resolve-post-signup-route';
import { Colors } from '../../res';
import {
  ApiServices,
  Firebase,
  flashErrorMessage,
  flashSuccessMessage,
  isIOS,
  setRevenueCat,
  StorageManager,
  useGlobalContext,
} from '../../services';
import { sendServerOtp } from '../../services/api/sms-otp';
import FirebaseServices from '../../services/firebase/Firebase';
import { useSettingsStore } from '../../stores';
import { flushPrimerAnswers } from '../signupPrimer/commit-primer';
import OtpHeader from './components/otp-header';
import OtpInput from './components/otp-input';
import ResendTimer from './components/resend-timer';
import { flashSmsOtpMessage } from './flash-sms-otp-message';
import {
  initialResendSeconds,
  otpScreenRoute,
  resendServerCode,
} from './server-otp-flow';
import { serverVerifyFailure } from './sms-otp-messages';

const firebaseApp = getApp();
const auth = getAuth(firebaseApp);

type User = {
  id?: string | number;
  first_name?: string;
  latitude?: number;
  longitude?: number;
  membership_status?: number | null;
  membership_expiry?: string | null;
  primary_image_to_show?: string;
  results?: {
    id?: string | number;
    first_name?: string;
    primary_image_to_show?: string;
    membership_status?: number | null;
  };
};

type PurposeOfLeaving = {
  id: string | number;
};

type OtpProps = {
  route?: {
    params?: {
      phoneNumber?: string;
      phoneNumberFirebaseRes?: unknown;
      /** 'server' when the code was sent by our server (SendPK or Bird). */
      otpRoute?: 'server' | 'firebase';
      /** Seconds until the server allows a resend. */
      resendIn?: number;
    };
  };
  navigation: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    reset: (config: {
      index: number;
      routes: Array<{ name: string; params?: Record<string, unknown> }>;
    }) => void;
  };
  showLogo?: boolean;
  from?: string;
  purposeOfLeaving?: PurposeOfLeaving;
  type?: 'email' | 'phone';
};

const Otp = (props: OtpProps) => {
  const { from = '', purposeOfLeaving } = props;
  const { storageKeys, setData } = StorageManager;
  const { currentUser, updateCurrentUser } = useGlobalContext();

  const textColor = Colors.color1;
  const phoneNumber = props?.route?.params?.phoneNumber || '';
  const [phoneNumberFirebaseRes, setPhoneNumberFirebaseRes] = useState(
    props?.route?.params?.phoneNumberFirebaseRes
  );
  // Server SMS route vs Firebase phone auth. Can switch to Firebase if the
  // admin turns server codes off while the member is on this screen.
  const [otpRoute, setOtpRoute] = useState(() =>
    otpScreenRoute(props?.route?.params?.otpRoute, from)
  );
  const isServerRoute = otpRoute === 'server';
  const verifyingRef = useRef(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [continueLoader, setContinueLoader] = useState(false);
  const [continueLoaderMessage, setContinueLoaderMessage] =
    useState('Verifying...');

  const CELL_COUNT = 6;
  const [value, setValue] = useState('');
  const [seconds, setSeconds] = useState(() =>
    initialResendSeconds(otpRoute, props?.route?.params?.resendIn)
  );
  const [timerActive, setTimerActive] = useState(true);

  const skipPaywall = useSettingsStore().getSkipSignupMembershipPaywall();

  const navigateTo = useCallback(
    (route: string) => {
      props.navigation.reset({
        index: 0,
        routes: [{ name: route }],
      });
    },
    [props.navigation]
  );

  const navigateAfterLogin = useCallback(
    (user: User) => {
      const userData = user?.results || user;

      if (!userData?.first_name) {
        navigateTo('Location');
        return;
      }

      const hasPrimaryImage =
        userData?.primary_image_to_show &&
        userData.primary_image_to_show.length > 0;

      if (!hasPrimaryImage) {
        navigateTo('ProfilePicture');
        return;
      }

      if (
        userData?.membership_status === null ||
        userData?.membership_status === 0
      ) {
        const route = postSignupMembershipRoute({
          membershipStatus: userData?.membership_status,
          skipPaywall,
        });
        props.navigation.reset({ index: 0, routes: [route] });
        return;
      }

      navigateTo('BottomTab');
    },
    [navigateTo, props.navigation, skipPaywall]
  );

  const onLoggedIn = useCallback(
    async (userObj: { results?: User }) => {
      try {
        void flushPrimerAnswers();
        if (userObj?.results?.id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setRevenueCat(userObj.results.id as any);
        }
        if (!currentUser && userObj?.results) {
          updateCurrentUser(userObj.results);
        }
        navigateAfterLogin(userObj.results || ({} as User));
      } catch (error) {
        console.error('Error in onLoggedIn:', error);
      }
    },
    [currentUser, navigateAfterLogin, updateCurrentUser]
  );

  /**
   * Shared post-login handling for both routes. The server route passes the
   * /otp/verify payload (same shape as /authenticate); the Firebase route
   * passes nothing and logs in with the Firebase ID token here.
   */
  const onOTPVerified = useCallback(
    async (loginResponse?: { results?: User }) => {
      if (!currentUser) {
        if (loginResponse) {
          onLoggedIn(loginResponse);
          return;
        }
        ApiServices.loginUser(phoneNumber, (userObj: { results?: User }) =>
          onLoggedIn(userObj)
        );
      } else {
        try {
          if (currentUser?.id) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setRevenueCat(currentUser.id as any);
          }
          const membershipRes = (await ApiServices.getMembershipStatus()) as {
            membership_expiry?: string | null;
            membership_status?: number;
          } | null;

          const updatedUser: User = {
            ...currentUser,
            membership_expiry:
              membershipRes?.membership_expiry ||
              currentUser.membership_expiry ||
              null,
            membership_status:
              membershipRes || currentUser.membership_status ? 1 : 0,
          };

          updateCurrentUser(updatedUser);
          await setData(storageKeys.USER, updatedUser);
          setContinueLoader(false);
          navigateAfterLogin(updatedUser);
        } catch (error) {
          console.error('Error in onOTPVerified:', error);
          setContinueLoader(false);
        }
      }
    },
    [
      currentUser,
      phoneNumber,
      onLoggedIn,
      navigateAfterLogin,
      setData,
      storageKeys.USER,
      updateCurrentUser,
    ]
  );

  const markLoggedIn = useCallback(() => {
    FirebaseServices.handleIsLoggedIn(true);
    flashSuccessMessage(LanguageKeys.loggedInSuccessfully);
  }, []);

  const onAuthStateChangedFirebase = useCallback(
    (user: FirebaseAuthTypes.User | null) => {
      if (user && from !== 'AccountDeletion' && phoneNumber) {
        markLoggedIn();
        ApiServices.authenticateUser(phoneNumber, () => onOTPVerified(), true);
      }
    },
    [from, phoneNumber, onOTPVerified, markLoggedIn]
  );

  useEffect(() => {
    // The server route never signs in to Firebase; a leftover Firebase user
    // must not trigger a Firebase-token login here.
    if (isServerRoute) return;
    const subscriber = onAuthStateChanged(auth, onAuthStateChangedFirebase);
    return () => subscriber();
  }, [isServerRoute, onAuthStateChangedFirebase]);

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      () => {
        setIsKeyboardOpen(true);
      }
    );

    const keyboardDidHideListener = Keyboard.addListener(
      'keyboardDidHide',
      () => {
        setIsKeyboardOpen(false);
      }
    );

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (timerActive && seconds > 0) {
      interval = setInterval(() => {
        setSeconds((prevSeconds) => {
          if (prevSeconds <= 1) {
            setTimerActive(false);
            return 0;
          }
          return prevSeconds - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [timerActive, seconds]);

  const hideContinueLoader = useCallback(() => {
    setContinueLoader(false);
  }, []);

  const otpType = props?.type;
  const handleAccountDeletion = useCallback(
    async (code: string) => {
      if (!purposeOfLeaving) {
        flashErrorMessage(LanguageKeys.selectPurposeOfLeaving);
        return;
      }

      setContinueLoaderMessage('Verifying...');
      setContinueLoader(true);

      try {
        if (otpType === 'email') {
          await ApiServices.verifyOTP({ otp: code });
        } else {
          await Firebase.matchOTP(phoneNumberFirebaseRes, code);
        }

        setContinueLoaderMessage('Deleting Account...');
        await ApiServices.deleteAccount(purposeOfLeaving.id);
        setContinueLoader(false);
        setContinueLoaderMessage('');
        props.navigation.navigate('AccountDeleted');
      } catch (error) {
        console.error('Error in account deletion:', error);
        setContinueLoader(false);
        setContinueLoaderMessage('');
      }
    },
    [purposeOfLeaving, otpType, phoneNumberFirebaseRes, props.navigation]
  );

  const restartResendTimer = useCallback((nextSeconds: number) => {
    setSeconds(nextSeconds);
    setTimerActive(nextSeconds > 0);
  }, []);

  const verifyServerCode = useCallback(
    async (code: string) => {
      if (verifyingRef.current) return;
      verifyingRef.current = true;
      setContinueLoaderMessage('Verifying...');
      setContinueLoader(true);
      try {
        const loginResponse = await ApiServices.loginWithServerOtp(
          phoneNumber,
          code
        );
        if (!loginResponse) {
          // Banned: loginWithServerOtp already told the member.
          hideContinueLoader();
          return;
        }
        markLoggedIn();
        await onOTPVerified(loginResponse);
      } catch (error) {
        console.log('Error verifying server code:', error);
        const failure = serverVerifyFailure(error);
        flashSmsOtpMessage(failure);
        if (failure.clearCode) setValue('');
        if (failure.allowResendNow) restartResendTimer(0);
        hideContinueLoader();
      } finally {
        verifyingRef.current = false;
      }
    },
    [
      phoneNumber,
      markLoggedIn,
      onOTPVerified,
      hideContinueLoader,
      restartResendTimer,
    ]
  );

  const onContinuePress = useCallback(async () => {
    const code = value;
    if (from === 'AccountDeletion') {
      await handleAccountDeletion(code);
    } else if (isServerRoute) {
      await verifyServerCode(code);
    } else {
      setContinueLoaderMessage('Verifying...');
      setContinueLoader(true);
      try {
        await Firebase.matchLoginVerificationCode(phoneNumberFirebaseRes, code);
      } catch (error) {
        console.error('Error verifying code:', error);
        hideContinueLoader();
      }
    }
  }, [
    value,
    from,
    handleAccountDeletion,
    isServerRoute,
    verifyServerCode,
    phoneNumberFirebaseRes,
    hideContinueLoader,
  ]);

  const onResendServerPress = useCallback(async () => {
    const outcome = await resendServerCode(phoneNumber, sendServerOtp);
    switch (outcome.kind) {
      case 'sent':
        setValue('');
        restartResendTimer(outcome.resendIn);
        flashSuccessMessage(LanguageKeys.codeResent);
        return;
      case 'wait':
        restartResendTimer(outcome.resendIn);
        flashSmsOtpMessage(outcome.message);
        return;
      case 'error':
        flashSmsOtpMessage(outcome.message);
        return;
      case 'firebase': {
        // Server codes were switched off meanwhile: continue on Firebase.
        const res = await Firebase.sendVerificationCode(phoneNumber);
        setPhoneNumberFirebaseRes(res);
        setOtpRoute('firebase');
        setValue('');
        restartResendTimer(30);
        flashSuccessMessage(LanguageKeys.codeResent);
        return;
      }
    }
  }, [phoneNumber, restartResendTimer]);

  const onResendPress = useCallback(async () => {
    try {
      if (isServerRoute) {
        await onResendServerPress();
        return;
      }
      if (otpType === 'email') {
        await ApiServices.sendOTPForAccountDelete({});
      } else {
        const res = await Firebase.sendVerificationCode(phoneNumber, true);
        setPhoneNumberFirebaseRes(res);
      }
      setSeconds(30);
      setTimerActive(true);
      flashSuccessMessage(LanguageKeys.codeResent);
    } catch (error) {
      console.error('Error resending code:', error);
    }
  }, [isServerRoute, onResendServerPress, otpType, phoneNumber]);

  useEffect(() => {
    if (value.length === CELL_COUNT) {
      // Use setTimeout to avoid calling setState synchronously in effect
      setTimeout(() => {
        onContinuePress();
      }, 0);
    }
  }, [value, CELL_COUNT, onContinuePress]);

  const { bottom } = useSafeAreaInsets();

  const scrollViewContentStyle = useMemo(
    () => ({
      flexGrow: 1,
      justifyContent: 'center' as const,
      paddingBottom: bottom,
    }),
    [bottom]
  );
  const containerStyle = useMemo(
    () => [
      Styles.container,
      { height: from === 'AccountDeletion' ? undefined : hp(100) },
    ],
    [from]
  );

  return (
    <SlideShowContainer disabled>
      <KeyboardAwareScrollView
        enableOnAndroid
        enableAutomaticScroll
        keyboardShouldPersistTaps="handled"
        extraScrollHeight={isIOS ? 100 : 80}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={scrollViewContentStyle}
      >
        <View style={containerStyle}>
          <Animation>
            <OtpHeader
              phoneNumber={phoneNumber}
              type={props?.type}
              textColor={textColor}
            />
            <OtpInput
              value={value}
              cellCount={CELL_COUNT}
              textColor={textColor}
              onValueChange={setValue}
            />
            <ResendTimer
              seconds={seconds}
              textColor={textColor}
              onResendPress={onResendPress}
            />
            <View style={Styles.continueBtnCon}>
              <Button
                loading={continueLoader}
                loadingMessage={continueLoaderMessage}
                text={LanguageKeys.continue}
                onPress={onContinuePress}
                disabled={value.length < CELL_COUNT}
              />
            </View>
          </Animation>
        </View>
      </KeyboardAwareScrollView>
    </SlideShowContainer>
  );
};

export default Otp;

const Styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.color2,
    justifyContent: 'flex-end',
    paddingHorizontal: wp(4),
    paddingBottom: hp(1.5),
  },
  continueBtnCon: {
    marginBottom: hp(3),
  },
});
