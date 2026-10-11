import { buildPhoneAuthPayload } from './phone-auth';

describe('buildPhoneAuthPayload', () => {
  it('always carries the Firebase ID token the server requires', () => {
    const payload = buildPhoneAuthPayload({
      phoneNumber: '+920000000000',
      firebaseIdToken: 'id-token',
      fcmToken: 'fcm-abc',
      isIOS: false,
    });
    expect(payload).toEqual({
      phone_number: '+920000000000',
      firebase_id_token: 'id-token',
      fcm_token: 'fcm-abc',
      device_type: 0,
    });
  });

  it('never uploads the FCM placeholder and marks iOS devices', () => {
    const payload = buildPhoneAuthPayload({
      phoneNumber: '+920000000000',
      firebaseIdToken: 'id-token',
      fcmToken: 'FcmToken',
      isIOS: true,
    });
    expect(payload.fcm_token).toBeUndefined();
    expect(payload.device_type).toBe(1);
  });
});
