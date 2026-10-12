import {
  FCM_TOKEN_PLACEHOLDER,
  pickFcmToken,
  shouldUploadFcmToken,
} from './fcmToken';

describe('shouldUploadFcmToken', () => {
  it('uploads a real token that differs from the last uploaded one', () => {
    expect(shouldUploadFcmToken('new-token', 'old-token')).toBe(true);
  });

  it('uploads when nothing was uploaded before', () => {
    expect(shouldUploadFcmToken('new-token', null)).toBe(true);
    expect(shouldUploadFcmToken('new-token', undefined)).toBe(true);
    expect(shouldUploadFcmToken('new-token', '')).toBe(true);
  });

  it('skips a token identical to the last uploaded one', () => {
    expect(shouldUploadFcmToken('same', 'same')).toBe(false);
  });

  it('never uploads the placeholder or an unusable token', () => {
    expect(shouldUploadFcmToken(FCM_TOKEN_PLACEHOLDER, 'old')).toBe(false);
    expect(shouldUploadFcmToken(FCM_TOKEN_PLACEHOLDER, null)).toBe(false);
    expect(shouldUploadFcmToken('', null)).toBe(false);
    expect(shouldUploadFcmToken('   ', null)).toBe(false);
    expect(shouldUploadFcmToken(null, 'old')).toBe(false);
    expect(shouldUploadFcmToken(undefined, null)).toBe(false);
  });
});

describe('pickFcmToken', () => {
  it("prefers Firebase's current token over a stale stored copy", () => {
    expect(pickFcmToken('fresh-token', 'stale-token')).toBe('fresh-token');
  });

  it('falls back to the stored token when Firebase has none', () => {
    expect(pickFcmToken(undefined, 'stored-token')).toBe('stored-token');
    expect(pickFcmToken(FCM_TOKEN_PLACEHOLDER, 'stored-token')).toBe(
      'stored-token'
    );
  });

  it('returns the placeholder when neither is usable', () => {
    expect(pickFcmToken(null, FCM_TOKEN_PLACEHOLDER)).toBe(
      FCM_TOKEN_PLACEHOLDER
    );
    expect(pickFcmToken('', undefined)).toBe(FCM_TOKEN_PLACEHOLDER);
  });
});
