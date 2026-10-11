import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Purchases, {
  type CustomerInfo,
  type PurchasesPackage,
} from 'react-native-purchases';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { hp, wp } from '@/global';
import { Colors, Fonts } from '@/res';

import { flashErrorMessage, useGlobalContext } from '../../services';
import type { PaywallResult } from '../../services/paywall-service';

const OFFERING_ID = 'chat-credits';
const CANCELLED_RESULT: PaywallResult = {
  success: false,
  error: 'Purchase cancelled by user',
};
const FALLBACK_CREDITS = [500, 1250, 3000];
const CREDITS_PER_NEW_CHAT = 50;
const CHAT_BUNDLE_ICON = 'sparkles';

type Props = {
  navigation?: {
    canGoBack?: () => boolean;
    goBack?: () => void;
    addListener?: (event: 'beforeRemove', callback: () => void) => () => void;
  };
  route?: {
    params?: {
      onComplete?: (result: PaywallResult) => void;
    };
  };
};

type PackagePresentation = {
  title: string;
  description: string;
  recommended: boolean;
};

function getChatCount(credits: number) {
  return Math.max(0, Math.floor(credits / CREDITS_PER_NEW_CHAT));
}

function formatChatBundle(credits: number) {
  const chats = getChatCount(credits);
  return `${chats} ${chats === 1 ? 'Chat' : 'Chats'}`;
}

function extractCredits(pkg: PurchasesPackage, index: number) {
  const searchText = [
    pkg.identifier,
    pkg.product?.identifier,
    pkg.product?.title,
    pkg.product?.description,
  ]
    .filter(Boolean)
    .join(' ');
  const match = searchText.match(/(\d{3,5})/);
  if (match) {
    return Number(match[1]);
  }
  return (
    FALLBACK_CREDITS[index] || FALLBACK_CREDITS[FALLBACK_CREDITS.length - 1]
  );
}

function getPackagePresentation(
  pkg: PurchasesPackage,
  index: number,
  packageCount: number
): PackagePresentation {
  const credits = extractCredits(pkg, index);
  const middleIndex = packageCount > 1 ? 1 : 0;
  const recommended =
    index === middleIndex ||
    `${pkg.identifier} ${pkg.product?.identifier} ${pkg.product?.title}`
      .toLowerCase()
      .includes('recommended');

  const descriptions = [
    'Start new conversations with people you like.',
    'Meet more compatible people.',
    'Best value for expanding your search.',
  ];

  return {
    title: formatChatBundle(credits),
    description: descriptions[index] || descriptions[descriptions.length - 1],
    recommended,
  };
}

function getPrice(pkg: PurchasesPackage) {
  return pkg.product?.priceString || '';
}

function ChatBundleIcon({ color, size }: { color: string; size: number }) {
  return <Ionicons name={CHAT_BUNDLE_ICON} size={size} color={color} />;
}

export default function ChatCreditsPaywallScreen({ navigation, route }: Props) {
  const { currentUser } = useGlobalContext();
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activePackageId, setActivePackageId] = useState<string | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const completedRef = useRef(false);

  const onComplete = route?.params?.onComplete;

  const closeScreen = useCallback(() => {
    if (navigation?.canGoBack?.()) {
      navigation.goBack?.();
    }
  }, [navigation]);

  const complete = useCallback(
    (result: PaywallResult) => {
      if (completedRef.current) return;
      completedRef.current = true;
      onComplete?.(result);
      closeScreen();
    },
    [closeScreen, onComplete]
  );

  // The promise returned by presentChatCreditsPaywall() must settle even when
  // the screen is dismissed without using our buttons (hardware back, swipe
  // back gesture, navigation reset). Otherwise callers awaiting it hang.
  // completedRef makes this settle exactly once alongside complete().
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const settleAsCancelled = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onCompleteRef.current?.(CANCELLED_RESULT);
  }, []);

  useEffect(() => {
    return navigation?.addListener?.('beforeRemove', settleAsCancelled);
  }, [navigation, settleAsCancelled]);

  // Fallback for removals that don't emit beforeRemove: settle on unmount.
  useEffect(() => settleAsCancelled, [settleAsCancelled]);

  useEffect(() => {
    let mounted = true;

    const fetchPackages = async () => {
      try {
        const offerings = await Purchases.getOfferings();
        const offering = offerings?.all?.[OFFERING_ID];
        const availablePackages = offering?.availablePackages || [];

        if (!mounted) return;
        setPackages(availablePackages);
        setError(
          availablePackages.length === 0
            ? 'Chat bundles are unavailable right now.'
            : ''
        );
      } catch {
        if (!mounted) return;
        setError('Failed to load chat bundles.');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchPackages();

    return () => {
      mounted = false;
    };
  }, []);

  const currentBalanceText = useMemo(() => {
    const credits =
      (currentUser as { chat_credits?: number })?.chat_credits ?? 0;
    return getChatCount(credits).toString();
  }, [currentUser]);

  const handleClose = () => complete(CANCELLED_RESULT);

  const handlePurchase = async (pkg: PurchasesPackage) => {
    setActivePackageId(pkg.identifier);
    try {
      const customerInfo = (await Purchases.purchasePackage(pkg)).customerInfo;
      complete({
        success: true,
        customerInfo,
      });
    } catch (purchaseError: unknown) {
      const err = purchaseError as {
        userCancelled?: boolean;
        code?: string;
        message?: string;
      };
      if (err.userCancelled || err.code === 'USER_CANCELLED') {
        complete(CANCELLED_RESULT);
        return;
      }
      flashErrorMessage(err.message || 'Failed to purchase chat bundle');
    } finally {
      setActivePackageId(null);
    }
  };

  const handleRestore = async () => {
    setRestoreLoading(true);
    try {
      const customerInfo = (await Purchases.restorePurchases()) as CustomerInfo;
      complete({
        success: true,
        customerInfo,
      });
    } catch (restoreError: unknown) {
      const err = restoreError as { message?: string };
      flashErrorMessage(err.message || 'Failed to restore purchases');
    } finally {
      setRestoreLoading(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
      <StatusBar
        translucent={false}
        barStyle="dark-content"
        backgroundColor={Colors.appBg}
      />

      <ScrollView
        bounces={false}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View style={styles.heroIcon}>
            <ChatBundleIcon size={wp(6.2)} color={Colors.surface} />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close chat bundles"
            onPress={handleClose}
            style={styles.closeBtn}
          >
            <MaterialCommunityIcons
              name="close"
              size={wp(6)}
              color={Colors.primary}
            />
          </Pressable>
        </View>

        <Text style={styles.title}>Get more chats</Text>
        <Text style={styles.subtitle}>
          Choose a bundle to start new conversations with people you like.
        </Text>

        <View style={styles.balanceCard}>
          <View>
            <Text style={styles.balanceLabel}>Chats available</Text>
            <Text style={styles.balanceValue}>{currentBalanceText}</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.stateText}>Loading packages...</Text>
          </View>
        ) : error ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateText}>{error}</Text>
          </View>
        ) : (
          <View style={styles.packageList}>
            {packages.map((pkg, index) => {
              const presentation = getPackagePresentation(
                pkg,
                index,
                packages.length
              );
              const isLoading = activePackageId === pkg.identifier;

              return (
                <Pressable
                  key={pkg.identifier}
                  accessibilityRole="button"
                  disabled={!!activePackageId || restoreLoading}
                  onPress={() => handlePurchase(pkg)}
                  style={[
                    styles.packageCard,
                    presentation.recommended && styles.packageCardRecommended,
                  ]}
                >
                  <View style={styles.packageIcon}>
                    <ChatBundleIcon size={wp(5)} color={Colors.primary} />
                  </View>

                  <View style={styles.packageContent}>
                    {presentation.recommended && (
                      <View style={styles.recommendedPill}>
                        <Text style={styles.recommendedText}>Recommended</Text>
                      </View>
                    )}
                    <Text style={styles.packageTitle}>
                      {presentation.title}
                    </Text>
                    <Text style={styles.packageDescription}>
                      {presentation.description}
                    </Text>
                  </View>

                  <View style={styles.priceButton}>
                    {isLoading ? (
                      <ActivityIndicator size="small" color={Colors.surface} />
                    ) : (
                      <Text style={styles.priceText}>{getPrice(pkg)}</Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Good to know</Text>
          <View style={styles.infoRows}>
            <View style={styles.infoRow}>
              <View style={styles.infoBullet} />
              <Text style={styles.infoText}>
                Each chat starts a new conversation.
              </Text>
            </View>
            <View style={styles.infoRow}>
              <View style={styles.infoBullet} />
              <Text style={styles.infoText}>
                Continue existing conversations freely.
              </Text>
            </View>
            <View style={styles.infoRow}>
              <View style={styles.infoBullet} />
              <Text style={styles.infoText}>
                Your chats are ready immediately after checkout.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            disabled={restoreLoading || !!activePackageId}
            onPress={handleRestore}
            style={styles.footerButton}
          >
            {restoreLoading ? (
              <ActivityIndicator size="small" color={Colors.muted} />
            ) : (
              <Text style={styles.footerText}>Restore Purchases</Text>
            )}
          </Pressable>
          <Text style={styles.footerText}>Terms</Text>
          <Text style={styles.footerText}>Privacy</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.appBg,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: hp(2),
    paddingBottom: hp(3),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: hp(2.2),
  },
  heroIcon: {
    width: wp(13),
    height: wp(13),
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  closeBtn: {
    width: wp(10),
    height: wp(10),
    borderRadius: wp(5),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.lavender,
  },
  title: {
    color: Colors.ink,
    fontFamily: Fonts.DISPLAY,
    fontSize: 26,
    lineHeight: 34,
    includeFontPadding: false,
  },
  subtitle: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_R,
    fontSize: 14,
    lineHeight: 21,
    marginTop: hp(0.8),
    marginBottom: hp(2),
    includeFontPadding: false,
  },
  balanceCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.hairline,
    backgroundColor: Colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: hp(1.5),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  balanceLabel: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_B,
    fontSize: 12,
    includeFontPadding: false,
  },
  balanceValue: {
    color: Colors.ink,
    fontFamily: Fonts.APPFONT_B,
    fontSize: 15,
    marginTop: hp(0.4),
    includeFontPadding: false,
  },
  packageList: {
    gap: 10,
  },
  packageCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.hairline,
    backgroundColor: Colors.surface,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  packageCardRecommended: {
    borderColor: Colors.primaryMid,
    backgroundColor: Colors.themeLight,
  },
  packageIcon: {
    width: wp(10.6),
    height: wp(10.6),
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.lavender,
  },
  packageContent: {
    flex: 1,
    minWidth: 0,
  },
  recommendedPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: Colors.lavender,
    marginBottom: hp(0.5),
  },
  recommendedText: {
    color: Colors.primary,
    fontFamily: Fonts.APPFONT_B,
    fontSize: 10,
    includeFontPadding: false,
  },
  packageTitle: {
    color: Colors.ink,
    fontFamily: Fonts.APPFONT_B,
    fontSize: 15,
    includeFontPadding: false,
  },
  packageDescription: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_R,
    fontSize: 12,
    lineHeight: 17,
    marginTop: hp(0.4),
    includeFontPadding: false,
  },
  priceButton: {
    minWidth: 88,
    minHeight: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  priceText: {
    color: Colors.surface,
    fontFamily: Fonts.APPFONT_B,
    fontSize: 13,
    includeFontPadding: false,
  },
  stateCard: {
    minHeight: hp(18),
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.hairline,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  stateText: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_M,
    fontSize: 13,
    textAlign: 'center',
    marginTop: hp(1),
    includeFontPadding: false,
  },
  infoCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.hairline,
    backgroundColor: Colors.surface,
    padding: 14,
    marginTop: hp(1.5),
  },
  infoTitle: {
    color: Colors.ink,
    fontFamily: Fonts.APPFONT_B,
    fontSize: 14,
    includeFontPadding: false,
    marginBottom: hp(1),
  },
  infoRows: {
    gap: 9,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  infoBullet: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.primaryMid,
    marginTop: 5,
  },
  infoText: {
    flex: 1,
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_R,
    fontSize: 12,
    lineHeight: 17,
    includeFontPadding: false,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: hp(4),
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
  },
  footerButton: {
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_B,
    fontSize: 12,
    includeFontPadding: false,
  },
});
