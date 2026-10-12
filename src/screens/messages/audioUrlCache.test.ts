import {
  AUDIO_URL_EXPIRY_MARGIN_MS,
  isAudioUrlFresh,
  toCachedAudioUrl,
} from './audioUrlCache';

const NOW = Date.parse('2026-10-11T10:00:00+05:00');

describe('audio URL cache freshness', () => {
  it('parses the expiry', () => {
    expect(
      toCachedAudioUrl('https://x/a.m4a', '2026-10-11T10:10:00+05:00')
    ).toEqual({
      url: 'https://x/a.m4a',
      expiresAtMs: Date.parse('2026-10-11T10:10:00+05:00'),
    });
  });

  it('has no expiry when the server sent none or garbage', () => {
    expect(toCachedAudioUrl('u', undefined).expiresAtMs).toBeNull();
    expect(toCachedAudioUrl('u', 'soon').expiresAtMs).toBeNull();
  });

  it('is fresh while comfortably before expiry', () => {
    const entry = toCachedAudioUrl('u', '2026-10-11T10:10:00+05:00');
    expect(isAudioUrlFresh(entry, NOW)).toBe(true);
  });

  it('is stale inside the safety margin and after expiry', () => {
    const expiry = NOW + AUDIO_URL_EXPIRY_MARGIN_MS - 1;
    expect(isAudioUrlFresh({ url: 'u', expiresAtMs: expiry }, NOW)).toBe(false);
    expect(isAudioUrlFresh({ url: 'u', expiresAtMs: NOW - 1000 }, NOW)).toBe(
      false
    );
  });

  it('is not fresh when there is no entry', () => {
    expect(isAudioUrlFresh(undefined, NOW)).toBe(false);
  });

  it('keeps an entry with an unknown expiry', () => {
    expect(isAudioUrlFresh({ url: 'u', expiresAtMs: null }, NOW)).toBe(true);
  });
});
