/**
 * Server-sent SMS sign-in codes (SendPK), the alternative to Firebase phone
 * auth for +92 numbers. See otp-route.ts for when this route is used.
 *
 *   POST /otp/send   { phone_number }                 -> { expires_in, resend_in, length }
 *   POST /otp/verify { phone_number, otp, fcm_token?, device_type? }
 *                    -> the same payload as POST /authenticate
 *
 * Failures carry `error_code` in the usual `{message, error, code, results}`
 * envelope; both calls throw an SmsOtpError (sms-otp-errors.ts).
 */
import { fcmTokenForUpload } from '../../notifications/fcmToken';
import EndPoints from './EndPoints';
import { Api } from './Middleware';
import { nonNegativeInt, resultsField, toSmsOtpError } from './sms-otp-errors';

const DEFAULT_RESEND_IN = 60;
const DEFAULT_EXPIRES_IN = 300;
const DEFAULT_CODE_LENGTH = 6;

export type ServerOtpSendResult = {
  expiresIn: number;
  resendIn: number;
  length: number;
};

export async function sendServerOtp(
  phoneNumber: string
): Promise<ServerOtpSendResult> {
  try {
    const res = await Api.post(EndPoints.otpSend, {
      phone_number: phoneNumber,
    });
    const results = res?.data?.results;
    return {
      expiresIn:
        nonNegativeInt(resultsField(results, 'expires_in')) ??
        DEFAULT_EXPIRES_IN,
      resendIn:
        nonNegativeInt(resultsField(results, 'resend_in')) ?? DEFAULT_RESEND_IN,
      length:
        nonNegativeInt(resultsField(results, 'length')) ?? DEFAULT_CODE_LENGTH,
    };
  } catch (error) {
    throw toSmsOtpError(error);
  }
}

export type ServerOtpVerifyPayload = {
  phone_number: string;
  otp: string;
  fcm_token?: string;
  device_type: 0 | 1;
};

/** Same FCM handling as buildPhoneAuthPayload: never upload the placeholder. */
export function buildServerOtpVerifyPayload(input: {
  phoneNumber: string;
  otp: string;
  fcmToken: unknown;
  isIOS: boolean;
}): ServerOtpVerifyPayload {
  return {
    phone_number: input.phoneNumber,
    otp: input.otp,
    fcm_token: fcmTokenForUpload(input.fcmToken),
    device_type: input.isIOS ? 1 : 0,
  };
}

/**
 * Checks the code. On success resolves with the raw axios response, whose
 * body matches POST /authenticate (results = user, top-level bearer_token).
 */
export async function verifyServerOtp(input: {
  phoneNumber: string;
  otp: string;
  fcmToken: unknown;
  isIOS: boolean;
}) {
  try {
    return await Api.post(
      EndPoints.otpVerify,
      buildServerOtpVerifyPayload(input)
    );
  } catch (error) {
    throw toSmsOtpError(error);
  }
}
