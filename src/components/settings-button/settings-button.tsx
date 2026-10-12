import React, { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Ripple from 'react-native-material-ripple';
import AntDesign from 'react-native-vector-icons/AntDesign';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { Typography, wp } from '../../global';
import { CheckRtl } from '../../languages';
import { Colors, Fonts } from '../../res';
import Text from '../Text';

type SettingsButtonProps = {
  iconName: string;
  name: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  showDivider?: boolean;
};

function SettingsButton({
  iconName,
  name,
  onPress,
  loading = false,
  disabled = false,
  accessibilityLabel,
  showDivider = false,
}: SettingsButtonProps) {
  const Rtl = CheckRtl();
  const { t } = useTranslation();

  const iconElement = useMemo(
    () => (
      <View style={Styles.iconChip}>
        <Ionicons name={iconName} size={wp(5)} color={Colors.primary} />
      </View>
    ),
    [iconName]
  );

  const nameElement = useMemo(
    () => (
      <Text style={Styles.btnTxt} numberOfLines={1}>
        {name}
      </Text>
    ),
    [name]
  );

  const arrowElement = useMemo(
    () => (
      <AntDesign
        name={Rtl ? 'arrowleft' : 'arrowright'}
        color={Colors.primaryLite}
        size={wp(5)}
      />
    ),
    [Rtl]
  );

  return (
    <Ripple
      style={[Styles.btnCon, showDivider && Styles.divider]}
      onPress={onPress}
      disabled={disabled}
      hitSlop={Styles.hitSlop}
      // `name` is a translation key (Text translates it for display), so the
      // screen-reader label must be translated too, not announced raw.
      accessibilityLabel={t(accessibilityLabel ?? name)}
      accessibilityRole="button"
    >
      {Rtl && arrowElement}
      <View
        style={[
          Styles.btnConInner,
          { justifyContent: Rtl ? 'flex-end' : 'flex-start' },
        ]}
      >
        {!Rtl && iconElement}
        {nameElement}
        {Rtl && iconElement}
      </View>
      {!Rtl && (loading ? <ActivityIndicator /> : arrowElement)}
    </Ripple>
  );
}

export default memo(SettingsButton);

const Styles = StyleSheet.create({
  btnCon: {
    paddingVertical: wp(3.4),
    paddingHorizontal: wp(4),
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.hairline,
  },
  btnConInner: {
    width: wp(75),
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconChip: {
    width: wp(9.5),
    height: wp(9.5),
    borderRadius: 11,
    backgroundColor: Colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnTxt: {
    fontSize: Typography.small2,
    alignSelf: 'center',
    fontFamily: Fonts.APPFONT_M,
    marginHorizontal: wp(3),
    color: Colors.ink,
    includeFontPadding: false,
  },
  hitSlop: {
    top: 6,
    bottom: 6,
    left: 6,
    right: 6,
  },
});
