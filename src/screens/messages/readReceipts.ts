/**
 * Pure read-receipt reducer for the open thread.
 *
 * The server announces `MessageRead` with ONE message id (after "mark all
 * read" it is the latest newly-read message). Reading a message means
 * everything before it was seen too, so the event is applied as "the reader
 * has read everything up to message_id".
 *
 * Keep this module free of React Native imports so it runs in plain jest.
 */
import type { ChatMessage } from './optimisticMessages';

export type ReadUpToEvent = {
  /** Highest message id the reader has now read. */
  messageId: number;
  readerId: number | string;
  readerType?: string;
  /** ISO timestamp of the read. */
  readAt: string;
};

const sameParticipant = (
  sender: Pick<ChatMessage, 'sender_id' | 'sender_type'>,
  reader: Pick<ReadUpToEvent, 'readerId' | 'readerType'>
): boolean =>
  String(sender.sender_id) === String(reader.readerId) &&
  (!sender.sender_type ||
    !reader.readerType ||
    sender.sender_type.toLowerCase() === reader.readerType.toLowerCase());

/**
 * Marks every confirmed message with id <= messageId (except the reader's own)
 * as read by the reader. An earlier `read_at` is never overwritten; a missing
 * `delivered_at` is filled (a read message was delivered). Returns the SAME
 * array when nothing changed.
 */
export function applyReadUpTo(
  messages: ChatMessage[],
  event: ReadUpToEvent
): ChatMessage[] {
  let changed = false;

  const next = messages.map((message) => {
    if (message.id <= 0 || message.id > event.messageId) return message;
    if (message.send_status !== undefined) return message;
    if (sameParticipant(message, event)) return message;

    const statuses = message.statuses ?? [];
    const index = statuses.findIndex(
      (status) => String(status.participant_id) === String(event.readerId)
    );

    if (index === -1) {
      changed = true;
      return {
        ...message,
        statuses: [
          ...statuses,
          {
            participant_type: event.readerType || 'User',
            participant_id: Number(event.readerId),
            delivered_at: event.readAt,
            read_at: event.readAt,
          },
        ],
      };
    }

    if (statuses[index].read_at) return message;

    changed = true;
    return {
      ...message,
      statuses: statuses.map((status, i) =>
        i === index
          ? {
              ...status,
              delivered_at: status.delivered_at ?? event.readAt,
              read_at: event.readAt,
            }
          : status
      ),
    };
  });

  return changed ? next : messages;
}
