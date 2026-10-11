import { fcmTokenForUpload, isUsableFcmToken } from './fcmToken';
import {
  flushPendingPush,
  openChatFromPush,
  registerPushNavigator,
  resetPendingPush,
} from './pendingPush';
import {
  buildChatRouteParams,
  getChatParamsFromNotifeeData,
  getChatPushParams,
  parsePushData,
  shouldDisplayBackgroundNotification,
  shouldSuppressChatBanner,
} from './pushPayload';

const chatJson = JSON.stringify({
  notification_type: 'new_message',
  conversationId: '42',
  message: 'Hello',
  user: { id: '9', name: 'Omar', image: '', type: 'User' },
});

describe('parsePushData', () => {
  it('parses a JSON string', () => {
    expect(parsePushData('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses a double-stringified JSON string', () => {
    expect(parsePushData(JSON.stringify('{"a":1}'))).toEqual({ a: 1 });
  });

  it('passes an object through', () => {
    expect(parsePushData({ a: 1 })).toEqual({ a: 1 });
  });

  it('returns null for malformed, empty, array and non-object input', () => {
    expect(parsePushData('{not json')).toBeNull();
    expect(parsePushData('')).toBeNull();
    expect(parsePushData('[1,2]')).toBeNull();
    expect(parsePushData('"text"')).toBeNull();
    expect(parsePushData(undefined)).toBeNull();
    expect(parsePushData(null)).toBeNull();
    expect(parsePushData(7)).toBeNull();
  });
});

describe('buildChatRouteParams', () => {
  it('converts string ids to numbers', () => {
    expect(buildChatRouteParams(parsePushData(chatJson))).toEqual({
      from: 'notification',
      conversationId: 42,
      message: 'Hello',
      otherUserData: { id: 9, name: 'Omar', image: '', type: 'User' },
    });
  });

  it('returns null without a usable conversation id', () => {
    expect(buildChatRouteParams({})).toBeNull();
    expect(buildChatRouteParams({ conversationId: 'abc' })).toBeNull();
    expect(buildChatRouteParams({ conversationId: '0' })).toBeNull();
    expect(buildChatRouteParams(null)).toBeNull();
  });

  it('omits the partner when the user id is unusable', () => {
    expect(
      buildChatRouteParams({ conversationId: '3', user: { id: 'x' } })
    ).toEqual({ from: 'notification', conversationId: 3 });
  });
});

describe('getChatPushParams', () => {
  it('reads an FCM remote message', () => {
    expect(
      getChatPushParams({ data: { pressAction: 'openChat', data: chatJson } })
    ).toMatchObject({ conversationId: 42 });
  });

  it('ignores non-chat pushes and garbage payloads', () => {
    expect(
      getChatPushParams({
        data: {
          pressAction: 'my_liked_you_tab',
          data: JSON.stringify({ notification_type: 'profile_liked' }),
        },
      })
    ).toBeNull();
    expect(
      getChatPushParams({ data: { pressAction: 'openChat', data: '{oops' } })
    ).toBeNull();
    expect(getChatPushParams(null)).toBeNull();
  });
});

describe('getChatParamsFromNotifeeData', () => {
  it('reads parsed notifee data', () => {
    expect(
      getChatParamsFromNotifeeData({
        pressAction: 'openChat',
        conversationId: '8',
      })
    ).toEqual({ from: 'notification', conversationId: 8 });
    expect(getChatParamsFromNotifeeData(undefined)).toBeNull();
  });
});

describe('shouldSuppressChatBanner', () => {
  it('suppresses when the same conversation is open (string vs number)', () => {
    expect(shouldSuppressChatBanner(42, { conversationId: '42' })).toBe(true);
    expect(shouldSuppressChatBanner('42', { conversationId: 42 })).toBe(true);
  });

  it('shows the banner for another conversation or when none is open', () => {
    expect(shouldSuppressChatBanner(7, { conversationId: '42' })).toBe(false);
    expect(shouldSuppressChatBanner(null, { conversationId: '42' })).toBe(
      false
    );
    expect(shouldSuppressChatBanner('', { conversationId: '42' })).toBe(false);
    expect(shouldSuppressChatBanner(42, {})).toBe(false);
  });
});

describe('shouldDisplayBackgroundNotification', () => {
  it('skips messages the system tray already shows', () => {
    expect(
      shouldDisplayBackgroundNotification({
        notification: { title: 't' },
        data: {},
      })
    ).toBe(false);
  });

  it('displays data-only messages', () => {
    expect(shouldDisplayBackgroundNotification({ data: { title: 't' } })).toBe(
      true
    );
  });
});

describe('fcmToken helpers', () => {
  it('never treats the placeholder or empties as uploadable', () => {
    expect(isUsableFcmToken('FcmToken')).toBe(false);
    expect(isUsableFcmToken('')).toBe(false);
    expect(isUsableFcmToken('  ')).toBe(false);
    expect(isUsableFcmToken(null)).toBe(false);
    expect(isUsableFcmToken('abc:123')).toBe(true);
    expect(fcmTokenForUpload('FcmToken')).toBeUndefined();
    expect(fcmTokenForUpload('abc:123')).toBe('abc:123');
  });
});

describe('pendingPush', () => {
  const params = { from: 'notification' as const, conversationId: 42 };
  const makeNav = (ready: boolean, routes: string[]) => ({
    isReady: jest.fn(() => ready),
    navigate: jest.fn(),
    getRootState: jest.fn(() => ({ routes: routes.map((name) => ({ name })) })),
  });

  afterEach(() => resetPendingPush());

  it('navigates immediately when the app is ready and the member is inside', () => {
    const nav = makeNav(true, ['BottomTab']);
    registerPushNavigator(nav);
    expect(openChatFromPush(params)).toBe(true);
    expect(nav.navigate).toHaveBeenCalledWith('SingleChat', params);
  });

  it('queues until navigation is ready (cold start), then flushes once', () => {
    let ready = false;
    const nav = {
      isReady: () => ready,
      navigate: jest.fn(),
      getRootState: () => ({ routes: [{ name: 'BottomTab' }] }),
    };
    registerPushNavigator(nav);
    expect(openChatFromPush(params)).toBe(false);
    expect(nav.navigate).not.toHaveBeenCalled();

    ready = true;
    expect(flushPendingPush()).toBe(true);
    expect(flushPendingPush()).toBe(false);
    expect(nav.navigate).toHaveBeenCalledTimes(1);
  });

  it('queues before a navigator is registered', () => {
    expect(openChatFromPush(params)).toBe(false);
    const nav = makeNav(true, ['BottomTab']);
    registerPushNavigator(nav);
    expect(flushPendingPush()).toBe(true);
  });

  it('ignores the same chat delivered twice in quick succession', () => {
    const nav = makeNav(true, ['BottomTab']);
    registerPushNavigator(nav);
    expect(openChatFromPush(params)).toBe(true);
    expect(openChatFromPush(params)).toBe(false);
    expect(nav.navigate).toHaveBeenCalledTimes(1);
    expect(openChatFromPush({ ...params, conversationId: 43 })).toBe(true);
    expect(nav.navigate).toHaveBeenCalledTimes(2);
  });

  it('drops the chat when the member is on an auth or onboarding stack', () => {
    const nav = makeNav(true, ['AuthWelcome']);
    registerPushNavigator(nav);
    expect(openChatFromPush(params)).toBe(false);
    expect(nav.navigate).not.toHaveBeenCalled();
    nav.getRootState.mockReturnValue({ routes: [{ name: 'BottomTab' }] });
    expect(flushPendingPush()).toBe(false);
    expect(nav.navigate).not.toHaveBeenCalled();
  });
});
