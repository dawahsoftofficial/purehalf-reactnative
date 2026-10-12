import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  type FlatList,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewToken,
} from 'react-native';
import Purchases, {
  type PurchasesPackage,
  type PurchasesStoreProduct,
} from 'react-native-purchases';
import { SafeAreaView } from 'react-native-safe-area-context';
import AntDesign from 'react-native-vector-icons/AntDesign';

import { wp } from '@/global';
import { Colors, Fonts } from '@/res';

import { ModalLoader } from '../../components';
import { LanguageKeys } from '../../languages';
import {
  flashErrorMessage,
  flashSuccessMessage,
  StorageManager,
  useGlobalContext,
} from '../../services';
import {
  FinePrint,
  Footer,
  PackageCard,
  PaginationDots,
  TermsAndConditions,
} from './components';

type Props = {
  navigation?: any;
  route?: any;
  onClose?: () => void;
};

type PlanUI = {
  badge: string;
  badgeVariant: 'neutral' | 'recommended';
  tagline: string;
  bullets: string[];
  emphasize: boolean; // highlight card
  compareAtMultiplier?: number; // for "cut price" (presentation-only)
};

const DEFAULT_PLAN_UI: Record<string, PlanUI> = {
  plus_starter: {
    badge: 'Starter',
    badgeVariant: 'neutral',
    tagline: 'Start strong — see interest and begin meaningful chats today.',
    bullets: [
      '10 bonus chats instantly on purchase',
      '3 chats every day',
      'See who liked you',
      'Who visited you: last 7 days',
      'Basic chat filters',
      'Search priority: low',
    ],
    emphasize: false,
    compareAtMultiplier: 1.28,
  },
  pro_recommended: {
    badge: 'Recommended • Best Value',
    badgeVariant: 'recommended',
    tagline:
      'Most chosen — better filters + priority visibility for faster replies.',
    bullets: [
      '15 bonus chats instantly on purchase',
      '6 chats every day',
      'See & sort who liked you',
      'Who visited you: last 30 days',
      'Advanced chat filters',
      'Search priority: medium',
    ],
    emphasize: true,
    compareAtMultiplier: 1.5,
  },
  elite_highest_visibility: {
    badge: 'Maximum Visibility',
    badgeVariant: 'neutral',
    tagline: 'Go all in — maximum reach, full insights, and more daily chats.',
    bullets: [
      '30 bonus chats instantly on purchase',
      '12 chats every day',
      'Full likes & views access',
      'Advanced chat filters',
      'Search priority: high',
      'Maximum visibility',
    ],
    emphasize: false,
    compareAtMultiplier: 1.4,
  },
};

function findRecommendedIndex(packages: PurchasesPackage[]) {
  const byId = packages.findIndex(
    (p) =>
      p?.product?.identifier === 'pro_recommended' ||
      (p?.identifier || '').toLowerCase().includes('recommended') ||
      (p?.product?.title || '').toLowerCase().includes('recommended')
  );
  return byId >= 0 ? byId : 0;
}

function normalizeProductId(id?: string) {
  if (!id) return '';
  const trimmed = id.trim().toLowerCase();

  // Try exact match first
  if (trimmed === 'plus_starter' || trimmed === 'plus (starter)') {
    return 'plus_starter';
  }
  if (
    trimmed === 'pro_recommended' ||
    trimmed === 'pro (recommended)' ||
    (trimmed.includes('pro') && trimmed.includes('recommended'))
  ) {
    return 'pro_recommended';
  }
  if (
    trimmed === 'elite_highest_visibility' ||
    trimmed === 'elite (highest visibility)' ||
    trimmed === 'elite (highest visbility)' ||
    (trimmed.includes('elite') && trimmed.includes('highest'))
  ) {
    return 'elite_highest_visibility';
  }

  // Fallback: try to match by keywords
  if (trimmed.includes('plus') || trimmed.includes('starter')) {
    return 'plus_starter';
  }
  if (trimmed.includes('pro') || trimmed.includes('recommended')) {
    return 'pro_recommended';
  }
  if (trimmed.includes('elite') || trimmed.includes('highest')) {
    return 'elite_highest_visibility';
  }

  return trimmed;
}

function formatMoneyFromProduct(product: PurchasesStoreProduct) {
  // Prefer pricePerMonthString / priceString
  return (
    product.pricePerMonthString ||
    product.priceString ||
    (typeof product.pricePerMonth === 'number'
      ? `$${product.pricePerMonth.toFixed(2)}`
      : typeof product.price === 'number'
        ? `$${product.price.toFixed(2)}`
        : '')
  );
}

function formatPerDayPrice(
  product: PurchasesStoreProduct,
  pricePerMonth: number | null | undefined
) {
  if (!pricePerMonth || pricePerMonth <= 0) return '';

  // Extract currency symbol and value from priceString if available
  const priceString = product.pricePerMonthString || product.priceString || '';

  // Try to extract currency symbol (e.g., "PKR", "$", "€")
  const currencyMatch = priceString.match(/^([^\d\s.,]+)/);
  let currencySymbol = currencyMatch ? currencyMatch[1].trim() : '';

  // If no symbol found, use currency code
  if (!currencySymbol) {
    const currency = product.currencyCode || 'USD';
    currencySymbol =
      currency === 'USD'
        ? '$'
        : currency === 'PKR'
          ? 'PKR'
          : currency === 'EUR'
            ? '€'
            : currency;
  }

  // Calculate per day price
  // Try to extract numeric value from priceString first (more reliable)
  let numericPrice = pricePerMonth;
  if (priceString) {
    // Extract number from price string (handles formats like "PKR4,900.00" or "$19.99")
    const numberMatch = priceString.replace(/[^\d.,]/g, '').replace(',', '');
    const parsedPrice = parseFloat(numberMatch);
    if (!isNaN(parsedPrice) && parsedPrice > 0) {
      numericPrice = parsedPrice;
    }
  }

  // Calculate per day
  const perDay = numericPrice / 30;

  // Format with proper decimal places
  const formattedPerDay = perDay.toFixed(2);

  return `${currencySymbol}${formattedPerDay}/day`;
}

function calcCompareAt(product: PurchasesStoreProduct, multiplier: number) {
  if (!multiplier) return { compareAtString: '', savePct: 0 };

  // Extract numeric value from priceString (more reliable than raw price values)
  // This handles cases where price might be in different units on different platforms
  const priceString = product.pricePerMonthString || product.priceString || '';
  let base = 0;

  if (priceString) {
    // Extract number from price string (handles formats like "PKR4,900.00" or "$19.99")
    const numberMatch = priceString.replace(/[^\d.,]/g, '').replace(',', '');
    const parsedPrice = parseFloat(numberMatch);
    if (!isNaN(parsedPrice) && parsedPrice > 0) {
      base = parsedPrice;
    }
  }

  // Fallback to raw price values if priceString parsing fails
  if (!base) {
    base = product.pricePerMonth ?? product.price ?? 0;
    // If the value seems too large (might be in cents/paise), divide by 100
    // For PKR: 1 PKR = 100 paise, for USD: 1 USD = 100 cents
    if (
      base > 10000 &&
      (product.currencyCode === 'PKR' || product.currencyCode === 'USD')
    ) {
      base = base / 100;
    }
  }

  if (!base) return { compareAtString: '', savePct: 0 };

  // Presentation-only compare-at
  const compareAt = Math.round(base * multiplier * 100) / 100;
  const savePct = Math.max(
    0,
    Math.round(((compareAt - base) / compareAt) * 100)
  );

  // Extract currency symbol from priceString if available
  const currencyMatch = priceString.match(/^([^\d\s.,]+)/);
  let currencySymbol = currencyMatch ? currencyMatch[1].trim() : '';

  // If no symbol found, use currency code
  if (!currencySymbol) {
    const currency = product.currencyCode || 'USD';
    currencySymbol =
      currency === 'USD'
        ? '$'
        : currency === 'PKR'
          ? 'PKR'
          : currency === 'EUR'
            ? '€'
            : currency;
  }

  // Format compareAt string with currency symbol
  const compareAtString = `${currencySymbol}${compareAt.toFixed(2)}`;

  return { compareAtString, savePct };
}

export default function PremiumPaywallScreen({
  navigation,
  route,
  onClose,
}: Props) {
  const { width } = useWindowDimensions();
  const { currentUser, updateCurrentUser } = useGlobalContext();
  const { setData, storageKeys } = StorageManager;

  const [loaderModal, setLoaderModal] = useState({
    visible: false,
    message: '',
  });

  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [loading, setLoading] = useState(true);

  const CARD_GAP = 12;
  const CARD_WIDTH = Math.min(width * 0.86, 420);
  const SIDE = (width - CARD_WIDTH) / 2;

  const scrollX = useMemo(() => new Animated.Value(0), []);
  const listRef = useRef<FlatList<PurchasesPackage>>(null);

  // Fetch packages from RevenueCat on mount if not provided
  useEffect(() => {
    // Fetch packages from RevenueCat
    const fetchPackages = async () => {
      try {
        const offerings = await Purchases.getOfferings();
        if (offerings?.current?.availablePackages) {
          console.log(
            'offerings.current.availablePackages',
            offerings.current.availablePackages
          );
          setPackages(offerings.current.availablePackages);
        }
      } catch (error) {
        console.error('Error fetching packages from RevenueCat:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPackages();
  }, []);

  const recommendedIndex = useMemo(
    () => findRecommendedIndex(packages),
    [packages]
  );
  const [index, setIndex] = useState(0);

  // Update index when packages are loaded or recommendedIndex changes
  useEffect(() => {
    if (packages.length > 0 && recommendedIndex >= 0) {
      // Use setTimeout for Android compatibility
      const timer = setTimeout(() => {
        setIndex(recommendedIndex);
        try {
          listRef.current?.scrollToIndex({
            index: recommendedIndex,
            animated: false,
          });
        } catch {
          // Fallback: scroll to offset if scrollToIndex fails (common on Android)
          const offset = recommendedIndex * (CARD_WIDTH + CARD_GAP);
          listRef.current?.scrollToOffset({
            offset,
            animated: false,
          });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [recommendedIndex, packages.length, CARD_WIDTH, CARD_GAP]);

  const mergedPlanUI = useMemo(() => {
    return { ...DEFAULT_PLAN_UI };
  }, []);

  const viewabilityConfig = useMemo(
    () => ({ itemVisiblePercentThreshold: 50 }),
    []
  );
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems?.[0];
      if (first?.index != null) {
        setIndex(first.index);
      }
    },
    []
  );

  const onMomentumScrollEnd = useCallback(
    (event: { nativeEvent: { contentOffset: { x: number } } }) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const newIndex = Math.round(offsetX / (CARD_WIDTH + CARD_GAP));
      if (newIndex >= 0 && newIndex < packages.length) {
        setIndex(newIndex);
      }
    },
    [packages.length, CARD_WIDTH, CARD_GAP]
  );

  const onScrollEnd = useCallback(
    (event: { nativeEvent: { contentOffset: { x: number } } }) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const newIndex = Math.round(offsetX / (CARD_WIDTH + CARD_GAP));
      if (newIndex >= 0 && newIndex < packages.length) {
        setIndex(newIndex);
      }
    },
    [packages.length, CARD_WIDTH, CARD_GAP]
  );

  const selected = packages[index];

  const handleSelect = (i: number) => {
    setIndex(i);
    listRef.current?.scrollToIndex({ index: i, animated: true });
  };

  const hideLoaderModal = () =>
    setLoaderModal({
      visible: false,
      message: '',
    });

  // Helper function to extract expiration date from customerInfo
  const getExpirationDate = (customerInfo: any): string | null => {
    return (
      customerInfo?.latestExpirationDate ||
      customerInfo?.customerInfo?.latestExpirationDate ||
      null
    );
  };

  // Helper function to check if subscription is active
  const isSubscriptionActive = (customerInfo: any): boolean => {
    const hasActiveSubscriptions =
      customerInfo?.activeSubscriptions?.length > 0;
    const hasExpirationDate = !!getExpirationDate(customerInfo);
    return hasActiveSubscriptions || hasExpirationDate;
  };

  // Helper function to update user and navigate after successful purchase
  const handlePurchaseSuccess = async (
    customerInfo: any,
    packageToPurchase?: PurchasesPackage
  ) => {
    const expirationDate = getExpirationDate(customerInfo);
    if (!expirationDate) {
      hideLoaderModal();
      flashErrorMessage(LanguageKeys.commonErrorMessage);
      return;
    }

    const updatedUser = {
      ...currentUser,
      membership_expiry: expirationDate,
      membership_status: 1,
    };
    updateCurrentUser(updatedUser);
    await setData(storageKeys.USER, updatedUser);
    hideLoaderModal();
    flashSuccessMessage(LanguageKeys.upgradedSuccessfully);

    const navigateTo = route?.params?.navigateTo;
    if (navigateTo && navigateTo === 'goBack') {
      navigation?.goBack();
    } else {
      navigation?.reset({
        index: 0,
        routes: [
          {
            name: 'MembershipCongrats',
            params: {
              amount: packageToPurchase?.product?.price || 0,
              localizedPrice: packageToPurchase?.product?.priceString,
              currencyCode: packageToPurchase?.product?.currencyCode,
              title: packageToPurchase?.product?.title || 'Premium',
            },
          },
        ],
      });
    }
  };

  // Helper function to get user-friendly error message
  const getErrorMessage = (error: any): string => {
    // Check if user cancelled
    if (
      error?.userCancelled === true ||
      error?.code === 'USER_CANCELLED' ||
      error?.code === 'PURCHASE_CANCELLED'
    ) {
      return ''; // Don't show error for user cancellation
    }

    // Check for network errors
    if (
      error?.code === 'NETWORK_ERROR' ||
      error?.message?.toLowerCase().includes('network') ||
      error?.message?.toLowerCase().includes('connection')
    ) {
      return 'Network error. Please check your internet connection and try again.';
    }

    // Check for payment errors
    if (
      error?.code === 'PAYMENT_PENDING' ||
      error?.code === 'PAYMENT_INVALID'
    ) {
      return 'Payment error. Please check your payment method and try again.';
    }

    // Check for store errors
    if (
      error?.code === 'STORE_PROBLEM' ||
      error?.code === 'PRODUCT_NOT_AVAILABLE'
    ) {
      return 'Product not available. Please try again later.';
    }

    // Default error message
    return error?.message || LanguageKeys.commonErrorMessage;
  };

  const handleSubscribe = async (pkg?: PurchasesPackage) => {
    const packageToPurchase = pkg || selected;
    if (!packageToPurchase) {
      flashErrorMessage(LanguageKeys.selectPackageToSubscribe);
      return;
    }

    setLoaderModal({
      visible: true,
      message: LanguageKeys.loading,
    });

    try {
      const customerInfo = await Purchases.purchasePackage(packageToPurchase);

      if (isSubscriptionActive(customerInfo)) {
        await handlePurchaseSuccess(customerInfo, packageToPurchase);
      } else {
        hideLoaderModal();
        flashErrorMessage(LanguageKeys.subscriptionNotVerified);
      }
    } catch (error: any) {
      hideLoaderModal();
      const errorMessage = getErrorMessage(error);
      if (errorMessage) {
        flashErrorMessage(errorMessage);
      }
    }
  };

  const handleRestore = async () => {
    setLoaderModal({
      visible: true,
      message: LanguageKeys.loading,
    });

    try {
      const customerInfo = await Purchases.restorePurchases();

      if (isSubscriptionActive(customerInfo)) {
        await handlePurchaseSuccess(customerInfo);
      } else {
        hideLoaderModal();
        flashErrorMessage('restoreSubscriptionErrorMessage');
      }
    } catch (error: any) {
      hideLoaderModal();
      const errorMessage = getErrorMessage(error);
      if (errorMessage) {
        flashErrorMessage(errorMessage);
      } else {
        // If no specific error message, show generic restore error
        flashErrorMessage('restoreSubscriptionErrorMessage');
      }
    }
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
      return;
    }
    if (route?.params?.from === 'SignUp') {
      navigation?.reset({
        index: 0,
        routes: [{ name: 'BottomTab' }],
      });
    } else {
      navigation?.goBack();
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
      <StatusBar
        translucent={true}
        barStyle={'dark-content'}
        backgroundColor={'transparent'}
      />
      <ModalLoader
        visible={loaderModal.visible}
        message={loaderModal.message}
      />
      <View style={styles.bg} />

      <View style={styles.container}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>Find the right match faster</Text>
            <Text style={styles.sub}>
              See who likes you, filter for serious matches, and get priority
              visibility.
            </Text>
          </View>

          {handleClose && (
            <Pressable onPress={handleClose} style={styles.closeBtn}>
              <AntDesign name="close" size={wp(5)} color={Colors.primary} />
            </Pressable>
          )}
        </View>

        {/* Swipe Cards */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading packages...</Text>
          </View>
        ) : packages.length === 0 ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>No packages available</Text>
          </View>
        ) : (
          <Animated.FlatList
            ref={listRef as any}
            data={packages}
            keyExtractor={(item) => item.product.identifier}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={CARD_WIDTH + CARD_GAP}
            snapToAlignment="center"
            decelerationRate="fast"
            bounces={false}
            contentContainerStyle={{
              paddingHorizontal: 0,
              paddingVertical: 0,
            }}
            getItemLayout={(_, i) => ({
              length: CARD_WIDTH + CARD_GAP,
              offset: (CARD_WIDTH + CARD_GAP) * i,
              index: i,
            })}
            initialScrollIndex={
              recommendedIndex >= 0 && packages.length > 0
                ? recommendedIndex
                : undefined
            }
            onScrollToIndexFailed={(info) => {
              // Fallback for Android if scrollToIndex fails
              setTimeout(() => {
                listRef.current?.scrollToOffset({
                  offset: info.averageItemLength * info.index,
                  animated: false,
                });
              }, 500);
            }}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { x: scrollX } } }],
              { useNativeDriver: false }
            )}
            onScrollEndDrag={onScrollEnd}
            onMomentumScrollEnd={onMomentumScrollEnd}
            scrollEventThrottle={16}
            viewabilityConfig={viewabilityConfig}
            onViewableItemsChanged={onViewableItemsChanged}
            renderItem={({ item, index: i }) => {
              // Try multiple sources for matching: product identifier, product title, package identifier
              const productId = normalizeProductId(item.product.identifier);
              const productTitle = normalizeProductId(item.product.title);
              const packageId = normalizeProductId(item.identifier);

              // Try to find matching plan
              let plan =
                mergedPlanUI[productId] ||
                mergedPlanUI[productTitle] ||
                mergedPlanUI[packageId];

              // If still no match, try to find by keywords in any of the identifiers
              if (!plan) {
                const searchText =
                  `${productId} ${productTitle} ${packageId}`.toLowerCase();
                if (
                  searchText.includes('plus') ||
                  searchText.includes('starter')
                ) {
                  plan = mergedPlanUI['plus_starter'];
                } else if (
                  searchText.includes('pro') ||
                  searchText.includes('recommended')
                ) {
                  plan = mergedPlanUI['pro_recommended'];
                } else if (
                  searchText.includes('elite') ||
                  searchText.includes('highest')
                ) {
                  plan = mergedPlanUI['elite_highest_visibility'];
                }
              }

              const isSelected = i === index;
              const price = formatMoneyFromProduct(item.product);
              const weekly = item.product.pricePerWeekString || '';
              const perDay = formatPerDayPrice(
                item.product,
                item.product.pricePerMonth
              );

              const { compareAtString, savePct } = calcCompareAt(
                item.product,
                plan?.compareAtMultiplier || 0
              );

              return (
                <View
                  style={{
                    width: CARD_WIDTH,
                    marginRight: i === packages.length - 1 ? 0 : CARD_GAP,
                    // backgroundColor: 'red',
                    justifyContent: 'center',
                  }}
                >
                  <PackageCard
                    item={item}
                    index={i}
                    isSelected={isSelected}
                    plan={plan}
                    price={price}
                    perDay={perDay}
                    weekly={weekly}
                    compareAtString={compareAtString}
                    savePct={savePct}
                    cardWidth={CARD_WIDTH}
                    cardGap={CARD_GAP}
                    isLast={i === packages.length - 1}
                    onSelect={handleSelect}
                    onSubscribe={handleSubscribe}
                  />
                </View>
              );
            }}
          />
        )}

        {/* Dots */}
        {!loading && packages.length > 0 && (
          <PaginationDots
            packages={packages}
            currentIndex={index}
            scrollX={scrollX}
            cardWidth={CARD_WIDTH}
            cardGap={CARD_GAP}
            onSelect={handleSelect}
          />
        )}

        {/* Fine Print */}
        {!loading && packages.length > 0 && <FinePrint />}

        {/* Terms and Conditions */}
        {!loading && packages.length > 0 && <TermsAndConditions />}

        {/* Footer actions */}
        {!loading && <Footer onRestore={handleRestore} />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.appBg },
  bg: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Colors.appBg,
  },
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 18 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 18,
  },
  h1: {
    fontFamily: Fonts.DISPLAY,
    fontSize: 24,
    lineHeight: 34,
    paddingTop: 2,
    color: Colors.ink,
  },
  sub: {
    fontFamily: Fonts.APPFONT_R,
    includeFontPadding: false,
    fontSize: 13,
    lineHeight: 19,
    color: Colors.muted,
    marginTop: 6,
  },

  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.lavender,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_R,
    fontSize: 14,
    marginTop: 12,
    includeFontPadding: false,
  },
});
