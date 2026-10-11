import { ChatApiError, toChatApiError } from './chat-errors';

const axiosError = (status: number | undefined, data?: unknown) => ({
  isAxiosError: true,
  message: 'Request failed',
  response: status === undefined ? undefined : { status, data },
});

describe('toChatApiError', () => {
  it('prefers the server error_code and uses data.results as the message', () => {
    const err = toChatApiError(
      axiosError(403, {
        message: 'Forbidden',
        error: true,
        code: 403,
        error_code: 'BLOCKED',
        results: "You can't message this member.",
      })
    );
    expect(err).toBeInstanceOf(ChatApiError);
    expect(err.code).toBe('BLOCKED');
    expect(err.message).toBe("You can't message this member.");
    expect(err.status).toBe(403);
  });

  it('keeps error_code even on a 429 status', () => {
    const err = toChatApiError(
      axiosError(429, { error_code: 'WAIT_FOR_REPLY', results: 'Wait' })
    );
    expect(err.code).toBe('WAIT_FOR_REPLY');
  });

  it('falls back to data.message when results is not a string', () => {
    const err = toChatApiError(
      axiosError(422, {
        error_code: 'VALIDATION',
        results: { body: ['required'] },
        message: 'The body field is required.',
      })
    );
    expect(err.code).toBe('VALIDATION');
    expect(err.message).toBe('The body field is required.');
  });

  it('maps HTTP 429 without error_code to RATE_LIMITED', () => {
    const err = toChatApiError(
      axiosError(429, { message: 'Too Many Attempts.' })
    );
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.status).toBe(429);
  });

  it('maps a missing response to NETWORK', () => {
    const err = toChatApiError(axiosError(undefined));
    expect(err.code).toBe('NETWORK');
    expect(err.status).toBeUndefined();
  });

  it('maps the legacy credits text to NO_CHAT_CREDITS', () => {
    const err = toChatApiError(
      axiosError(400, { results: 'You have no chat credits left' })
    );
    expect(err.code).toBe('NO_CHAT_CREDITS');
    expect(err.message).toBe('You have no chat credits left');
  });

  it('maps an unrecognised server error_code to UNKNOWN', () => {
    const err = toChatApiError(
      axiosError(500, { error_code: 'SOMETHING_NEW', results: 'Boom' })
    );
    expect(err.code).toBe('UNKNOWN');
    expect(err.message).toBe('Boom');
  });

  it('wraps a plain string rejection', () => {
    const err = toChatApiError('Failed to start conversation');
    expect(err).toBeInstanceOf(ChatApiError);
    expect(err.code).toBe('UNKNOWN');
    expect(err.message).toBe('Failed to start conversation');
  });

  it('detects the legacy credits text in a plain string', () => {
    const err = toChatApiError('You have no chat credits left');
    expect(err.code).toBe('NO_CHAT_CREDITS');
  });

  it('returns an existing ChatApiError unchanged', () => {
    const original = new ChatApiError('BLOCKED', 'x', 403);
    expect(toChatApiError(original)).toBe(original);
  });

  it('uses a generic message for unknown input', () => {
    const err = toChatApiError(undefined);
    expect(err.code).toBe('UNKNOWN');
    expect(err.message.length).toBeGreaterThan(0);
  });
});
