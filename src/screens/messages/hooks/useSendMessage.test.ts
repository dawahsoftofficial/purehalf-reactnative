import { act, renderHook } from '@testing-library/react-native';

import type {
  Conversation,
  Message,
} from '../../../services/api/types/message-types';
import type { ChatMessage } from '../optimisticMessages';
import { useSendMessage } from './useSendMessage';

jest.mock('@/services/rating/ratingEngagement', () => ({
  recordSentMessage: jest.fn(),
}));
jest.mock('../../../services', () => ({
  flashErrorMessage: jest.fn(),
}));
jest.mock('../../../services/paywall-service', () => ({
  presentChatCreditsPaywall: jest.fn(),
}));
jest.mock('../../../services/api/message-services', () => ({
  __esModule: true,
  default: {
    startConversation: jest.fn(),
    sendConversationMessage: jest.fn(),
    getConversationWithUser: jest.fn(),
    getConversationMessages: jest.fn(),
  },
}));

// Loaded after the jest.mock calls above (they are hoisted anyway).
import messageServices from '../../../services/api/message-services';

const api = messageServices as unknown as {
  startConversation: jest.Mock;
  sendConversationMessage: jest.Mock;
  getConversationWithUser: jest.Mock;
  getConversationMessages: jest.Mock;
};

const ME = 1;

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/** Lets queued sends (promise chains) run. */
const flush = async () => {
  for (let i = 0; i < 10; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

const serverMessage = (
  id: number,
  conversationId: number,
  body: string
): Message =>
  ({
    id,
    conversation_id: conversationId,
    body,
    type: 'text',
    sender_type: 'User',
    sender_id: ME,
    created_at: '2026-10-12T00:00:00Z',
    statuses: [],
  }) as unknown as Message;

const startedConversation = (id: number, otherId: number) =>
  ({
    id,
    type: 'private',
    created: true,
    last_message_detail: serverMessage(id * 100, id, 'first'),
    participants: [
      { id: ME, type: 'User', last_read_message_id: null },
      { id: otherId, type: 'User', last_read_message_id: null },
    ],
  }) as unknown as Conversation;

type ScreenProps = {
  entryKey: string;
  conversationId: string;
  partnerId: number;
};

const setup = (initial: ScreenProps) => {
  let messages: ChatMessage[] = [];
  const setMessages = jest.fn(
    (update: ChatMessage[] | ((previous: ChatMessage[]) => ChatMessage[])) => {
      messages = typeof update === 'function' ? update(messages) : update;
    }
  );
  const setConversationId = jest.fn();
  const setConversationData = jest.fn();
  const onConversationStarted = jest.fn();
  const onWaitForReply = jest.fn();
  const onBlocked = jest.fn();

  const view = renderHook(
    (props: ScreenProps) =>
      useSendMessage({
        entryKey: props.entryKey,
        otherUserData: { id: props.partnerId },
        conversationData: props.conversationId
          ? ({ id: Number(props.conversationId) } as Conversation)
          : ({} as Conversation),
        setConversationData,
        messages,
        setMessages,
        conversationId: props.conversationId,
        setConversationId,
        currentUserId: ME,
        isBlockedByYou: false,
        setInputMessage: jest.fn(),
        onBlocked,
        onWaitForReply,
        onConversationStarted,
      }),
    { initialProps: initial }
  );

  return {
    ...view,
    getMessages: () => messages,
    /** The screen re-targeted at another chat (onEntryChange clears it). */
    retarget: (next: ScreenProps) => {
      messages = [];
      view.rerender(next);
    },
    setMessages,
    setConversationId,
    setConversationData,
    onConversationStarted,
    onWaitForReply,
    onBlocked,
  };
};

describe('useSendMessage re-target safety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delivers an in-flight and a queued message to the chat they were typed in', async () => {
    const first = deferred<Message>();
    api.sendConversationMessage
      .mockImplementationOnce(() => first.promise)
      .mockImplementation((conversationId: number, payload: { body: string }) =>
        Promise.resolve(serverMessage(500, conversationId, payload.body))
      );

    const screen = setup({
      entryKey: 'c:10',
      conversationId: '10',
      partnerId: 5,
    });

    act(() => {
      screen.result.current.onSendPress('one');
      screen.result.current.onSendPress('two');
    });
    await flush();
    expect(api.sendConversationMessage).toHaveBeenCalledTimes(1);

    // A push for another chat replaces the params while "one" is in flight
    // and "two" is still queued.
    screen.retarget({ entryKey: 'c:20', conversationId: '20', partnerId: 6 });
    act(() => {
      screen.result.current.onSendPress('three');
    });
    const setMessagesCallsBefore = screen.setMessages.mock.calls.length;

    first.resolve(serverMessage(400, 10, 'one'));
    await flush();

    expect(api.sendConversationMessage.mock.calls).toEqual([
      [10, { body: 'one' }],
      [10, { body: 'two' }],
      [20, { body: 'three' }],
    ]);
    // Only "three" (on screen) was resolved in the visible list.
    expect(screen.setMessages.mock.calls.length).toBe(
      setMessagesCallsBefore + 1
    );
    expect(screen.getMessages()).toHaveLength(1);
    expect(screen.getMessages()[0]).toMatchObject({
      body: 'three',
      conversation_id: 20,
    });
  });

  it('a stale "start" result does not change the new chat, and its follow-up still reaches the first member', async () => {
    const start = deferred<Conversation>();
    api.startConversation.mockImplementationOnce(() => start.promise);
    api.startConversation.mockImplementation(
      ({ receiver_id }: { receiver_id: number }) =>
        Promise.resolve(startedConversation(receiver_id * 10, receiver_id))
    );
    api.sendConversationMessage.mockImplementation(
      (conversationId: number, payload: { body: string }) =>
        Promise.resolve(serverMessage(700, conversationId, payload.body))
    );

    // Brand-new chat with member 5 (opened by user id).
    const screen = setup({ entryKey: 'u:5', conversationId: '', partnerId: 5 });
    act(() => {
      screen.result.current.onSendPress('salaam');
      screen.result.current.onSendPress('follow-up');
    });
    await flush();
    expect(api.startConversation).toHaveBeenCalledWith({
      receiver_id: 5,
      body: 'salaam',
    });

    // Re-targeted at a brand-new chat with member 6 before `start` answers.
    screen.retarget({ entryKey: 'u:6', conversationId: '', partnerId: 6 });

    start.resolve(startedConversation(40, 5));
    await flush();

    // The new screen is untouched by member 5's conversation.
    expect(screen.setConversationId).not.toHaveBeenCalled();
    expect(screen.setConversationData).not.toHaveBeenCalled();
    expect(screen.onConversationStarted).not.toHaveBeenCalled();
    // The queued follow-up went to member 5's new conversation.
    expect(api.sendConversationMessage).toHaveBeenCalledWith(40, {
      body: 'follow-up',
    });

    // A message typed to member 6 starts member 6's own conversation.
    act(() => {
      screen.result.current.onSendPress('hello six');
    });
    await flush();
    expect(api.startConversation).toHaveBeenLastCalledWith({
      receiver_id: 6,
      body: 'hello six',
    });
    expect(api.sendConversationMessage).not.toHaveBeenCalledWith(40, {
      body: 'hello six',
    });
    expect(screen.setConversationId).toHaveBeenCalledWith('60');
    expect(screen.onConversationStarted).toHaveBeenCalledTimes(1);
  });

  it('a send that fails after a re-target leaves the new chat alone', async () => {
    const pending = deferred<Message>();
    api.sendConversationMessage.mockImplementationOnce(() => pending.promise);

    const screen = setup({
      entryKey: 'c:10',
      conversationId: '10',
      partnerId: 5,
    });
    act(() => {
      screen.result.current.onSendPress('one');
    });
    await flush();

    screen.retarget({ entryKey: 'c:20', conversationId: '20', partnerId: 6 });
    const setMessagesCallsBefore = screen.setMessages.mock.calls.length;

    pending.reject({ code: 'WAIT_FOR_REPLY', message: 'wait' });
    await flush();

    expect(screen.setMessages.mock.calls.length).toBe(setMessagesCallsBefore);
    expect(screen.onWaitForReply).not.toHaveBeenCalled();
    expect(screen.onBlocked).not.toHaveBeenCalled();
  });

  it('A -> B -> A: a send from the first visit does not touch the second', async () => {
    const pending = deferred<Message>();
    api.sendConversationMessage.mockImplementationOnce(() => pending.promise);

    const screen = setup({
      entryKey: 'c:10',
      conversationId: '10',
      partnerId: 5,
    });
    act(() => {
      screen.result.current.onSendPress('one');
    });
    await flush();

    screen.retarget({ entryKey: 'c:20', conversationId: '20', partnerId: 6 });
    screen.retarget({ entryKey: 'c:10', conversationId: '10', partnerId: 5 });
    const setMessagesCallsBefore = screen.setMessages.mock.calls.length;

    pending.resolve(serverMessage(400, 10, 'one'));
    await flush();

    expect(screen.setMessages.mock.calls.length).toBe(setMessagesCallsBefore);
  });

  it('without re-target, the first message of a new chat updates the screen and the next one follows up', async () => {
    api.startConversation.mockResolvedValue(startedConversation(40, 5));
    api.sendConversationMessage.mockImplementation(
      (conversationId: number, payload: { body: string }) =>
        Promise.resolve(serverMessage(700, conversationId, payload.body))
    );

    const screen = setup({ entryKey: 'u:5', conversationId: '', partnerId: 5 });
    act(() => {
      screen.result.current.onSendPress('salaam');
      screen.result.current.onSendPress('again');
    });
    await flush();

    expect(api.startConversation).toHaveBeenCalledTimes(1);
    expect(screen.setConversationId).toHaveBeenCalledWith('40');
    expect(screen.onConversationStarted).toHaveBeenCalledTimes(1);
    expect(api.sendConversationMessage).toHaveBeenCalledWith(40, {
      body: 'again',
    });
    expect(screen.getMessages().every((m) => m.send_status === undefined)).toBe(
      true
    );
  });
});
