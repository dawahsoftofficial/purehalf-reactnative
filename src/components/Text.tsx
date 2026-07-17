import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type StyleProp,
  Text as RNText,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';

import { CheckRtl } from '../languages';
import { Fonts } from '../res';

type TextProps = {
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  /**
   * Shrinks the text to fit within `numberOfLines` before wrapping/truncating —
   * used for long single-line labels (e.g. profile section titles) that must
   * not wrap. Only applied to single-string children.
   */
  adjustsFontSizeToFit?: boolean;
  minimumFontScale?: number;
  testID?: string;
  containerStyle?: StyleProp<ViewStyle>;
  /**
   * 'display' applies the editorial serif face. Serif is Latin/LTR only —
   * in RTL (Urdu) it silently falls back to the default sans styling.
   */
  variant?: 'display';
  children: string | string[];
};

const Text = React.memo((props: TextProps) => {
  const { t } = useTranslation();
  const Rtl = CheckRtl();
  const {
    style,
    numberOfLines,
    adjustsFontSizeToFit,
    minimumFontScale,
    testID,
    containerStyle,
    variant,
    children,
  } = props;

  const textStyle = useMemo<StyleProp<TextStyle>>(() => {
    const alignSelf: TextStyle = {
      alignSelf: Rtl ? ('flex-end' as const) : ('flex-start' as const),
    };
    // Serif display face for LTR; bold Poppins fallback for RTL (Urdu has no serif).
    const display: StyleProp<TextStyle> =
      variant === 'display'
        ? { fontFamily: Rtl ? Fonts.APPFONT_B : Fonts.DISPLAY }
        : null;
    return [alignSelf, display, style];
  }, [Rtl, style, variant]);

  // Handle string children
  if (typeof children === 'string') {
    return (
      <RNText
        style={textStyle}
        numberOfLines={numberOfLines}
        adjustsFontSizeToFit={adjustsFontSizeToFit}
        minimumFontScale={minimumFontScale}
        testID={testID}
      >
        {t(children)}
      </RNText>
    );
  }

  // Handle array of strings
  if (Array.isArray(children) && children.length > 0) {
    return (
      <View
        style={[
          containerStyle,
          { flexDirection: Rtl ? 'row-reverse' : 'row', alignItems: 'center' },
        ]}
      >
        {children.map((element: string, index: number) => (
          <RNText style={textStyle} key={index}>
            {t(element)}
          </RNText>
        ))}
      </View>
    );
  }

  // Return null for empty/invalid children
  return null;
});

Text.displayName = 'Text';

export default Text;
