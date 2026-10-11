/**
 * Pure helpers for FCM / notifee push payloads.
 *
 * The backend sends every value in `message.data` as a string, with the
 * structured part JSON-encoded in `data.data`. Keep this module free of React
 * Native imports so it runs in plain jest (and from index.js headless tasks).
 */

export type ChatPushUser = {
  id?: number | string;
  name?: string;
  image?: string | null;
  type?: string;
};

export type ChatPushData = {
  notification_type?: string | null;
  conversationId?: number | string;
  message?: string;
  user?: ChatPushUser | null;
  [key: string]: unknown;
};

export type ChatRouteParams = {
  from: 'notification';
  conversationId: number | string;
  message?: string;
  otherUserData?: {
    id: number | string;
    name?: string;
    image?: string | null;
    type?: string;
  };
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * Parses the `data` field of a push payload. Never throws: tolerates an
 * already-parsed object, a JSON string, a double-stringified JSON string, and
 * returns `null` for anything else.
 */
export function parsePushData(raw: unknown): Record<string, any> | null {
  try {
    let value: unknown = raw;
    for (let i = 0; i < 2 && typeof value === 'string'; i += 1) {
      if (value.length === 0) return null;
      value = JSON.parse(value);
    }
    return isPlainObject(value) ? value : null;
  } catch {
    return null;
  }
}

const toIdValue = (value: unknown): number | string | null => {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return parsed > 0 ? parsed : null;
  }
  return null;
};

/**
 * Navigation params for SingleChat built from a parsed push `data` object.
 * Ids arrive as strings; they are converted to numbers, which is what the
 * rest of the chat code expects. Returns `null` without a usable conversation.
 */
export function buildChatRouteParams(
  data: ChatPushData | null | undefined
): ChatRouteParams | null {
  const conversationId = toIdValue(data?.conversationId);
  if (conversationId === null) return null;

  const params: ChatRouteParams = { from: 'notification', conversationId };
  if (typeof data?.message === 'string') params.message = data.message;

  const user = data?.user;
  const userId = toIdValue(user?.id);
  if (user && userId !== null) {
    params.otherUserData = {
      id: userId,
      name: user.name,
      image: user.image,
      type: user.type,
    };
  }
  return params;
}

type RemoteMessageLike = {
  data?: Record<string, unknown> | null;
  notification?: unknown;
} | null;

/**
 * The chat to open for a tapped / received push, or `null` if the push is not
 * a chat push. Works for FCM remote messages and for notifee notification
 * `data` (where the nested object is already parsed -- pass it as `data`).
 */
export function getChatPushParams(
  message: RemoteMessageLike
): ChatRouteParams | null {
  const data = parsePushData(message?.data?.data);
  const isChat =
    message?.data?.pressAction === 'openChat' ||
    data?.notification_type === 'new_message';
  return isChat ? buildChatRouteParams(data) : null;
}

/** Chat route params from notifee's `notification.data` (already flattened). */
export function getChatParamsFromNotifeeData(
  data: Record<string, unknown> | null | undefined
): ChatRouteParams | null {
  const isChat =
    data?.pressAction === 'openChat' ||
    data?.notification_type === 'new_message';
  return isChat ? buildChatRouteParams(data as ChatPushData) : null;
}

/**
 * True when the foreground banner for this push must be suppressed because
 * the user is already looking at that conversation. Compares string forms
 * (route ids are numbers, payload ids are strings).
 */
export function shouldSuppressChatBanner(
  openedConversationId: unknown,
  data: ChatPushData | null | undefined
): boolean {
  if (
    openedConversationId === null ||
    openedConversationId === undefined ||
    openedConversationId === '' ||
    data?.conversationId === undefined ||
    data?.conversationId === null
  ) {
    return false;
  }
  return String(openedConversationId) === String(data.conversationId);
}

/**
 * Whether the headless/background handler should draw its own notifee
 * notification. A message with a `notification` block is already shown by the
 * system tray (Android / iOS), so drawing another would duplicate it.
 */
export function shouldDisplayBackgroundNotification(
  message: RemoteMessageLike
): boolean {
  return !message?.notification;
}
