import { ChatApiError, toChatApiError } from './chat-errors';
import EndPoints from './EndPoints';
import { Api } from './Middleware';
import type {
  Conversation,
  GetConversationMessagesParams,
  GetConversationMessagesResponse,
  GetConversationsListParams,
  GetConversationsListResponse,
  GetMessageAudioUrlResponse,
  Message,
  ReportMessagePayload,
  SendConversationMessagePayload,
  SendConversationMessageResponse,
  StandardResponse,
  StartConversationPayload,
  StartConversationResponse,
} from './types/message-types';

const AUDIO_UPLOAD_TIMEOUT_MS = 60000;

/**
 * Message Services
 * Professional API client for message-related operations
 * Built from scratch based on Swagger API specifications
 */
class MessageServices {
  /**
   * Builds the request payload for sendConversationMessage.
   * Text messages are sent as a plain JSON object; audio messages are sent
   * as multipart form data so the audio file can be uploaded.
   * @param payload - Send conversation message payload
   * @returns JSON-serializable object for text, or FormData for audio
   */
  private buildSendPayload = (payload: SendConversationMessagePayload) => {
    if (payload.type !== 'audio') {
      return {
        type: payload.type ?? 'text',
        body: payload.body,
      };
    }

    const formData = new FormData();
    formData.append('type', 'audio');
    formData.append('duration_seconds', String(payload.duration_seconds));
    if (payload.waveform_peaks && payload.waveform_peaks.length > 0) {
      formData.append('waveform_peaks', JSON.stringify(payload.waveform_peaks));
    }
    formData.append('audio', payload.audio as unknown as Blob);

    return formData;
  };

  /**
   * Starts a new conversation with a user
   * @param payload - Start conversation payload
   * @param payload.receiver_id - ID of the user to start conversation with
   * @param payload.body - Initial message body
   * @returns Promise resolving to conversation object
   */
  startConversation = (payload: StartConversationPayload) => {
    return new Promise<Conversation>((resolve, reject) => {
      Api.post(EndPoints.startConversation, payload)
        .then((response) => {
          const data = response.data as StartConversationResponse;

          // Validate response structure
          if (data?.error === true) {
            console.error(
              '[MessageServices.startConversation] API returned error:',
              data?.message || 'Unknown error'
            );
            reject(
              new ChatApiError(
                'UNKNOWN',
                data?.message || 'Failed to start conversation'
              )
            );
            return;
          }

          // Return conversation result
          if (data?.results) {
            resolve(data.results);
          } else {
            reject(new ChatApiError('UNKNOWN', 'Invalid response structure'));
          }
        })
        .catch((error) => {
          const chatError = toChatApiError(error);
          const errorMessage = chatError.message;

          console.error('[MessageServices.startConversation] Error:', {
            message: errorMessage,
            status: error?.response?.status,
            data: error?.response?.data,
          });
          reject(chatError);
        });
    });
  };

  /**
   * Gets list of conversations for the authenticated user
   * @param params - Optional query parameters
   * @param params.per_page - Number of items per page (default: 20)
   * @returns Promise resolving to array of conversation objects
   */
  getConversationsList = (params?: GetConversationsListParams) => {
    return new Promise<Conversation[]>((resolve, reject) => {
      const queryParams = {
        per_page: params?.per_page || 20,
      };

      Api.get(EndPoints.getConversationsList, { params: queryParams })
        .then((response) => {
          const data = response.data as GetConversationsListResponse;

          // Validate response structure
          if (data?.error === true) {
            console.error(
              '[MessageServices.getConversationsList] API returned error:',
              data?.message || 'Unknown error'
            );
            reject(
              new ChatApiError(
                'UNKNOWN',
                data?.message || 'Failed to fetch conversations'
              )
            );
            return;
          }

          // Return results array or empty array if not present
          const results = Array.isArray(data?.results) ? data.results : [];
          resolve(results);
        })
        .catch((error) => {
          const chatError = toChatApiError(error);
          const errorMessage = chatError.message;
          console.error('[MessageServices.getConversationsList] Error:', {
            message: errorMessage,
            status: error?.response?.status,
            data: error?.response?.data,
          });
          reject(chatError);
        });
    });
  };

  /**
   * Gets messages of a conversation
   * @param conversationId - Conversation ID
   * @param params - Optional query parameters
   * @param params.per_page - Number of items per page (default: 20)
   * @returns Promise resolving to array of message objects
   */
  getConversationMessages = (
    conversationId: number,
    params?: GetConversationMessagesParams
  ) => {
    return new Promise<Message[]>((resolve, reject) => {
      const queryParams = {
        per_page: params?.per_page || 20,
        ...(params?.page ? { page: params.page } : {}),
      };

      Api.get(EndPoints.getConversationMessages(conversationId), {
        params: queryParams,
      })
        .then((response) => {
          const data = response.data as GetConversationMessagesResponse;

          // Validate response structure
          if (data?.error === true) {
            console.error(
              '[MessageServices.getConversationMessages] API returned error:',
              data?.message || 'Unknown error'
            );
            reject(
              new ChatApiError(
                'UNKNOWN',
                data?.message || 'Failed to fetch messages'
              )
            );
            return;
          }

          // Return results array or empty array if not present
          const results = Array.isArray(data?.results) ? data.results : [];
          resolve(results);
        })
        .catch((error) => {
          const chatError = toChatApiError(error);
          const errorMessage = chatError.message;
          console.error('[MessageServices.getConversationMessages] Error:', {
            message: errorMessage,
            status: error?.response?.status,
            data: error?.response?.data,
          });
          reject(chatError);
        });
    });
  };

  /**
   * Sends a message in a conversation
   * @param conversationId - Conversation ID
   * @param payload - Message payload
   * @param payload.body - Message body/text
   * @returns Promise resolving to the created message object
   */
  sendConversationMessage = (
    conversationId: number,
    payload: SendConversationMessagePayload
  ) => {
    return new Promise<Message>((resolve, reject) => {
      Api.post(
        EndPoints.sendConversationMessage(conversationId),
        this.buildSendPayload(payload),
        // Voice notes upload a file, so give them more room than the 20s
        // default before treating a slow connection as a failure.
        ...(payload.type === 'audio'
          ? [{ timeout: AUDIO_UPLOAD_TIMEOUT_MS }]
          : [])
      )
        .then((response) => {
          const data = response.data as SendConversationMessageResponse;

          // Validate response structure
          if (data?.error === true) {
            console.error(
              '[MessageServices.sendConversationMessage] API returned error:',
              data?.message || 'Unknown error'
            );
            reject(
              new ChatApiError(
                'UNKNOWN',
                data?.message || 'Failed to send message'
              )
            );
            return;
          }

          // Return message result
          if (data?.results) {
            resolve(data.results);
          } else {
            reject(new ChatApiError('UNKNOWN', 'Invalid response structure'));
          }
        })
        .catch((error) => {
          const chatError = toChatApiError(error);
          const errorMessage = chatError.message;
          console.error('[MessageServices.sendConversationMessage] Error:', {
            message: errorMessage,
            status: error?.response?.status,
            data: error?.response?.data,
          });
          reject(chatError);
        });
    });
  };

  /**
   * Fetches a temporary playback URL for a voice message's audio attachment
   * @param messageId - Message ID
   * @returns Promise resolving to a signed url and its expiry timestamp
   */
  getMessageAudioUrl = (messageId: number) => {
    return new Promise<{ url: string; expires_at: string }>(
      (resolve, reject) => {
        Api.get(EndPoints.getMessageAudioUrl(messageId))
          .then((response) => {
            const data = response.data as GetMessageAudioUrlResponse;

            // Validate response structure
            if (data?.error === true) {
              console.error(
                '[MessageServices.getMessageAudioUrl] API returned error:',
                data?.message || 'Unknown error'
              );
              reject(
                new ChatApiError(
                  'UNKNOWN',
                  data?.message || 'Failed to fetch audio URL'
                )
              );
              return;
            }

            resolve(data.results);
          })
          .catch((error) => {
            const chatError = toChatApiError(error);
            const errorMessage = chatError.message;
            console.error('[MessageServices.getMessageAudioUrl] Error:', {
              message: errorMessage,
              status: error?.response?.status,
              data: error?.response?.data,
            });
            reject(chatError);
          });
      }
    );
  };

  /**
   * Clears all messages in a conversation
   * @param conversationId - Conversation ID
   * @returns Promise resolving to void on success
   */
  clearConversation = (conversationId: number) => {
    return new Promise<void>((resolve, reject) => {
      Api.post(EndPoints.clearConversation(conversationId))
        .then((response) => {
          const data = response.data as StandardResponse;

          // Validate response structure
          if (data?.error === true) {
            console.error(
              '[MessageServices.clearConversation] API returned error:',
              data?.message || 'Unknown error'
            );
            reject(
              new ChatApiError(
                'UNKNOWN',
                data?.message || 'Failed to clear conversation'
              )
            );
            return;
          }

          // Resolve on success
          resolve();
        })
        .catch((error) => {
          const chatError = toChatApiError(error);
          const errorMessage = chatError.message;
          console.error('[MessageServices.clearConversation] Error:', {
            message: errorMessage,
            status: error?.response?.status,
            data: error?.response?.data,
          });
          reject(chatError);
        });
    });
  };

  /**
   * Deletes a conversation
   * @param conversationId - Conversation ID
   * @returns Promise resolving to void on success
   */
  deleteConversation = (conversationId: number) => {
    return new Promise<void>((resolve, reject) => {
      Api.delete(EndPoints.deleteConversation(conversationId))
        .then((response) => {
          const data = response.data as StandardResponse;

          // Validate response structure
          if (data?.error === true) {
            console.error(
              '[MessageServices.deleteConversation] API returned error:',
              data?.message || 'Unknown error'
            );
            reject(
              new ChatApiError(
                'UNKNOWN',
                data?.message || 'Failed to delete conversation'
              )
            );
            return;
          }

          // Resolve on success
          resolve();
        })
        .catch((error) => {
          const chatError = toChatApiError(error);
          const errorMessage = chatError.message;
          console.error('[MessageServices.deleteConversation] Error:', {
            message: errorMessage,
            status: error?.response?.status,
            data: error?.response?.data,
          });
          reject(chatError);
        });
    });
  };

  /**
   * Blocks a participant in a conversation
   * @param conversationId - Conversation ID
   * @param participantId - Participant ID to block
   * @returns Promise resolving to void on success
   */
  blockConversationParticipant = (
    conversationId: number,
    participantId: number
  ) => {
    return new Promise<void>((resolve, reject) => {
      Api.post(
        EndPoints.blockConversationParticipant(conversationId, participantId)
      )
        .then((response) => {
          const data = response.data as StandardResponse;

          // Validate response structure
          if (data?.error === true) {
            console.error(
              '[MessageServices.blockConversationParticipant] API returned error:',
              data?.message || 'Unknown error'
            );
            reject(
              new ChatApiError(
                'UNKNOWN',
                data?.message || 'Failed to block participant'
              )
            );
            return;
          }

          // Resolve on success
          resolve();
        })
        .catch((error) => {
          const chatError = toChatApiError(error);
          const errorMessage = chatError.message;
          console.error(
            '[MessageServices.blockConversationParticipant] Error:',
            {
              message: errorMessage,
              status: error?.response?.status,
              data: error?.response?.data,
            }
          );
          reject(chatError);
        });
    });
  };

  /**
   * Unblocks a participant in a conversation, clearing the pivot is_blocked
   * flag so the participant can send messages again. Mirror of
   * blockConversationParticipant.
   * @param conversationId - Conversation ID
   * @param participantId - Participant ID to unblock
   * @returns Promise resolving to void on success
   */
  unblockConversationParticipant = (
    conversationId: number,
    participantId: number
  ) => {
    return new Promise<void>((resolve, reject) => {
      Api.post(
        EndPoints.unblockConversationParticipant(conversationId, participantId)
      )
        .then((response) => {
          const data = response.data as StandardResponse;

          if (data?.error === true) {
            console.error(
              '[MessageServices.unblockConversationParticipant] API returned error:',
              data?.message || 'Unknown error'
            );
            reject(
              new ChatApiError(
                'UNKNOWN',
                data?.message || 'Failed to unblock participant'
              )
            );
            return;
          }

          resolve();
        })
        .catch((error) => {
          const chatError = toChatApiError(error);
          const errorMessage = chatError.message;
          console.error(
            '[MessageServices.unblockConversationParticipant] Error:',
            {
              message: errorMessage,
              status: error?.response?.status,
              data: error?.response?.data,
            }
          );
          reject(chatError);
        });
    });
  };

  /**
   * Reports a message
   * @param messageId - Message ID to report
   * @param payload - Report payload
   * @param payload.reason - Reason for reporting the message
   * @returns Promise resolving to void on success
   */
  reportMessage = (messageId: number, payload: ReportMessagePayload) => {
    return new Promise<void>((resolve, reject) => {
      Api.post(EndPoints.reportMessage(messageId), payload)
        .then((response) => {
          const data = response.data as StandardResponse;

          // Validate response structure
          if (data?.error === true) {
            console.error(
              '[MessageServices.reportMessage] API returned error:',
              data?.message || 'Unknown error'
            );
            reject(
              new ChatApiError(
                'UNKNOWN',
                data?.message || 'Failed to report message'
              )
            );
            return;
          }

          // Resolve on success
          resolve();
        })
        .catch((error) => {
          const chatError = toChatApiError(error);
          const errorMessage = chatError.message;
          console.error('[MessageServices.reportMessage] Error:', {
            message: errorMessage,
            status: error?.response?.status,
            data: error?.response?.data,
          });
          reject(chatError);
        });
    });
  };

  /**
   * Marks a message as read
   * @param messageId - Message ID to mark as read
   * @returns Promise resolving to void on success
   */
  markMessageAsRead = (messageId: number) => {
    return new Promise<void>((resolve, reject) => {
      Api.post(EndPoints.markMessageAsRead(messageId))
        .then((response) => {
          const data = response.data as StandardResponse;

          // Validate response structure
          if (data?.error === true) {
            console.error(
              '[MessageServices.markMessageAsRead] API returned error:',
              data?.message || 'Unknown error'
            );
            reject(
              new ChatApiError(
                'UNKNOWN',
                data?.message || 'Failed to mark message as read'
              )
            );
            return;
          }

          // Resolve on success
          resolve();
        })
        .catch((error) => {
          const chatError = toChatApiError(error);
          const errorMessage = chatError.message;
          console.error('[MessageServices.markMessageAsRead] Error:', {
            message: errorMessage,
            status: error?.response?.status,
            data: error?.response?.data,
          });
          reject(chatError);
        });
    });
  };

  /**
   * Marks all messages in a conversation as read
   * @param conversationId - Conversation ID
   * @returns Promise resolving to void on success
   */
  markAllMessagesAsRead = (conversationId: number) => {
    return new Promise<void>((resolve, reject) => {
      Api.post(EndPoints.markAllMessagesAsRead(conversationId))
        .then((response) => {
          const data = response.data as StandardResponse;

          // Validate response structure
          if (data?.error === true) {
            console.error(
              '[MessageServices.markAllMessagesAsRead] API returned error:',
              data?.message || 'Unknown error'
            );
            reject(
              new ChatApiError(
                'UNKNOWN',
                data?.message || 'Failed to mark all messages as read'
              )
            );
            return;
          }

          // Resolve on success
          resolve();
        })
        .catch((error) => {
          const chatError = toChatApiError(error);
          const errorMessage = chatError.message;
          console.error('[MessageServices.markAllMessagesAsRead] Error:', {
            message: errorMessage,
            status: error?.response?.status,
            data: error?.response?.data,
          });
          reject(chatError);
        });
    });
  };

  /**
   * Marks a message as delivered
   * @param messageId - Message ID to mark as delivered
   * @returns Promise resolving to void on success
   */
  markMessageDelivered = (messageId: number) => {
    return new Promise<void>((resolve, reject) => {
      Api.post(
        EndPoints.markMessageDelivered(messageId),
        {},
        {
          params: { messageid: messageId },
        }
      )
        .then((response) => {
          const data = response.data as StandardResponse;

          // Validate response structure
          if (data?.error === true) {
            console.error(
              '[MessageServices.markMessageDelivered] API returned error:',
              data?.message || 'Unknown error'
            );
            reject(
              new ChatApiError(
                'UNKNOWN',
                data?.message || 'Failed to mark message as delivered'
              )
            );
            return;
          }

          // Resolve on success
          resolve();
        })
        .catch((error) => {
          const chatError = toChatApiError(error);
          const errorMessage = chatError.message;
          console.error('[MessageServices.markMessageDelivered] Error:', {
            message: errorMessage,
            status: error?.response?.status,
            data: error?.response?.data,
          });
          reject(chatError);
        });
    });
  };
}

const messageServices = new MessageServices();
export default messageServices;
