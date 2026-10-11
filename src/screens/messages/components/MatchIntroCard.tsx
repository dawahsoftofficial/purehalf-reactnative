import React from 'react';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, Text, View } from 'react-native';
import Ripple from 'react-native-material-ripple';

import { ProfilePhotoPlaceholder } from '../../../components';
import { hp, Typography, wp } from '../../../global';
import { Colors, Fonts } from '../../../res';
import { capitalizeName } from '../../../services';

interface MatchIntroCardProps {
  otherUserData: any;
  isBlockedYou: boolean;
  /** Omit to hide the button (e.g. the member's account is gone). */
  onViewProfilePress?: () => void;
  /**
   * Localized advice string in the "quote | source" format. When provided,
   * it renders inside the panel below a hairline divider.
   */
  quote?: string;
}

/**
 * Unified intro panel pinned at the top of a conversation (rendered as the
 * footer of the inverted message list): the match's photo, name, age and
 * location, plus the rotating hadith quote while the chat is still short —
 * one soft surface instead of a stack of bordered cards.
 */
const MatchIntroCard = ({
  otherUserData,
  isBlockedYou,
  onViewProfilePress,
  quote,
}: MatchIntroCardProps) => {
  const { t }: any = useTranslation();

  const metaParts = [
    otherUserData?.age,
    [otherUserData?.city, otherUserData?.country].filter(Boolean).join(', '),
  ].filter(Boolean);

  const [quoteText, quoteSource] = (quote ?? '').split('|');

  return (
    <View style={Styles.panel}>
      <View style={Styles.avatar}>
        {otherUserData?.image && !isBlockedYou ? (
          <Image
            source={{ uri: otherUserData.image }}
            resizeMode="cover"
            style={Styles.avatarImage}
          />
        ) : (
          <ProfilePhotoPlaceholder
            name={otherUserData?.name}
            size={wp(8)}
            centeredInitials
          />
        )}
      </View>
      <Text style={Styles.name} numberOfLines={1}>
        {capitalizeName(otherUserData?.name)}
      </Text>
      {metaParts.length > 0 && (
        <Text style={Styles.meta} numberOfLines={1}>
          {metaParts.join(' · ')}
        </Text>
      )}
      {onViewProfilePress ? (
        <Ripple
          style={Styles.viewProfileBtn}
          rippleColor={Colors.whiteRGBA30}
          onPress={onViewProfilePress}
        >
          <Text style={Styles.viewProfileText}>{t('viewProfile')}</Text>
        </Ripple>
      ) : null}
      {!!quoteText?.trim() && (
        <View style={Styles.quoteSection}>
          <Text style={Styles.quoteText}>{quoteText.trim()}</Text>
          {!!quoteSource?.trim() && (
            <Text style={Styles.quoteSource}>{quoteSource.trim()}</Text>
          )}
        </View>
      )}
    </View>
  );
};

const Styles = StyleSheet.create({
  panel: {
    backgroundColor: Colors.lavender,
    borderRadius: 20,
    alignItems: 'center',
    paddingTop: hp(2.4),
    paddingBottom: hp(1.8),
    paddingHorizontal: wp(4),
    marginBottom: hp(1.5),
  },
  avatar: {
    width: wp(17),
    height: wp(17),
    borderRadius: wp(8.5),
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: Colors.surface,
    marginBottom: hp(1.2),
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  name: {
    fontSize: Typography.medium,
    fontFamily: Fonts.APPFONT_B,
    color: Colors.ink,
    includeFontPadding: false,
  },
  meta: {
    fontSize: Typography.small1,
    fontFamily: Fonts.APPFONT_R,
    color: Colors.muted,
    includeFontPadding: false,
    marginTop: hp(0.4),
  },
  viewProfileBtn: {
    marginTop: hp(1.4),
    paddingVertical: hp(0.8),
    paddingHorizontal: wp(5.5),
    borderRadius: 16,
    backgroundColor: Colors.primary,
  },
  viewProfileText: {
    fontSize: Typography.small1,
    fontFamily: Fonts.APPFONT_M,
    color: Colors.color2,
    includeFontPadding: false,
  },
  quoteSection: {
    alignSelf: 'stretch',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.primaryRGBA12,
    marginTop: hp(1.8),
    paddingTop: hp(1.5),
    paddingHorizontal: wp(2),
  },
  quoteText: {
    fontSize: Typography.small1,
    fontFamily: Fonts.DISPLAY_R,
    color: Colors.muted,
    textAlign: 'center',
  },
  quoteSource: {
    fontSize: Typography.tiny1,
    fontFamily: Fonts.APPFONT_M,
    color: Colors.primaryMid,
    includeFontPadding: false,
    marginTop: hp(0.5),
  },
});

export default MatchIntroCard;
