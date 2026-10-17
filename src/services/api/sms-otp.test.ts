import EndPoints from './EndPoints';
import { Api } from './Middleware';
import {
  buildServerOtpVerifyPayload,
  sendServerOtp,
  verifyServerOtp,
} from './sms-otp';

jest.mock('./Middleware', () => ({
  Api: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));

const axiosError = (status: number | undefined, data?: unknown) => ({
  isAxiosError: true,
  message: 'Request failed',
  response: status === undefined ? undefined : { status, data },
});

const envelope = (
  errorCode: string | undefined,
  results: unknown = 'Server says no',
  message = 'Error'
) => ({
  message,
  error: true,
  code: 0,
  results,
  ...(errorCode ? { error_code: errorCode } : {}),
});

describe('sendServerOtp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('posts the E.164 number and returns the timings', async () => {
    (Api.post as jest.Mock).mockResolvedValue({
      data: {
        error: false,
        results: { expires_in: 300, resend_in: 45, length: 6 },
      },
    });

    await expect(sendServerOtp('+923001234567')).resolves.toEqual({
      expiresIn: 300,
      resendIn: 45,
      length: 6,
    });
    expect(Api.post).toHaveBeenCalledWith(EndPoints.otpSend, {
      phone_number: '+923001234567',
    });
  });

  it('defaults the timings when the server omits them', async () => {
    (Api.post as jest.Mock).mockResolvedValue({ data: { results: null } });
    await expect(sendServerOtp('+923001234567')).resolves.toEqual({
      expiresIn: 300,
      resendIn: 60,
      length: 6,
    });
  });

  it('throws a coded SmsOtpError', async () => {
    (Api.post as jest.Mock).mockRejectedValue(
      axiosError(409, envelope('PROVIDER_DISABLED'))
    );
    await expect(sendServerOtp('+923001234567')).rejects.toMatchObject({
      name: 'SmsOtpError',
      code: 'PROVIDER_DISABLED',
    });
  });
});

describe('verifyServerOtp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('posts the code with the FCM token and device type', async () => {
    const response = {
      status: 201,
      data: { results: { id: 7 }, bearer_token: 'tok' },
    };
    (Api.post as jest.Mock).mockResolvedValue(response);

    await expect(
      verifyServerOtp({
        phoneNumber: '+923001234567',
        otp: '123456',
        fcmToken: 'fcm-abc',
        isIOS: true,
      })
    ).resolves.toBe(response);
    expect(Api.post).toHaveBeenCalledWith(EndPoints.otpVerify, {
      phone_number: '+923001234567',
      otp: '123456',
      fcm_token: 'fcm-abc',
      device_type: 1,
    });
  });

  it('throws OTP_INVALID with attempts left', async () => {
    (Api.post as jest.Mock).mockRejectedValue(
      axiosError(422, envelope('OTP_INVALID', { attempts_left: 2 }))
    );
    await expect(
      verifyServerOtp({
        phoneNumber: '+923001234567',
        otp: '000000',
        fcmToken: undefined,
        isIOS: false,
      })
    ).rejects.toMatchObject({ code: 'OTP_INVALID', attemptsLeft: 2 });
  });
});

describe('buildServerOtpVerifyPayload', () => {
  it('never uploads the FCM placeholder and marks Android as 0', () => {
    expect(
      buildServerOtpVerifyPayload({
        phoneNumber: '+923001234567',
        otp: '123456',
        fcmToken: 'FcmToken',
        isIOS: false,
      })
    ).toEqual({
      phone_number: '+923001234567',
      otp: '123456',
      fcm_token: undefined,
      device_type: 0,
    });
  });
});
