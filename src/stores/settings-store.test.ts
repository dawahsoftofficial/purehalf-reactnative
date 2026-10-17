import { useSettingsStore } from './settings-store';

describe('getMaintenanceMode', () => {
  afterEach(() => {
    useSettingsStore.getState().clearSettings();
  });

  it('defaults to disabled when no settings have loaded', () => {
    expect(useSettingsStore.getState().getMaintenanceMode()).toEqual({
      enabled: false,
      message: '',
      start_at: null,
      end_at: null,
    });
  });

  it('reflects an enabled maintenance window from the settings payload', () => {
    useSettingsStore.getState().setSettings({
      message: 'ok',
      error: false,
      code: 200,
      results: [
        {
          title: 'Maintenance Mode',
          key: 'maintenance_mode',
          type: 'json',
          value: {
            enabled: true,
            message: 'Upgrading servers.',
            start_at: '2026-07-13T22:00',
            end_at: '2026-07-14T02:00',
          },
        },
      ],
    });

    expect(useSettingsStore.getState().getMaintenanceMode()).toEqual({
      enabled: true,
      message: 'Upgrading servers.',
      start_at: '2026-07-13T22:00',
      end_at: '2026-07-14T02:00',
    });
  });

  it('falls back to defaults when the setting is missing entirely', () => {
    useSettingsStore.getState().setSettings({
      message: 'ok',
      error: false,
      code: 200,
      results: [],
    });

    expect(useSettingsStore.getState().getMaintenanceMode().enabled).toBe(
      false
    );
  });
});

describe('profile intro media settings', () => {
  afterEach(() => {
    useSettingsStore.getState().clearSettings();
  });

  it('stays disabled until the server explicitly enables each format', () => {
    expect(useSettingsStore.getState().getProfileIntroVideoEnabled()).toBe(
      false
    );
    expect(useSettingsStore.getState().getProfileIntroVoiceEnabled()).toBe(
      false
    );
  });

  it('reads independent video and voice switches', () => {
    useSettingsStore.getState().setSettings({
      message: 'ok',
      error: false,
      code: 200,
      results: [
        {
          title: 'Profile intro video',
          key: 'profile_intro_video_enabled',
          type: 'boolean',
          value: true,
        },
        {
          title: 'Profile intro voice',
          key: 'profile_intro_voice_enabled',
          type: 'boolean',
          value: false,
        },
      ],
    });

    expect(useSettingsStore.getState().getProfileIntroVideoEnabled()).toBe(
      true
    );
    expect(useSettingsStore.getState().getProfileIntroVoiceEnabled()).toBe(
      false
    );
  });
});

describe('getProfilePdfEnabled', () => {
  afterEach(() => {
    useSettingsStore.getState().clearSettings();
  });

  it('defaults to false until the server enables it', () => {
    expect(useSettingsStore.getState().getProfilePdfEnabled()).toBe(false);
  });

  it('reads the profile_pdf_enabled switch from settings', () => {
    useSettingsStore.getState().setSettings({
      message: 'ok',
      error: false,
      code: 200,
      results: [
        {
          title: 'Profile PDF Sharing',
          key: 'profile_pdf_enabled',
          type: 'boolean',
          value: true,
        },
      ],
    });

    expect(useSettingsStore.getState().getProfilePdfEnabled()).toBe(true);
  });
});

describe('getSmsOtpProvider', () => {
  afterEach(() => {
    useSettingsStore.getState().clearSettings();
  });

  const withProvider = (value: string) =>
    useSettingsStore.getState().setSettings({
      message: 'ok',
      error: false,
      code: 200,
      results: [
        {
          title: 'SMS OTP Provider',
          key: 'sms_otp_provider',
          type: 'string',
          value,
        },
      ],
    });

  it('defaults to firebase when the setting is missing', () => {
    expect(useSettingsStore.getState().getSmsOtpProvider()).toBe('firebase');
  });

  it('reads sendpk from settings and records when settings loaded', () => {
    withProvider('sendpk');
    expect(useSettingsStore.getState().getSmsOtpProvider()).toBe('sendpk');
    expect(useSettingsStore.getState().loadedAt).toEqual(expect.any(Number));
  });

  it('treats an unknown value as firebase', () => {
    withProvider('something-else');
    expect(useSettingsStore.getState().getSmsOtpProvider()).toBe('firebase');
  });

  it('clears loadedAt with the settings', () => {
    withProvider('sendpk');
    useSettingsStore.getState().clearSettings();
    expect(useSettingsStore.getState().loadedAt).toBeNull();
  });

  const withSettings = (values: Record<string, string>) =>
    useSettingsStore.getState().setSettings({
      message: 'ok',
      error: false,
      code: 200,
      results: Object.entries(values).map(([key, value]) => ({
        title: key,
        key,
        type: 'string',
        value,
      })),
    });

  it('defaults the international provider to firebase when missing', () => {
    withProvider('sendpk');
    expect(useSettingsStore.getState().getSmsOtpIntlProvider()).toBe(
      'firebase'
    );
    expect(useSettingsStore.getState().getSmsOtpProviders()).toEqual({
      pk: 'sendpk',
      intl: 'firebase',
    });
  });

  it('reads bird for international numbers', () => {
    withSettings({ sms_otp_provider_intl: 'bird' });
    expect(useSettingsStore.getState().getSmsOtpIntlProvider()).toBe('bird');
    expect(useSettingsStore.getState().getSmsOtpProviders()).toEqual({
      pk: 'firebase',
      intl: 'bird',
    });
  });

  it('reads both settings independently', () => {
    withSettings({ sms_otp_provider: 'sendpk', sms_otp_provider_intl: 'bird' });
    expect(useSettingsStore.getState().getSmsOtpProviders()).toEqual({
      pk: 'sendpk',
      intl: 'bird',
    });
  });

  it('treats an unknown international value as firebase', () => {
    withSettings({ sms_otp_provider_intl: 'sendpk' });
    expect(useSettingsStore.getState().getSmsOtpIntlProvider()).toBe(
      'firebase'
    );
  });
});
