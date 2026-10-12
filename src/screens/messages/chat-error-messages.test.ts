import { ChatApiError } from '../../services/api/chat-errors';
import { chatErrorMessageKey } from './chat-error-messages';

describe('chatErrorMessageKey', () => {
  it('maps coded errors to their localized key', () => {
    expect(chatErrorMessageKey(new ChatApiError('BLOCKED', 'x'))).toBe(
      'chatErrorBlocked'
    );
    expect(chatErrorMessageKey(new ChatApiError('NETWORK', 'x'))).toBe(
      'chatErrorNetwork'
    );
  });

  it('falls back to the generic key for UNKNOWN/VALIDATION', () => {
    expect(chatErrorMessageKey(new ChatApiError('UNKNOWN', 'raw'))).toBe(
      'commonErrorMessage'
    );
    expect(chatErrorMessageKey(new ChatApiError('VALIDATION', 'raw'))).toBe(
      'commonErrorMessage'
    );
  });

  it('classifies arbitrary thrown values', () => {
    expect(chatErrorMessageKey(new Error('boom'))).toBe('commonErrorMessage');
    expect(
      chatErrorMessageKey({
        isAxiosError: true,
        response: { status: 403, data: { error_code: 'BLOCKED' } },
      })
    ).toBe('chatErrorBlocked');
  });
});
