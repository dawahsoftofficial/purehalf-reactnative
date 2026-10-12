import notifee from '@notifee/react-native';
import { useFocusEffect } from '@react-navigation/native';
import moment from 'moment';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  DeviceEventEmitter,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ripple from 'react-native-material-ripple';
import {
  Menu,
  MenuOption,
  MenuOptions,
  MenuTrigger,
} from 'react-native-popup-menu';
import Ionicons from 'react-native-vector-icons/Ionicons';

import {
  TESTER_GIFT_CALENDAR_PREVIEW,
  useNotificationStore,
  usePremiumStore,
  useSettingsStore,
  useTesterPreviewStore,
  useUserStatsStore,
} from '@/stores';

import {
  CheckMembershipStatus,
  Container,
  Loader,
  ModalLoader,
  PopupMenuRenderer,
  PurchaseSuccessModal,
  Swiper,
  Text as AppText,
} from '../../components';
import { hp, Typography, wp } from '../../global';
import { CheckRtl, LanguageKeys } from '../../languages';
import { CommonActions } from '../../navigation';
import { LIKED_YOU_PRESS_EVENT } from '../../notifications/pushEvents';
import { Colors, Fonts } from '../../res';
import {
  ApiServices,
  flashErrorMessage,
  flashSuccessMessage,
  isIOS,
  StorageManager,
  useGlobalContext,
} from '../../services';
import { presentBoostProfilePaywall } from '../../services/paywall-service';
import GiftClaimModal from '../profile/components/gift-claim-modal';
import Wiggle from '../profile/components/wiggle';
import { buildUpdatedUserAfterGiftClaim } from '../profile/gift-claim-outcome';
import { computeGiftStatus } from '../profile/gift-status';
import { RecommendationHeart } from './components';
import DailyVipRewardModal, {
  type DailyVipReward,
} from './components/daily-vip-reward-modal';
import OptionsBar from './OptionsBar';
import PremiumButton from './PremiumButton';
import PrivatePhotoAccessBtn from './PrivatePhotoAccessBtn';
import UsersList from './UsersList';

type OptionButton = {
  name: string;
  value: string;
};

type ProfileProgressItem = {
  label: string;
  id: string;
  navigation: string;
  scrollTo?: number;
  completed: boolean;
};

type WelcomeRouteParams = {
  openRecommendationModal?: boolean;
};

type WelcomeProps = {
  navigation: any;
  route?: { params?: WelcomeRouteParams };
};

const sortByCompletion = (
  a: ProfileProgressItem,
  b: ProfileProgressItem
): number => Number(b.completed) - Number(a.completed);

// Module-level flag to prevent multiple initial fetches across remounts
let hasInitializedUsers = false;
let dailyRewardPromptedFor: string | null = null;

const Welcome: React.FC<WelcomeProps> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const Rtl = CheckRtl();
  const optionBarList = useMemo<OptionButton[]>(
    () => [
      {
        name: LanguageKeys.recommended,
        value: '-1',
      },
      {
        name: LanguageKeys.likedByYou,
        value: '2',
      },
      {
        name: LanguageKeys.likedYou,
        value: '1',
      },
      {
        name: LanguageKeys.visitors,
        value: '3',
      },
    ],
    []
  );

  const profileProgressTemplate = useMemo<ProfileProgressItem[]>(
    () => [
      // {
      //   label: LanguageKeys.profileImage,
      //   id: 'primary_image_to_show',
      //   navigation: 'PhotosAndVideos',
      //   completed: false,
      // },
      // Currently not entertaining cover photo
      // {
      //   label: LanguageKeys.coverImage,
      //   id: 'cover_image',
      //   navigation: 'PhotosAndVideos',
      //   completed: false,
      // },
      {
        label: LanguageKeys.tagline,
        id: 'tagline',
        navigation: 'Profile',
        scrollTo: isIOS ? hp(2) : 10,
        completed: false,
      },
      {
        label: LanguageKeys.appearanceHealth,
        id: 'appearance-0',
        navigation: 'Profile',
        scrollTo: hp(80),
        completed: false,
      },
      {
        label: LanguageKeys.familyBackground,
        id: 'familybg-0',
        navigation: 'Profile',
        scrollTo: hp(120),
        completed: false,
      },
      {
        label: LanguageKeys.lifeStyle,
        id: 'life-0',
        navigation: 'Profile',
        scrollTo: hp(160),
        completed: false,
      },
      {
        label: LanguageKeys.personalityRequirements,
        id: 'personality-0',
        navigation: 'Profile',
        scrollTo: hp(210),
        completed: false,
      },
      {
        label: LanguageKeys.islamicValues,
        id: 'islamicval-0',
        navigation: 'Profile',
        scrollTo: hp(250),
        completed: false,
      },
      {
        label: LanguageKeys.futurePlans,
        id: 'futurePlans-0',
        navigation: 'Profile',
        scrollTo: hp(280),
        completed: false,
      },
      {
        label: LanguageKeys.myInterestAndHobbies,
        id: 'myInterestAndHobbies-0',
        navigation: 'Profile',
        scrollTo: hp(30),
        completed: false,
      },
    ],
    []
  );

  const { loaded, isPremium } = usePremiumStore();
  const unreadNotifications = useNotificationStore((s) => s.unreadCount);
  const setUnreadNotifications = useNotificationStore((s) => s.setUnreadCount);
  const isPremiumUser = isPremium();
  const { currentUser, updateCurrentUser } = useGlobalContext();
  const { setData, getData, storageKeys } = StorageManager;
  const [loader, setLoader] = useState(true);
  const [loadMoreLoader, setLoadMoreLoader] = useState(false);
  const [modalLoader, setModalLoader] = useState(false);
  // Get user stats from Pusher store (updated via counterUpdate events)
  const {
    like_count,
    visit_count,
    photo_request_count,
    photo_approval_count,
    setUserStats,
    setPhotoApprovalCount,
  } = useUserStatsStore();
  const photoAlertCount = photo_request_count + photo_approval_count;
  const accountMenuItems = useMemo(
    () => [
      {
        label: t(LanguageKeys.accountMenuProfile),
        icon: 'person-outline',
        screen: 'Profile',
      },
      {
        label: t(LanguageKeys.accountMenuPhotos),
        icon: 'images-outline',
        screen: 'PhotosAndVideos',
      },
      {
        label: t(LanguageKeys.accountMenuPrivacy),
        icon: 'shield-checkmark-outline',
        screen: 'PrivacySettings',
      },
      {
        label: t(LanguageKeys.accountMenuMembership),
        icon: 'diamond-outline',
        screen: isPremiumUser ? 'MembershipInfo' : 'ProFeaturesPromotion',
      },
      {
        label: t(LanguageKeys.accountMenuSettings),
        icon: 'settings-outline',
        screen: 'Settings',
      },
    ],
    [isPremiumUser, t]
  );
  const [activeOptionButton, setActiveOptionButton] = useState<OptionButton>(
    optionBarList[0]
  );
  const [optionTab, setOptionTab] = useState<string>('');
  const [usersList, setUsersList] = useState<any[]>([]);
  const [userListPage, setUserListPage] = useState(1);

  const [recommendationModal, setRecommendationModal] =
    useState<boolean>(false);
  const [boostSuccessModalVisible, setBoostSuccessModalVisible] =
    useState<boolean>(false);
  const [isBoostLoading, setIsBoostLoading] = useState<boolean>(false);
  const [profileCompleteProgress, setProfileCompleteProgress] = useState<
    ProfileProgressItem[]
  >(() => profileProgressTemplate.map((item) => ({ ...item })));
  const [showRecommendationModal, setShowRecommendationModal] =
    useState<boolean>(false);
  const dailyRecommendations = useSettingsStore().getDailyRecommendations();
  const [profileBannerDismissed, setProfileBannerDismissed] = useState(false);
  const profileIncomplete =
    profileCompleteProgress.length > 0 &&
    profileCompleteProgress.filter((i) => i.completed).length <
      profileCompleteProgress.length;

  const giftThreshold =
    useSettingsStore().getProfileCompletionThresholdPercent();
  const giftCreditsAmount =
    useSettingsStore().getProfileCompletionGiftCredits();
  const giftStatus = useMemo(
    () => computeGiftStatus(currentUser, giftThreshold),
    [currentUser, giftThreshold]
  );
  const giftPending = !giftStatus.claimed;
  const [giftModalVisible, setGiftModalVisible] = useState(false);
  const [dailyReward, setDailyReward] = useState<DailyVipReward | null>(null);
  const [dailyRewardVisible, setDailyRewardVisible] = useState(false);
  const openGiftModal = useCallback(() => setGiftModalVisible(true), []);
  const closeGiftModal = useCallback(() => setGiftModalVisible(false), []);

  // Services.tsx's Promise executors are untyped (bare `Promise<unknown>`),
  // so callers cast at the call site — same idiom used by OnboardingProfile
  // and Header for this exact endpoint.
  const claimGift = useCallback(
    () =>
      ApiServices.claimProfileGift() as unknown as Promise<{
        status: string;
        awarded: number;
        new_balance: number;
        multiplier: number;
      }>,
    []
  );

  const onGiftClaimed = useCallback(
    (result: any) => {
      // GiftClaimModal shows its own "You earned" confirmation
      // before calling this (for a fresh claim) or hands off immediately
      // (for an already-claimed race) — either way, no separate toast here,
      // just persisting the result on currentUser.
      setGiftModalVisible(false);
      const updatedUser = buildUpdatedUserAfterGiftClaim(currentUser, result);
      setData(storageKeys.USER, updatedUser);
      updateCurrentUser(updatedUser);
    },
    [currentUser, setData, storageKeys.USER, updateCurrentUser]
  );

  useFocusEffect(
    useCallback(() => {
      if (!currentUser?.id) return;

      let active = true;
      ApiServices.getDailyChatCreditReward()
        .then((result: any) => {
          if (!active || !result?.available) return;

          const promptKey = `${currentUser.id}:${currentUser.last_chat_credit_collected_at ?? 'never'}:${result.eligible_days}`;
          setDailyReward(result as DailyVipReward);
          if (dailyRewardPromptedFor !== promptKey) {
            dailyRewardPromptedFor = promptKey;
            setRecommendationModal(false);
            setDailyRewardVisible(true);
          }
        })
        .catch(() => {
          // A reward popup is celebratory, not a reason to block the home feed.
        });

      return () => {
        active = false;
      };
    }, [currentUser?.id, currentUser?.last_chat_credit_collected_at])
  );

  // Tester tools can request the daily-gift ("gift calendar") popup on demand
  // for review, using sample reward data instead of a real eligible day.
  const giftCalendarRequested = useTesterPreviewStore(
    (s) => s.giftCalendarRequested
  );
  const clearGiftCalendar = useTesterPreviewStore((s) => s.clearGiftCalendar);
  useFocusEffect(
    useCallback(() => {
      if (!giftCalendarRequested) return;
      clearGiftCalendar();
      setDailyReward(TESTER_GIFT_CALENDAR_PREVIEW);
      setRecommendationModal(false);
      setDailyRewardVisible(true);
    }, [giftCalendarRequested, clearGiftCalendar])
  );

  const claimDailyReward = useCallback(
    () =>
      ApiServices.collectChatCredits() as unknown as Promise<{
        user: any;
        reward: DailyVipReward;
      }>,
    []
  );

  const onDailyRewardClaimed = useCallback(
    (result: { user: any; reward: DailyVipReward }) => {
      setDailyRewardVisible(false);
      setDailyReward(null);
      if (result.user) {
        updateCurrentUser(result.user);
        setData(storageKeys.USER, result.user);
      }
    },
    [setData, storageKeys.USER, updateCurrentUser]
  );

  // Check if recommendation modal should be shown based on daily
  // recommendations settings. The time-window check alone isn't enough --
  // it used to show the heart/modal even when there were zero actual
  // recommendations for this user's location, landing on a bare "no options
  // available" card. Only show either once we know there's really something
  // to see.
  useEffect(() => {
    setShowRecommendationModal(false);
    if (!dailyRecommendations) return;

    const { status, start, end } = dailyRecommendations;

    // Check if status is enabled ('1')
    if (status !== '1') return;

    const testerForcesRecommendations = Boolean(
      currentUser?.tester_mode_enabled === true &&
      currentUser?.is_tester &&
      currentUser?.tester_force_recommendations
    );
    if (testerForcesRecommendations) {
      setShowRecommendationModal(true);
      return;
    }

    // Get current hour in 24-hour format (0-23)
    const currentHour = new Date().getHours();
    const startHour = parseInt(start, 10);
    const endHour = parseInt(end, 10);

    // Check if current time is between start and end hours
    // If end is 24, it means until 23:59 (end of day), so check >= startHour
    const shouldShow =
      endHour === 24
        ? currentHour >= startHour
        : currentHour >= startHour && currentHour < endHour;

    if (!shouldShow) return;

    let cancelled = false;
    ApiServices.getRecommendedUser()
      .then((res: any) => {
        if (cancelled) return;
        if (Array.isArray(res) && res.length > 0) {
          setShowRecommendationModal(true);
          setRecommendationModal(true);
        }
      })
      .catch(() => {
        // Silently skip -- absence of the heart/modal is an acceptable
        // fallback for a feature that's already best-effort.
      });

    return () => {
      cancelled = true;
    };
  }, [
    currentUser?.is_tester,
    currentUser?.tester_mode_enabled,
    currentUser?.tester_force_recommendations,
    dailyRecommendations,
  ]);
  const applyOptionSelection = useCallback((item: OptionButton) => {
    setOptionTab(item.name);
    setActiveOptionButton(item);
    setUserListPage(1);
    setUsersList([]);
  }, []);

  const getAttribute = useCallback(() => {
    getData(storageKeys.ATTRIBUTE).then((res) => {
      if (!res) {
        ApiServices.getAttribute().then((data) => {
          setData(storageKeys.ATTRIBUTE, data);
        });
      }
    });
  }, [getData, setData, storageKeys]);

  // Tracks whether a users fetch is in flight. A ref (not loader state) so a
  // fetch that returns an empty deck can't flip a dependency of the focus
  // effect below and spin into an infinite refetch loop (server then 429s).
  const usersFetchInFlightRef = useRef(false);

  const getUsers = useCallback(
    (
      params: { page: number; type: number | string } = { page: 1, type: -1 },
      replace = false
    ) => {
      usersFetchInFlightRef.current = true;
      ApiServices.getUsers(params)
        .then((res) => {
          const list = Array.isArray(res) ? res : [];
          setUsersList((prev) => (replace ? list : [...prev, ...list]));
        })
        .catch(() => {})
        .finally(() => {
          usersFetchInFlightRef.current = false;
          setLoader(false);
          setLoadMoreLoader(false);
        });
    },
    []
  );

  // getUserStats removed - counters now come from Pusher events via useUserStatsStore

  const ensureActiveMembership = useCallback(async (): Promise<boolean> => {
    const now = moment();
    const membershipExpiry = currentUser?.membership_expiry;
    const hasActiveMembership =
      membershipExpiry !== null &&
      membershipExpiry !== undefined &&
      moment(membershipExpiry).isAfter(now);

    if (hasActiveMembership) {
      return true;
    }

    setModalLoader(true);
    try {
      const refreshedUser: any = await ApiServices.getCurrentUserDetail();
      updateCurrentUser(refreshedUser);
      const refreshedExpiry = refreshedUser?.membership_expiry;
      return (
        refreshedExpiry !== null &&
        refreshedExpiry !== undefined &&
        moment(refreshedExpiry).isAfter(now)
      );
    } catch (err) {
      console.log('error while ensuring active membership =>', err);
      return false;
    } finally {
      setModalLoader(false);
    }
  }, [currentUser?.membership_expiry, updateCurrentUser]);

  const onOptionPress = useCallback(
    async (item: OptionButton) => {
      const { value } = item;
      setLoader(true);

      if (value === '1' || value === '3') {
        // const hasMembership = await ensureActiveMembership();
        if (!isPremiumUser) {
          const defaultOption = optionBarList[0];
          applyOptionSelection(defaultOption);
          getUsers({ page: 1, type: defaultOption.value }, true);

          navigation.navigate('ProFeaturesPromotion', {
            navigateTo: 'BottomTab',
          });
          return;
        }
      }

      applyOptionSelection(item);
      getUsers({ page: 1, type: value }, true);
      // Counters now come from Pusher events, no API call needed
    },
    [applyOptionSelection, getUsers, isPremiumUser, navigation, optionBarList]
  );

  const onLoadMorePress = useCallback(() => {
    if (!loadMoreLoader) {
      setLoadMoreLoader(true);
    }

    setUserListPage((prevPage) => {
      const nextPage = prevPage + 1;
      const type = activeOptionButton?.value ?? optionBarList[0].value;
      getUsers({ page: nextPage, type });
      return nextPage;
    });
  }, [activeOptionButton?.value, getUsers, loadMoreLoader, optionBarList]);

  // Chat pushes are routed centrally (usePushHandlers / index.js ->
  // pendingPush); this screen only owns the "liked you" tab shortcut.
  const openLikedYouTab = useCallback(
    () =>
      onOptionPress({
        name: LanguageKeys.likedYou,
        value: '1',
      }),
    [onOptionPress]
  );

  const getInitialNotification = useCallback(async () => {
    const initialNotification: any = await notifee.getInitialNotification();
    if (initialNotification?.pressAction?.id === 'my_liked_you_tab') {
      await openLikedYouTab();
    }
  }, [openLikedYouTab]);

  const handleProfileCompleteData = useCallback(async () => {
    const baseState: Record<string, boolean> = {
      primary_image_to_show: Boolean(currentUser?.primary_image_to_show),
      // Currently not entertaining cover photo
      // cover_image: Boolean(currentUser?.media?.cover_image),
      tagline: Boolean(currentUser?.detail?.tagline),
      'appearance-0': true,
      'familybg-0': true,
      'life-0': true,
      'islamicval-0': true,
      'personality-0': true,
      'futurePlans-0': Boolean(
        currentUser?.detail?.family_plan_id &&
        currentUser?.detail?.marriage_plan_id &&
        currentUser?.detail?.relocation_plan_id
      ),
      'myInterestAndHobbies-0': Boolean(
        currentUser?.detail?.interest_id?.length
      ),
    };

    try {
      const data: any = await getData(storageKeys.PROFILE_DETAIL_LOCAL);
      if (data) {
        let islamicCount = 0;
        Object.keys(data).forEach((childKey) => {
          data[childKey].forEach((element: any) => {
            if (currentUser?.detail && Object.keys(currentUser.detail).length) {
              const value = currentUser.detail[element.apiKey];
              if (value === null || value === undefined) {
                baseState[element?.category] = false;
              }
              if (
                element?.category === 'islamicval-0' &&
                (value !== null || value !== undefined)
              ) {
                islamicCount += 1;
              }
              if (islamicCount < 4) {
                baseState['islamicval-0'] = true;
              }
            } else {
              baseState[element?.category] = false;
            }
          });
        });
      }
    } catch {
      // ignore read errors and keep existing completion defaults
    }

    setProfileCompleteProgress(() => {
      const updated = profileProgressTemplate.map((item) => ({
        ...item,
        completed: Boolean(baseState[item.id]),
      }));
      return updated.sort(sortByCompletion);
    });
  }, [
    currentUser,
    getData,
    profileProgressTemplate,
    storageKeys.PROFILE_DETAIL_LOCAL,
  ]);

  // Call getAttribute and getUsers on mount
  useEffect(() => {
    getAttribute();
    // Always fetch users on mount, reset flag on unmount to allow refetch on remount
    if (!hasInitializedUsers) {
      hasInitializedUsers = true;
      getUsers(undefined, true);
    }

    return () => {
      // Reset flag on unmount to allow fresh fetch if component remounts
      // This ensures users are fetched after profile picture upload/navigation
      hasInitializedUsers = false;
    };
  }, [getUsers, getAttribute]);

  useEffect(() => {
    getInitialNotification();
    // Taps on a "liked you" notification arrive via the background handler
    // registered in index.js, which forwards them here.
    const subscription = DeviceEventEmitter.addListener(
      LIKED_YOU_PRESS_EVENT,
      openLikedYouTab
    );

    return () => subscription.remove();
  }, [getInitialNotification, openLikedYouTab]);

  const onBoostProfilePress = useCallback(async () => {
    setIsBoostLoading(true);
    try {
      const result = await presentBoostProfilePaywall();
      if (result.success) {
        setBoostSuccessModalVisible(true);
      } else if (
        result.error &&
        result.error !== 'Purchase cancelled by user'
      ) {
        flashErrorMessage(result.error || 'Failed to purchase boost');
      }
    } catch (error: any) {
      flashErrorMessage(error.message || 'Failed to purchase boost');
    } finally {
      setIsBoostLoading(false);
    }
  }, []);

  const onBoostSuccessCollect = useCallback(async () => {
    setBoostSuccessModalVisible(false);
    // Boost credit is granted server-side by the RevenueCat purchase webhook
    // (assignBoostPack), not by this handler. Just refresh the local user so
    // the new chat_credits balance is reflected in the UI.
    try {
      const refreshedUser: any = await ApiServices.getCurrentUserDetail();
      updateCurrentUser(refreshedUser);
      setData(storageKeys.USER, refreshedUser);
    } catch (error) {
      console.log('error while refreshing user after boost purchase =>', error);
    }
    flashSuccessMessage('Boost profile activated successfully!');
  }, [setData, storageKeys.USER, updateCurrentUser]);

  const onRecommendationPress = useCallback((value?: boolean) => {
    if (value) {
      setShowRecommendationModal(true);
      setRecommendationModal(true);
    } else {
      setRecommendationModal((prev) => !prev);
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      // Pusher keeps these current while the app is open; the API restores
      // persistent indicators after a cold start or a missed push event.
      ApiServices.getUserStats()
        .then((stats: any) => {
          setUserStats(
            stats?.like_you_counter ?? 0,
            stats?.visit_you_counter ?? 0,
            stats?.photo_requested_you_counter ?? 0
          );
          setPhotoApprovalCount(stats?.photo_request_approved_unread ?? 0);
          setUnreadNotifications(stats?.unread_notifications ?? 0);
        })
        .catch(() => null);
      handleProfileCompleteData();

      // Fetch users on focus when the deck is empty and no fetch is in flight.
      // Guarded by a ref rather than `loader` state: an empty or failed fetch
      // must not flip a dependency and re-run this effect, or it loops until
      // the server throttles the endpoint (429).
      if (usersList.length === 0 && !usersFetchInFlightRef.current) {
        setLoader(true);
        getUsers(undefined, true);
      }
    }, [
      getUsers,
      handleProfileCompleteData,
      setPhotoApprovalCount,
      setUnreadNotifications,
      setUserStats,
      usersList.length,
    ])
  );

  // Show loading state instead of blank screen if premium store hasn't loaded yet
  // if (!loaded) {
  //   return (
  //     <Container style={Styles.container}>
  //       <Loader />
  //     </Container>
  //   );
  // }

  if (!isPremiumUser) {
    // navigation.replace('ProFeaturesPromotion');
  }
  return (
    <Container style={Styles.container} barBg={Colors.appBg}>
      <View style={Styles.paddingH}>
        <CheckMembershipStatus />
        <ModalLoader visible={modalLoader} useModalLayout={true} />
        <CommonActions navigation={navigation} userId={currentUser?.id} />
        <View
          style={[
            Styles.headerWrapper,
            { flexDirection: Rtl ? 'row-reverse' : 'row' },
          ]}
        >
          <Menu renderer={PopupMenuRenderer}>
            <MenuTrigger>
              <View
                style={[
                  Styles.accountTrigger,
                  { flexDirection: Rtl ? 'row-reverse' : 'row' },
                ]}
              >
                <View style={Styles.avatarBtn}>
                  {currentUser?.media?.un_blur_primary_image ? (
                    <Image
                      source={{
                        uri: currentUser?.media?.un_blur_primary_image,
                      }}
                      style={Styles.avatarImg}
                    />
                  ) : (
                    <Text style={Styles.headerText}>
                      {currentUser?.first_name?.slice(0, 1)}
                    </Text>
                  )}
                  {isPremiumUser ? (
                    <View style={Styles.premiumBadge}>
                      <Ionicons
                        name="diamond"
                        size={wp(2.6)}
                        color={Colors.surface}
                      />
                    </View>
                  ) : null}
                  {photoAlertCount > 0 ? (
                    <View style={Styles.accountAlertBadge}>
                      <Text style={Styles.accountAlertBadgeText}>
                        {photoAlertCount > 99 ? '99+' : photoAlertCount}
                      </Text>
                    </View>
                  ) : null}
                  {giftPending ? <View style={Styles.giftDot} /> : null}
                </View>
                <View style={Styles.greetingBlock}>
                  <AppText
                    variant="display"
                    style={Styles.greetingName}
                    numberOfLines={1}
                  >
                    {currentUser?.first_name || t(LanguageKeys.myProfile)}
                  </AppText>
                </View>
                <View style={Styles.accountMenuCue}>
                  <Ionicons
                    name="chevron-down"
                    size={wp(3.6)}
                    color={Colors.primary}
                  />
                </View>
              </View>
            </MenuTrigger>
            <MenuOptions optionsContainerStyle={Styles.accountMenuOptions}>
              {accountMenuItems.map((item) => (
                <MenuOption
                  key={`${item.screen}-${item.label}`}
                  onSelect={() => navigation.navigate(item.screen)}
                  style={Styles.accountMenuOption}
                >
                  <View
                    style={[
                      Styles.accountMenuOptionContent,
                      { flexDirection: Rtl ? 'row-reverse' : 'row' },
                    ]}
                  >
                    <View style={Styles.accountMenuIcon}>
                      <Ionicons
                        name={item.icon as any}
                        size={wp(4.8)}
                        color={Colors.primary}
                      />
                    </View>
                    <View style={Styles.accountMenuLabelWrap}>
                      <Text style={Styles.accountMenuOptionText}>
                        {item.label}
                      </Text>
                      {giftPending && item.screen === 'Profile' ? (
                        <View style={Styles.giftDotInline} />
                      ) : null}
                    </View>
                    <Ionicons
                      name={Rtl ? 'chevron-back' : 'chevron-forward'}
                      size={wp(4)}
                      color={Colors.muted}
                    />
                  </View>
                </MenuOption>
              ))}
            </MenuOptions>
          </Menu>
          <View
            style={[
              Styles.headerRightWrapper,
              {
                flexDirection: Rtl ? 'row-reverse' : 'row',
                alignItems: 'center',
                gap: wp(3),
              },
            ]}
          >
            {showRecommendationModal && (
              <RecommendationHeart
                onPress={() => onRecommendationPress(true)}
              />
            )}
            {/* The notifications list was only reachable from the old home
                header's bell; it was lost when the header was redesigned. */}
            <Ripple
              rippleColor={Colors.primary}
              style={Styles.searchIconBtn}
              onPress={() => navigation.navigate('Notifications')}
              accessibilityRole="button"
              accessibilityLabel={t(LanguageKeys.notificationsSection)}
            >
              <Ionicons
                name="notifications-outline"
                size={wp(5.8)}
                color={Colors.ink}
              />
              {unreadNotifications > 0 ? (
                <View style={Styles.accountAlertBadge}>
                  <Text style={Styles.accountAlertBadgeText}>
                    {unreadNotifications > 99
                      ? '99+'
                      : String(unreadNotifications)}
                  </Text>
                </View>
              ) : null}
            </Ripple>
            <Ripple
              rippleColor={Colors.primary}
              style={Styles.searchIconBtn}
              onPress={() => navigation.navigate('SearchProfiles')}
            >
              <Ionicons name="search" size={wp(5.8)} color={Colors.ink} />
            </Ripple>
          </View>
        </View>
        {!giftStatus.claimed &&
          (profileIncomplete || giftStatus.eligible) &&
          !profileBannerDismissed && (
            <Ripple
              style={[
                Styles.pendingApprovalBanner,
                { flexDirection: Rtl ? 'row-reverse' : 'row' },
              ]}
              onPress={() =>
                giftStatus.eligible
                  ? openGiftModal()
                  : navigation.navigate('OnboardingProfile', {
                      from: 'Home',
                    })
              }
            >
              <View
                style={[
                  Styles.pendingIconChip,
                  giftStatus.eligible && Styles.pendingIconChipReady,
                ]}
              >
                <Wiggle active={giftStatus.eligible}>
                  <Ionicons
                    name={giftStatus.eligible ? 'gift' : 'gift-outline'}
                    size={wp(4.5)}
                    color={giftStatus.eligible ? Colors.color2 : Colors.primary}
                  />
                </Wiggle>
              </View>
              <View style={Styles.completeBannerTextWrap}>
                <Text style={Styles.completeBannerTitle}>
                  {t(
                    giftStatus.eligible
                      ? LanguageKeys.giftReadyTitle
                      : LanguageKeys.completeProfileCta
                  )}
                </Text>
                <Text style={Styles.completeBannerSub}>
                  {t(
                    giftStatus.eligible
                      ? LanguageKeys.giftReadyBody
                      : LanguageKeys.completeProfileBannerBody
                  )}
                </Text>
              </View>
              <Ripple
                onPress={() => setProfileBannerDismissed(true)}
                style={Styles.bannerDismiss}
              >
                <Ionicons name="close" size={wp(4.5)} color={Colors.muted} />
              </Ripple>
            </Ripple>
          )}
        {!isPremiumUser ? <PremiumButton /> : null}
      </View>
      <GiftClaimModal
        visible={giftModalVisible}
        giftCredits={giftCreditsAmount}
        onClose={closeGiftModal}
        onClaimed={onGiftClaimed}
        claim={claimGift}
      />
      <DailyVipRewardModal
        visible={dailyRewardVisible}
        reward={dailyReward}
        onClose={() => setDailyRewardVisible(false)}
        claim={claimDailyReward}
        onClaimed={onDailyRewardClaimed}
      />
      {/* <RecommendationButton onPress={onRecommendationPress} /> */}
      {recommendationModal && !dailyRewardVisible ? (
        <Swiper onPress={onRecommendationPress} />
      ) : null}
      {photo_request_count && photo_request_count >= 1 ? (
        <PrivatePhotoAccessBtn
          navigation={navigation}
          photoRequests={photo_request_count}
        />
      ) : null}
      <PurchaseSuccessModal
        visible={boostSuccessModalVisible}
        onCollect={onBoostSuccessCollect}
        title="Boost Profile Purchased!"
        message="Your profile boost has been activated successfully."
      />
      <OptionsBar
        onPress={onOptionPress}
        userStats={{
          like_you_counter: like_count,
          visit_you_counter: visit_count,
          photo_requested_you_counter: photo_request_count,
        }}
        activeOptionButton={activeOptionButton}
        options={optionBarList}
      />
      {loader ? (
        <Loader />
      ) : (
        <UsersList
          data={usersList}
          navigation={navigation}
          onLoadMorePress={onLoadMorePress}
          optionTab={optionTab}
        />
      )}
      {loadMoreLoader && (
        <ActivityIndicator color={Colors.primary} size="small" />
      )}
    </Container>
  );
};

export default Welcome;

const Styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.appBg,
  },
  paddingH: {
    paddingHorizontal: wp(3),
  },
  headerWrapper: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: hp(1),
  },
  greetingBlock: {
    flexShrink: 1,
    marginHorizontal: wp(2.8),
  },
  greetingName: {
    fontSize: Typography.large1,
    color: Colors.ink,
    textTransform: 'capitalize',
    includeFontPadding: false,
  },
  headerRightWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(2.5),
  },
  accountTrigger: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderColor: Colors.primaryRGBA12,
    borderRadius: wp(8),
    borderWidth: 1,
    maxWidth: wp(62),
    paddingHorizontal: wp(1.1),
    paddingVertical: hp(0.4),
  },
  accountMenuCue: {
    alignItems: 'center',
    height: wp(7),
    justifyContent: 'center',
    width: wp(7),
  },
  searchIconBtn: {
    width: wp(10),
    height: wp(10),
    borderRadius: wp(5),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.lavender,
    borderWidth: 1,
    borderColor: Colors.primaryRGBA12,
  },
  avatarBtn: {
    width: wp(13),
    height: wp(13),
    borderRadius: wp(6.5),
    backgroundColor: Colors.lavender,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImg: {
    width: wp(13),
    height: wp(13),
    borderRadius: wp(6.5),
  },
  headerText: {
    fontFamily: Fonts.APPFONT_B,
    fontSize: Typography.large1,
    color: Colors.primary,
    textTransform: 'capitalize',
  },
  premiumBadge: {
    width: wp(5),
    height: wp(5),
    borderRadius: wp(2.5),
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    bottom: -2,
    right: -2,
    borderWidth: 1.5,
    borderColor: Colors.surface,
  },
  accountAlertBadge: {
    alignItems: 'center',
    backgroundColor: Colors.color24,
    borderColor: Colors.surface,
    borderRadius: wp(2.7),
    borderWidth: 1.5,
    height: wp(5.4),
    justifyContent: 'center',
    minWidth: wp(5.4),
    paddingHorizontal: wp(1),
    position: 'absolute',
    right: -wp(1.5),
    top: -hp(0.7),
  },
  accountAlertBadgeText: {
    color: Colors.color2,
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.tiny2,
    includeFontPadding: false,
  },
  accountMenuOptions: {
    backgroundColor: Colors.surface,
    borderColor: Colors.hairline,
    borderRadius: 16,
    borderWidth: 1,
    elevation: 8,
    marginTop: hp(7.2),
    paddingVertical: hp(0.7),
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    width: wp(66),
  },
  accountMenuOption: {
    paddingHorizontal: wp(3.5),
    paddingVertical: hp(1.05),
  },
  accountMenuOptionContent: {
    alignItems: 'center',
    gap: wp(2.6),
  },
  accountMenuIcon: {
    alignItems: 'center',
    backgroundColor: Colors.lavender,
    borderRadius: wp(5),
    height: wp(9),
    justifyContent: 'center',
    width: wp(9),
  },
  accountMenuOptionText: {
    color: Colors.ink,
    flex: 1,
    fontFamily: Fonts.APPFONT_M,
    fontSize: Typography.small1,
    includeFontPadding: false,
  },
  accountMenuLabelWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(2),
  },
  giftDot: {
    position: 'absolute',
    top: -hp(0.2),
    left: -wp(1),
    width: wp(3),
    height: wp(3),
    borderRadius: wp(1.5),
    backgroundColor: Colors.color24,
    borderWidth: 1.5,
    borderColor: Colors.surface,
  },
  giftDotInline: {
    width: wp(2.2),
    height: wp(2.2),
    borderRadius: wp(1.1),
    backgroundColor: Colors.color24,
  },
  pendingApprovalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.lavender,
    paddingHorizontal: wp(3.5),
    paddingVertical: hp(1.3),
    borderRadius: 14,
    marginTop: hp(1.4),
    gap: wp(3),
  },
  pendingIconChip: {
    width: wp(9),
    height: wp(9),
    borderRadius: wp(4.5),
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingIconChipReady: {
    backgroundColor: Colors.attention,
  },
  pendingApprovalText: {
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small1,
    color: Colors.ink,
    flex: 1,
  },
  completeBannerTextWrap: {
    flex: 1,
  },
  completeBannerTitle: {
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small1,
    color: Colors.ink,
  },
  completeBannerSub: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small,
    marginTop: hp(0.2),
  },
  bannerDismiss: {
    padding: wp(1.5),
  },
});
