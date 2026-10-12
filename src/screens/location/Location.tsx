import Geolocation from '@react-native-community/geolocation';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AppState,
  type AppStateStatus,
  Linking,
  PermissionsAndroid,
  StyleSheet,
  View,
} from 'react-native';

import { Colors } from '@/res';

import { Button, Container } from '../../components';
import { hp, wp } from '../../global';
import { LanguageKeys } from '../../languages';
import {
  ApiServices,
  flashErrorMessage,
  flashSuccessMessage,
  isIOS,
  StorageManager,
  useGlobalContext,
} from '../../services';
import LocationHeader from './components/location-header';
import PermissionBlockedModal from './components/permission-blocked-modal';
import ReportLink from './components/report-link';
import TryAgainLink from './components/try-again-link';

type GeolocationPosition = {
  coords: {
    latitude: number;
    longitude: number;
  };
};

type GeolocationError = {
  code: number;
  message: string;
};

type AddressComponent = {
  types: string[];
  long_name: string;
};

type GeocodingResponse = {
  error_message?: string;
  results?: Array<{
    address_components: AddressComponent[];
  }>;
};

type User = {
  first_name?: string;
  last_name?: string;
  gender?: string;
  date_of_birth?: string;
  latitude?: number;
  longitude?: number;
  detail?: unknown;
  [key: string]: unknown;
};

type LocationProps = {
  navigation: {
    reset: (config: { index: number; routes: Array<{ name: string }> }) => void;
  };
};

// Two independent things must be true before we can read a location, and the
// fix each one needs is different — so we track *which* is missing:
//  - 'permission'         : app permission not granted yet, but the OS will
//                           still show its prompt. Re-requesting works.
//  - 'permission-blocked' : user tapped "Don't allow" (Android never_ask_again
//                           / iOS denied). The OS will NOT prompt again — only
//                           the app's Settings page can grant it now.
//  - 'services'           : permission is granted but device location (GPS) is
//                           off / has no fix. The GPS settings screen fixes it.
type Blocker = 'permission' | 'permission-blocked' | 'services' | null;

function Location({ navigation }: LocationProps) {
  const { setData, storageKeys } = StorageManager;
  const { currentUser, updateCurrentUser, updateCustomModal } =
    useGlobalContext();
  const [loading, setLoading] = useState<boolean>(false);
  const [report, setReport] = useState<boolean>(false);
  const [isReported, setIsReported] = useState<boolean>(false);
  const [blocker, setBlocker] = useState<Blocker>(null);

  // Guards the ENTIRE permission+fetch flow. Mount, button taps and every
  // return-to-foreground all funnel through here, so without this they would
  // stack overlapping requests (each geolocation call has a 30s timeout) and
  // thrash the UI. Set on entry, cleared at every terminal branch.
  const inFlightRef = useRef<boolean>(false);
  // Latest blocker, readable inside the AppState listener without making the
  // listener re-subscribe on every change.
  const blockerRef = useRef<Blocker>(null);
  // Previous AppState so we only auto-retry on a real background->active edge,
  // not on the repeated 'active' events emulators emit around system panels.
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  // Latest currentUser, so the fetch chain below stays referentially stable
  // (keeps effects from re-running just because the user object changed).
  const currentUserRef = useRef(currentUser);
  // Ensures the initial auto-check runs exactly once per mount.
  const didInitRef = useRef<boolean>(false);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    blockerRef.current = blocker;
  }, [blocker]);

  const navigateToNextScreen = useCallback(
    (user: User) => {
      const hasBasicInfo =
        user?.first_name &&
        user?.last_name &&
        user?.gender &&
        user?.date_of_birth;

      navigation.reset({
        index: 0,
        routes: [{ name: hasBasicInfo ? 'BottomTab' : 'UserInput' }],
      });
    },
    [navigation]
  );

  const onTagLineSubmit = useCallback(
    ({
      lat,
      long,
      country,
      city,
    }: {
      lat: number;
      long: number;
      country?: string;
      city?: string;
    }) => {
      ApiServices.updateUserInfo({
        latitude: lat,
        longitude: long,
        country,
        city,
      })
        .then(async (res) => {
          const updatedUser: User = {
            ...(currentUserRef.current as User),
            detail: res,
            latitude: lat,
            longitude: long,
          };
          await setData(storageKeys.USER, updatedUser);
          updateCurrentUser(updatedUser);
          inFlightRef.current = false;
          navigateToNextScreen(updatedUser);
        })
        .catch(() => {
          inFlightRef.current = false;
          setLoading(false);
        });
    },
    [setData, storageKeys.USER, updateCurrentUser, navigateToNextScreen]
  );

  const extractLocationInfo = useCallback(
    (addressComponents: AddressComponent[]) => {
      let country: string | undefined;
      let city: string | undefined;

      for (const component of addressComponents) {
        if (component.types.includes('country')) {
          country = component.long_name;
        } else if (component.types.includes('locality')) {
          city = component.long_name;
        }

        if (country && city) {
          break;
        }
      }

      return { country, city };
    },
    []
  );

  const getCountryAndCity = useCallback(
    (lat: number, long: number) => {
      ApiServices.getLocationByLatLong(lat, long)
        .then((res: unknown) => {
          const response = res as GeocodingResponse;
          if (response?.error_message) {
            inFlightRef.current = false;
            setLoading(false);
            flashErrorMessage(response.error_message);
            return;
          }
          if (response?.results && response.results.length > 0) {
            const addressComponents = response.results[0].address_components;
            const { country, city } = extractLocationInfo(addressComponents);
            onTagLineSubmit({ lat, long, country, city });
          } else {
            inFlightRef.current = false;
            setLoading(false);
          }
        })
        .catch(() => {
          inFlightRef.current = false;
          setLoading(false);
        });
    },
    [extractLocationInfo, onTagLineSubmit]
  );

  // Reads a single fix. Permission is assumed granted by the caller, so any
  // error here means device location (GPS) is off / has no fix.
  const getPosition = useCallback(
    ({ fromUser }: { fromUser: boolean }) => {
      Geolocation.getCurrentPosition(
        (position: GeolocationPosition) => {
          setBlocker(null);
          // inFlightRef stays true through the geocode + save chain below so the
          // spinner and guard hold until we either navigate away or fail.
          getCountryAndCity(
            position.coords.latitude,
            position.coords.longitude
          );
        },
        (error: GeolocationError) => {
          inFlightRef.current = false;
          console.error('Geolocation error:', error);
          setLoading(false);
          setBlocker('services');
          // Only surface a flash for explicit user attempts. Silent auto-retries
          // (mount / return-to-foreground) must not loop the same message.
          if (fromUser) {
            flashErrorMessage(LanguageKeys.turnOnDeviceLocation);
          }
        },
        {
          enableHighAccuracy: false,
          timeout: 30000,
          maximumAge: 1000,
        }
      );
    },
    [getCountryAndCity]
  );

  // Guidance popup for the hard-blocked case. The OS won't prompt again, so a
  // transient flash isn't enough — this modal explains the fix and offers a
  // one-tap route to the app's Settings page.
  const showBlockedGuidance = useCallback(() => {
    updateCustomModal(true, () => (
      <PermissionBlockedModal
        onOpenSettings={() => {
          updateCustomModal(false, null);
          Linking.openSettings();
        }}
        onDismiss={() => updateCustomModal(false, null)}
      />
    ));
  }, [updateCustomModal]);

  // The single entry point: resolve permission, then fetch. `fromUser`
  // distinguishes explicit taps (which may flash guidance) from silent
  // automatic checks (mount / return-to-foreground).
  const runLocationFlow = useCallback(
    async ({ fromUser }: { fromUser: boolean }) => {
      if (inFlightRef.current) {
        return;
      }
      inFlightRef.current = true;
      setLoading(true);

      if (isIOS) {
        // iOS prompts for permission on first fetch; a denied permission comes
        // back as an error, handled the same as a missing fix.
        getPosition({ fromUser });
        return;
      }

      try {
        const alreadyGranted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );

        if (!alreadyGranted) {
          const result = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );

          if (result === PermissionsAndroid.RESULTS.GRANTED) {
            getPosition({ fromUser });
            return;
          }

          inFlightRef.current = false;
          setLoading(false);

          if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
            // OS will no longer prompt — surface the guidance popup pointing the
            // user to the app Settings page (the only path left).
            setBlocker('permission-blocked');
            showBlockedGuidance();
          } else {
            setBlocker('permission');
            if (fromUser) {
              flashErrorMessage(LanguageKeys.allowLocationPermission);
            }
          }
          return;
        }

        getPosition({ fromUser });
      } catch (error) {
        console.error('Permission request error:', error);
        inFlightRef.current = false;
        setLoading(false);
        setBlocker('permission');
      }
    },
    [getPosition, showBlockedGuidance]
  );

  // Initial silent check on mount (runs once). Not `fromUser`, so it won't flash
  // an error before the user has done anything — but the OS permission prompt
  // still appears on a first-ever visit.
  useEffect(() => {
    if (didInitRef.current) {
      return;
    }
    didInitRef.current = true;
    // Deferred a tick so the initial state update lands outside the effect body
    // (avoids the synchronous setState-in-effect cascade).
    const initTimer = setTimeout(() => {
      runLocationFlow({ fromUser: false });
    }, 0);
    return () => clearTimeout(initTimer);
  }, [runLocationFlow]);

  // Surface the "Report" link only after the user has been waiting a while.
  useEffect(() => {
    const reportTimer = setTimeout(() => {
      setReport(true);
    }, 20000);
    return () => clearTimeout(reportTimer);
  }, []);

  // Auto-retry when the user returns to the app (e.g. after granting permission
  // or enabling GPS in Settings). Fires only on a real background->active edge
  // and only while still blocked; inFlightRef prevents stacking.
  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        const prevState = appStateRef.current;
        appStateRef.current = nextState;

        const cameToForeground =
          nextState === 'active' &&
          (prevState === 'background' || prevState === 'inactive');

        if (cameToForeground && blockerRef.current !== null) {
          runLocationFlow({ fromUser: false });
        }
      }
    );
    return () => subscription.remove();
  }, [runLocationFlow]);

  // Opens the device location (GPS) toggle.
  const openLocationServices = useCallback(() => {
    if (isIOS) {
      Linking.openSettings();
    } else {
      Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS');
    }
  }, []);

  // Primary button: routes to whatever the current blocker actually needs.
  const onPrimaryPress = useCallback(() => {
    if (loading) {
      return;
    }
    if (blocker === 'permission-blocked') {
      // OS won't prompt again — show the guidance popup (routes to Settings).
      showBlockedGuidance();
      return;
    }
    if (blocker === 'services') {
      // Permission is fine; device location is off — open the GPS toggle.
      openLocationServices();
      return;
    }
    // Initial state or a re-askable denial: (re)request. Shows the OS dialog.
    runLocationFlow({ fromUser: true });
  }, [
    loading,
    blocker,
    openLocationServices,
    runLocationFlow,
    showBlockedGuidance,
  ]);

  // "Try Again": re-run the check. If the permission is hard-blocked there is
  // nothing to retry, so route straight to Settings instead of no-op'ing.
  const onTryAgain = useCallback(() => {
    if (blocker === 'permission-blocked') {
      showBlockedGuidance();
      return;
    }
    runLocationFlow({ fromUser: true });
  }, [blocker, runLocationFlow, showBlockedGuidance]);

  const onReport = useCallback(() => {
    ApiServices.storeQuery({ type: 3 })
      .then((res: unknown) => {
        const response = res as { data?: { error?: boolean } };
        if (!response?.data?.error) {
          flashSuccessMessage(LanguageKeys.reportedSuccessfully);
          setIsReported(true);
        }
      })
      .catch((error) => {
        console.error('Error reporting issue:', error);
      });
  }, []);

  const buttonText = useMemo(
    () => (loading ? LanguageKeys.processing : LanguageKeys.enableLocation),
    [loading]
  );

  return (
    <Container style={Styles.container}>
      <LocationHeader />
      <View style={Styles.buttonContainer}>
        {blocker !== null && <TryAgainLink onPress={onTryAgain} />}
        <Button
          buttonStyle={Styles.locationBtn}
          text={buttonText}
          onPress={onPrimaryPress}
          loading={loading}
        />
        {report && <ReportLink isReported={isReported} onPress={onReport} />}
      </View>
    </Container>
  );
}

export default Location;

const Styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
    backgroundColor: Colors.color2,
  },
  locationBtn: {
    marginTop: hp(3),
  },
  buttonContainer: {
    bottom: 0,
    zIndex: 1,
    width: '100%',
    position: 'absolute',
    paddingBottom: hp(1.5),
    paddingHorizontal: wp(4),
  },
});
