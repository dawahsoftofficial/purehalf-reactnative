import type { Conversation } from '../../services/api/types/message-types';
import {
  captureSendTarget,
  deliveryTarget,
  getMyParticipant,
  getOtherParticipant,
  getSendTarget,
  hasHeaderFields,
  initialOtherUser,
  isChatPartnerDeleted,
  mergeChatPartner,
  resolveChatEntry,
  threadSyncKey,
} from './SingleChat.routing';

const conversation = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'private',
  participants: [
    { id: 1, type: 'User', name: 'Me', image: 'me.jpg' },
    { id: 2, type: 'User', name: 'Aisha', image: 'a.jpg' },
  ],
  ...extra,
});

const asConversation = (value: unknown) => value as Conversation;

describe('resolveChatEntry', () => {
  it('uses a full conversation object from the inbox as-is', () => {
    const conv = conversation(7);
    expect(resolveChatEntry({ conversationData: conv })).toEqual({
      kind: 'conversation',
      conversation: conv,
    });
  });

  it('accepts convDetails as an alias of conversationData', () => {
    const conv = conversation(7);
    expect(resolveChatEntry({ convDetails: conv })).toEqual({
      kind: 'conversation',
      conversation: conv,
    });
  });

  it('treats a bare conversationId (notification) as an id entry and keeps the user', () => {
    expect(
      resolveChatEntry({ conversationId: '12', otherUserData: { id: 5 } })
    ).toEqual({ kind: 'conversationId', conversationId: '12', userId: 5 });
  });

  it('does not carry a staff/support sender id as a member id (push from an Admin)', () => {
    expect(
      resolveChatEntry({
        conversationId: '12',
        otherUserData: { id: 5, type: 'Admin' },
      })
    ).toEqual({ kind: 'conversationId', conversationId: '12', userId: null });
  });

  it('keeps the member id when the pushed sender type is User', () => {
    expect(
      resolveChatEntry({
        conversationId: '12',
        otherUserData: { id: 5, type: 'User' },
      })
    ).toEqual({ kind: 'conversationId', conversationId: '12', userId: 5 });
  });

  it('accepts a numeric conversationId and no user', () => {
    expect(resolveChatEntry({ conversationId: 12 })).toEqual({
      kind: 'conversationId',
      conversationId: '12',
      userId: null,
    });
  });

  it('treats an object with an id but no participants as an id entry', () => {
    expect(
      resolveChatEntry({
        conversationData: { id: 9 },
        otherUserData: { id: 3 },
      })
    ).toEqual({ kind: 'conversationId', conversationId: '9', userId: 3 });
  });

  it('reads the legacy convDetails.id shape', () => {
    expect(
      resolveChatEntry({
        conversationData: { convDetails: { id: '15' }, messages: [] },
      })
    ).toEqual({ kind: 'conversationId', conversationId: '15', userId: null });
  });

  it('ignores a non-numeric legacy id and falls back to the user', () => {
    expect(
      resolveChatEntry({
        conversationData: { convDetails: { id: '-Nabc123' } },
        otherUserData: { id: 4 },
      })
    ).toEqual({ kind: 'user', userId: 4 });
  });

  it('resolves by userId when only a user is known', () => {
    expect(resolveChatEntry({ userId: 8 })).toEqual({
      kind: 'user',
      userId: 8,
    });
  });

  it('treats an empty legacy conversation placeholder as a user entry', () => {
    expect(
      resolveChatEntry({
        conversationData: { convDetails: {}, messages: [] },
        otherUserData: { id: 6 },
      })
    ).toEqual({ kind: 'user', userId: 6 });
  });

  it('prefers an explicit userId over otherUserData.id', () => {
    expect(resolveChatEntry({ userId: '8', otherUserData: { id: 6 } })).toEqual(
      { kind: 'user', userId: 8 }
    );
  });

  it('returns empty when nothing identifies the chat', () => {
    expect(resolveChatEntry({})).toEqual({ kind: 'empty' });
    expect(resolveChatEntry(undefined)).toEqual({ kind: 'empty' });
  });
});

describe('getOtherParticipant', () => {
  it('returns the participant that is not the current user (type-insensitive ids)', () => {
    expect(getOtherParticipant(asConversation(conversation(1)), '1')?.id).toBe(
      2
    );
  });

  it('returns undefined without a conversation', () => {
    expect(getOtherParticipant(null, 1)).toBeUndefined();
  });

  it('never picks a Guardian pivot as the partner, even listed first', () => {
    const conv = asConversation({
      id: 3,
      participants: [
        { id: 9, type: 'Guardian', name: 'Wali' },
        { id: 1, type: 'User', name: 'Me' },
        { id: 2, type: 'User', name: 'Aisha' },
      ],
    });
    expect(getOtherParticipant(conv, 1)?.id).toBe(2);
  });

  it('does not mistake a Guardian sharing my numeric id for me', () => {
    const conv = asConversation({
      id: 3,
      participants: [
        { id: 1, type: 'Guardian', name: 'Wali' },
        { id: 1, type: 'User', name: 'Me' },
        { id: 2, type: 'User', name: 'Aisha' },
      ],
    });
    expect(getOtherParticipant(conv, 1)).toMatchObject({ id: 2, type: 'User' });
    expect(getMyParticipant(conv, 1)).toMatchObject({ id: 1, type: 'User' });
  });

  it('still returns a support (Admin) partner', () => {
    const conv = asConversation({
      id: 3,
      type: 'support',
      participants: [
        { id: 1, type: 'User', name: 'Me' },
        { id: 1, type: 'Admin', name: 'Support' },
      ],
    });
    expect(getOtherParticipant(conv, 1)).toMatchObject({ type: 'Admin' });
  });

  it('returns undefined when only a Guardian is left', () => {
    const conv = asConversation({
      id: 3,
      participants: [
        { id: 1, type: 'User', name: 'Me' },
        { id: 9, type: 'Guardian', name: 'Wali' },
      ],
    });
    expect(getOtherParticipant(conv, 1)).toBeUndefined();
  });
});

describe('isChatPartnerDeleted', () => {
  it('is true when the route user is flagged deleted', () => {
    expect(isChatPartnerDeleted({ is_deleted: true }, null, 1)).toBe(true);
  });

  it('is true when the conversation partner is flagged deleted', () => {
    const conv = conversation(1);
    Object.assign(conv.participants[1], { is_deleted: true });
    expect(isChatPartnerDeleted({ id: 2 }, asConversation(conv), 1)).toBe(true);
  });

  it('is false for a live member', () => {
    expect(
      isChatPartnerDeleted({ id: 2 }, asConversation(conversation(1)), 1)
    ).toBe(false);
  });
});

describe('hasHeaderFields', () => {
  it('needs a name and an image field', () => {
    expect(hasHeaderFields({ name: 'A', image: 'x.jpg' })).toBe(true);
    expect(hasHeaderFields({ name: 'A', image: '' })).toBe(true);
    expect(hasHeaderFields({ name: 'A' })).toBe(false);
    expect(hasHeaderFields({ image: 'x' })).toBe(false);
    expect(hasHeaderFields(undefined)).toBe(false);
  });
});

describe('mergeChatPartner', () => {
  const participant = {
    id: 2,
    type: 'User',
    name: 'Aisha K',
    image: 'a.jpg',
    is_blocked: 0,
    last_seen_at: null,
    last_read_message_id: null,
    unread_count: 0,
  };

  it('fills gaps but keeps richer route data for a live member', () => {
    const merged = mergeChatPartner(
      { id: 2, name: 'Aisha Khan', age: 27 },
      participant
    );
    expect(merged).toMatchObject({
      id: 2,
      type: 'User',
      name: 'Aisha Khan',
      image: 'a.jpg',
      age: 27,
      is_deleted: false,
    });
  });

  it('builds the partner from the payload when nothing else is known', () => {
    expect(mergeChatPartner(undefined, participant)).toMatchObject({
      id: 2,
      name: 'Aisha K',
      image: 'a.jpg',
      is_deleted: false,
    });
  });

  it('uses the payload name/image for a deleted member', () => {
    const merged = mergeChatPartner(
      { id: 2, name: 'Stale', image: 'stale.jpg' },
      { ...participant, name: 'Deleted member', image: '', is_deleted: true }
    );
    expect(merged).toMatchObject({
      name: 'Deleted member',
      image: '',
      is_deleted: true,
    });
  });
});

describe('initialOtherUser', () => {
  it('prefers the route user object', () => {
    expect(initialOtherUser({ otherUserData: { id: 2, name: 'A' } })).toEqual({
      id: 2,
      name: 'A',
    });
  });

  it('falls back to an id-only user', () => {
    expect(initialOtherUser({ userId: '9' })).toEqual({ id: 9 });
    expect(initialOtherUser({})).toBeUndefined();
  });
});

describe('getSendTarget', () => {
  it('is new when nothing identifies a conversation', () => {
    expect(getSendTarget({}, '')).toEqual({ kind: 'new' });
    expect(getSendTarget(undefined, undefined)).toEqual({ kind: 'new' });
  });

  it('uses the payload id', () => {
    expect(getSendTarget({ id: 7 }, '')).toEqual({
      kind: 'existing',
      conversationId: 7,
    });
  });

  it('falls back to the screen conversationId when the payload is sparse', () => {
    expect(getSendTarget({}, '12')).toEqual({
      kind: 'existing',
      conversationId: 12,
    });
  });
});

describe('captureSendTarget / deliveryTarget', () => {
  it('captures the conversation id when one is known', () => {
    expect(
      captureSendTarget({
        conversationData: { id: 7 },
        conversationId: '',
        receiverId: 5,
        created: new Map(),
      })
    ).toEqual({
      kind: 'existing',
      conversationId: 7,
    });
    expect(
      captureSendTarget({
        conversationData: {},
        conversationId: '12',
        receiverId: 5,
        created: new Map(),
      })
    ).toEqual({
      kind: 'existing',
      conversationId: 12,
    });
  });

  it('captures the receiver for a brand-new chat', () => {
    expect(
      captureSendTarget({
        conversationData: {},
        conversationId: '',
        receiverId: 5,
        created: new Map(),
      })
    ).toEqual({
      kind: 'new',
      receiverId: 5,
    });
    expect(
      captureSendTarget({
        conversationData: {},
        conversationId: '',
        receiverId: '5',
        created: new Map(),
      })
    ).toEqual({
      kind: 'new',
      receiverId: 5,
    });
  });

  it('reuses a conversation this screen already created with that receiver', () => {
    expect(
      captureSendTarget({
        conversationData: {},
        conversationId: '',
        receiverId: 5,
        created: new Map([['5', 40]]),
      })
    ).toEqual({
      kind: 'existing',
      conversationId: 40,
    });
    // Created with someone else: not reused.
    expect(
      captureSendTarget({
        conversationData: {},
        conversationId: '',
        receiverId: 5,
        created: new Map([['6', 40]]),
      })
    ).toEqual({
      kind: 'new',
      receiverId: 5,
    });
  });

  it('is null when there is neither a conversation nor a receiver', () => {
    expect(
      captureSendTarget({
        conversationData: {},
        conversationId: '',
        receiverId: undefined,
        created: new Map(),
      })
    ).toBeNull();
    expect(
      captureSendTarget({
        conversationData: {},
        conversationId: '',
        receiverId: 'abc',
        created: new Map(),
      })
    ).toBeNull();
  });

  it('a queued follow-up chains onto the conversation created for ITS receiver', () => {
    const created = new Map<string, number>();
    const followUp = captureSendTarget({
      conversationData: {},
      conversationId: '',
      receiverId: 5,
      created,
    });
    // Meanwhile the first message created the conversation with member 5,
    // and the screen was re-targeted at member 6.
    created.set('5', 40);
    expect(deliveryTarget(followUp!, created)).toEqual({
      kind: 'existing',
      conversationId: 40,
    });
    expect(deliveryTarget({ kind: 'new', receiverId: 6 }, created)).toEqual({
      kind: 'new',
      receiverId: 6,
    });
  });

  it('never redirects an existing-conversation send', () => {
    expect(
      deliveryTarget(
        { kind: 'existing', conversationId: 7 },
        new Map([['5', 40]])
      )
    ).toEqual({ kind: 'existing', conversationId: 7 });
  });
});

describe('threadSyncKey', () => {
  it('is null without a conversation id', () => {
    expect(threadSyncKey('', 'u:5')).toBeNull();
  });

  it('changes when a push re-targets a user entry at the same conversation', () => {
    // Opened by user id, resolved to conversation 10; then a push for
    // conversation 10 arrives. conversationId never changes, but the
    // thread must be refetched (its messages were cleared).
    expect(threadSyncKey('10', 'u:5')).not.toBe(threadSyncKey('10', 'c:10'));
  });

  it('is stable while neither the entry nor the id changes', () => {
    expect(threadSyncKey('10', 'c:10')).toBe(threadSyncKey('10', 'c:10'));
  });

  it('changes when the first send gives a new chat its id', () => {
    expect(threadSyncKey('', 'u:5')).not.toBe(threadSyncKey('40', 'u:5'));
  });
});
