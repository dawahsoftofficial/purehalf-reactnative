import { resolveUnreadCounts } from './unreadCounts';

const NONE = { conversations: 0, messages: 0 };

describe('resolveUnreadCounts', () => {
  it('maps the /auth/counter keys', () => {
    expect(
      resolveUnreadCounts(
        { unread_conversations_count: 3, unread_messages_count: 11 },
        NONE
      )
    ).toEqual({ conversations: 3, messages: 11 });
  });

  it('accepts numeric strings (the Pusher payload sends the messages count as a string)', () => {
    expect(
      resolveUnreadCounts(
        { unread_conversations_count: '2', unread_messages_count: '5' },
        NONE
      )
    ).toEqual({ conversations: 2, messages: 5 });
  });

  it('returns null when neither key is present (leave the store alone)', () => {
    expect(resolveUnreadCounts({ like_you_counter: 4 }, NONE)).toBeNull();
    expect(resolveUnreadCounts(null, NONE)).toBeNull();
    expect(resolveUnreadCounts(undefined, NONE)).toBeNull();
    expect(resolveUnreadCounts('x', NONE)).toBeNull();
  });

  it('keeps the current value for a key that is missing', () => {
    expect(
      resolveUnreadCounts(
        { unread_messages_count: 4 },
        { conversations: 9, messages: 1 }
      )
    ).toEqual({ conversations: 9, messages: 4 });
  });

  it('treats garbage / negative / null values as 0 for a present key', () => {
    expect(
      resolveUnreadCounts(
        { unread_conversations_count: null, unread_messages_count: -3 },
        { conversations: 5, messages: 5 }
      )
    ).toEqual({ conversations: 0, messages: 0 });
    expect(
      resolveUnreadCounts(
        { unread_conversations_count: 'abc', unread_messages_count: 2.9 },
        NONE
      )
    ).toEqual({ conversations: 0, messages: 2 });
  });
});
