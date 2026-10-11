/**
 * Pure helpers for opening SingleChat.
 *
 * The screen can be opened with several param shapes (inbox row, push
 * notification, profile / swipe card). `resolveChatEntry` normalises them so
 * the screen has one resolution path. Keep this module free of React Native
 * imports so it runs in plain jest.
 */
import type {
  Conversation,
  Participant,
} from '../../services/api/types/message-types';

/** Loosely-typed chat partner: route params, profile and payload fields merged. */
export type ChatPartner = Record<string, unknown>;

export type ChatEntry =
  /** A full conversation object (inbox row, or a lookup result). */
  | { kind: 'conversation'; conversation: Conversation }
  /** Only the id is known (notification); `userId` helps fetch the payload. */
  | { kind: 'conversationId'; conversationId: string; userId: number | null }
  /** Only the other member is known; the conversation must be looked up. */
  | { kind: 'user'; userId: number }
  /** Nothing identifies the chat. */
  | { kind: 'empty' };

type RouteParams =
  | {
      conversationData?: unknown;
      convDetails?: unknown;
      conversationId?: unknown;
      userId?: unknown;
      otherUserData?: ChatPartner | null;
    }
  | null
  | undefined;

const toPositiveInt = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return parsed > 0 ? parsed : null;
  }
  return null;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;

export function resolveChatEntry(params: RouteParams): ChatEntry {
  // A push from staff/support carries the sender's Admin id; looking that up
  // as a member id would query the wrong person, so it is not a member hint.
  const senderType = params?.otherUserData?.type;
  const senderIsMember =
    typeof senderType !== 'string' ||
    senderType.trim() === '' ||
    senderType === 'User';
  const userId =
    toPositiveInt(params?.userId) ??
    (senderIsMember ? toPositiveInt(params?.otherUserData?.id) : null);

  const raw =
    asRecord(params?.conversationData) ?? asRecord(params?.convDetails);

  if (raw) {
    // Legacy placeholders nested the id as `{convDetails: {id}}`.
    const nested = asRecord(raw.convDetails);
    const id = toPositiveInt(raw.id) ?? toPositiveInt(nested?.id);
    if (id !== null) {
      if (toPositiveInt(raw.id) !== null && Array.isArray(raw.participants)) {
        return { kind: 'conversation', conversation: raw as Conversation };
      }
      return { kind: 'conversationId', conversationId: String(id), userId };
    }
  }

  const routeConversationId = toPositiveInt(params?.conversationId);
  if (routeConversationId !== null) {
    return {
      kind: 'conversationId',
      conversationId: String(routeConversationId),
      userId,
    };
  }

  if (userId !== null) {
    return { kind: 'user', userId };
  }

  return { kind: 'empty' };
}

/** The participant that is not the signed-in member. */
export function getOtherParticipant(
  conversation: Conversation | null | undefined,
  currentUserId: string | number | null | undefined
): Participant | undefined {
  if (!conversation?.participants) return undefined;
  const me = currentUserId != null ? String(currentUserId) : null;
  return conversation.participants.find((p) => String(p.id) !== me);
}

/** True when the chat partner's account no longer exists. */
export function isChatPartnerDeleted(
  otherUserData: { id?: unknown; is_deleted?: unknown } | null | undefined,
  conversation: Conversation | null | undefined,
  currentUserId: string | number | null | undefined
): boolean {
  return (
    otherUserData?.is_deleted === true ||
    getOtherParticipant(conversation, currentUserId)?.is_deleted === true
  );
}

/**
 * True when the chat header already has what it renders (name + image), so
 * the profile endpoint (which records a profile visit) need not be called.
 */
export function hasHeaderFields(
  otherUserData: { name?: unknown; image?: unknown } | null | undefined
): boolean {
  return (
    typeof otherUserData?.name === 'string' &&
    otherUserData.name.trim() !== '' &&
    otherUserData.image !== undefined
  );
}

/**
 * Folds the conversation payload's view of the partner into whatever the
 * route already carried. Route data wins for a live member (it can be richer,
 * e.g. a full profile); a deleted member always takes the payload's snapshot
 * name/image.
 */
export function mergeChatPartner(
  previous: ChatPartner | null | undefined,
  participant: Participant
): ChatPartner {
  const deleted = participant.is_deleted === true;
  return {
    ...(previous ?? {}),
    id: previous?.id ?? participant.id,
    type: previous?.type ?? participant.type,
    name: deleted ? participant.name : (previous?.name ?? participant.name),
    image: deleted
      ? participant.image
      : previous?.image !== undefined
        ? previous.image
        : participant.image,
    is_deleted: deleted,
  };
}

/** The partner as the route describes it (possibly just an id). */
export function initialOtherUser(params: RouteParams): ChatPartner | undefined {
  if (params?.otherUserData) return params.otherUserData;
  const userId = toPositiveInt(params?.userId);
  return userId !== null ? { id: userId } : undefined;
}

export type SendTarget =
  | { kind: 'new' }
  | { kind: 'existing'; conversationId: number };

/**
 * Which send path applies: an existing conversation whenever its id is known
 * (from the payload or the screen state), `start` only for a brand-new chat.
 */
export function getSendTarget(
  conversationData: { id?: unknown } | null | undefined,
  conversationId: string | number | null | undefined
): SendTarget {
  const id =
    toPositiveInt(conversationData?.id) ?? toPositiveInt(conversationId);
  return id !== null
    ? { kind: 'existing', conversationId: id }
    : { kind: 'new' };
}

/**
 * Where a message goes, fixed when the member presses send (or retries), so a
 * screen re-targeted at another chat while it is queued never redirects it.
 */
export type CapturedSendTarget =
  | { kind: 'existing'; conversationId: number }
  | { kind: 'new'; receiverId: number };

/**
 * Conversations this screen created (or found) per receiver id, before the
 * screen state has caught up. Keyed by the receiver captured at send time.
 */
export type CreatedConversations = ReadonlyMap<string, number>;

/**
 * Captures the send target from the screen state at send time. A brand-new
 * chat records the receiver (not "whoever is on screen later"); returns null
 * when neither a conversation nor a valid receiver is known.
 */
export function captureSendTarget({
  conversationData,
  conversationId,
  receiverId,
  created,
}: {
  conversationData: { id?: unknown } | null | undefined;
  conversationId: string | number | null | undefined;
  receiverId: unknown;
  created: CreatedConversations;
}): CapturedSendTarget | null {
  const target = getSendTarget(conversationData, conversationId);
  if (target.kind === 'existing') return target;
  const receiver = toPositiveInt(receiverId);
  if (receiver === null) return null;
  return deliveryTarget({ kind: 'new', receiverId: receiver }, created);
}

/**
 * The target to use when a queued send actually runs: a "new chat" send whose
 * receiver got a conversation in the meantime (the first message created it)
 * follows up in that conversation instead of starting another.
 */
export function deliveryTarget(
  captured: CapturedSendTarget,
  created: CreatedConversations
): CapturedSendTarget {
  if (captured.kind === 'existing') return captured;
  const createdId = created.get(String(captured.receiverId));
  return createdId !== undefined
    ? { kind: 'existing', conversationId: createdId }
    : captured;
}
