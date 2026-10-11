import { getApp } from '@react-native-firebase/app';
import {
  getAuth,
  signInWithPhoneNumber,
  signOut,
} from '@react-native-firebase/auth';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import {
  AuthorizationStatus,
  getMessaging,
  getToken,
  isDeviceRegisteredForRemoteMessages,
  onTokenRefresh,
  registerDeviceForRemoteMessages,
  requestPermission,
} from '@react-native-firebase/messaging';
import {
  GoogleSignin,
  type SignInResponse,
} from '@react-native-google-signin/google-signin';

import { isUsableFcmToken } from '../../notifications/fcmToken';
import { flashErrorMessage } from '../FlashMessages';
import { StorageManager } from '../storageManager';
const { storageKeys, setData } = StorageManager;

const firebaseApp = getApp();
const auth = getAuth(firebaseApp);
const functions = getFunctions(firebaseApp);
const messaging = getMessaging(firebaseApp);

class GFirebase {
  googleSignIn = () => {
    return new Promise<SignInResponse>((resolve, reject) => {
      GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      GoogleSignin.signIn()
        .then((res: SignInResponse) => {
          resolve(res);
        })
        .catch((error: Error) => {
          console.log({ error });
          flashErrorMessage(error?.message || 'An error occurred');
          reject(error);
        });
    });
  };

  sendVerificationCode = (phoneNumber: any, forceResend = false) => {
    return new Promise((resolve, reject) => {
      signInWithPhoneNumber(auth, phoneNumber, undefined, forceResend)
        .then((confirmResult: any) => {
          resolve(confirmResult);
        })
        .catch((error: any) => {
          console.log('Error while sending verification code =>', error);
          if (error?.code === 'missing-phone-number') {
            flashErrorMessage('Missing Phone Number');
          } else if (error?.code === 'auth/invalid-phone-number') {
            flashErrorMessage('Invalid Phone Number');
          } else if (error?.code === 'auth/quota-exceeded') {
            flashErrorMessage('SMS quota exceeded.Please try again later');
          } else if (error?.code === 'auth/user-disabled') {
            flashErrorMessage('Phone Number disabled. Please contact support');
          } else {
            console.log('Unexpected Error.' + error?.code);
            flashErrorMessage(
              'Unexpected Error Occured. Please contact support'
            );
          }
          reject('');
        });
    });
  };

  handleIsLoggedIn = async (isLoggedIn: any) => {
    return new Promise((resolve, reject) => {
      setData(storageKeys.IS_LOGGED_IN, isLoggedIn)
        .then(() => {
          resolve('');
        })
        .catch((error: any) => {
          console.log('error while saving isLoggedIn =>', error);
          reject('');
        });
    });
  };

  matchLoginVerificationCode = (phoneNumberFirebaseRes: any, value: any) => {
    return new Promise(async (resolve, reject) => {
      const user: any = auth.currentUser;
      if (user && user.uid) {
        this.handleIsLoggedIn(true)
          .then(() => {
            resolve('');
          })
          .catch(() => reject(''));
      } else {
        phoneNumberFirebaseRes
          .confirm(value)
          .then(async () => {
            this.handleIsLoggedIn(true)
              .then(() => {
                resolve('');
              })
              .catch(() => reject(''));
          })
          .catch((error: any) => {
            switch (error.code) {
              case 'auth/invalid-verification-code':
                flashErrorMessage('Invalid code');
                break;
              default:
                flashErrorMessage(error.message);
            }
            reject('');
            console.log(
              'Error while matching firebase verification code =>',
              error
            );
          });
      }
    });
  };

  getFcmToken = async () => {
    try {
      const authStatus = await requestPermission(messaging);
      const enabled =
        authStatus === AuthorizationStatus.AUTHORIZED ||
        authStatus === AuthorizationStatus.PROVISIONAL;

      if (!enabled) {
        return 'FcmToken';
      }

      const isRegistered = isDeviceRegisteredForRemoteMessages(messaging);

      if (!isRegistered) {
        await registerDeviceForRemoteMessages(messaging);
      }

      const token = await getToken(messaging);
      return token || 'FcmToken';
    } catch (error) {
      console.log('Error while getting FCM token =>', error);
      return 'FcmToken';
    }
  };

  /**
   * Subscribes to FCM token rotation. The callback only ever receives a real
   * token. Returns the unsubscribe function.
   */
  onFcmTokenRefresh = (callback: (token: string) => void) => {
    return onTokenRefresh(messaging, (token) => {
      if (isUsableFcmToken(token)) callback(token);
    });
  };

  sendMessageNotification = async (token: any, data: any) => {
    const sendNotification = httpsCallable(functions, 'sendNotification');
    try {
      await sendNotification({
        token: token,
        data: {
          title: data?.title,
          body: data?.body,
          pressAction: data?.pressAction,
          data: JSON.stringify(data?.data),
        },
      });
    } catch (error) {
      console.log('error while sending notificaiton =>', error);
    }
  };

  matchOTP = (phoneNumberFirebaseRes: any, code: any) => {
    return new Promise((resolve, reject) => {
      phoneNumberFirebaseRes
        .confirm(code)
        .then(async () => {
          resolve('');
        })
        .catch((error: any) => {
          switch (error.code) {
            case 'auth/invalid-verification-code':
              flashErrorMessage('Invalid code');
              break;
            default:
              flashErrorMessage(error.message);
          }
          reject('');
          console.log(
            'Error while matching firebase verification code =>',
            error
          );
        });
    });
  };

  debugSignOut = () => {
    return signOut(auth);
  };
}

const FirebaseServices = new GFirebase();
export default FirebaseServices;
