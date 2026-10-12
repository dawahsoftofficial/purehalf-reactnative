import { act, renderHook, waitFor } from '@testing-library/react-native';

import type { Conversation } from '../../../services/api/types/message-types';
import { getSendTarget, threadSyncKey } from '../SingleChat.routing';
import {
  type ChatResolutionServices,
  useChatResolution,
} from './useChatResolution';

const ME = 1;

const participant = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'User',
  name: `User ${id}`,
  image: `u${id}.jpg`,
  is_blocked: 0,
  last_seen_at: null,
  last_read_message_id: null,
  unread_count: 0,
  ...extra,
});

const conversation = (
  id: number,
  otherId: number,
  otherExtra: Record<string, unknown> = {}
) =>
  ({
    id,
    type: 'private',
    last_message: '',
    last_message_at: '',
    last_message_detail: null,
    participants: [participant(ME), participant(otherId, otherExtra)],
  }) as unknown as Conversation;

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const makeServices = (overrides: Partial<ChatResolutionServices> = {}) => ({
  // Default: an older backend without GET /conversations/{id}.
  getConversation: jest.fn().mockRejectedValue(new Error('404')),
  getConversationWithUser: jest.fn().mockResolvedValue(null),
  getUserDetail: jest.fn().mockResolvedValue({}),
  ...overrides,
});

const setup = (
  routeParams: unknown,
  services: ChatResolutionServices,
  onEntryChange?: () => void
) =>
  renderHook(
    (props: { routeParams: unknown }) =>
      useChatResolution({
        routeParams: props.routeParams,
        currentUserId: ME,
        services,
        onEntryChange,
      }),
    { initialProps: { routeParams } }
  );

describe('useChatResolution', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('conversationId-only entry resolves with the id and the existing send path', async () => {
    const services = makeServices();
    const { result } = setup({ conversationId: 12 }, services);

    await waitFor(() => expect(result.current.partnerSettled).toBe(true));

    expect(result.current.conversationId).toBe('12');
    expect(result.current.conversationData.id).toBe(12);
    expect(
      getSendTarget(
        result.current.conversationData,
        result.current.conversationId
      )
    ).toEqual({ kind: 'existing', conversationId: 12 });
    expect(services.getConversationWithUser).not.toHaveBeenCalled();
  });

  describe('conversationId entry (push notification)', () => {
    it('fills partner, block flags and deleted state from getConversation', async () => {
      const conv = conversation(12, 5, {
        is_blocked: 1,
        name: 'Deleted member',
        image: '',
        is_deleted: true,
      });
      const services = makeServices({
        getConversation: jest.fn().mockResolvedValue(conv),
      });
      const { result } = setup({ conversationId: 12 }, services);

      await waitFor(() => expect(result.current.partnerSettled).toBe(true));

      expect(services.getConversation).toHaveBeenCalledWith('12');
      expect(result.current.conversationData.participants).toHaveLength(2);
      expect(result.current.isBlockedByYou).toBe(true);
      expect(result.current.isPartnerDeleted).toBe(true);
      expect(result.current.otherUserData).toMatchObject({
        id: 5,
        name: 'Deleted member',
      });
      // No partner id was needed, and nothing else is looked up.
      expect(services.getConversationWithUser).not.toHaveBeenCalled();
      expect(services.getUserDetail).not.toHaveBeenCalled();
    });

    it('prefers getConversation over the user lookup when both are possible', async () => {
      const services = makeServices({
        getConversation: jest.fn().mockResolvedValue(conversation(12, 5)),
      });
      const { result } = setup(
        { conversationId: 12, otherUserData: { id: 5, name: 'Pushed' } },
        services
      );

      await waitFor(() => expect(result.current.partnerSettled).toBe(true));

      expect(services.getConversationWithUser).not.toHaveBeenCalled();
      // Route data wins for a live member.
      expect(result.current.otherUserData.name).toBe('Pushed');
    });

    it('falls back to the push payload user and the user lookup when getConversation fails', async () => {
      const services = makeServices({
        getConversationWithUser: jest
          .fn()
          .mockResolvedValue(conversation(12, 5)),
      });
      const { result } = setup(
        {
          conversationId: 12,
          otherUserData: { id: 5, name: 'Pushed', image: 'p.jpg' },
        },
        services
      );

      await waitFor(() => expect(result.current.partnerSettled).toBe(true));

      expect(services.getConversation).toHaveBeenCalledTimes(1);
      expect(services.getConversationWithUser).toHaveBeenCalledWith(5);
      expect(result.current.conversationId).toBe('12');
      expect(result.current.otherUserData.name).toBe('Pushed');
    });

    it('keeps the payload partner and the existing send path when everything fails', async () => {
      const services = makeServices({
        getConversationWithUser: jest.fn().mockRejectedValue(new Error('x')),
      });
      const { result } = setup(
        { conversationId: 12, otherUserData: { id: 5, name: 'Pushed' } },
        services
      );

      await waitFor(() => expect(result.current.partnerSettled).toBe(true));

      expect(result.current.otherUserData).toMatchObject({
        id: 5,
        name: 'Pushed',
      });
      expect(
        getSendTarget(
          result.current.conversationData,
          result.current.conversationId
        )
      ).toEqual({ kind: 'existing', conversationId: 12 });
      expect(result.current.loadError).toBeNull();
    });

    it('ignores a getConversation answer for a different conversation', async () => {
      const services = makeServices({
        getConversation: jest.fn().mockResolvedValue(conversation(99, 5)),
      });
      const { result } = setup({ conversationId: 12 }, services);

      await waitFor(() => expect(result.current.partnerSettled).toBe(true));

      expect(result.current.conversationId).toBe('12');
      expect(result.current.conversationData.id).toBe(12);
    });

    it('drops a stale getConversation answer when the entry changes', async () => {
      const first = deferred<Conversation>();
      const services = makeServices({
        getConversation: jest
          .fn()
          .mockReturnValueOnce(first.promise)
          .mockRejectedValue(new Error('404')),
      });
      const { result, rerender } = setup({ conversationId: 12 }, services);

      rerender({ routeParams: { conversationId: 13 } });
      await waitFor(() => expect(result.current.conversationId).toBe('13'));

      await act(async () => {
        first.resolve(conversation(12, 5, { is_blocked: 1 }));
      });

      expect(result.current.conversationId).toBe('13');
      expect(result.current.isBlockedByYou).toBe(false);
    });
  });

  it('an id entry (push) can send at once while the lookups are still running', async () => {
    const lookup = deferred<Conversation>();
    const services = makeServices({
      getConversation: jest.fn().mockReturnValue(lookup.promise),
    });
    const { result } = setup(
      { conversationId: 12, otherUserData: { id: 5 } },
      services
    );

    await waitFor(() => expect(result.current.resolved).toBe(true));
    expect(result.current.partnerSettled).toBe(false);
    expect(
      getSendTarget(
        result.current.conversationData,
        result.current.conversationId
      )
    ).toEqual({ kind: 'existing', conversationId: 12 });
    // No profile visit before the lookup says who (and whether deleted).
    expect(services.getUserDetail).not.toHaveBeenCalled();

    await act(async () => {
      lookup.resolve(conversation(12, 5));
    });
    expect(result.current.partnerSettled).toBe(true);
    expect(result.current.otherUserData).toMatchObject({ name: 'User 5' });
  });

  it('a push for the chat already open by user id changes the entry but not the id', async () => {
    const services = makeServices({
      getConversationWithUser: jest.fn().mockResolvedValue(conversation(10, 5)),
      getConversation: jest.fn().mockResolvedValue(conversation(10, 5)),
    });
    const onEntryChange = jest.fn();
    const { result, rerender } = setup({ userId: 5 }, services, onEntryChange);
    await waitFor(() => expect(result.current.conversationId).toBe('10'));
    const before = threadSyncKey(
      result.current.conversationId,
      result.current.entryGeneration
    );

    rerender({ routeParams: { conversationId: 10 } });
    await waitFor(() => expect(result.current.partnerSettled).toBe(true));

    // Messages were cleared (onEntryChange) and conversationId ends where it
    // started, so a thread effect keyed on the id alone would never refetch.
    expect(onEntryChange).toHaveBeenCalledTimes(1);
    expect(result.current.conversationId).toBe('10');
    expect(result.current.entryKey).toBe('c:10');
    expect(
      threadSyncKey(
        result.current.conversationId,
        result.current.entryGeneration
      )
    ).not.toBe(before);
  });

  it('re-targeting A -> B moves the thread key straight from A to B', async () => {
    const services = makeServices();
    const keys: (string | null)[] = [];
    const { rerender } = renderHook(
      (props: { routeParams: unknown }) => {
        const state = useChatResolution({
          routeParams: props.routeParams,
          currentUserId: ME,
          services,
        });
        keys.push(threadSyncKey(state.conversationId, state.entryGeneration));
        return state;
      },
      {
        initialProps: {
          routeParams: { conversationData: conversation(10, 5) },
        },
      }
    );
    await waitFor(() => expect(keys).toContain('0|10'));

    rerender({ routeParams: { conversationData: conversation(20, 6) } });
    await waitFor(() => expect(keys).toContain('1|20'));

    // Never "new entry, old conversation": the thread is fetched and
    // subscribed once per re-target, never for the chat being left.
    const distinct = keys.filter(
      (key, index) => key !== null && keys.indexOf(key) === index
    );
    expect(distinct).toEqual(['0|10', '1|20']);
  });

  it('keeps the existing send path and skips getUserDetail when the participant lookup fails', async () => {
    const services = makeServices({
      getConversationWithUser: jest.fn().mockRejectedValue(new Error('boom')),
    });
    const { result } = setup(
      { conversationId: 12, otherUserData: { id: 5 } },
      services
    );

    await waitFor(() => expect(result.current.partnerSettled).toBe(true));

    expect(result.current.conversationData.id).toBe(12);
    expect(
      getSendTarget(
        result.current.conversationData,
        result.current.conversationId
      )
    ).toEqual({ kind: 'existing', conversationId: 12 });
    // Deleted state is unknown, so no profile visit may be recorded.
    expect(services.getUserDetail).not.toHaveBeenCalled();
  });

  it('keeps the existing send path when the lookup returns a different conversation', async () => {
    const services = makeServices({
      getConversationWithUser: jest.fn().mockResolvedValue(conversation(99, 5)),
    });
    const { result } = setup(
      { conversationId: 12, otherUserData: { id: 5 } },
      services
    );

    await waitFor(() => expect(result.current.partnerSettled).toBe(true));

    expect(result.current.conversationId).toBe('12');
    expect(result.current.conversationData.id).toBe(12);
  });

  it('applies the matching lookup result (block flags, partner)', async () => {
    const conv = conversation(12, 5);
    (conv.participants[1] as { is_blocked: number }).is_blocked = 1;
    const services = makeServices({
      getConversationWithUser: jest.fn().mockResolvedValue(conv),
    });
    const { result } = setup(
      { conversationId: '12', otherUserData: { id: 5 } },
      services
    );

    await waitFor(() => expect(result.current.partnerSettled).toBe(true));

    expect(result.current.conversationData.participants).toHaveLength(2);
    expect(result.current.isBlockedByYou).toBe(true);
    expect(result.current.otherUserData).toMatchObject({
      id: 5,
      name: 'User 5',
    });
  });

  it('userId entry with a null lookup starts a new chat and clears the loader', async () => {
    const services = makeServices();
    const { result } = setup({ userId: 8 }, services);
    expect(result.current.loader).toBe(true);

    await waitFor(() => expect(result.current.partnerSettled).toBe(true));

    expect(services.getConversationWithUser).toHaveBeenCalledWith(8);
    expect(result.current.loader).toBe(false);
    expect(result.current.conversationId).toBe('');
    expect(result.current.loadError).toBeNull();
    expect(
      getSendTarget(
        result.current.conversationData,
        result.current.conversationId
      )
    ).toEqual({ kind: 'new' });
  });

  it('userId entry with a conversation applies it (loader is left to the message fetch)', async () => {
    const services = makeServices({
      getConversationWithUser: jest.fn().mockResolvedValue(conversation(7, 8)),
    });
    const { result } = setup({ userId: 8 }, services);

    await waitFor(() => expect(result.current.partnerSettled).toBe(true));

    expect(result.current.conversationId).toBe('7');
    expect(result.current.loader).toBe(true);
    expect(result.current.loadError).toBeNull();
  });

  it('a lookup error sets loadError, clears the loader and can be retried', async () => {
    const lookup = jest
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(null);
    const services = makeServices({ getConversationWithUser: lookup });
    const { result } = setup({ userId: 8 }, services);

    await waitFor(() => expect(result.current.loadError).toBe('resolve'));
    expect(result.current.loader).toBe(false);
    expect(result.current.resolved).toBe(false);

    act(() => result.current.retryResolution());

    await waitFor(() => expect(result.current.partnerSettled).toBe(true));
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(result.current.loadError).toBeNull();
    expect(result.current.loader).toBe(false);
  });

  it('an entry that identifies nothing shows the error state, not a spinner', async () => {
    const { result } = setup({}, makeServices());

    await waitFor(() => expect(result.current.loadError).toBe('resolve'));
    expect(result.current.loader).toBe(false);
  });

  it('a deleted partner never triggers getUserDetail and keeps the payload name', async () => {
    const conv = conversation(7, 8, {
      name: 'Deleted member',
      image: '',
      is_deleted: true,
    });
    const services = makeServices();
    const { result } = setup(
      { conversationData: conv, otherUserData: { id: 8 } },
      services
    );

    await waitFor(() => expect(result.current.partnerSettled).toBe(true));

    expect(result.current.isPartnerDeleted).toBe(true);
    expect(result.current.otherUserData.name).toBe('Deleted member');
    expect(services.getUserDetail).not.toHaveBeenCalled();
  });

  it('skips getUserDetail when the payload already has name and image', async () => {
    const services = makeServices();
    const { result } = setup(
      { conversationData: conversation(7, 8) },
      services
    );

    await waitFor(() => expect(result.current.partnerSettled).toBe(true));
    expect(services.getUserDetail).not.toHaveBeenCalled();
  });

  it('calls getUserDetail once when the header lacks name/image', async () => {
    const services = makeServices({
      getUserDetail: jest.fn().mockResolvedValue({
        full_name: 'Aisha Khan',
        primary_image_to_show: 'a.jpg',
      }),
    });
    const { result } = setup({ userId: 8 }, services);

    await waitFor(() =>
      expect(result.current.otherUserData.name).toBe('Aisha Khan')
    );
    expect(result.current.otherUserData.image).toBe('a.jpg');
    expect(services.getUserDetail).toHaveBeenCalledTimes(1);
    expect(services.getUserDetail).toHaveBeenCalledWith(8);
  });

  it('ignores a stale lookup result when the entry changes mid-flight', async () => {
    const first = deferred<Conversation | null>();
    const second = deferred<Conversation | null>();
    const lookup = jest
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const onEntryChange = jest.fn();
    const services = makeServices({ getConversationWithUser: lookup });
    const { result, rerender } = setup({ userId: 8 }, services, onEntryChange);

    rerender({ routeParams: { userId: 9 } });
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(2));
    expect(onEntryChange).toHaveBeenCalledTimes(1);

    // The old entry's answer arrives late and must be dropped.
    await act(async () => {
      first.resolve(conversation(7, 8));
    });
    expect(result.current.conversationId).toBe('');
    expect(result.current.resolved).toBe(false);

    await act(async () => {
      second.resolve(null);
    });
    await waitFor(() => expect(result.current.partnerSettled).toBe(true));
    expect(result.current.conversationId).toBe('');
    expect(result.current.loader).toBe(false);
    expect(result.current.otherUserData.id).toBe(9);
  });

  it('ignores a stale lookup error when the entry changes mid-flight', async () => {
    const first = deferred<Conversation | null>();
    const lookup = jest
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(null);
    const services = makeServices({ getConversationWithUser: lookup });
    const { result, rerender } = setup({ userId: 8 }, services);

    rerender({ routeParams: { userId: 9 } });
    await waitFor(() => expect(result.current.partnerSettled).toBe(true));

    await act(async () => {
      first.reject(new Error('late failure'));
    });
    expect(result.current.loadError).toBeNull();
    expect(result.current.resolved).toBe(true);
  });

  it('ignores a stale getUserDetail result when the entry changes', async () => {
    const detail = deferred<unknown>();
    const services = makeServices({
      getUserDetail: jest
        .fn()
        .mockReturnValueOnce(detail.promise)
        .mockResolvedValue({ full_name: 'Fresh Person' }),
    });
    const { result, rerender } = setup({ userId: 8 }, services);

    await waitFor(() => expect(services.getUserDetail).toHaveBeenCalled());
    rerender({ routeParams: { userId: 9 } });
    await waitFor(() =>
      expect(result.current.otherUserData.name).toBe('Fresh Person')
    );

    await act(async () => {
      detail.resolve({
        full_name: 'Stale Person',
        primary_image_to_show: 's.jpg',
      });
    });

    // Only the new entry's own detail may land.
    expect(result.current.otherUserData.name).toBe('Fresh Person');
  });
});
