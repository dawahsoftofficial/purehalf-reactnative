import type { Conversation } from '../../services/api/types/message-types';
import {
  appendInboxPage,
  hasMoreInboxPages,
  INBOX_PAGE_SIZE,
  mergeFirstInboxPage,
  sortInbox,
} from './inboxPaging';

// Conversation `n` was last active `n` minutes after 10:00 (bigger = newer).
const convo = (n: number, extra: Partial<Conversation> = {}): Conversation =>
  ({
    id: n,
    type: 'private',
    last_message: `m${n}`,
    last_message_at: new Date(Date.UTC(2026, 9, 11, 10, n)).toISOString(),
    participants: [],
    last_message_detail: null,
    ...extra,
  }) as Conversation;

const ids = (list: Conversation[]) => list.map((c) => c.id);

describe('hasMoreInboxPages (stop condition)', () => {
  it('continues while a page comes back full', () => {
    expect(hasMoreInboxPages(20, 20)).toBe(true);
    expect(hasMoreInboxPages(INBOX_PAGE_SIZE)).toBe(true);
  });

  it('stops on a short page', () => {
    expect(hasMoreInboxPages(19, 20)).toBe(false);
    expect(hasMoreInboxPages(1, 20)).toBe(false);
  });

  it('stops on an empty page', () => {
    expect(hasMoreInboxPages(0, 20)).toBe(false);
  });
});

describe('sortInbox', () => {
  it('orders by last activity, newest first, without mutating the input', () => {
    const input = [convo(1), convo(3), convo(2)];
    expect(ids(sortInbox(input))).toEqual([3, 2, 1]);
    expect(ids(input)).toEqual([1, 3, 2]);
  });

  it('treats an unparsable time as oldest', () => {
    const list = [convo(1, { last_message_at: 'nope' }), convo(2)];
    expect(ids(sortInbox(list))).toEqual([2, 1]);
  });
});

describe('appendInboxPage', () => {
  it('appends an older page below the loaded ones', () => {
    const merged = appendInboxPage([convo(9), convo(8)], [convo(2), convo(1)]);
    expect(ids(merged)).toEqual([9, 8, 2, 1]);
  });

  it('skips conversations already on screen and keeps the on-screen copy', () => {
    const live = convo(8, { last_message: 'live update' });
    const merged = appendInboxPage([convo(9), live], [convo(8), convo(7)]);
    expect(ids(merged)).toEqual([9, 8, 7]);
    expect(merged.find((c) => c.id === 8)?.last_message).toBe('live update');
  });

  it('returns the same array when the page adds nothing', () => {
    const existing = [convo(9), convo(8)];
    expect(appendInboxPage(existing, [convo(8)])).toBe(existing);
    expect(appendInboxPage(existing, [])).toBe(existing);
  });
});

describe('mergeFirstInboxPage', () => {
  it('replaces the list when the first page is short (the whole inbox)', () => {
    const merged = mergeFirstInboxPage(
      [convo(5), convo(4), convo(3)],
      [convo(5), convo(3)],
      20
    );
    expect(ids(merged)).toEqual([5, 3]);
  });

  it('keeps later pages when a full first page is refetched', () => {
    const page1 = [convo(6), convo(5)];
    // 4 and 3 were loaded from page 2 earlier.
    const merged = mergeFirstInboxPage(
      [convo(6), convo(5), convo(4), convo(3)],
      page1,
      2
    );
    expect(ids(merged)).toEqual([6, 5, 4, 3]);
  });

  it('drops a conversation newer than the page boundary that the server no longer lists', () => {
    // 6 was deleted: the fresh first page (7, 5) no longer contains it, and it
    // is newer than the boundary (5), so it must go. 4 is on a later page.
    const merged = mergeFirstInboxPage(
      [convo(7), convo(6), convo(5), convo(4)],
      [convo(7), convo(5)],
      2
    );
    expect(ids(merged)).toEqual([7, 5, 4]);
  });

  it('puts a conversation that jumped to the top first and does not duplicate it', () => {
    const merged = mergeFirstInboxPage(
      [convo(5), convo(4), convo(3)],
      [convo(9, { id: 3 }), convo(8)],
      2
    );
    expect(merged.filter((c) => c.id === 3)).toHaveLength(1);
    expect(merged[0].id).toBe(3);
  });
});
