/**
 * Pure paging rules for the conversation list (inbox).
 *
 * `GET /auth/conversations/list?per_page=N&page=P` returns a bare array with no
 * total/meta, so "there is another page" can only be inferred: a page that
 * comes back FULL (>= per_page) may have a successor, a short page is the end.
 * The list is newest-activity-first and is also edited live by Pusher events,
 * so merges dedupe by id and never drop a conversation the server still lists.
 *
 * Keep this module free of React Native imports so it runs in plain jest.
 */
import type { Conversation } from '../../services/api/types/message-types';

export const INBOX_PAGE_SIZE = 20;

/** True when the page that was just loaded may be followed by another one. */
export function hasMoreInboxPages(
  pageLength: number,
  perPage: number = INBOX_PAGE_SIZE
): boolean {
  return pageLength >= perPage;
}

/** Parsed last activity, or null when missing / not a date. */
const parsedTime = (conversation: Conversation): number | null => {
  const time = Date.parse(conversation.last_message_at);
  return Number.isNaN(time) ? null : time;
};

const timeOf = (conversation: Conversation): number =>
  parsedTime(conversation) ?? 0;

/** Most recent activity first. Always returns a new array. */
export function sortInbox(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => timeOf(b) - timeOf(a));
}

/**
 * Adds an older page below what is already loaded. Conversations already on
 * screen win (a live Pusher update may be newer than the page).
 */
export function appendInboxPage(
  existing: Conversation[],
  page: Conversation[]
): Conversation[] {
  const seen = new Set(existing.map((c) => c.id));
  const fresh = page.filter((c) => !seen.has(c.id));
  if (fresh.length === 0) return existing;
  return sortInbox([...existing, ...fresh]);
}

/**
 * Applies a refetch of page 1 to a list that may already hold later pages.
 *
 * - A short first page is the whole inbox: it replaces the list.
 * - A full first page only covers the newest `perPage` conversations. Loaded
 *   entries older than its last item stay (they are on later pages); loaded
 *   entries NEWER than that boundary which the server no longer returns were
 *   deleted and are dropped. Items with a null/unparsable `last_message_at`
 *   are ignored when locating that boundary.
 */
export function mergeFirstInboxPage(
  existing: Conversation[],
  firstPage: Conversation[],
  perPage: number = INBOX_PAGE_SIZE
): Conversation[] {
  if (!hasMoreInboxPages(firstPage.length, perPage)) {
    return sortInbox(firstPage);
  }
  // Items without a usable timestamp say nothing about where the page ends;
  // counting them as time 0 would make every loaded older page look "newer".
  // With no usable timestamp at all nothing can be judged deleted.
  const times = firstPage
    .map(parsedTime)
    .filter((time): time is number => time !== null);
  const boundary = times.length > 0 ? Math.min(...times) : Infinity;
  const inFirstPage = new Set(firstPage.map((c) => c.id));
  const kept = existing.filter(
    (c) => !inFirstPage.has(c.id) && timeOf(c) < boundary
  );
  return sortInbox([...firstPage, ...kept]);
}
