import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  StyleSheet,
  Text as RNText,
  TouchableOpacity,
  View,
} from 'react-native';
import AntDesign from 'react-native-vector-icons/AntDesign';

import { Text } from '../../../components';
import { hp, Typography, wp } from '../../../global';
import Constants from '../../../global/Constants';
import { CheckRtl, LanguageKeys } from '../../../languages';
import { Colors, Fonts } from '../../../res';

type ResendTimerProps = {
  seconds: number;
  textColor: string;
  onResendPress: () => void;
};

function ResendTimer({ seconds, textColor, onResendPress }: ResendTimerProps) {
  const Rtl = CheckRtl();
  const { t } = useTranslation();

  if (seconds > 0) {
    return (
      <View
        style={[
          Styles.timerContainer,
          {
            alignSelf: Rtl ? 'flex-end' : 'flex-start',
            flexDirection: Rtl ? 'row' : 'row-reverse',
          },
        ]}
      >
        <RNText style={[Styles.timerText, { color: textColor }]}>
          {t(LanguageKeys.resendCodeIn, { seconds })}
        </RNText>
        <AntDesign
          name="clockcircleo"
          color={textColor}
          size={wp(5)}
          style={{ marginRight: wp(2) }}
        />
      </View>
    );
  }

  return (
    <TouchableOpacity
      onPress={onResendPress}
      activeOpacity={Constants.btnActiveOpacity}
    >
      <Text style={[Styles.resendCode, { color: textColor }]}>
        {LanguageKeys.resendCode}
      </Text>
    </TouchableOpacity>
  );
}

export default memo(ResendTimer);

const Styles = StyleSheet.create({
  timerContainer: {
    marginBottom: hp(3),
    alignItems: 'center',
    flexDirection: 'row',
  },
  timerText: {
    fontSize: Typography.small1,
    marginBottom: Constants.fontFamilyMarginBottom,
    fontFamily: Fonts.APPFONT_R,
    color: Colors.color2,
  },
  resendCode: {
    alignSelf: 'center',
    marginBottom: hp(2),
    fontSize: Typography.medium,
    color: Colors.color10,
    fontFamily: Fonts.APPFONT_B,
  },
});
