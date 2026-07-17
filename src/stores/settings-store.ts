import { create } from 'zustand';

// Type definitions for the settings API response
type AuthenticationMethod = {
  is_phone: number;
  is_apple: number;
  is_google: number;
};

type QuestionCredits = {
  credits: number;
};

type SectionCredits = {
  totalCredits: number;
  questions: Record<string, QuestionCredits>;
};

type ChatCredits = {
  chatCreditsBySection: {
    signUp?: SectionCredits;
    passionsAndHobbies?: SectionCredits;
    appearanceAndHealth?: SectionCredits;
    familyBackground?: SectionCredits;
    lifeStyle?: SectionCredits;
    personalityAndRequirements?: SectionCredits;
    waliInformation?: SectionCredits;
    islamicValues?: SectionCredits;
    futurePlans?: SectionCredits;
  };
};

type MaxChatsPerDay = {
  gents: {
    free: number;
    paid: number;
  };
  ladies: {
    free: number;
    paid: number;
  };
};

export type BadgeVisibility = {
  searchResults: boolean;
  singleProfile: boolean;
  chatList: boolean;
  chatThread: boolean;
  homeRecommended: boolean;
  dailyRecommendations: boolean;
  profileIconPopup: boolean;
};

type PaymentWallVisibility = {
  singleChat?: boolean;
  chatThread?: boolean;
  profileIconPopup?: boolean;
  homeRecommended?: boolean;
  homeVisitedUs?: boolean;
  homeLikedUs?: boolean;
  homeTop?: boolean;
  conversationList?: boolean;
  singleConversation?: boolean;
};

type BadgeConfig = {
  enabled: boolean;
  visibility: BadgeVisibility;
};

type NewMemberBadgeConfig = BadgeConfig & {
  maxAccountAgeDays?: number;
};

type PaymentWallConfig = {
  enabled: boolean;
  visibility: PaymentWallVisibility;
};

type BadgesAndPayments = {
  badges: {
    completedProfile?: BadgeConfig;
    boosted?: BadgeConfig;
    vipMember?: BadgeConfig;
    newMember?: NewMemberBadgeConfig;
  };
  paymentWalls: {
    buyChatCredits?: PaymentWallConfig;
    buyBoostCredits?: PaymentWallConfig;
    buyVipMembership?: PaymentWallConfig;
  };
};

type DailyRecommendations = {
  status: string; //"1" or "0" for enabled or disabled
  start: string;
  end: string;
};

type SubscriptionPackage = {
  revenueCatProductId: string;
  iosProductId: string;
  androidProductId: string;
  bonusChatsOnPurchase: number;
  dailyChats: number;
  defaultSelected?: boolean;
};

type ChatPack = {
  revenueCatProductId: string;
  iosProductId: string;
  androidProductId: string;
  chats: number;
};

type BoostPack = {
  revenueCatProductId: string;
  iosProductId: string;
  androidProductId: string;
  boosts: number;
};

type PackagesAndEntitlements = {
  subscriptionsMonthly: SubscriptionPackage[];
  chatPacks: ChatPack[];
  boostPacks: BoostPack[];
};

type AppLink = {
  url: string;
  icon: string;
  label: string;
};

type RatingPromptConfig = {
  enabled: boolean;
  minAccountAgeDays: number;
  minSentMessages: number;
  cooldownDays: number;
  maxPrompts: number;
  storeMinStars: number;
};

const RATING_PROMPT_DEFAULTS: RatingPromptConfig = {
  enabled: true,
  minAccountAgeDays: 7,
  minSentMessages: 15,
  cooldownDays: 60,
  maxPrompts: 3,
  storeMinStars: 4,
};

export type MaintenanceMode = {
  enabled: boolean;
  message: string;
  start_at: string | null;
  end_at: string | null;
};

const MAINTENANCE_MODE_DEFAULTS: MaintenanceMode = {
  enabled: false,
  message: '',
  start_at: null,
  end_at: null,
};

type SettingValue =
  | AuthenticationMethod
  | ChatCredits
  | boolean
  | number
  | MaxChatsPerDay
  | BadgesAndPayments
  | DailyRecommendations
  | MaintenanceMode
  | PackagesAndEntitlements
  | RatingPromptConfig
  | AppLink[];

type SettingItem = {
  title: string;
  key: string;
  value: SettingValue;
  type: 'json' | 'boolean' | 'string' | 'number';
};

type SettingsResponse = {
  message: string;
  error: boolean;
  code: number;
  results: SettingItem[];
};

type SettingsState = {
  settings: SettingsResponse | null;
  loaded: boolean;
  setSettings: (settings: SettingsResponse) => void;
  clearSettings: () => void;
  getAuthenticationMethod: () => AuthenticationMethod | null;
  getChatCredits: () => ChatCredits | null;
  getForceUpdate: () => boolean;
  getSkipSignupMembershipPaywall: () => boolean;
  getEnablePresignupQuestions: () => boolean;
  getEnablePostsignupQuestions: () => boolean;
  getEnableMatchCountReveal: () => boolean;
  getProfileIntroVideoEnabled: () => boolean;
  getProfileIntroVoiceEnabled: () => boolean;
  getProfilePdfEnabled: () => boolean;
  getProfileCompletionGiftCredits: () => number;
  getProfileCompletionThresholdPercent: () => number;
  getMaxChatsPerDay: () => MaxChatsPerDay | null;
  getBadgesAndPayments: () => BadgesAndPayments | null;
  getDailyRecommendations: () => DailyRecommendations | null;
  getPackagesAndEntitlements: () => PackagesAndEntitlements | null;
  getAppLinks: () => AppLink[] | null;
  getRatingPrompt: () => RatingPromptConfig;
  getMaintenanceMode: () => MaintenanceMode;
  getSettingByKey: <T extends SettingValue>(key: string) => T | null;
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  loaded: false,

  setSettings: (settings: SettingsResponse) => {
    set({ settings, loaded: true });
  },

  clearSettings: () => {
    set({ settings: null, loaded: false });
  },

  getAuthenticationMethod: () => {
    const state = get();
    return state.getSettingByKey<AuthenticationMethod>('authentication_method');
  },

  getChatCredits: () => {
    const state = get();
    return state.getSettingByKey<ChatCredits>('chat_credits');
  },

  getForceUpdate: () => {
    const state = get();
    return state.getSettingByKey<boolean>('forceUpdate') ?? false;
  },

  getSkipSignupMembershipPaywall: () => {
    const state = get();
    return (
      state.getSettingByKey<boolean>('skip_signup_membership_paywall') ?? true
    );
  },

  getEnablePresignupQuestions: () => {
    const state = get();
    return (
      state.getSettingByKey<boolean>('enable_presignup_questions') ?? false
    );
  },

  getEnablePostsignupQuestions: () => {
    const state = get();
    return (
      state.getSettingByKey<boolean>('enable_postsignup_questions') ?? true
    );
  },

  getEnableMatchCountReveal: () => {
    const state = get();
    return state.getSettingByKey<boolean>('enable_match_count_reveal') ?? false;
  },

  getProfileIntroVideoEnabled: () => {
    const state = get();
    return (
      state.getSettingByKey<boolean>('profile_intro_video_enabled') ?? false
    );
  },
  getProfilePdfEnabled: () => {
    const state = get();
    return state.getSettingByKey<boolean>('profile_pdf_enabled') ?? false;
  },

  getProfileIntroVoiceEnabled: () => {
    const state = get();
    return (
      state.getSettingByKey<boolean>('profile_intro_voice_enabled') ?? false
    );
  },

  getProfileCompletionGiftCredits: () => {
    const state = get();
    return (
      state.getSettingByKey<number>('profile_completion_gift_credits') ?? 150
    );
  },

  getProfileCompletionThresholdPercent: () => {
    const state = get();
    return (
      state.getSettingByKey<number>('profile_completion_threshold_percent') ??
      90
    );
  },

  getMaxChatsPerDay: () => {
    const state = get();
    return state.getSettingByKey<MaxChatsPerDay>('maxChatsPerDay');
  },

  getBadgesAndPayments: () => {
    const state = get();
    return state.getSettingByKey<BadgesAndPayments>('badges_and_payments');
  },

  getDailyRecommendations: () => {
    const state = get();
    return state.getSettingByKey<DailyRecommendations>('daily_recommendations');
  },

  getPackagesAndEntitlements: () => {
    const state = get();
    return state.getSettingByKey<PackagesAndEntitlements>(
      'packages_and_entitlements'
    );
  },

  getAppLinks: () => {
    const state = get();
    return state.getSettingByKey<AppLink[]>('app_links');
  },

  getRatingPrompt: () => {
    const state = get();
    const value = state.getSettingByKey<RatingPromptConfig>('rating_prompt');
    return { ...RATING_PROMPT_DEFAULTS, ...(value ?? {}) };
  },

  getMaintenanceMode: () => {
    const state = get();
    const value = state.getSettingByKey<MaintenanceMode>('maintenance_mode');
    return {
      ...MAINTENANCE_MODE_DEFAULTS,
      ...(value ?? {}),
      enabled: value?.enabled === true,
    };
  },

  getSettingByKey: <T extends SettingValue>(key: string) => {
    const state = get();
    if (!state.settings) return null;

    const setting = state.settings.results.find((item) => item.key === key);
    if (!setting) return null;

    return (setting.value as T) ?? null;
  },
}));

// Export types for use in other files
export type {
  AppLink,
  AuthenticationMethod,
  BadgeConfig,
  BadgesAndPayments,
  BoostPack,
  ChatCredits,
  ChatPack,
  DailyRecommendations,
  MaxChatsPerDay,
  PackagesAndEntitlements,
  PaymentWallConfig,
  RatingPromptConfig,
  SettingItem,
  SettingsResponse,
  SubscriptionPackage,
};
