/**
 * Pure merge of a freshly fetched "newest page" of a conversation into the
 * messages already on screen. Used to catch up after the app was backgrounded
 * or Pusher reconnected. Keep this module free of React Native imports so it
 * runs in plain jest.
 */
import type { Message } from '../../services/api/types/message-types';

const timeOf = (message: Message): number => {
  const time = Date.parse(message.created_at);
  return Number.isNaN(time) ? 0 : time;
};

/** Newest first; created_at ties are broken by id (higher = newer). */
const newestFirst = (a: Message, b: Message): number => {
  const byTime = timeOf(b) - timeOf(a);
  return byTime !== 0 ? byTime : b.id - a.id;
};

/**
 * Merges the newest server page into the current list (both newest-first).
 *
 * - de-duplicates by message id; the server copy wins, but fields only the
 *   client knows (e.g. `local_uri`) are kept, and existing statuses are kept
 *   when the server sends none
 * - messages not in the page are kept: older history loaded by pagination and
 *   pending local items the server does not know yet
 * - returns the SAME array when nothing changed, so callers can skip a render
 */
export function mergeNewestPage(
  existing: Message[],
  fetched: Message[]
): Message[] {
  if (fetched.length === 0) return existing;

  const byId = new Map<number, Message>(existing.map((m) => [m.id, m]));
  let changed = false;

  for (const incoming of fetched) {
    const current = byId.get(incoming.id);
    if (!current) {
      byId.set(incoming.id, incoming);
      changed = true;
      continue;
    }

    const next: Message = {
      ...current,
      ...incoming,
      statuses: incoming.statuses?.length
        ? incoming.statuses
        : (current.statuses ?? []),
    };
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      byId.set(incoming.id, next);
      changed = true;
    }
  }

  if (!changed) return existing;
  return Array.from(byId.values()).sort(newestFirst);
}
