import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Ripple from 'react-native-material-ripple';
import AntDesign from 'react-native-vector-icons/AntDesign';

import { CountryPicker } from '../../components';
import { Text } from '../../components';
import { Button } from '../../components/buttons';
import { hp, Typography, wp } from '../../global';
import { CheckRtl, LanguageKeys } from '../../languages';
import { Colors, Fonts } from '../../res';
import {
  checkEmpty,
  Firebase,
  flashErrorMessage,
  useGlobalContext,
} from '../../services';

const PhoneNumber = () => {
  const { currentUser } = useGlobalContext();
  const navigation: any = useNavigation();
  const [loading, setLoading] = useState(false);
  const [phoneNumber] = useState(
    currentUser?.phone_number?.slice(3, currentUser?.phone_number?.length)
  );
  const [loadingMessage] = useState('Submitting...');
  const Rtl = CheckRtl();
  const [selectedCountry, setSelectedCountry] = useState({
    code: 'PK',
    dial_code: '+92',
    flag: '🇵🇰',
    name: 'Pakistan',
  });
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);

  const onPressFlagBtn = () => setCountryPickerVisible(true);
  const closeCountryPicker = () => setCountryPickerVisible(false);
  const hideLoading = () => setLoading(false);

  const onSelectCountry = (item: any) => {
    setSelectedCountry(item);
    setCountryPickerVisible(false);
  };

  const onContinuePress = () => {
    if (
      selectedCountry.dial_code === '+92' &&
      (phoneNumber.length < 10 || phoneNumber.length > 12)
    ) {
      flashErrorMessage(LanguageKeys.invalidPhoneNumber);
    } else if (selectedCountry.dial_code !== '+92' && phoneNumber.length < 6) {
      flashErrorMessage(LanguageKeys.invalidPhoneNumber);
    } else {
      const phoneNumberWithCode =
        selectedCountry.dial_code +
        (phoneNumber[0] === '0' ? phoneNumber.slice(1) : phoneNumber);
      if (phoneNumberWithCode !== currentUser?.phone_number) {
        flashErrorMessage(LanguageKeys.accountDeletionWrongNumber);
      } else {
        setLoading(true);
        Firebase.sendVerificationCode(phoneNumberWithCode)
          .then((verificationRes: any) => {
            setLoading(false);
            navigation.navigate('PurposeOfLeaving', {
              phoneNumber: phoneNumberWithCode,
              phoneNumberFirebaseRes: verificationRes,
            });
          })
          .catch(hideLoading);
      }
    }
  };

  return (
    <View>
      <View style={Styles.headingCon}>
        <Text style={Styles.heading}>{LanguageKeys.enterPhoneNumber}</Text>
      </View>

      <View
        style={{
          ...Styles.inputOuterContainer,
          flexDirection: Rtl ? 'row-reverse' : 'row',
        }}
      >
        <Ripple style={Styles.flagBtnCon} onPress={onPressFlagBtn}>
          <Text style={Styles.countryPickerTxt}>{selectedCountry.flag}</Text>
          <Text style={Styles.countryPickerTxt}>
            {selectedCountry.dial_code}
          </Text>
          <AntDesign name="caretdown" size={wp(3)} color={Colors.color1} />
        </Ripple>
        <TextInput
          style={Styles.phoneNumberInput}
          keyboardType="number-pad"
          value={phoneNumber}
          // onChangeText={onChangePhoneNumber}
        />
      </View>
      <View style={Styles.continueBtnCon}>
        <Button
          text={LanguageKeys.continue}
          onPress={onContinuePress}
          loading={loading}
          loadingMessage={loadingMessage}
          disabled={checkEmpty(phoneNumber) || loading}
        />
      </View>
      <CountryPicker
        visible={countryPickerVisible}
        onClose={closeCountryPicker}
        onPress={onSelectCountry}
      />
    </View>
  );
};

export default PhoneNumber;

const Styles = StyleSheet.create({
  contentContainer: {},
  continueBtnCon: {
    marginBottom: hp(3),
  },
  inputOuterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: hp(3),
    height: wp(11),
  },
  flagBtnCon: {
    height: wp(11),
    minWidth: wp(18),
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.color3,
    paddingHorizontal: wp(2),
  },
  countryPickerTxt: {
    fontSize: Typography.small2,
    marginRight: wp(1),
    color: Colors.color1,
    alignSelf: 'center',
  },
  phoneNumberInput: {
    color: Colors.color1,
    borderBottomWidth: 1,
    height: wp(11),
    width: wp(70),
    paddingVertical: hp(1),
    fontSize: Typography.medium,
  },
  headingCon: {
    marginBottom: hp(3),
  },
  heading: {
    fontSize: Typography.large,
    fontFamily: Fonts.APPFONT_B,
    color: Colors.color1,
  },
});
