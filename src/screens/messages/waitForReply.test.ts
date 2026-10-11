import type { ChatMessage } from './optimisticMessages';
import {
  hasOtherReplied,
  isWaitingForReply,
  startedFreshConversation,
} from './waitForReply';

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
  createdHere: true,
  serverSaysWait: false,
};

describe('startedFreshConversation', () => {
  const participant = (id: number, lastRead: number | null) => ({
    id,
    type: 'User',
    name: 'x',
    image: '',
    is_blocked: 0,
    last_seen_at: null,
    last_read_message_id: lastRead,
    unread_count: 0,
  });
  const conversation = (...participants: ReturnType<typeof participant>[]) =>
    ({ id: 1, participants }) as never;

  it('is true when the partner has not read anything yet', () => {
    expect(
      startedFreshConversation(
        conversation(participant(ME, null), participant(9, null)),
        ME
      )
    ).toBe(true);
  });

  it('is false when the partner has read messages: the chat already existed', () => {
    expect(
      startedFreshConversation(
        conversation(participant(ME, null), participant(9, 40)),
        ME
      )
    ).toBe(false);
  });

  it('is false without participants', () => {
    expect(startedFreshConversation({ id: 1 } as never, ME)).toBe(false);
  });
});

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

  it('never pre-blocks a conversation this screen did not create (e.g. after Clear chat)', () => {
    // Clear chat hides the partner's earlier reply, so [his message] looks
    // like "never replied" although the server will allow the send.
    expect(
      isWaitingForReply({
        ...base,
        createdHere: false,
        messages: [mine(2), mine(1)],
      })
    ).toBe(false);
  });

  it('does not pre-block when start appended to an existing conversation', () => {
    // onConversationStarted is not called for an append, so createdHere stays false.
    expect(
      isWaitingForReply({ ...base, createdHere: false, messages: [mine(1)] })
    ).toBe(false);
  });

  it('locks a brand-new chat after the first message, until the reply', () => {
    expect(isWaitingForReply({ ...base, messages: [mine(1)] })).toBe(true);
    expect(isWaitingForReply({ ...base, messages: [msg(2), mine(1)] })).toBe(
      false
    );
  });

  it('blocks on the server saying so, even in a conversation not created here', () => {
    expect(
      isWaitingForReply({
        ...base,
        createdHere: false,
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
