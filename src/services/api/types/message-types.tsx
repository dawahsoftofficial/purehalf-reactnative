/**
 * TypeScript types for Message API endpoints
 * Based on Swagger API specifications
 */

/**
 * Participant in a conversation
 */
export type Participant = {
  id: number;
  type: string;
  name: string;
  image: string;
  is_blocked: number | boolean; // Backend sends 0/1, but can be boolean
  last_seen_at: string | null;
  last_read_message_id: number | null;
  unread_count: number;
  /** True when the member's account is gone (name/image come from a snapshot). */
  is_deleted?: boolean;
};

/**
 * Message status (delivery/read status)
 */
export type MessageStatus = {
  participant_type: string;
  participant_id: number;
  delivered_at: string | null;
  read_at: string | null;
};

/**
 * Audio attachment metadata for a voice message
 */
export type MessageAudio = {
  path: string;
  duration_seconds: number;
  mime: string;
  size_bytes: number;
  waveform_peaks?: number[] | null;
};

/**
 * Message object (used in messages list and last message detail)
 */
export type Message = {
  id: number;
  conversation_id: number;
  body: string;
  type: string;
  sender_type: string;
  sender_id: number;
  created_at: string;
  statuses: MessageStatus[];
  audio?: MessageAudio | null;
};

/**
 * Last message details in a conversation (alias for Message)
 */
export type LastMessageDetail = Message;

/**
 * Conversation object from API
 */
export type Conversation = {
  id: number;
  type: string;
  last_message: string;
  last_message_at: string;
  participants: Participant[];
  last_message_detail: LastMessageDetail | null;
};

/**
 * Start Conversation Request Payload
 */
export type StartConversationPayload = {
  receiver_id: number;
  body: string;
};

/**
 * Start Conversation Response
 */
export type StartConversationResponse = {
  message: string;
  error: boolean;
  code: number;
  results: Conversation;
};

/**
 * Get Conversation With User Response
 * `results` is null when the caller has no private conversation with the member.
 */
export type GetConversationWithUserResponse = {
  message: string;
  error: boolean;
  code: number;
  results: Conversation | null;
};

/**
 * Get Conversation Response
 * A single conversation the caller participates in (403 FORBIDDEN otherwise).
 */
export type GetConversationResponse = {
  message: string;
  error: boolean;
  code: number;
  results: Conversation;
};

/**
 * Get Conversations List Query Parameters
 */
export type GetConversationsListParams = {
  per_page?: number;
};

/**
 * Get Conversations List Response
 */
export type GetConversationsListResponse = {
  message: string;
  error: boolean;
  code: number;
  results: Conversation[];
};

/**
 * Get Conversation Messages Query Parameters
 */
export type GetConversationMessagesParams = {
  per_page?: number;
  page?: number;
};

/**
 * Get Conversation Messages Response
 */
export type GetConversationMessagesResponse = {
  message: string;
  error: boolean;
  code: number;
  results: Message[];
};

/**
 * File reference used to upload an audio recording as multipart form data
 */
export type AudioUploadFile = {
  uri: string;
  name: string;
  type: string;
};

/**
 * Send Conversation Message Request Payload (text variant)
 */
export type SendTextConversationMessagePayload = {
  type?: 'text';
  body: string;
};

/**
 * Send Conversation Message Request Payload (audio variant)
 */
export type SendAudioConversationMessagePayload = {
  type: 'audio';
  audio: AudioUploadFile;
  duration_seconds: number;
  waveform_peaks?: number[];
};

/**
 * Send Conversation Message Request Payload
 */
export type SendConversationMessagePayload =
  | SendTextConversationMessagePayload
  | SendAudioConversationMessagePayload;

/**
 * Send Conversation Message Response
 */
export type SendConversationMessageResponse = {
  message: string;
  error: boolean;
  code: number;
  results: Message;
};

/**
 * Get Message Audio Url Response
 */
export type GetMessageAudioUrlResponse = {
  message: string;
  error: boolean;
  code: number;
  results: {
    url: string;
    expires_at: string;
  };
};

/**
 * Report Message Request Payload
 */
export type ReportMessagePayload = {
  reason: string;
};

/**
 * Standard API Response (for operations without specific return data)
 */
export type StandardResponse = {
  message: string;
  error: boolean;
  code: number;
  results?: unknown;
};

/**
 * Pusher Event Data Types
 * These types represent the data structure sent from backend via Pusher events
 */

/**
 * MessageSent event data (from Pusher)
 * Nested structure with message and conversation objects
 */
export type MessageSentEventData = {
  event: 'MessageSent';
  message: {
    id: number;
    conversation_id: number;
    body: string;
    type: string;
    sender_type: string;
    sender_id: number;
    created_at: string;
    statuses?: MessageStatus[];
    audio?: MessageAudio | null;
  };
  conversation: {
    id: number;
    last_message: string;
    last_message_at: string;
    participants: Array<{
      id: number;
      unread_count: number;
    }>;
  };
};

/**
 * MessageRead event data (from Pusher)
 */
export type MessageReadEventData = {
  event?: string;
  message_id: number;
  conversation_id?: number; // May not be in event, will be extracted from message
  read_by: {
    id: number;
    type: string;
  };
  read_at?: string; // May not be in event, will use current timestamp if missing
};

/**
 * MessageDelivered event data (from Pusher)
 */
export type MessageDeliveredEventData = {
  event?: string;
  message_id: number;
  conversation_id?: number; // May not be in event, will be extracted from message
  delivered_by: {
    id: number;
    type: string;
  };
  delivered_at?: string; // May not be in event, will use current timestamp if missing
};

/**
 * NewConversationCreated event data (from Pusher)
 * Sent on user channel when a new conversation is created
 */
export type NewConversationCreatedEventData = {
  event: 'NewConversationCreated';
  conversation: Conversation;
};

/**
 * ConversationUpdated event data (from Pusher)
 * Sent on user channel when conversation is updated (message sent, read, etc.)
 */
export type ConversationUpdatedEventData = {
  event: 'ConversationUpdated';
  update_type: 'sent' | 'read' | 'delivered' | string;
  conversation: Conversation;
};

/**
 * Counter participant data structure
 * Contains user counter information (unread counts, chat credits, etc.)
 */
export type CounterParticipant = {
  id: number;
  unread_conversations_count?: number;
  unread_messages_count?: string | number;
  chat_credits?: number;
  last_chat_credit_collected_at?: string | null;
  like_count?: number;
  visit_count?: number;
  photo_request_count?: number;
  photo_approval_count?: number;
};

/**
 * CounterUpdate event data (from Pusher)
 * Sent on private-user.counters.{userId} channel to update user counters
 * This is the normalized event type when event.eventName is normalized to 'counterUpdate'
 */
export type CounterUpdateEventData = {
  event: 'counterUpdate';
  participant: CounterParticipant;
};

/**
 * UnreadConversationCounter event data (from Pusher)
 * Sent on user channel to update unread conversation and message counts
 * Note: This event may also include chat_credits and last_chat_credit_collected_at
 * when sent via the counters channel
 */
export type UnreadConversationCounterEventData = {
  event: 'UnreadConversationCounter' | 'counterUpdate';
  participant: CounterParticipant;
};

/**
 * ParticipantBlocked event data (from Pusher)
 */
export type ParticipantBlockedEventData = {
  conversation_id: number;
  /** The participant whose block state changed (the target of the action). */
  blocked_participant_id: number;
  /** The participant who performed the block/unblock (may be null). */
  blocked_by_id: number | null;
  /** New block state: true = blocked, false = unblocked. */
  is_blocked: boolean;
};
