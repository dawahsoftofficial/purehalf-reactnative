import type { ChatMessage } from './optimisticMessages';
import { canReportMessage, REPORT_REASONS } from './reportMessage';

const ME = 7;
const msg = (extra: Partial<ChatMessage> = {}): ChatMessage =>
  ({
    id: 50,
    conversation_id: 1,
    body: 'hi',
    type: 'text',
    sender_type: 'User',
    sender_id: 9,
    created_at: '2026-10-11T10:00:00+05:00',
    statuses: [],
    audio: null,
    ...extra,
  }) as ChatMessage;

describe('canReportMessage', () => {
  it('allows a confirmed message from the other person', () => {
    expect(canReportMessage(msg(), ME)).toBe(true);
  });

  it('never offers Report on own messages', () => {
    expect(canReportMessage(msg({ sender_id: ME }), ME)).toBe(false);
    expect(canReportMessage(msg({ sender_id: ME }), String(ME))).toBe(false);
  });

  it('never offers Report on optimistic / unsent bubbles', () => {
    expect(canReportMessage(msg({ id: -3, sender_id: 9 }), ME)).toBe(false);
    expect(
      canReportMessage(msg({ send_status: 'failed', sender_id: 9 }), ME)
    ).toBe(false);
  });

  it('is false without a message or a signed-in member', () => {
    expect(canReportMessage(null, ME)).toBe(false);
    expect(canReportMessage(msg(), undefined)).toBe(false);
  });
});

describe('REPORT_REASONS', () => {
  it('stays within the 1000 character reason limit', () => {
    REPORT_REASONS.forEach((reason) =>
      expect(reason.value.length).toBeLessThanOrEqual(1000)
    );
  });
});
