const EndPoints = {
  authenticate: '/authenticate',
  socialAuthenticate: '/socialite/authenticate',
  updateInfo: '/auth/update/info',
  updateDetails: '/auth/update/detail',
  updateProfilePrivacy: '/auth/profile/privacy',
  claimProfileGift: '/auth/profile/claim-gift',
  getLanguageList: '/auth/list/language',
  getNationalityList: '/auth/list/nationality',
  getUsers: '/auth/user/index',
  getUserDetail: '/auth/user',
  recommendedUsers: '/auth/user/exclusive?page=1&type=-1',
  getCurrentUserDetail: '/auth/my/detail',
  getAttribute: '/auth/list/attribute',
  updateFcmToken: '/auth/fcm-token',
  logout: '/auth/logout',
  deleteMedia: '/auth/media/delete',
  moveMedia: '/auth/media/move',
  mediaUpload: '/auth/media/upload',
  interactionAction: '/auth/interaction/action',
  topPicks: '/auth/reviewed_top_picks',
  privatePhotoAccessRequest: '/auth/interaction/photo/access',
  privatePhotoAcceptRequest: '/auth/interaction/photo/access/approve',
  privatePhotoRejectRequest: '/auth/interaction/photo/access/reject',
  privatePhotoRevokeAccess: '/auth/interaction/photo/access/revoke',
  privatePhotoRemoveRequest: '/auth/interaction/photo/access/remove',
  counter: '/auth/counter',
  searchFilterApply: '/auth/filter/apply',
  saveSearchFilter: '/auth/filter/store',
  searchFilter: '/auth/filter',
  getSearchFilter: '/auth/filter/index',
  deleteAccountOtp: '/auth/otp/email/send',
  verifyOtp: '/auth/otp/email/verify',
  deleteAccount: '/auth/delete/account',
  debugForceDeleteAccount: '/auth/debug/force-delete-account',
  user: '/auth/user',
  privateMedia: '/private/media',
  createGuardian: '/auth/guardian/create',
  removeGuardian: '/auth/guardian/remove',
  storeQuerySupport: '/auth/query/store',
  getAppSettings: '/settings',
  storeRating: '/auth/rating/store',
  paymentInfo: '/auth/list/paymentinfo',
  snedMessageNotification: '/auth/send/message/notification',

  // Message/Conversation endpoints
  startConversation: '/auth/conversations/start',
  getConversationsList: '/auth/conversations/list',
  getConversationWithUser: (userId: number | string) =>
    `/auth/conversations/with/${userId}`,
  getConversation: (conversationId: number | string) =>
    `/auth/conversations/${conversationId}`,
  getConversationMessages: (conversationId: number) =>
    `/auth/conversations/${conversationId}/messages`,
  sendConversationMessage: (conversationId: number) =>
    `/auth/conversations/${conversationId}/messages`,
  getMessageAudioUrl: (messageId: number) =>
    `/auth/conversations/messages/${messageId}/audio`,
  clearConversation: (conversationId: number) =>
    `/auth/conversations/${conversationId}/clear`,
  deleteConversation: (conversationId: number) =>
    `/auth/conversations/${conversationId}`,
  blockConversationParticipant: (
    conversationId: number,
    participantId: number
  ) => `/auth/conversations/${conversationId}/block/${participantId}`,
  unblockConversationParticipant: (
    conversationId: number,
    participantId: number
  ) => `/auth/conversations/${conversationId}/unblock/${participantId}`,
  reportMessage: (messageId: number) =>
    `/auth/conversations/messages/${messageId}/report`,
  markMessageAsRead: (messageId: number) =>
    `/auth/conversations/messages/${messageId}/read`,
  markAllMessagesAsRead: (conversationId: number) =>
    `/auth/conversations/${conversationId}/mark-all-read`,
  collectChatCredit: '/auth/collect/chat-credit',
  dailyChatCreditReward: '/auth/chat-credit/daily-reward',

  // Notification center endpoints
  notifications: '/auth/notifications',
  notificationMarkRead: (id: number) => `/auth/notifications/${id}/read`,
  notificationsMarkAllRead: '/auth/notifications/mark-all-read',
  notificationPhotoApprovalsMarkRead:
    '/auth/notifications/photo-approvals/read',
  notificationDelete: (id: number) => `/auth/notifications/${id}`,
  notificationsClearAll: '/auth/notifications/clear-all',

  // Signup welcome primer (Part 2)
  matchCount: '/public/match-count',
  introCommit: '/auth/intro/commit',
};

export default EndPoints;
