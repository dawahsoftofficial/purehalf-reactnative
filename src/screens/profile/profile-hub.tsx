/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Ripple from 'react-native-material-ripple';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { Text } from '../../components';
import { hp, Typography, wp } from '../../global';
import { LanguageKeys } from '../../languages';
import { stripLeadingEmoji } from '../../lib/utils/profile-utils';
import { Colors, Fonts } from '../../res';
import {
  countFilled,
  GROUP_META,
  type GroupMeta,
  previewOf,
} from './profile-completion';

export {
  computeCompletion,
  countFilled,
  GROUP_META,
  type GroupMeta,
} from './profile-completion';

export const SectionLabel = memo(function SectionLabel({
  label,
}: {
  label: string;
}) {
  return <Text style={Styles.sectionLabel}>{label}</Text>;
});

export const CompletionCard = memo(function CompletionCard({
  percent,
}: {
  percent: number;
}) {
  return (
    <View style={Styles.completionCard}>
      <View style={Styles.completionTop}>
        <Text style={Styles.completionTitle}>
          {LanguageKeys.profileStrength}
        </Text>
        <Text style={Styles.completionPct}>{`${percent}%`}</Text>
      </View>
      <View style={Styles.track}>
        <View style={[Styles.trackFill, { width: `${percent}%` }]} />
      </View>
    </View>
  );
});

type InterestsPreviewProps = {
  interests: any[];
  onEdit: () => void;
};

export const InterestsPreview = memo(function InterestsPreview({
  interests,
  onEdit,
}: InterestsPreviewProps) {
  const selected = (interests ?? []).filter((i) => i?.selected);
  const preview = selected
    .map((i) => stripLeadingEmoji(i?.value ?? '').trim())
    .filter((v) => v.length > 0)
    .slice(0, 3)
    .join(' · ');
  return (
    <View style={Styles.card}>
      <Ripple onPress={onEdit} style={Styles.row}>
        <View style={Styles.iconChip}>
          <Ionicons name="happy-outline" size={wp(5)} color={Colors.primary} />
        </View>
        <View style={Styles.rowText}>
          <Text style={Styles.rowTitle}>
            {LanguageKeys.myInterestAndHobbies}
          </Text>
          <Text style={Styles.rowPreview} numberOfLines={1}>
            {preview.length > 0 ? preview : LanguageKeys.tapToAdd}
          </Text>
        </View>
        {selected.length > 0 ? (
          // Interests have a cap (10) rather than a required total, so any
          // selection counts as filled — matching the green "done" pill the
          // other groups show at filled === total.
          <View style={[Styles.countPill, Styles.countPillDone]}>
            <Text style={[Styles.countTxt, Styles.countTxtDone]}>
              {String(selected.length)}
            </Text>
          </View>
        ) : null}
        <Ionicons
          name="chevron-forward"
          size={wp(5)}
          color={Colors.primaryLite}
        />
      </Ripple>
    </View>
  );
});

type DetailSectionListProps = {
  categoriesData: any;
  gender?: string;
  onOpenGroup: (group: GroupMeta) => void;
};

export const DetailSectionList = memo(function DetailSectionList({
  categoriesData,
  gender,
  onOpenGroup,
}: DetailSectionListProps) {
  return (
    <View style={Styles.card}>
      {GROUP_META.map((g, index) => {
        const group = categoriesData?.[g.key];
        const { filled, total } = countFilled(group, gender);
        const preview = previewOf(group, gender);
        return (
          <Ripple
            key={g.key}
            onPress={() => onOpenGroup(g)}
            style={[Styles.row, index > 0 && Styles.rowDivider]}
          >
            <View style={Styles.iconChip}>
              <Ionicons name={g.icon} size={wp(5)} color={Colors.primary} />
            </View>
            <View style={Styles.rowText}>
              <Text style={Styles.rowTitle}>{g.title}</Text>
              <Text style={Styles.rowPreview} numberOfLines={1}>
                {preview.length > 0 ? preview : LanguageKeys.tapToAdd}
              </Text>
            </View>
            {total > 0 ? (
              <View
                style={[
                  Styles.countPill,
                  filled === total && Styles.countPillDone,
                ]}
              >
                <Text
                  style={[
                    Styles.countTxt,
                    filled === total && Styles.countTxtDone,
                  ]}
                >
                  {`${filled}/${total}`}
                </Text>
              </View>
            ) : null}
            <Ionicons
              name="chevron-forward"
              size={wp(5)}
              color={Colors.primaryLite}
            />
          </Ripple>
        );
      })}
    </View>
  );
});

type SharePdfRowProps = {
  onPress: () => void;
};

export const SharePdfRow = memo(function SharePdfRow({
  onPress,
}: SharePdfRowProps) {
  return (
    <View style={Styles.card}>
      <Ripple onPress={onPress} style={Styles.row}>
        <View style={Styles.iconChip}>
          <Ionicons
            name="document-text-outline"
            size={wp(5)}
            color={Colors.primary}
          />
        </View>
        <View style={Styles.rowText}>
          <Text style={Styles.rowTitle}>{LanguageKeys.shareProfilePdf}</Text>
          <Text style={Styles.rowPreview} numberOfLines={1}>
            {LanguageKeys.shareProfilePdfSubtitle}
          </Text>
        </View>
        <View style={Styles.countPillDone}>
          <Text style={Styles.newBadgeTxt}>
            {LanguageKeys.sharePdfNewBadge}
          </Text>
        </View>
        <Ionicons
          name="chevron-forward"
          size={wp(5)}
          color={Colors.primaryLite}
        />
      </Ripple>
    </View>
  );
});

const Styles = StyleSheet.create({
  sectionLabel: {
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.tiny1,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Colors.muted,
    marginTop: hp(2.5),
    marginBottom: hp(1),
    marginHorizontal: wp(5),
  },
  completionCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.hairline,
    borderRadius: 16,
    padding: wp(4),
    marginHorizontal: wp(4),
    marginTop: hp(1),
  },
  completionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: hp(1.2),
  },
  completionTitle: {
    fontFamily: Fonts.APPFONT_M,
    fontSize: Typography.small2,
    color: Colors.ink,
  },
  completionPct: {
    fontFamily: Fonts.APPFONT_B,
    fontSize: Typography.small3,
    color: Colors.primary,
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.lavender,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.hairline,
    borderRadius: 16,
    marginHorizontal: wp(4),
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(3),
    paddingVertical: hp(1.6),
    paddingHorizontal: wp(4),
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: Colors.hairline,
  },
  iconChip: {
    width: wp(9.5),
    height: wp(9.5),
    borderRadius: 11,
    backgroundColor: Colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small2,
    color: Colors.ink,
  },
  rowPreview: {
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small1,
    color: Colors.muted,
    marginTop: hp(0.2),
  },
  countPill: {
    backgroundColor: Colors.lavender,
    borderRadius: 999,
    paddingVertical: hp(0.3),
    paddingHorizontal: wp(2.2),
  },
  countPillDone: {
    backgroundColor: 'rgba(46,158,91,0.12)',
  },
  countTxt: {
    fontFamily: Fonts.APPFONT_B,
    fontSize: Typography.tiny1,
    color: Colors.primary,
  },
  countTxtDone: {
    color: Colors.verified,
  },
  newBadgeTxt: {
    fontFamily: Fonts.APPFONT_B,
    fontSize: Typography.tiny1,
    color: Colors.verified,
    paddingHorizontal: wp(0.5),
  },
});
