import { fcmTokenForUpload } from '../../notifications/fcmToken';

export type PhoneAuthPayload = {
  phone_number: string;
  firebase_id_token: string;
  fcm_token?: string;
  device_type: 0 | 1;
};

/**
 * Body for POST /authenticate after a Firebase phone sign-in. The server
 * requires the Firebase ID token as proof the number was verified and
 * rejects the call (401) without it.
 */
export function buildPhoneAuthPayload(input: {
  phoneNumber: string;
  firebaseIdToken: string;
  fcmToken: unknown;
  isIOS: boolean;
}): PhoneAuthPayload {
  return {
    phone_number: input.phoneNumber,
    firebase_id_token: input.firebaseIdToken,
    fcm_token: fcmTokenForUpload(input.fcmToken),
    device_type: input.isIOS ? 1 : 0,
  };
}
