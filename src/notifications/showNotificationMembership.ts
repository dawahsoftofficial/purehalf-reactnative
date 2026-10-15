import { Alert } from 'react-native';

/** Reuse the existing membership purchase screen after an explicit upgrade choice. */
export function showNotificationMembership(navigation: {
  navigate: (name: string, params?: object) => void;
}): void {
  Alert.alert(
    'Premium membership required',
    'Upgrade to Premium to open member profiles from notifications.',
    [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'View membership',
        onPress: () =>
          navigation.navigate('ProFeaturesPromotion', { navigateTo: 'goBack' }),
      },
    ]
  );
}
