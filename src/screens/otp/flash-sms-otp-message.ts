import { FlashMessage } from '../../components';
import { flashErrorMessage } from '../../services';
import type { SmsOtpMessage } from './sms-otp-messages';

/** Shows a server-OTP error: the server's own text when given, else `key`. */
export function flashSmsOtpMessage(message: SmsOtpMessage) {
  if (message.text) {
    return FlashMessage({ type: 'danger', message: message.text });
  }
  return flashErrorMessage(message.key, message.options);
}
