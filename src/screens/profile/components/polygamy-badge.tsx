import React from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { Text } from '../../../components';
import { hp, Typography, wp } from '../../../global';
import { Colors, Fonts } from '../../../res';

// Prominent disclosure shown on a VIEWED profile when the person has marked
// themselves open to another (polygamous) marriage. Surfaced at the top of the
// profile so someone browsing/matching can't miss it — it also still appears as
// a row inside the detail card. The female-side "not a second wife" filter
// (backend `exclude_polygamy`) hides these profiles for women who opt out.
const PolygamyBadge = () => (
  <View style={Styles.wrap}>
    <View style={Styles.pill}>
      <Ionicons name="people-outline" size={wp(4)} color={Colors.primary} />
      <Text style={Styles.txt}>Open to second marriage</Text>
    </View>
  </View>
);

export default PolygamyBadge;

const Styles = StyleSheet.create({
  wrap: {
    marginHorizontal: wp(4),
    marginTop: hp(1.2),
    marginBottom: hp(2),
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(2),
    backgroundColor: Colors.lavender,
    borderColor: Colors.primary,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: wp(4),
    paddingVertical: hp(1.2),
  },
  txt: {
    color: Colors.primary,
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small1,
  },
});
