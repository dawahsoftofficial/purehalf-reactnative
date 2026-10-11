import type { Message } from '../../services/api/types/message-types';
import { mergeNewestPage } from './mergeMessages';

const msg = (id: number, createdAt: string, extra: Partial<Message> = {}) =>
  ({
    id,
    conversation_id: 1,
    body: `m${id}`,
    type: 'text',
    sender_type: 'user',
    sender_id: 7,
    created_at: createdAt,
    statuses: [],
    audio: null,
    ...extra,
  }) as Message;

describe('mergeNewestPage', () => {
  it('adds messages that arrived while away and keeps newest-first order', () => {
    const existing = [
      msg(2, '2026-10-11T10:02:00+05:00'),
      msg(1, '2026-10-11T10:01:00+05:00'),
    ];
    const fetched = [
      msg(4, '2026-10-11T10:04:00+05:00'),
      msg(3, '2026-10-11T10:03:00+05:00'),
      msg(2, '2026-10-11T10:02:00+05:00'),
    ];
    const merged = mergeNewestPage(existing, fetched);
    expect(merged.map((m) => m.id)).toEqual([4, 3, 2, 1]);
  });

  it('dedupes by id', () => {
    const existing = [msg(1, '2026-10-11T10:01:00+05:00')];
    const merged = mergeNewestPage(existing, [
      msg(1, '2026-10-11T10:01:00+05:00'),
    ]);
    expect(merged).toHaveLength(1);
  });

  it('keeps older messages that are not in the newest page', () => {
    const existing = [
      msg(60, '2026-10-11T12:00:00+05:00'),
      msg(5, '2026-10-11T08:00:00+05:00'),
    ];
    const fetched = [msg(61, '2026-10-11T12:01:00+05:00')];
    expect(mergeNewestPage(existing, fetched).map((m) => m.id)).toEqual([
      61, 60, 5,
    ]);
  });

  it('keeps pending local items that the server does not know yet', () => {
    const pending = msg(-1, '2026-10-11T12:05:00+05:00', {
      local_uri: 'file:///x.m4a',
    } as Partial<Message>);
    const merged = mergeNewestPage(
      [pending],
      [msg(9, '2026-10-11T12:00:00+05:00')]
    );
    expect(merged.map((m) => m.id)).toEqual([-1, 9]);
  });

  it('keeps local-only fields on a message the server now returns', () => {
    const local = msg(3, '2026-10-11T10:03:00+05:00', {
      local_uri: 'file:///a.m4a',
    } as Partial<Message>);
    const merged = mergeNewestPage([local], [msg(3, local.created_at)]);
    expect((merged[0] as Message & { local_uri?: string }).local_uri).toBe(
      'file:///a.m4a'
    );
  });

  it('takes fresher statuses from the server', () => {
    const existing = [msg(3, '2026-10-11T10:03:00+05:00')];
    const read = [
      {
        participant_type: 'User',
        participant_id: 9,
        delivered_at: '2026-10-11T10:04:00+05:00',
        read_at: '2026-10-11T10:05:00+05:00',
      },
    ];
    const merged = mergeNewestPage(existing, [
      msg(3, existing[0].created_at, { statuses: read }),
    ]);
    expect(merged[0].statuses).toEqual(read);
  });

  it('keeps existing statuses when the server returns none', () => {
    const read = [
      {
        participant_type: 'User',
        participant_id: 9,
        delivered_at: null,
        read_at: '2026-10-11T10:05:00+05:00',
      },
    ];
    const merged = mergeNewestPage(
      [msg(3, '2026-10-11T10:03:00+05:00', { statuses: read })],
      [msg(3, '2026-10-11T10:03:00+05:00', { statuses: [] })]
    );
    expect(merged[0].statuses).toEqual(read);
  });

  it('orders across different UTC offsets by instant, not by string', () => {
    const merged = mergeNewestPage(
      [msg(1, '2026-10-11T10:00:00+05:00')], // 05:00Z
      [msg(2, '2026-10-11T06:00:00+00:00')] // 06:00Z, later
    );
    expect(merged.map((m) => m.id)).toEqual([2, 1]);
  });

  it('breaks created_at ties by id, newest first', () => {
    const merged = mergeNewestPage(
      [msg(1, '2026-10-11T10:00:00+05:00')],
      [msg(2, '2026-10-11T10:00:00+05:00')]
    );
    expect(merged.map((m) => m.id)).toEqual([2, 1]);
  });

  it('returns the existing array when nothing changed', () => {
    const existing = [msg(1, '2026-10-11T10:01:00+05:00')];
    expect(mergeNewestPage(existing, [{ ...existing[0] }])).toBe(existing);
  });

  it('handles empty inputs', () => {
    const existing = [msg(1, '2026-10-11T10:01:00+05:00')];
    expect(mergeNewestPage(existing, [])).toBe(existing);
    expect(
      mergeNewestPage([], [msg(1, '2026-10-11T10:01:00+05:00')])
    ).toHaveLength(1);
  });
});
