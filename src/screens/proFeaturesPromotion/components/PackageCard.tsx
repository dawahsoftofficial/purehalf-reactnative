import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type PurchasesPackage } from 'react-native-purchases';

import { Colors, Fonts } from '@/res';

type PlanUI = {
  badge: string;
  badgeVariant: 'neutral' | 'recommended';
  tagline: string;
  bullets: string[];
  emphasize: boolean;
  compareAtMultiplier?: number;
};

type PackageCardProps = {
  item: PurchasesPackage;
  index: number;
  isSelected: boolean;
  plan: PlanUI | undefined;
  price: string;
  perDay: string;
  weekly: string;
  compareAtString: string;
  savePct: number;
  cardWidth: number;
  cardGap: number;
  isLast: boolean;
  onSelect: (index: number) => void;
  onSubscribe: (item: PurchasesPackage) => void;
};

export function PackageCard({
  item,
  index,
  isSelected,
  plan,
  price,
  perDay,
  weekly,
  compareAtString,
  savePct,
  cardWidth,
  cardGap,
  isLast,
  onSelect,
  onSubscribe,
}: PackageCardProps) {
  const isProEmphasis = !!plan?.emphasize;

  const getButtonText = () => {
    const identifier = item.identifier?.toLowerCase() || '';
    const productTitle = item.product?.title?.toLowerCase() || '';
    const productId = item.product?.identifier?.toLowerCase() || '';
    const searchText = `${identifier} ${productTitle} ${productId}`;

    if (searchText.includes('plus') || searchText.includes('starter')) {
      return 'Get Plus';
    }
    if (searchText.includes('pro') || searchText.includes('recommended')) {
      return 'Start Pro';
    }
    if (
      searchText.includes('elite') ||
      searchText.includes('highest') ||
      searchText.includes('visibility')
    ) {
      return 'Go Elite';
    }
    return 'Select Plan';
  };

  // Emphasized (Pro) card = solid violet with light text; neutral cards =
  // white surface with ink text. All colors resolve from this one map so the
  // JSX below stays presentation-agnostic.
  const c = isProEmphasis
    ? {
        name: Colors.surface,
        badgeBg: 'rgba(255,255,255,0.16)',
        badgeText: Colors.lavender,
        tagline: '#C9BEE6',
        price: Colors.surface,
        per: '#C9BEE6',
        was: '#A99BCF',
        savePillBg: Colors.surface,
        savePillText: Colors.primary,
        tickBg: 'rgba(255,255,255,0.16)',
        tickText: Colors.surface,
        bullet: '#EDE9F6',
        ctaBg: Colors.surface,
        ctaText: Colors.primary,
        ctaBorder: Colors.surface,
      }
    : {
        name: Colors.ink,
        badgeBg: Colors.lavender,
        badgeText: Colors.primary,
        tagline: Colors.muted,
        price: Colors.ink,
        per: Colors.muted,
        was: Colors.muted,
        savePillBg: Colors.lavender,
        savePillText: Colors.primary,
        tickBg: Colors.lavender,
        tickText: Colors.primary,
        bullet: Colors.ink,
        ctaBg: 'transparent',
        ctaText: Colors.primary,
        ctaBorder: Colors.primary,
      };

  return (
    <View
      style={{
        width: cardWidth,
        marginRight: isLast ? 0 : cardGap,
        alignItems: 'center',
      }}
    >
      <Pressable
        onPress={() => onSelect(index)}
        style={[
          styles.card,
          { width: cardWidth },
          isProEmphasis ? styles.cardEmphasis : styles.cardNeutral,
          isSelected && !isProEmphasis && styles.cardSelected,
        ]}
      >
        {/* Badge Row */}
        <View style={styles.badgeRow}>
          <Text style={[styles.planName, { color: c.name }]}>
            {item.identifier?.split('(')[0]?.trim()}
          </Text>

          <View style={[styles.badge, { backgroundColor: c.badgeBg }]}>
            <Text
              style={[styles.badgeText, { color: c.badgeText }]}
              numberOfLines={1}
            >
              {plan?.badge || 'Plan'}
            </Text>
          </View>
        </View>

        <Text style={[styles.tagline, { color: c.tagline }]}>
          {plan?.tagline || item.product.description || ''}
        </Text>

        {/* Price */}
        <View style={styles.priceRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.now, { color: c.price }]}>{price}</Text>
            <Text style={[styles.per, { color: c.per }]}>
              per month {perDay ? `· ~${perDay}` : ''}{' '}
              {weekly ? `· ${weekly}/wk` : ''}
            </Text>

            {!!compareAtString && (
              <Text style={[styles.was, { color: c.was }]}>
                <Text style={styles.strike}>{compareAtString}</Text> original
              </Text>
            )}
          </View>

          {!!savePct && (
            <View style={[styles.savePill, { backgroundColor: c.savePillBg }]}>
              <Text style={[styles.saveText, { color: c.savePillText }]}>
                Save {savePct}%
              </Text>
            </View>
          )}
        </View>

        {/* Bullets */}
        <View style={styles.bullets}>
          {(plan?.bullets || []).map((b, bi) => (
            <View key={`${item.identifier}-${bi}`} style={styles.bulletRow}>
              <View style={[styles.tick, { backgroundColor: c.tickBg }]}>
                <Text style={[styles.tickText, { color: c.tickText }]}>✓</Text>
              </View>
              <Text style={[styles.bulletText, { color: c.bullet }]}>{b}</Text>
            </View>
          ))}
        </View>

        {/* In-card CTA button */}
        <Pressable
          onPress={() => {
            onSelect(index);
            onSubscribe(item);
          }}
          style={[
            styles.cardCta,
            { backgroundColor: c.ctaBg, borderColor: c.ctaBorder },
          ]}
        >
          <Text style={[styles.cardCtaText, { color: c.ctaText }]}>
            {getButtonText()}
          </Text>
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 16,
    paddingBottom: 14,
    overflow: 'hidden',
    marginBottom: 14,
    minHeight: 345,
  },
  cardNeutral: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.hairline,
  },
  cardEmphasis: {
    backgroundColor: Colors.primary,
    borderWidth: 1,
    borderColor: Colors.primary,
    transform: [{ translateY: -2 }],
  },
  cardSelected: {
    borderColor: Colors.primaryLite,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 6,
  },
  planName: {
    fontFamily: Fonts.APPFONT_B,
    includeFontPadding: false,
    fontSize: 18,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: Fonts.APPFONT_B,
    includeFontPadding: false,
  },
  tagline: {
    marginTop: 0,
    marginBottom: 6,
    fontFamily: Fonts.APPFONT_R,
    includeFontPadding: false,
    fontSize: 12,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
    marginVertical: 6,
  },
  now: {
    fontFamily: Fonts.APPFONT_B,
    includeFontPadding: false,
    fontSize: 26,
    letterSpacing: -0.78,
  },
  per: {
    marginTop: 2,
    fontFamily: Fonts.APPFONT_M,
    fontSize: 12,
    includeFontPadding: false,
  },
  was: {
    marginTop: 6,
    fontFamily: Fonts.APPFONT_M,
    fontSize: 12,
    includeFontPadding: false,
  },
  strike: {
    textDecorationLine: 'line-through',
    includeFontPadding: false,
  },
  savePill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
  },
  saveText: {
    fontFamily: Fonts.APPFONT_B,
    fontSize: 12,
    textAlign: 'center',
    includeFontPadding: false,
  },
  bullets: { marginVertical: 10 },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  tick: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    flexShrink: 0,
  },
  tickText: {
    fontSize: 12,
    fontFamily: Fonts.APPFONT_B,
    includeFontPadding: false,
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Fonts.APPFONT_R,
    includeFontPadding: false,
  },
  cardCta: {
    marginTop: 10,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  cardCtaText: {
    fontFamily: Fonts.APPFONT_B,
    fontSize: 14,
    includeFontPadding: false,
  },
});
