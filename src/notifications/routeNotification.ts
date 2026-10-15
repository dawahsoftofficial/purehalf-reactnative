import { notificationProfileId } from './notificationProfile';
import { buildChatRouteParams } from './pushPayload';

export type NotificationRouteData = {
  notification_type?: string | null;
  id?: number | string;
  [key: string]: any;
};

export type NotificationRouteDeps = {
  onLogout?: () => void | Promise<void>;
  openAppStore?: () => void | Promise<void>;
  onProfilePictureUpdateRequired?: () => void | Promise<void>;
  onMembershipRequired?: () => void | Promise<void>;
};

export type NotificationRouteOptions = {
  data?: NotificationRouteData | null;
  deps?: NotificationRouteDeps;
  currentUserId?: number | string;
  isPremium?: boolean;
  profileOnly?: boolean;
};

/**
 * Perform the correct navigation / side effect for a notification_type.
 * Shared by the foreground push banner and the notification-center list so
 * both behave identically. Missing deps are simply skipped.
 */
export const routeNotification = async (
  navigation: any,
  type: string | null | undefined,
  {
    data,
    deps = {},
    currentUserId,
    isPremium = false,
    profileOnly = false,
  }: NotificationRouteOptions = {}
): Promise<void> => {
  const id = notificationProfileId(type, data, currentUserId);
  const profileNotification = [
    'profile_liked',
    'profile_visited',
    'someone_liked_your_profile',
    'profile_visit_notification',
  ].includes(type ?? '');
  if (profileOnly || profileNotification) {
    if (
      profileNotification &&
      data?.membership_required === true &&
      !isPremium
    ) {
      await deps.onMembershipRequired?.();
      return;
    }
    if (!id) return;
    if (!isPremium) {
      await deps.onMembershipRequired?.();
      return;
    }
    navigation.navigate('UserProfile', { userData: { id } });
    return;
  }
  switch (type) {
    case 'photo_request_approved':
      navigation.navigate('PrivatePhotoRequest', {
        initialTab: 'yourRequests',
      });
      break;
    case 'photo_access_request':
    case 'photo_request_declined':
      navigation.navigate('PrivatePhotoRequest');
      break;
    case 'account_deletion':
      await deps.onLogout?.();
      break;
    case 'daily_matches':
      navigation.navigate('Welcome', { openRecommendationModal: true });
      break;
    case 'new_female_signups':
    case 'new_male_signups':
      navigation.navigate('Welcome');
      break;
    case 'new_message': {
      const params = buildChatRouteParams(data);
      if (params) {
        navigation.navigate('SingleChat', params);
      } else {
        navigation.navigate('Messages');
      }
      break;
    }
    case 'app_update':
      try {
        await deps.openAppStore?.();
      } catch (error) {
        console.error('[routeNotification] app_update:', error);
      }
      break;
    case 'profile_picture_update_required':
      await deps.onProfilePictureUpdateRequired?.();
      navigation.navigate('ProfilePicture');
      break;
    // account_suspended, profile_approved and any unknown type: no navigation.
    default:
      break;
  }
};
