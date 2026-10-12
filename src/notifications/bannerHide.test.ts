import { shouldClearBannerAfterHide } from './bannerHide';

describe('shouldClearBannerAfterHide', () => {
  const first = { id: 'first' };
  const second = { id: 'second' };

  it('clears when the message being hidden is still the current one', () => {
    expect(shouldClearBannerAfterHide(first, first)).toBe(true);
  });

  it('does not clear when a newer message replaced it during the slide-out', () => {
    expect(shouldClearBannerAfterHide(first, second)).toBe(false);
  });

  it('does not clear when something else already cleared the banner', () => {
    expect(shouldClearBannerAfterHide(first, null)).toBe(false);
  });

  it('never matches on two empty values', () => {
    expect(shouldClearBannerAfterHide(null, null)).toBe(false);
    expect(shouldClearBannerAfterHide(undefined, null)).toBe(false);
  });
});
