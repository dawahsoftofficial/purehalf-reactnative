import type { ChatMessage } from './optimisticMessages';
import { applyReadUpTo } from './readReceipts';

const ME = 7;
const OTHER = 9;
const READ_AT = '2026-10-11T10:05:00+05:00';

const msg = (id: number, extra: Partial<ChatMessage> = {}): ChatMessage =>
  ({
    id,
    conversation_id: 1,
    body: `m${id}`,
    type: 'text',
    sender_type: 'User',
    sender_id: ME,
    created_at: '2026-10-11T10:00:00+05:00',
    statuses: [],
    audio: null,
    ...extra,
  }) as ChatMessage;

const event = { readerId: OTHER, readerType: 'User', readAt: READ_AT };
const readBy = (m: ChatMessage, who = OTHER) =>
  m.statuses.find((s) => s.participant_id === who)?.read_at ?? null;

describe('applyReadUpTo', () => {
  it('marks every own message up to the id as read, not just that one', () => {
    // newest first, like the chat list
    const list = [msg(30), msg(20), msg(10)];
    const next = applyReadUpTo(list, { ...event, messageId: 20 });

    expect(readBy(next[0])).toBeNull(); // 30 is newer than the read marker
    expect(readBy(next[1])).toBe(READ_AT);
    expect(readBy(next[2])).toBe(READ_AT);
  });

  it('fills delivered_at for a message that had no delivery yet', () => {
    const [next] = applyReadUpTo([msg(10)], { ...event, messageId: 10 });
    expect(next.statuses[0]).toMatchObject({
      participant_id: OTHER,
      delivered_at: READ_AT,
      read_at: READ_AT,
    });
  });

  it('keeps an earlier delivered_at and never overwrites an earlier read_at', () => {
    const delivered = '2026-10-11T10:01:00+05:00';
    const earlier = '2026-10-11T10:02:00+05:00';
    const list = [
      msg(20, {
        statuses: [
          {
            participant_type: 'User',
            participant_id: OTHER,
            delivered_at: delivered,
            read_at: null,
          },
        ],
      }),
      msg(10, {
        statuses: [
          {
            participant_type: 'User',
            participant_id: OTHER,
            delivered_at: delivered,
            read_at: earlier,
          },
        ],
      }),
    ];
    const next = applyReadUpTo(list, { ...event, messageId: 20 });

    expect(next[0].statuses[0]).toMatchObject({
      delivered_at: delivered,
      read_at: READ_AT,
    });
    expect(next[1]).toBe(list[1]);
    expect(readBy(next[1])).toBe(earlier);
  });

  it("does not mark the reader's own messages as read by the reader", () => {
    const theirs = msg(15, { sender_id: OTHER });
    const next = applyReadUpTo([theirs, msg(10)], { ...event, messageId: 20 });
    expect(next[0]).toBe(theirs);
    expect(readBy(next[1])).toBe(READ_AT);
  });

  it('ignores unsent bubbles (negative ids / send_status)', () => {
    const pending = msg(-1, { send_status: 'sending' });
    const next = applyReadUpTo([pending, msg(10)], { ...event, messageId: 20 });
    expect(next[0]).toBe(pending);
    expect(next[0].statuses).toEqual([]);
  });

  it('returns the same array when nothing changes', () => {
    const list = [
      msg(10, {
        statuses: [
          {
            participant_type: 'User',
            participant_id: OTHER,
            delivered_at: READ_AT,
            read_at: READ_AT,
          },
        ],
      }),
      msg(40),
    ];
    // 10 is already read; 40 is newer than the marker.
    expect(applyReadUpTo(list, { ...event, messageId: 20 })).toBe(list);
  });

  it('works when the reader id arrives as a string', () => {
    const next = applyReadUpTo([msg(10)], {
      ...event,
      readerId: String(OTHER),
      messageId: 10,
    });
    expect(readBy(next[0])).toBe(READ_AT);
  });
});
