/**
 * Branch logic for the server SMS sign-in route, kept out of the screens so
 * it can be tested without React Native. The screens inject the real calls.
 */
import {
  chooseOtpRoute,
  type OtpRoute,
  type SmsOtpProvider,
} from '../../services/api/otp-route';
import {
  shouldFallBackToFirebase,
  toSmsOtpError,
} from '../../services/api/sms-otp-errors';
import { smsOtpErrorMessage, type SmsOtpMessage } from './sms-otp-messages';

const DEFAULT_RESEND_IN = 60;

type SendCode = (phoneNumber: string) => Promise<{ resendIn: number }>;

export type PhoneLoginStart =
  | { route: 'firebase' }
  | { route: 'server'; resendIn: number }
  | { route: 'error'; message: SmsOtpMessage };

/**
 * Phone screen, on Continue: pick the route and, for the server route, send
 * the code. Firebase is used whenever the provider can't be read, the route
 * isn't the server one, or the server says SMS codes are off.
 */
export async function startPhoneLogin(
  phoneNumber: string,
  deps: { resolveProvider: () => Promise<SmsOtpProvider>; send: SendCode }
): Promise<PhoneLoginStart> {
  let provider: SmsOtpProvider = 'firebase';
  try {
    provider = await deps.resolveProvider();
  } catch {
    provider = 'firebase';
  }
  if (chooseOtpRoute(provider, phoneNumber) !== 'server') {
    return { route: 'firebase' };
  }

  try {
    const { resendIn } = await deps.send(phoneNumber);
    return { route: 'server', resendIn };
  } catch (error) {
    const err = toSmsOtpError(error);
    if (shouldFallBackToFirebase(err)) return { route: 'firebase' };
    // A code went out moments ago (e.g. the member came back from the OTP
    // screen) and is still valid: let them enter it.
    if (err.code === 'OTP_RESEND_TOO_SOON') {
      return { route: 'server', resendIn: err.resendIn ?? DEFAULT_RESEND_IN };
    }
    return { route: 'error', message: smsOtpErrorMessage(err) };
  }
}

export type ServerResendOutcome =
  | { kind: 'sent'; resendIn: number }
  | { kind: 'wait'; resendIn: number; message: SmsOtpMessage }
  | { kind: 'firebase' }
  | { kind: 'error'; message: SmsOtpMessage };

/** OTP screen, Resend on the server route. */
export async function resendServerCode(
  phoneNumber: string,
  send: SendCode
): Promise<ServerResendOutcome> {
  try {
    const { resendIn } = await send(phoneNumber);
    return { kind: 'sent', resendIn };
  } catch (error) {
    const err = toSmsOtpError(error);
    // The admin switched back to Firebase while this member was waiting.
    if (shouldFallBackToFirebase(err)) return { kind: 'firebase' };
    if (err.code === 'OTP_RESEND_TOO_SOON' && err.resendIn) {
      return {
        kind: 'wait',
        resendIn: err.resendIn,
        message: smsOtpErrorMessage(err),
      };
    }
    return { kind: 'error', message: smsOtpErrorMessage(err) };
  }
}

/** Route the OTP screen runs on; anything but an explicit 'server' is Firebase. */
export function otpScreenRoute(
  param: unknown,
  from: string | undefined
): OtpRoute {
  // Account deletion re-verifies the signed-in member's number and always
  // stays on Firebase.
  if (from === 'AccountDeletion') return 'firebase';
  return param === 'server' ? 'server' : 'firebase';
}

/** First countdown on the OTP screen: the server's resend_in, else 30 s. */
export function initialResendSeconds(
  route: OtpRoute,
  resendIn: unknown
): number {
  if (route !== 'server') return 30;
  return typeof resendIn === 'number' && Number.isFinite(resendIn)
    ? Math.max(0, Math.floor(resendIn))
    : DEFAULT_RESEND_IN;
}
