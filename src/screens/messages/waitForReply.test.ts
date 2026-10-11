import type { ChatMessage } from './optimisticMessages';
import { hasOtherReplied, isWaitingForReply } from './waitForReply';

const ME = 7;
const msg = (id: number, extra: Partial<ChatMessage> = {}): ChatMessage =>
  ({
    id,
    conversation_id: 1,
    body: `m${id}`,
    type: 'text',
    sender_type: 'User',
    sender_id: 9,
    created_at: '2026-10-11T10:00:00+05:00',
    statuses: [],
    audio: null,
    ...extra,
  }) as ChatMessage;
const mine = (id: number, extra: Partial<ChatMessage> = {}) =>
  msg(id, { sender_id: ME, ...extra });

const base = {
  gender: 'male',
  currentUserId: ME,
  historyComplete: true,
  serverSaysWait: false,
};

describe('isWaitingForReply', () => {
  it('blocks a man whose only messages are his own (full history)', () => {
    expect(isWaitingForReply({ ...base, messages: [mine(2), mine(1)] })).toBe(
      true
    );
  });

  it('never blocks women', () => {
    expect(
      isWaitingForReply({ ...base, gender: 'female', messages: [mine(1)] })
    ).toBe(false);
    expect(
      isWaitingForReply({
        ...base,
        gender: 'female',
        serverSaysWait: true,
        messages: [mine(1)],
      })
    ).toBe(false);
  });

  it('allows the first message of an empty chat', () => {
    expect(isWaitingForReply({ ...base, messages: [] })).toBe(false);
  });

  it('is unlocked once the other member has replied, even after his later messages', () => {
    expect(
      isWaitingForReply({
        ...base,
        messages: [mine(3), msg(2), mine(1)],
      })
    ).toBe(false);
  });

  it('counts a staff reply as a reply, like the server does', () => {
    expect(
      isWaitingForReply({
        ...base,
        messages: [msg(2, { sender_type: 'Admin', sender_id: 1 }), mine(1)],
      })
    ).toBe(false);
  });

  it('does not block when history is incomplete and no reply is loaded', () => {
    expect(
      isWaitingForReply({
        ...base,
        historyComplete: false,
        messages: [mine(2), mine(1)],
      })
    ).toBe(false);
  });

  it('blocks on the server saying so, even with incomplete history', () => {
    expect(
      isWaitingForReply({
        ...base,
        historyComplete: false,
        serverSaysWait: true,
        messages: [mine(1)],
      })
    ).toBe(true);
  });

  it('unlocks immediately when a reply arrives, whatever the server said', () => {
    expect(
      isWaitingForReply({
        ...base,
        serverSaysWait: true,
        messages: [msg(5), mine(1)],
      })
    ).toBe(false);
  });

  it('blocks right after sending (message in flight or just confirmed)', () => {
    expect(
      isWaitingForReply({
        ...base,
        messages: [mine(-1, { send_status: 'sending' })],
      })
    ).toBe(true);
  });

  it('does not count a failed bubble that never reached the server', () => {
    expect(
      isWaitingForReply({
        ...base,
        messages: [mine(-1, { send_status: 'failed', may_have_sent: false })],
      })
    ).toBe(false);
    expect(
      isWaitingForReply({
        ...base,
        messages: [mine(-1, { send_status: 'failed', may_have_sent: true })],
      })
    ).toBe(true);
  });

  it('ignores unsent bubbles when deciding whether the other side replied', () => {
    expect(
      hasOtherReplied(
        [msg(-2, { send_status: 'sending', sender_id: 9 }), mine(1)],
        ME
      )
    ).toBe(false);
  });
});
