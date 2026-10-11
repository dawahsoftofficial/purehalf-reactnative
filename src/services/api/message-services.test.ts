import { ChatApiError } from './chat-errors';
import EndPoints from './EndPoints';
import messageServices from './message-services';
import { Api } from './Middleware';

jest.mock('./Middleware', () => ({
  Api: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));

describe('messageServices audio messages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends text messages as JSON payloads', async () => {
    (Api.post as jest.Mock).mockResolvedValue({
      data: {
        error: false,
        results: {
          id: 1,
          conversation_id: 2,
          body: 'Assalamu alaikum',
          type: 'text',
          sender_type: 'User',
          sender_id: 3,
          created_at: '2026-07-05 10:00:00',
          statuses: [],
          audio: null,
        },
      },
    });

    await messageServices.sendConversationMessage(2, {
      type: 'text',
      body: 'Assalamu alaikum',
    });

    expect(Api.post).toHaveBeenCalledWith(
      EndPoints.sendConversationMessage(2),
      { type: 'text', body: 'Assalamu alaikum' }
    );
  });

  it('sends audio messages as form data', async () => {
    (Api.post as jest.Mock).mockResolvedValue({
      data: {
        error: false,
        results: {
          id: 1,
          conversation_id: 2,
          body: 'Voice message',
          type: 'audio',
          sender_type: 'User',
          sender_id: 3,
          created_at: '2026-07-05 10:00:00',
          statuses: [],
          audio: {
            path: 'pure-half/chat-audio/2/voice.m4a',
            duration_seconds: 12,
            mime: 'audio/mp4',
            size_bytes: 100,
          },
        },
      },
    });

    await messageServices.sendConversationMessage(2, {
      type: 'audio',
      audio: {
        uri: 'file:///tmp/voice.m4a',
        name: 'voice.m4a',
        type: 'audio/mp4',
      },
      duration_seconds: 12,
      waveform_peaks: [0.1, 0.5, 0.9],
    });

    const [, payload] = (Api.post as jest.Mock).mock.calls[0];
    expect(payload).toBeInstanceOf(FormData);
    const payloadEntries = (payload as any)._parts
      ? (payload as any)._parts
      : Array.from((payload as any).entries());
    expect(payloadEntries).toContainEqual([
      'waveform_peaks',
      JSON.stringify([0.1, 0.5, 0.9]),
    ]);
  });

  it('fetches a temporary audio playback url', async () => {
    (Api.get as jest.Mock).mockResolvedValue({
      data: {
        error: false,
        results: {
          url: 'https://signed.example.test/audio.m4a',
          expires_at: '2026-07-05 10:05:00',
        },
      },
    });

    const result = await messageServices.getMessageAudioUrl(55);

    expect(Api.get).toHaveBeenCalledWith(EndPoints.getMessageAudioUrl(55));
    expect(result.url).toBe('https://signed.example.test/audio.m4a');
  });
});

describe('messageServices coded errors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects startConversation with a ChatApiError carrying the server code', async () => {
    (Api.post as jest.Mock).mockRejectedValue({
      response: {
        status: 402,
        data: {
          error: true,
          error_code: 'NO_CHAT_CREDITS',
          results: 'You have no chat credits left',
        },
      },
    });

    const rejection = messageServices.startConversation({
      receiver_id: 9,
      body: 'Salam',
    });

    await expect(rejection).rejects.toBeInstanceOf(ChatApiError);
    await expect(rejection).rejects.toMatchObject({
      code: 'NO_CHAT_CREDITS',
      status: 402,
      message: 'You have no chat credits left',
    });
  });

  it('rejects with NETWORK when there is no response (timeout/offline)', async () => {
    (Api.post as jest.Mock).mockRejectedValue({
      message: 'timeout of 20000ms exceeded',
    });

    await expect(
      messageServices.sendConversationMessage(2, { type: 'text', body: 'hi' })
    ).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('rejects an error:true 200 response with a ChatApiError', async () => {
    (Api.get as jest.Mock).mockResolvedValue({
      data: { error: true, message: 'Nope' },
    });

    await expect(messageServices.getConversationsList()).rejects.toBeInstanceOf(
      ChatApiError
    );
  });

  it('gives voice notes a longer upload timeout than text', async () => {
    (Api.post as jest.Mock).mockResolvedValue({
      data: { error: false, results: { id: 1 } },
    });

    await messageServices.sendConversationMessage(2, {
      type: 'audio',
      audio: { uri: 'file:///tmp/v.m4a', name: 'v.m4a', type: 'audio/mp4' },
      duration_seconds: 3,
    });

    expect((Api.post as jest.Mock).mock.calls[0][2]).toEqual({
      timeout: 60000,
    });
  });
});
