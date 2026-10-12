/**
 * Pure merge of a freshly fetched "newest page" of a conversation into the
 * messages already on screen. Used to catch up after the app was backgrounded
 * or Pusher reconnected. Keep this module free of React Native imports so it
 * runs in plain jest.
 */
import type { Message } from '../../services/api/types/message-types';
import {
  type ChatMessage,
  dropDeliveredPending,
  sortMessages,
} from './optimisticMessages';

/**
 * Merges the newest server page into the current list (both newest-first).
 *
 * - de-duplicates by message id; the server copy wins, but fields only the
 *   client knows (e.g. `local_uri`) are kept, and existing statuses are kept
 *   when the server sends none
 * - messages not in the page are kept: older history loaded by pagination and
 *   pending local items the server does not know yet
 * - optimistic bubbles (`sending` / `failed`) always survive and stay pinned at
 *   the bottom; the exception is a failed bubble that may have reached the
 *   server (timeout) whose delivered twin is in the page - it is dropped so the
 *   message is not shown twice (see `findDeliveredTwin`)
 * - returns the SAME array when nothing changed, so callers can skip a render
 */
export function mergeNewestPage<T extends Message = ChatMessage>(
  existing: T[],
  fetched: Message[]
): T[] {
  if (fetched.length === 0) return existing;

  const byId = new Map<number, T>(existing.map((m) => [m.id, m]));
  let changed = false;

  for (const incoming of fetched) {
    const current = byId.get(incoming.id);
    if (!current) {
      byId.set(incoming.id, incoming as T);
      changed = true;
      continue;
    }

    const next = {
      ...current,
      ...incoming,
      statuses: incoming.statuses?.length
        ? incoming.statuses
        : (current.statuses ?? []),
    } as T;
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      byId.set(incoming.id, next);
      changed = true;
    }
  }

  const merged = Array.from(byId.values());
  const withoutTwins = dropDeliveredPending(
    merged as ChatMessage[],
    fetched
  ) as T[];
  if (withoutTwins.length !== merged.length) changed = true;

  if (!changed) return existing;
  return sortMessages(withoutTwins as ChatMessage[]) as T[];
}
