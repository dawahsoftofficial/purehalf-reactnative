import LanguageKeys from '../../languages/Keys';

/** Stable ids for the chat header overflow menu (labels are translated). */
export type ChatHeaderOptionId =
  | 'viewProfile'
  | 'block'
  | 'unblock'
  | 'reportAndBlock'
  | 'clearChat'
  | 'deleteConversation';

export type ChatHeaderMenuState = {
  /** Support thread or deleted partner: no profile/badge actions. */
  hideProfileActions: boolean;
  isPartnerDeleted: boolean;
  hasConversation: boolean;
  isBlockedByYou: boolean;
};

export const CHAT_HEADER_OPTION_LABELS: Record<ChatHeaderOptionId, string> = {
  viewProfile: LanguageKeys.viewProfile,
  block: LanguageKeys.blockUser,
  unblock: LanguageKeys.unblockUser,
  reportAndBlock: LanguageKeys.reportAndBlockUser,
  clearChat: LanguageKeys.clearChat,
  deleteConversation: LanguageKeys.deleteConversation,
};

const DESTRUCTIVE_OPTIONS: ReadonlySet<ChatHeaderOptionId> = new Set([
  'clearChat',
  'deleteConversation',
]);

export const isDestructiveChatHeaderOption = (id: ChatHeaderOptionId) =>
  DESTRUCTIVE_OPTIONS.has(id);

/** The menu options to show, in display order. */
export const buildChatHeaderOptions = ({
  hideProfileActions,
  isPartnerDeleted,
  hasConversation,
  isBlockedByYou,
}: ChatHeaderMenuState): ChatHeaderOptionId[] => {
  if (isPartnerDeleted) {
    // A deleted member can't be blocked or viewed; only local cleanup remains.
    return hasConversation
      ? ['clearChat', 'deleteConversation']
      : ['clearChat'];
  }

  const options: ChatHeaderOptionId[] = hideProfileActions
    ? []
    : ['viewProfile'];
  if (isBlockedByYou) {
    options.push('unblock');
  } else {
    options.push('block', 'reportAndBlock');
  }
  options.push('clearChat');
  if (hasConversation) {
    options.push('deleteConversation');
  }
  return options;
};
