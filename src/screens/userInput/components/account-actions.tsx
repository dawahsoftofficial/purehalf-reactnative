import React, { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Ripple from 'react-native-material-ripple';

import { Button, DeletePicker, Text } from '../../../components';
import { hp, Typography, wp } from '../../../global';
import { LanguageKeys } from '../../../languages';
import { Colors, Fonts } from '../../../res';

type AccountActionsProps = {
  onLogoutPress: () => void;
  onDeleteAccountPress: () => void;
};

function AccountActions({
  onLogoutPress,
  onDeleteAccountPress,
}: AccountActionsProps) {
  const [confirmLogoutVisible, setConfirmLogoutVisible] = useState(false);

  const hideConfirmLogout = () => setConfirmLogoutVisible(false);

  const onConfirmLogout = () => {
    hideConfirmLogout();
    onLogoutPress();
  };

  return (
    <View style={Styles.container}>
      <Button
        text={LanguageKeys.logOut}
        variant="outline"
        onPress={() => setConfirmLogoutVisible(true)}
        buttonStyle={Styles.logoutBtn}
      />
      <Ripple style={Styles.deleteBtn} onPress={onDeleteAccountPress}>
        <Text style={Styles.deleteText}>{LanguageKeys.deleteAccount}</Text>
      </Ripple>
      <DeletePicker
        visible={confirmLogoutVisible}
        headerTitle={LanguageKeys.logOutConfirm}
        actionButtonLabel={LanguageKeys.logOut}
        onClose={hideConfirmLogout}
        onDeletePress={onConfirmLogout}
        onCancelPress={hideConfirmLogout}
        useCustomModal={false}
      />
    </View>
  );
}

export default memo(AccountActions);

const Styles = StyleSheet.create({
  container: {
    paddingHorizontal: wp(4),
    paddingBottom: hp(2),
  },
  logoutBtn: {
    height: hp(6),
  },
  deleteBtn: {
    alignSelf: 'center',
    paddingVertical: hp(1.2),
    marginTop: hp(0.5),
  },
  deleteText: {
    fontSize: Typography.small2,
    fontFamily: Fonts.APPFONT_M,
    color: Colors.color24,
    alignSelf: 'center',
  },
});
