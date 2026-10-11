import type { Message } from '../../services/api/types/message-types';
import { mergeNewestPage } from './mergeMessages';
import {
  addPending,
  addServerMessage,
  type ChatMessage,
  dropDeliveredPending,
  failPending,
  findDeliveredTwin,
  isPending,
  mayHaveReachedServer,
  nextTempId,
  removePending,
  resolvePending,
  retryPending,
  sortMessages,
} from './optimisticMessages';

const ME = 7;
const OTHER = 9;

const server = (
  id: number,
  createdAt: string,
  extra: Partial<ChatMessage> = {}
): ChatMessage =>
  ({
    id,
    conversation_id: 1,
    body: `m${id}`,
    type: 'text',
    sender_type: 'user',
    sender_id: OTHER,
    created_at: createdAt,
    statuses: [],
    audio: null,
    ...extra,
  }) as ChatMessage;

const at = (minute: number) =>
  `2026-10-11T10:${String(minute).padStart(2, '0')}:00+05:00`;
const ms = (minute: number) => Date.parse(at(minute));

const pend = (list: ChatMessage[], body: string, minute: number) => {
  const { id, localId } = nextTempId(ms(minute));
  return {
    localId,
    list: addPending(list, {
      id,
      localId,
      conversationId: 1,
      senderId: ME,
      body,
      now: ms(minute),
    }),
  };
};

describe('addPending', () => {
  it('shows the message at the bottom of the thread as `sending` with its text', () => {
    const { list, localId } = pend([server(5, at(1))], 'salaam', 2);
    expect(list.map((m) => m.body)).toEqual(['salaam', 'm5']);
    expect(list[0]).toMatchObject({
      local_id: localId,
      send_status: 'sending',
      sender_id: ME,
      type: 'text',
      statuses: [],
    });
    expect(localId).toMatch(/^tmp-\d+-\d+$/);
    expect(list[0].id).toBeLessThan(0);
  });

  it('records the newest server id it knew about', () => {
    const { list } = pend([server(8, at(2)), server(5, at(1))], 'hi', 3);
    expect(list[0].after_id).toBe(8);
  });

  it('keeps unsent bubbles at the bottom even when the server clock is ahead', () => {
    const { list } = pend([server(5, at(30))], 'hi', 2); // bubble "older" by clock
    expect(list[0].send_status).toBe('sending');
  });

  it('builds a voice bubble that keeps the recording for playback and retry', () => {
    const { id, localId } = nextTempId();
    const audio = {
      uri: 'file:///v.m4a',
      name: 'voice.m4a',
      type: 'audio/mp4',
      duration_seconds: 12,
      waveform_peaks: [0.2, 0.5],
    };
    const [bubble] = addPending([], {
      id,
      localId,
      conversationId: 1,
      senderId: ME,
      body: '',
      audio,
    });
    expect(bubble).toMatchObject({
      type: 'audio',
      local_uri: 'file:///v.m4a',
      pending_audio: audio,
      audio: { path: 'file:///v.m4a', duration_seconds: 12 },
    });
  });

  it('gives every bubble a unique id', () => {
    const a = pend([], 'a', 1);
    const b = pend(a.list, 'b', 1);
    expect(new Set(b.list.map((m) => m.id)).size).toBe(2);
  });
});

describe('resolvePending', () => {
  it('replaces the bubble with the server message in the right position', () => {
    const { list, localId } = pend([server(5, at(1))], 'salaam', 2);
    const resolved = resolvePending(
      list,
      localId,
      server(6, at(2), { sender_id: ME, body: 'salaam' })
    );
    expect(resolved.map((m) => m.id)).toEqual([6, 5]);
    expect(isPending(resolved[0])).toBe(false);
    expect(resolved[0].local_id).toBe(localId);
  });

  it('does not show the message twice when the realtime echo arrived first', () => {
    const { list, localId } = pend([server(5, at(1))], 'salaam', 2);
    const echoed = addServerMessage(
      list,
      server(6, at(2), { sender_id: ME, body: 'salaam' })
    );
    expect(echoed).toHaveLength(3); // bubble + echo + 5
    const resolved = resolvePending(
      echoed,
      localId,
      server(6, at(2), { sender_id: ME, body: 'salaam' })
    );
    expect(resolved.map((m) => m.id)).toEqual([6, 5]);
    expect(resolved.filter(isPending)).toHaveLength(0);
  });

  it('leaves the list alone when the bubble is gone (screen re-targeted)', () => {
    const { list, localId } = pend([], 'hi', 1);
    const without = removePending(list, localId);
    expect(resolvePending(without, localId, server(6, at(1)))).toBe(without);
  });

  it('keeps the recorded file on a resolved voice note for local playback', () => {
    const { id, localId } = nextTempId();
    const audio = {
      uri: 'file:///v.m4a',
      name: 'v',
      type: 'audio/mp4',
      duration_seconds: 3,
    };
    const list = addPending([], {
      id,
      localId,
      conversationId: 1,
      senderId: ME,
      body: '',
      audio,
    });
    const resolved = resolvePending(
      list,
      localId,
      server(6, at(1), { type: 'audio', sender_id: ME })
    );
    expect(resolved[0].local_uri).toBe('file:///v.m4a');
    expect(resolved[0].pending_audio).toBeUndefined();
  });

  it('only resolves the bubble it was started for', () => {
    const first = pend([], 'ok', 1);
    const second = pend(first.list, 'ok', 1);
    const resolved = resolvePending(
      second.list,
      first.localId,
      server(6, at(1), { sender_id: ME, body: 'ok' })
    );
    expect(resolved.filter(isPending).map((m) => m.local_id)).toEqual([
      second.localId,
    ]);
  });
});

describe('addServerMessage (realtime echo)', () => {
  it('is a no-op for an id already on screen', () => {
    const list = [server(5, at(1))];
    expect(addServerMessage(list, server(5, at(1)))).toBe(list);
  });

  it('inserts a new message in time order, below unsent bubbles', () => {
    const { list } = pend([server(5, at(1))], 'hi', 2);
    const next = addServerMessage(list, server(6, at(3)));
    expect(next.map((m) => m.id)).toEqual([list[0].id, 6, 5]);
  });
});

describe('failPending / retryPending / removePending', () => {
  it('marks the bubble failed and keeps its text', () => {
    const { list, localId } = pend([], 'important text', 1);
    const failed = failPending(list, localId, {
      code: 'NETWORK',
      mayHaveSent: true,
    });
    expect(failed[0]).toMatchObject({
      send_status: 'failed',
      failure_code: 'NETWORK',
      may_have_sent: true,
      body: 'important text',
    });
  });

  it('retry flips it back to sending and clears the failure', () => {
    const { list, localId } = pend([], 'hi', 1);
    const failed = failPending(list, localId, {
      code: 'UNKNOWN',
      mayHaveSent: false,
    });
    const retried = retryPending(failed, localId);
    expect(retried[0].send_status).toBe('sending');
    expect(retried[0].failure_code).toBeUndefined();
    expect(retried[0].may_have_sent).toBeUndefined();
    expect(retried[0].body).toBe('hi');
  });

  it('retry ignores a bubble that is not failed', () => {
    const { list, localId } = pend([], 'hi', 1);
    expect(retryPending(list, localId)).toBe(list);
  });

  it('ignores unknown ids', () => {
    const { list } = pend([], 'hi', 1);
    expect(
      failPending(list, 'tmp-nope', { code: 'UNKNOWN', mayHaveSent: false })
    ).toBe(list);
    expect(removePending(list, 'tmp-nope')).toBe(list);
  });

  it('removes a bubble', () => {
    const { list, localId } = pend([server(5, at(1))], 'hi', 2);
    expect(removePending(list, localId).map((m) => m.id)).toEqual([5]);
  });
});

describe('mayHaveReachedServer', () => {
  it('is true for timeouts, dropped connections, unparseable and 5xx answers', () => {
    expect(mayHaveReachedServer({ code: 'NETWORK' })).toBe(true);
    expect(mayHaveReachedServer({ code: 'UNKNOWN' })).toBe(true);
    expect(mayHaveReachedServer({ code: 'UNKNOWN', status: 502 })).toBe(true);
  });

  it('is false when the server answered with a rejection', () => {
    expect(mayHaveReachedServer({ code: 'WAIT_FOR_REPLY', status: 403 })).toBe(
      false
    );
    expect(mayHaveReachedServer({ code: 'BLOCKED', status: 403 })).toBe(false);
    expect(mayHaveReachedServer({ code: 'RATE_LIMITED', status: 429 })).toBe(
      false
    );
    expect(mayHaveReachedServer({ code: 'UNKNOWN', status: 400 })).toBe(false);
  });
});

describe('sortMessages', () => {
  it('orders by instant across offsets, ties by id', () => {
    const sorted = sortMessages([
      server(1, '2026-10-11T10:00:00+05:00'), // 05:00Z
      server(2, '2026-10-11T06:00:00+00:00'), // 06:00Z
      server(3, '2026-10-11T06:00:00+00:00'),
    ]);
    expect(sorted.map((m) => m.id)).toEqual([3, 2, 1]);
  });
});

describe('mergeNewestPage with optimistic bubbles', () => {
  it('keeps sending and failed bubbles at the bottom through a merge', () => {
    const a = pend([server(5, at(1))], 'one', 2);
    const b = pend(a.list, 'two', 3);
    const failed = failPending(b.list, a.localId, {
      code: 'NETWORK',
      mayHaveSent: false,
    });
    const merged = mergeNewestPage(failed, [
      server(6, at(4)),
      server(5, at(1)),
    ]);
    expect(merged.map((m) => m.send_status ?? m.id)).toEqual([
      'sending',
      'failed',
      6,
      5,
    ]);
    expect(merged[0].body).toBe('two');
    expect(merged[1].body).toBe('one');
  });

  it('drops a timed-out bubble once its delivered twin shows up', () => {
    const { list, localId } = pend([server(5, at(1))], 'salaam', 2);
    const failed = failPending(list, localId, {
      code: 'NETWORK',
      mayHaveSent: true,
    });
    const merged = mergeNewestPage(failed, [
      server(6, at(2), { sender_id: ME, body: 'salaam' }),
      server(5, at(1)),
    ]);
    expect(merged.map((m) => m.id)).toEqual([6, 5]);
  });

  it('keeps a bubble that definitely did not reach the server', () => {
    const { list, localId } = pend([server(5, at(1))], 'salaam', 2);
    const failed = failPending(list, localId, {
      code: 'WAIT_FOR_REPLY',
      mayHaveSent: false,
    });
    const merged = mergeNewestPage(failed, [
      server(6, at(2), { sender_id: ME, body: 'salaam' }),
    ]);
    expect(merged.filter(isPending)).toHaveLength(1);
  });

  it('keeps a bubble still in flight even if the server copy is already listed', () => {
    const { list } = pend([server(5, at(1))], 'salaam', 2);
    const merged = mergeNewestPage(list, [
      server(6, at(2), { sender_id: ME, body: 'salaam' }),
    ]);
    // The send response will resolve it (and drop the bubble) in a moment.
    expect(merged.filter(isPending)).toHaveLength(1);
  });

  it('returns the same array when nothing changed', () => {
    const { list } = pend([server(5, at(1))], 'hi', 2);
    expect(mergeNewestPage(list, [server(5, at(1))])).toBe(list);
  });
});

describe('findDeliveredTwin', () => {
  const failedBubble = (body: string, afterList: ChatMessage[]) => {
    const { list, localId } = pend(afterList, body, 5);
    const failed = failPending(list, localId, {
      code: 'NETWORK',
      mayHaveSent: true,
    });
    return { bubble: failed[0], list: failed };
  };

  it('matches an identical body from the same sender that arrived after the bubble', () => {
    const { bubble, list } = failedBubble('ok', [server(5, at(1))]);
    const twin = server(6, at(5), { sender_id: ME, body: 'ok' });
    expect(findDeliveredTwin(bubble, [twin], list)).toBe(twin);
  });

  it('ignores an identical message that predates the bubble', () => {
    const { bubble, list } = failedBubble('ok', [
      server(5, at(1), { sender_id: ME, body: 'ok' }),
    ]);
    expect(
      findDeliveredTwin(
        bubble,
        [server(5, at(1), { sender_id: ME, body: 'ok' })],
        list
      )
    ).toBeUndefined();
  });

  it('ignores a different body, another sender, and our own confirmed sends', () => {
    const { bubble, list } = failedBubble('ok', [server(5, at(1))]);
    expect(
      findDeliveredTwin(
        bubble,
        [server(6, at(5), { sender_id: ME, body: 'okay' })],
        list
      )
    ).toBeUndefined();
    expect(
      findDeliveredTwin(
        bubble,
        [server(6, at(5), { sender_id: OTHER, body: 'ok' })],
        list
      )
    ).toBeUndefined();
    const confirmedEarlier = server(6, at(5), {
      sender_id: ME,
      body: 'ok',
      local_id: 'tmp-earlier',
    });
    expect(
      findDeliveredTwin(bubble, [confirmedEarlier], [confirmedEarlier, ...list])
    ).toBeUndefined();
  });

  it('matches a voice note by duration', () => {
    const { id, localId } = nextTempId();
    const list = addPending([], {
      id,
      localId,
      conversationId: 1,
      senderId: ME,
      body: '',
      audio: { uri: 'f', name: 'v', type: 'audio/mp4', duration_seconds: 9 },
    });
    const failed = failPending(list, localId, {
      code: 'NETWORK',
      mayHaveSent: true,
    });
    const delivered = server(6, at(5), {
      type: 'audio',
      sender_id: ME,
      audio: {
        path: 'p',
        duration_seconds: 9,
        mime: 'audio/mp4',
        size_bytes: 1,
      },
    });
    expect(findDeliveredTwin(failed[0], [delivered], failed)).toBe(delivered);
  });

  it('dropDeliveredPending lets one server message account for only one bubble', () => {
    const first = failedBubble('ok', [server(5, at(1))]);
    const second = pend(first.list, 'ok', 6);
    const both = failPending(second.list, second.localId, {
      code: 'NETWORK',
      mayHaveSent: true,
    });
    const next = dropDeliveredPending(both, [
      server(6, at(5), { sender_id: ME, body: 'ok' }),
    ]);
    expect(next.filter(isPending)).toHaveLength(1);
  });
});

// Typing sanity: the chat list state is ChatMessage[], assignable to Message[].
const _assignable: Message[] = [] as ChatMessage[];
void _assignable;
