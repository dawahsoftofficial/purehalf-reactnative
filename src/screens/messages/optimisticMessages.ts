/**
 * Pure optimistic-send state for a conversation's message list.
 *
 * A message the member just sent is shown immediately as a "pending" bubble
 * (client temp id, status `sending`). When the server answers it is replaced
 * by the real message; when the send fails it stays as a `failed` bubble with
 * its text (or voice file) so it can be retried - nothing is lost.
 *
 * All lists are newest-first (the chat list is inverted) and every function
 * returns a NEW array, or the SAME array when nothing changed. Keep this
 * module free of React Native imports so it runs in plain jest.
 */
import type { ChatErrorCode } from '../../services/api/chat-errors';
import type { Message } from '../../services/api/types/message-types';

/** The recorded voice note of a pending audio bubble, kept for retry. */
export type PendingAudio = {
  uri: string;
  name: string;
  type: string;
  duration_seconds: number;
  waveform_peaks?: number[];
};

export type SendStatus = 'sending' | 'failed';

/** Client-only fields. A pending bubble carries all of them. */
export type LocalMessageFields = {
  /** Client temp id, `tmp-<timestamp>-<n>`. Survives onto the resolved message. */
  local_id: string;
  /** Present only while the message is not yet confirmed by the server. */
  send_status: SendStatus;
  failure_code: ChatErrorCode;
  /**
   * The request timed out / the connection dropped: the server may still have
   * stored the message. Retry must check for a delivered twin first.
   */
  may_have_sent: boolean;
  /** Highest server id known when the bubble was created (duplicate guard). */
  after_id: number;
  /** Voice note payload for retry. */
  pending_audio: PendingAudio;
  /** Recorded file, so the sender can play a voice note before/without upload. */
  local_uri: string;
};

export type ChatMessage = Message & Partial<LocalMessageFields>;

let tempSeq = 0;

/**
 * A unique client temp id. `id` is a negative number so it can never collide
 * with a server id and still satisfies `Message.id: number` everywhere
 * (keys, selection, audio caches); `localId` is the `tmp-<timestamp>` handle.
 */
export function nextTempId(now: number = Date.now()): {
  id: number;
  localId: string;
} {
  tempSeq += 1;
  return { id: -tempSeq, localId: `tmp-${now}-${tempSeq}` };
}

export const isPending = (message: ChatMessage): boolean =>
  message.send_status !== undefined;

const timeOf = (message: ChatMessage): number => {
  const time = Date.parse(message.created_at);
  return Number.isNaN(time) ? 0 : time;
};

const compare = (a: ChatMessage, b: ChatMessage): number => {
  const aPending = isPending(a);
  const bPending = isPending(b);
  // Unsent bubbles are pinned to the bottom of the thread (front of the
  // newest-first list) regardless of clock skew; they jump to their server
  // position once confirmed.
  if (aPending !== bPending) return aPending ? -1 : 1;
  const byTime = timeOf(b) - timeOf(a);
  if (byTime !== 0) return byTime;
  // Ties: server ids are higher = newer; temp ids are -1, -2... lower = newer.
  return aPending ? a.id - b.id : b.id - a.id;
};

/** Newest first, unsent bubbles pinned first. Always returns a new array. */
export function sortMessages<T extends ChatMessage>(list: T[]): T[] {
  return [...list].sort(compare);
}

const maxServerId = (list: ChatMessage[]): number =>
  list.reduce((max, m) => (m.id > max ? m.id : max), 0);

export type AddPendingInput = {
  id: number;
  localId: string;
  conversationId: number;
  senderId: number;
  senderType?: string;
  body: string;
  audio?: PendingAudio;
  /** ms epoch; defaults to now. */
  now?: number;
};

/** Puts a new `sending` bubble at the bottom of the thread. */
export function addPending(
  list: ChatMessage[],
  input: AddPendingInput
): ChatMessage[] {
  const isAudio = input.audio !== undefined;
  const pending: ChatMessage = {
    id: input.id,
    conversation_id: input.conversationId,
    body: isAudio ? 'Voice message' : input.body,
    type: isAudio ? 'audio' : 'text',
    sender_type: input.senderType ?? 'user',
    sender_id: input.senderId,
    created_at: new Date(input.now ?? Date.now()).toISOString(),
    statuses: [],
    audio: isAudio
      ? {
          path: input.audio!.uri,
          duration_seconds: input.audio!.duration_seconds,
          mime: input.audio!.type,
          size_bytes: 0,
          waveform_peaks: input.audio!.waveform_peaks ?? null,
        }
      : null,
    local_id: input.localId,
    send_status: 'sending',
    after_id: maxServerId(list),
    ...(isAudio
      ? { pending_audio: input.audio, local_uri: input.audio!.uri }
      : {}),
  };
  return sortMessages([pending, ...list]);
}

const indexOfLocal = (list: ChatMessage[], localId: string): number =>
  list.findIndex((m) => m.local_id === localId && isPending(m));

/**
 * Adds a message the server confirmed (realtime event or catch-up). Deduped by
 * server id, so the realtime echo of a message that is already on screen - or
 * that the send response already resolved - is a no-op.
 */
export function addServerMessage(
  list: ChatMessage[],
  message: ChatMessage
): ChatMessage[] {
  if (list.some((m) => m.id === message.id)) return list;
  return sortMessages([message, ...list]);
}

/**
 * Replaces the pending bubble with the server's message. If the realtime echo
 * (or a catch-up) already delivered that server id, the pending bubble is
 * simply dropped so the message is not shown twice. If the bubble is gone the
 * list is returned untouched.
 */
export function resolvePending(
  list: ChatMessage[],
  localId: string,
  server: Message
): ChatMessage[] {
  const pendingIndex = indexOfLocal(list, localId);
  const pending = pendingIndex >= 0 ? list[pendingIndex] : undefined;

  // Remember where the message came from: marks it as "ours" for the twin
  // guard and keeps the recorded file for local playback.
  const confirmed: ChatMessage = {
    ...server,
    local_id: localId,
    ...(pending?.local_uri ? { local_uri: pending.local_uri } : {}),
  };

  const existingIndex = list.findIndex((m) => m.id === server.id);
  if (existingIndex >= 0) {
    // The echo / catch-up got there first: keep that copy, drop the bubble.
    const marked: ChatMessage = {
      ...list[existingIndex],
      local_id: localId,
      ...(pending?.local_uri ? { local_uri: pending.local_uri } : {}),
    };
    return sortMessages(
      list
        .map((m, i) => (i === existingIndex ? marked : m))
        .filter((_, i) => i !== pendingIndex)
    );
  }

  // The bubble is gone: the screen was re-targeted at another conversation
  // while the request was in flight. Do not inject its message into this one;
  // the thread's own fetch shows it when the member returns.
  if (!pending) return list;

  const next = [...list];
  next[pendingIndex] = confirmed;
  return sortMessages(next);
}

/**
 * Whether a failed send may nevertheless be stored by the server: the request
 * timed out / the connection dropped (NETWORK), the response could not be
 * understood (no HTTP status), or the server errored (5xx). Such bubbles get the
 * duplicate guard before a retry resends them.
 */
export function mayHaveReachedServer(error: {
  code: ChatErrorCode;
  status?: number;
}): boolean {
  if (error.code === 'NETWORK') return true;
  return (
    error.code === 'UNKNOWN' &&
    (error.status === undefined || error.status >= 500)
  );
}

/** Marks a pending bubble failed; it keeps its text / voice file for retry. */
export function failPending(
  list: ChatMessage[],
  localId: string,
  failure: { code: ChatErrorCode; mayHaveSent: boolean }
): ChatMessage[] {
  const index = indexOfLocal(list, localId);
  if (index < 0) return list;
  const next = [...list];
  next[index] = {
    ...list[index],
    send_status: 'failed',
    failure_code: failure.code,
    may_have_sent: failure.mayHaveSent,
  };
  return next;
}

/** Failed -> sending again (tap to retry). */
export function retryPending(
  list: ChatMessage[],
  localId: string
): ChatMessage[] {
  const index = indexOfLocal(list, localId);
  if (index < 0 || list[index].send_status !== 'failed') return list;
  const retried: ChatMessage = { ...list[index], send_status: 'sending' };
  delete retried.failure_code;
  delete retried.may_have_sent;
  const next = [...list];
  next[index] = retried;
  return next;
}

/** Drops a pending/failed bubble (the member deleted it, or it was a twin). */
export function removePending(
  list: ChatMessage[],
  localId: string
): ChatMessage[] {
  const index = indexOfLocal(list, localId);
  if (index < 0) return list;
  return list.filter((_, i) => i !== index);
}

/**
 * Best-effort duplicate guard for a send that timed out.
 *
 * The server has no client-message-id idempotency, so a timed-out send may
 * have been stored anyway. Given a freshly fetched newest page, finds a message
 * that looks like the failed bubble's delivered twin: same sender, same type,
 * identical body (voice: same duration), and newer than anything the client
 * knew when the bubble was created (`after_id` - server ids only grow, so
 * this is the clock-skew-proof equivalent of "arrived after the bubble's
 * creation time"). Messages that came from one of our own confirmed sends
 * (`local_id` set) are never twins, so sending "ok" twice quickly cannot
 * swallow the second one. It is a heuristic: an identical message sent from
 * another device in the same window would also match.
 */
export function findDeliveredTwin(
  pending: ChatMessage,
  fetched: ChatMessage[],
  current: ChatMessage[]
): ChatMessage | undefined {
  const claimed = new Set(
    current.filter((m) => m.local_id && !isPending(m)).map((m) => m.id)
  );
  const wantedBody = (pending.body ?? '').trim();
  const wantedDuration = pending.pending_audio?.duration_seconds;

  return fetched.find((candidate) => {
    if (candidate.id <= 0 || candidate.id <= (pending.after_id ?? 0)) {
      return false;
    }
    if (claimed.has(candidate.id) || candidate.local_id) return false;
    if (String(candidate.sender_id) !== String(pending.sender_id)) return false;
    if (candidate.type !== pending.type) return false;
    if (pending.type === 'audio') {
      return (
        wantedDuration !== undefined &&
        candidate.audio?.duration_seconds === wantedDuration
      );
    }
    return (candidate.body ?? '').trim() === wantedBody;
  });
}

/**
 * Drops failed bubbles whose delivered twin is in `fetched` (each server
 * message can account for only one bubble). Only bubbles that may have reached
 * the server (`may_have_sent`) are considered.
 */
export function dropDeliveredPending(
  list: ChatMessage[],
  fetched: ChatMessage[]
): ChatMessage[] {
  const used = new Set<number>();
  let changed = false;
  const next = list.filter((message) => {
    if (message.send_status !== 'failed' || !message.may_have_sent) return true;
    const twin = findDeliveredTwin(
      message,
      fetched.filter((f) => !used.has(f.id)),
      list
    );
    if (!twin) return true;
    used.add(twin.id);
    changed = true;
    return false;
  });
  return changed ? next : list;
}
