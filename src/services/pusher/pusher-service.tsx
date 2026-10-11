import {
  Pusher,
  type PusherChannel,
  PusherEvent,
} from '@pusher/pusher-websocket-react-native';
import axios from 'axios';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useConversationStore } from '../../stores/conversation-store';
import { useUserStatsStore } from '../../stores/user-stats-store';
import BaseUrl from '../api/BaseUrl';
import type { CounterUpdateEventData } from '../api/types/message-types';
import { resolveUnreadCounts } from '../chat/unreadCounts';
import { StorageManager } from '../storageManager';
import { ChannelRegistry } from './channel-registry';

type PusherConfig = {
  apiKey: string;
  cluster: string;
  authEndpoint?: string;
  useTLS?: boolean;
};

/**
 * Pusher Service for Real-Time Chat
 * Handles WebSocket connections for real-time messaging
 */
type ChannelSubscription = {
  channel: PusherChannel;
};

/** One `subscribeToChannel` call; identity is what makes cleanup exact. */
type Subscriber = {
  onEvent?: (event: PusherEvent) => void;
};

export type PusherConnectionListener = (
  currentState: string,
  previousState: string
) => void;

class PusherService {
  private pusher: Pusher | null = null;
  /**
   * Requested channels (whether or not a native subscription exists yet), live
   * channels and in-flight subscribes. Requested channels are what get
   * (re)subscribed once Pusher is initialized / connected, or after an error.
   */
  private registry = new ChannelRegistry<Subscriber, ChannelSubscription>();
  private connectionListeners: Set<PusherConnectionListener> = new Set();
  private connectionState = 'DISCONNECTED';
  private config: PusherConfig | null = null;
  private isConnected = false;
  private initialized = false;

  /**
   * Initialize Pusher with configuration
   * @param config - Pusher configuration
   */
  initialize = async (config: PusherConfig) => {
    try {
      if (this.initialized && this.pusher) {
        console.log('[PusherService] Already initialized');
        return this.pusher;
      }

      this.config = config;

      // Get singleton instance
      this.pusher = Pusher.getInstance();

      if (!this.pusher) {
        throw new Error('Pusher.getInstance() returned null');
      }

      // Initialize Pusher
      // Note: We use onAuthorizer instead of authEndpoint to have control over headers
      // If authEndpoint is provided, we'll use it in onAuthorizer with proper headers
      await this.pusher.init({
        apiKey: config.apiKey,
        cluster: config.cluster,
        // Don't set authEndpoint here - use onAuthorizer instead for custom headers
        useTLS: config.useTLS ?? true,
        onConnectionStateChange: (
          currentState: string,
          previousState: string
        ) => {
          console.log('[PusherService] Connection state changed:', {
            previous: previousState,
            current: currentState,
          });
          this.isConnected = currentState === 'CONNECTED';
          this.connectionState = currentState;
          this.connectionListeners.forEach((listener) => {
            try {
              listener(currentState, previousState);
            } catch (listenerError) {
              console.error(
                '[PusherService] Connection listener error:',
                listenerError
              );
            }
          });
          if (currentState === 'CONNECTED') {
            // Subscriptions requested while offline (or that errored) retry now.
            void this.resubscribeDesired();
          }
        },
        onError: (message: string, code: any, error: unknown) => {
          console.error('[PusherService] Error:', { message, code, error });
          if (
            message.includes('Auth value') ||
            message.includes('authentication')
          ) {
            console.error(
              '[PusherService] ⚠️ Authentication error - Private channels require AuthEndpoint. ' +
                'Make sure PUSHER_AUTH_ENDPOINT is set in your .env file and your backend endpoint is configured.'
            );
          }
          this.isConnected = false;
        },
        // The library only reports subscription failures here (never on the
        // per-channel args), so this is the single error path: forget the dead
        // channel so the next subscriber or CONNECTED subscribes afresh.
        onSubscriptionError: (channelName: string, message: string) => {
          this.handleSubscriptionError(channelName, message);
        },
        onAuthorizer: async (channelName: string, socketId: string) => {
          // Custom authorizer for private channels.
          //
          // It must NEVER throw or hang: on Android the native side blocks on
          // a semaphore until we hand back a result, and only the library
          // wrapper releases it (any truthy result does). So every failure
          // returns an empty signature, which makes the subscription fail
          // (surfacing through onSubscriptionError, and retried later) instead
          // of freezing the connection thread.
          const failAuthorization = (reason: string) => {
            console.error(`[PusherService] ${reason} (${channelName})`);
            return { auth: '' } as { auth: string; channel_data?: string };
          };

          if (!config.authEndpoint) {
            return failAuthorization(
              'No authEndpoint configured — private channel subscription cannot succeed. Set PUSHER_AUTH_ENDPOINT in .env.'
            );
          }

          // Get user token from storage. A storage failure must not throw out
          // of the authorizer (see the contract above).
          let token: unknown;
          try {
            token = await StorageManager.getData(
              StorageManager.storageKeys.USER_TOKEN
            );
          } catch (error) {
            console.error('[PusherService] Token read failed:', error);
            return failAuthorization('Could not read the user token');
          }

          if (!token) {
            return failAuthorization(
              'No user token — cannot authorize private channel.'
            );
          }

          // Determine if authEndpoint is absolute or relative URL
          const isAbsoluteUrl =
            config.authEndpoint.startsWith('http://') ||
            config.authEndpoint.startsWith('https://');

          const authUrl = isAbsoluteUrl
            ? config.authEndpoint
            : `${BaseUrl}${config.authEndpoint.startsWith('/') ? '' : '/'}${config.authEndpoint}`;

          try {
            const response = await axios.post(
              authUrl,
              {
                socket_id: socketId,
                channel_name: channelName,
              },
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
              }
            );

            // No signature from the backend: fail the subscription.
            if (!response?.data?.auth) {
              console.error(
                '[PusherService] Auth response missing auth field',
                response?.data
              );
              return failAuthorization(
                'Auth response missing the auth signature'
              );
            }

            const authResponse: { auth: string; channel_data?: string } = {
              auth: response.data.auth,
            };

            // Only include channel_data if it's provided and not empty
            if (response.data.channel_data) {
              authResponse.channel_data = response.data.channel_data;
            }

            return authResponse;
          } catch (error: any) {
            console.error(
              '[PusherService] Custom authorizer error for',
              channelName,
              {
                status: error?.response?.status,
                data: error?.response?.data,
                message: error?.message,
              }
            );
            return failAuthorization('Auth request failed');
          }
        },
      });

      // Connect to Pusher
      if (!this.pusher) {
        throw new Error('Pusher instance is null after init');
      }

      await this.pusher.connect();
      this.initialized = true;
      this.isConnected = true;

      console.log('[PusherService] Initialized and connected');
      // Channels requested before Pusher was ready (the app root and screens
      // subscribe on mount, which can precede init).
      void this.resubscribeDesired();
      return this.pusher;
    } catch (error) {
      console.error('[PusherService.initialize] Error:', error);
      this.isConnected = false;
      this.initialized = false;
      this.pusher = null;
      throw error;
    }
  };

  /**
   * Unsubscribe from a channel (removes channel from Pusher and local map)
   * @param channelName - Channel name to unsubscribe from
   */
  unsubscribeFromChannel = async (channelName: string) => {
    const sub = this.registry.getChannel(channelName);
    if (sub && this.pusher) {
      // Forget it first so a subscriber that arrives while the native
      // unsubscribe is in flight creates a fresh subscription.
      this.registry.deleteChannel(channelName);
      try {
        await this.pusher.unsubscribe({ channelName });
        console.log('[PusherService] Unsubscribed from:', channelName);
      } catch (error) {
        console.error('[PusherService.unsubscribeFromChannel] Error:', error);
      }
    }
  };

  /**
   * Disconnect from Pusher. Also forgets every requested channel: after a
   * logout nothing may re-subscribe the previous member's private channels.
   */
  disconnect = async () => {
    // Drop the wishes first so a reconnect / re-render during the awaits
    // below cannot resubscribe anything.
    const liveChannels = this.registry.channelNames();
    this.registry.reset();
    if (this.pusher) {
      try {
        // Unsubscribe from all channels
        await Promise.all(
          liveChannels.map((channelName) =>
            this.pusher
              ? this.pusher.unsubscribe({ channelName }).catch(() => {})
              : undefined
          )
        );

        await this.pusher.disconnect();
        this.pusher = null;
        this.isConnected = false;
        this.connectionState = 'DISCONNECTED';
        this.initialized = false;
        console.log('[PusherService] Disconnected from Pusher');
      } catch (error) {
        console.error('[PusherService.disconnect] Error:', error);
      }
    }
  };

  /**
   * Send a Pusher client event (e.g. typing indicators) on a channel this
   * client is already subscribed to. Client events only work on private/
   * presence channels and only reach OTHER subscribers on the channel (Pusher
   * never echoes them back to the sender) — and only if "client events" is
   * enabled for the app in the Pusher dashboard; otherwise this is a no-op
   * that Pusher silently drops.
   * @param channelName - Must already be subscribed via subscribeToChannel
   * @param eventName - Must start with "client-" per Pusher's client event spec
   * @param data - JSON-serializable payload
   */
  triggerClientEvent = async (
    channelName: string,
    eventName: string,
    data: Record<string, unknown> = {}
  ): Promise<void> => {
    if (!eventName.startsWith('client-')) {
      console.error(
        '[PusherService] Client event names must start with "client-":',
        eventName
      );
      return;
    }

    const sub = this.registry.getChannel(channelName);
    if (!sub || !this.isReady()) {
      console.log(
        '[PusherService] Cannot trigger client event, not subscribed/ready:',
        channelName
      );
      return;
    }

    try {
      await sub.channel.trigger(
        new PusherEvent({
          channelName,
          eventName,
          data: JSON.stringify(data),
        })
      );
    } catch (error) {
      console.error('[PusherService.triggerClientEvent] Error:', error);
    }
  };

  /**
   * Get connection status
   */
  getConnectionStatus = () => {
    return this.isConnected && this.initialized && this.pusher !== null;
  };

  /**
   * Check if Pusher is fully initialized and ready
   */
  isReady = () => {
    return this.initialized && this.pusher !== null;
  };

  /** Current Pusher connection state ('CONNECTED', 'CONNECTING', ...). */
  getConnectionState = (): string => this.connectionState;

  /**
   * Listens for connection state changes. Returns the remover.
   */
  addConnectionListener = (
    listener: PusherConnectionListener
  ): (() => void) => {
    this.connectionListeners.add(listener);
    return () => {
      this.connectionListeners.delete(listener);
    };
  };

  /** Re-attempts every requested channel that has no live subscription. */
  private resubscribeDesired = async (): Promise<void> => {
    await Promise.all(
      this.registry.channelsToRetry().map((name) => this.ensureSubscribed(name))
    );
  };

  /**
   * The one place a failed subscription is handled (init-level
   * onSubscriptionError, and the pusher:subscription_error event): forget the
   * dead channel so the next subscriber, or the next CONNECTED, retries.
   */
  private handleSubscriptionError = (channelName: string, message: string) => {
    console.error('[PusherService] ❌ Subscription error:', {
      channelName,
      message,
    });
    if (
      message?.includes('MethodNotAllowed') ||
      message?.includes('POST method is not supported')
    ) {
      console.error(
        '[PusherService] ⚠️ Backend Route Error: ' +
          'The broadcasting/auth endpoint must accept POST requests. ' +
          'Please ask your backend developer to ensure the route accepts POST method.'
      );
    }
    this.registry.markFailed(channelName);
    const pusher = this.pusher;
    if (pusher) {
      pusher.unsubscribe({ channelName }).catch(() => {});
    }
  };

  private dispatchToSubscribers = (channelName: string, event: PusherEvent) => {
    this.registry.subscribers(channelName).forEach((subscriber) => {
      try {
        subscriber.onEvent?.(event);
      } catch (error) {
        console.error('[PusherService] Subscriber threw:', error);
      }
    });
  };

  /**
   * Creates the single native subscription for a requested channel. No-op if
   * it already exists, is in flight, nobody wants it, there is no signed-in
   * member (private channels need a token) or Pusher is not ready.
   */
  private ensureSubscribed = async (channelName: string): Promise<void> => {
    // A signed-out device must not (re)subscribe anyone's private channels.
    // Callers fire-and-forget this, so a storage failure must not become an
    // unhandled rejection: treat it as "not signed in" (the next CONNECTED or
    // subscriber retries).
    let token: unknown;
    try {
      token = await StorageManager.getData(
        StorageManager.storageKeys.USER_TOKEN
      );
    } catch (error) {
      console.error(
        '[PusherService.ensureSubscribed] Token read failed:',
        error
      );
      return;
    }
    if (!token) return;

    if (this.registry.hasChannel(channelName)) return;
    const inFlight = this.registry.getPending(channelName);
    if (inFlight) {
      await inFlight.catch(() => {});
      return;
    }
    if (
      !this.registry.isWanted(channelName) ||
      !this.isReady() ||
      !this.pusher
    ) {
      return;
    }

    const pusher = this.pusher;
    // disconnect() resets the registry; a subscribe still in flight across it
    // must not store its channel (phantom "live" channel that would block a
    // later re-subscribe).
    const epoch = this.registry.epoch;
    const subscribePromise = (async (): Promise<void> => {
      const channel = await pusher.subscribe({
        channelName,
        onSubscriptionSucceeded: () => {
          console.log(
            '[PusherService] ✅ Successfully subscribed to channel:',
            channelName
          );
        },
        onEvent: (event: PusherEvent) => {
          if (event.eventName === 'pusher:subscription_error') {
            this.handleSubscriptionError(
              channelName,
              typeof event.data === 'string'
                ? event.data
                : JSON.stringify(event.data ?? '')
            );
            return;
          }

          console.log(
            '[PusherService] 📨 Event received on',
            channelName,
            ':',
            {
              eventName: event.eventName,
              data: event.data,
            }
          );
          this.dispatchToSubscribers(channelName, event);
        },
      });

      // Not stored if the subscription already failed while being created, or
      // if a disconnect / logout reset the registry meanwhile.
      const stored = this.registry.setChannel(channelName, { channel }, epoch);
      if (!stored && epoch !== this.registry.epoch) {
        // Stale (reset since this subscribe began). Drop the native channel,
        // unless someone wants it again: the native channel is shared by name,
        // so unsubscribing would kill the newer subscription.
        if (!this.registry.isWanted(channelName)) {
          pusher.unsubscribe({ channelName }).catch(() => {});
        }
      }
    })();

    this.registry.beginPending(channelName, subscribePromise);
    try {
      await subscribePromise;
    } catch (error) {
      console.error('[PusherService.ensureSubscribed] Error:', error);
      this.registry.deleteChannel(channelName);
    } finally {
      this.registry.endPending(channelName, subscribePromise);
    }
    // Every subscriber left while the subscription was being created.
    if (!this.registry.isWanted(channelName)) {
      void this.unsubscribeFromChannel(channelName);
    }
  };

  /**
   * Subscribe to any channel (public or private).
   * Safe to call multiple times for the same channel (e.g. when both users send at once):
   * only one native subscription is created and events are multiplexed to every
   * subscriber. A request made before Pusher is ready, or while offline, is
   * remembered and fulfilled when Pusher initializes / becomes CONNECTED; a
   * subscription that errors is dropped so it is retried the same way.
   * @param channelName - Channel name to subscribe to
   * @param onEvent - Callback for any event received on this channel
   * @returns cleanup that removes exactly this subscriber (and the native
   *   subscription once nobody is left)
   */
  subscribeToChannel = async (
    channelName: string,
    onEvent?: (event: PusherEvent) => void
  ): Promise<() => void> => {
    const subscriber: Subscriber = { onEvent };
    this.registry.addSubscriber(channelName, subscriber);

    let cleanedUp = false;
    const cleanup = (): void => {
      if (cleanedUp) return;
      cleanedUp = true;
      if (this.registry.removeSubscriber(channelName, subscriber)) {
        void this.unsubscribeFromChannel(channelName);
      }
    };

    if (!this.isReady()) {
      console.log(
        '[PusherService] Pusher not ready yet; subscription to',
        channelName,
        'will start when it connects'
      );
      return cleanup;
    }

    await this.ensureSubscribed(channelName);
    return cleanup;
  };
}

// Singleton instance
const pusherService = new PusherService();
export default pusherService;

/**
 * React Hook for using Pusher in components
 */
export function usePusher(config: PusherConfig | null) {
  const [, setIsConnected] = useState(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!config) {
      return;
    }

    // Don't re-initialize if already initialized with same config
    if (initializedRef.current) {
      return;
    }

    const initPusher = async () => {
      try {
        await pusherService.initialize(config);
        // Wait a bit for connection to establish
        setTimeout(() => {
          setIsConnected(pusherService.getConnectionStatus());
        }, 500);
        initializedRef.current = true;
      } catch (error) {
        console.error('[usePusher] Initialization error:', error);
        initializedRef.current = false;
      }
    };

    initPusher();

    return () => {
      // Don't disconnect on unmount, just reset the ref
      initializedRef.current = false;
    };
  }, [config]);

  // Poll connection status to update state
  useEffect(() => {
    if (!config) return;

    const updateStatus = () => {
      const status =
        pusherService.getConnectionStatus() && pusherService.isReady();
      setIsConnected(status);
    };

    // Initial check
    updateStatus();

    const interval = setInterval(updateStatus, 1000);

    return () => clearInterval(interval);
  }, [config]);

  return {
    pusherService,
    isConnected: pusherService.getConnectionStatus() && pusherService.isReady(),
  };
}

/**
 * React Hook for subscribing to user counters channel globally
 * This hook subscribes to private-user.counters.{userId} channel
 * and handles counter-related events app-wide.
 *
 * The subscription is requested even if Pusher is not initialized yet or the
 * device is offline: pusherService remembers it and fulfils it once Pusher is
 * connected (and again after a reconnect or a subscription error).
 */
export function useUserCountersChannel(
  currentUser: { id: string | number; user?: { id: string | number } } | null,
  updateCurrentUser: (user: unknown) => void
) {
  // Mirror `currentUser` / `updateCurrentUser` into refs so the Pusher event
  // handler always reads the latest values WITHOUT being in the effect's deps
  // (which would trigger a resubscribe on every profile update).
  const currentUserRef = useRef(currentUser);
  const updateCurrentUserRef = useRef(updateCurrentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
    updateCurrentUserRef.current = updateCurrentUser;
  }, [currentUser, updateCurrentUser]);

  // Extract userId using useMemo to avoid unnecessary re-renders
  const userId = useMemo(() => {
    return currentUser?.id === 'guardian'
      ? currentUser?.user?.id
      : currentUser?.id;
  }, [currentUser?.id, currentUser?.user?.id]);

  useEffect(() => {
    if (!userId) return undefined;

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    // Subscribe to user counters channel: private-user.counters.{userId}
    const countersChannelName = `private-user.counters.${userId}`;

    pusherService
      .subscribeToChannel(countersChannelName, (event) => {
        try {
          const rawData =
            typeof event.data === 'string'
              ? JSON.parse(event.data)
              : event.data;

          // Extract event type from Laravel event class name or from data.event
          let eventType = event.eventName;
          if (eventType.includes('\\')) {
            // Laravel event class name format: App\Events\User\CounterUpdated
            eventType = eventType.split('\\').pop() || eventType;
          }

          // If data has an 'event' field, use that as the event type
          if (rawData?.event) {
            eventType = rawData.event;
          }

          // Always read the latest currentUser via the ref.
          const latestUser = currentUserRef.current;
          const latestUserId =
            latestUser?.id === 'guardian'
              ? latestUser?.user?.id
              : latestUser?.id;

          if (latestUserId === userId) {
            handleCounterEvent(
              eventType,
              rawData,
              latestUser,
              updateCurrentUserRef.current
            );
          }
        } catch (error) {
          console.error(
            '[useUserCountersChannel] Error handling counter event:',
            error
          );
        }
      })
      .then((remove) => {
        if (cancelled) {
          remove();
        } else {
          unsubscribe = remove;
        }
      })
      .catch((error) => {
        console.error(
          '[useUserCountersChannel] Error setting up counters channel:',
          error
        );
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
      unsubscribe = null;
    };
  }, [userId]);
}

/**
 * Handle counter-related events from the counters channel
 */
// eslint-disable-next-line max-params
function handleCounterEvent(
  eventType: string,
  rawData: unknown,
  currentUser: { id: string | number; user?: { id: string | number } } | null,
  updateCurrentUser: (user: unknown) => void
): void {
  console.log(
    '[useUserCountersChannel] Counter event received:',
    eventType,
    rawData
  );

  try {
    // Handle different counter event types
    switch (eventType) {
      case 'counterUpdate': {
        // Counter update event with participant data
        // Data structure: { event: 'counterUpdate', participant: { id, unread_conversations_count, unread_messages_count, chat_credits, last_chat_credit_collected_at } }
        console.log(
          '[useUserCountersChannel] Counter update received:',
          rawData
        );

        if (
          rawData &&
          typeof rawData === 'object' &&
          'participant' in rawData &&
          currentUser
        ) {
          const eventData = rawData as CounterUpdateEventData;
          const participant = eventData.participant;

          // Prepare user updates object
          const userUpdates: Partial<{
            chat_credits: number;
            last_chat_credit_collected_at: string | null;
          }> = {};

          // Update chat credits if present
          if (participant.chat_credits !== undefined) {
            const credits =
              typeof participant.chat_credits === 'number'
                ? participant.chat_credits
                : parseInt(String(participant.chat_credits), 10) || 0;

            console.log(
              '[useUserCountersChannel] Updating chat credits:',
              credits
            );
            userUpdates.chat_credits = credits;
          }

          // Update last_chat_credit_collected_at if present
          if (participant.last_chat_credit_collected_at !== undefined) {
            console.log(
              '[useUserCountersChannel] Updating last_chat_credit_collected_at:',
              participant.last_chat_credit_collected_at
            );
            userUpdates.last_chat_credit_collected_at =
              participant.last_chat_credit_collected_at;
          }

          // Apply user updates if any
          if (Object.keys(userUpdates).length > 0) {
            updateCurrentUser({
              ...currentUser,
              ...userUpdates,
            });
          }

          // Update unread counts if present
          const conversationStore = useConversationStore.getState();
          const unread = resolveUnreadCounts(participant, {
            conversations: conversationStore.unreadConversationsCount,
            messages: conversationStore.unreadMessagesCount,
          });
          if (unread) {
            console.log(
              '[useUserCountersChannel] Updating unread counts:',
              unread.conversations,
              'conversations,',
              unread.messages,
              'messages'
            );
            conversationStore.setUnreadCounts(
              unread.conversations,
              unread.messages
            );
          }

          // Update interaction counters (like_count, visit_count, photo_request_count)
          if (
            participant.like_count !== undefined ||
            participant.visit_count !== undefined ||
            participant.photo_request_count !== undefined ||
            participant.photo_approval_count !== undefined
          ) {
            const likeCount = participant.like_count ?? 0;
            const visitCount = participant.visit_count ?? 0;
            const photoRequestCount = participant.photo_request_count ?? 0;

            console.log(
              '[useUserCountersChannel] Updating interaction counters:',
              {
                like_count: likeCount,
                visit_count: visitCount,
                photo_request_count: photoRequestCount,
              }
            );

            // Update user stats store
            useUserStatsStore
              .getState()
              .setUserStats(likeCount, visitCount, photoRequestCount);
            useUserStatsStore
              .getState()
              .setPhotoApprovalCount(participant.photo_approval_count ?? 0);
          }
        }
        break;
      }

      default:
        console.log(
          '[useUserCountersChannel] Unknown counter event type:',
          eventType,
          rawData
        );
    }
  } catch (error) {
    console.error(
      '[useUserCountersChannel] Error handling counter event:',
      error
    );
  }
}
