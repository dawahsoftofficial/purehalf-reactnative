import { t } from 'i18next';
import React, { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Ripple from 'react-native-material-ripple';
import Entypo from 'react-native-vector-icons/Entypo';

import { Animation } from '../../animations';
import {
  Button,
  Container,
  Header,
  Picker,
  SocialLinks,
  Text,
} from '../../components';
import { hp, Typography, wp } from '../../global';
import { CheckRtl, LanguageKeys } from '../../languages';
import { Colors, Fonts } from '../../res';
import {
  ApiServices,
  flashSuccessMessage,
  StorageManager,
} from '../../services';

const ContactSupport = ({ navigation }: any) => {
  const { setData, getData, storageKeys } = StorageManager;

  const Rtl = CheckRtl();
  const [reasonsList, setReasonsList] = useState();
  const [selectedReason, setSelectedReason] = useState({ id: '', value: '' });
  const [comment, setComment] = useState('');
  const [pickerVisible, setPickerVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  const onClosePicker = () => setPickerVisible(false);
  const showPicker = () => setPickerVisible(true);

  const onPickerItemPress = (item: any) => {
    setPickerVisible(false);
    setSelectedReason(item);
  };

  const onSubmit = () => {
    setLoading(true);
    ApiServices.storeQuery({
      type: 1,
      description: comment,
      source: selectedReason?.id,
      reason: selectedReason?.id,
    })
      .then(async () => {
        setComment('');
        setSelectedReason({ id: '', value: '' });
        flashSuccessMessage(LanguageKeys.submittedSuccessfully);
        setLoading(false);
      })
      .catch((error) => {
        console.log(error);
        setLoading(false);
      });
  };

  useEffect(() => {
    getData(storageKeys.ATTRIBUTE).then((res: any) => {
      const queryAttribute = res['other-0']['query-0'];
      if (queryAttribute && queryAttribute?.length !== 0) {
        setReasonsList(queryAttribute);
      }
    });
  }, []);

  return (
    <Container style={Styles.screen}>
      <Header
        title={LanguageKeys.contactSupport}
        navigation={navigation}
        titleVariant="display"
      />

      <ScrollView
        contentContainerStyle={Styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Animation
          style={Styles.animationContainer}
          animation={'zoomInUp'}
          duration={500}
        >
          <Text variant="display" style={Styles.heading}>
            {LanguageKeys.helpandsupport}
          </Text>
          {/* <Text style={Styles.description}>
            {LanguageKeys.whatWouldYouLikeToTalkAbout}
          </Text> */}
          <Text style={Styles.description}>
            {LanguageKeys.shareSomeDetails}
          </Text>
          <Ripple style={Styles.reasonBtn} onPress={showPicker}>
            <Text
              style={[
                Styles.reasonBtnTxt,
                {
                  color:
                    selectedReason?.value?.length === 0
                      ? Colors.muted
                      : Colors.ink,
                },
              ]}
            >
              {selectedReason?.value?.length === 0
                ? LanguageKeys.selectAReason
                : selectedReason?.value}
            </Text>
            <View style={Styles.arrowCon}>
              <Entypo name="chevron-down" color={Colors.primary} size={22} />
            </View>
          </Ripple>
        </Animation>
        <Animation
          style={Styles.animationContainer}
          animation={'fadeInDown'}
          duration={700}
        >
          <TextInput
            style={[Styles.input, { textAlign: Rtl ? 'right' : 'left' }]}
            multiline
            placeholder={`${t(LanguageKeys.addYourComment)}`}
            placeholderTextColor={Colors.muted}
            value={comment}
            onChangeText={(text) => setComment(text)}
          />
        </Animation>
        <SocialLinks />
      </ScrollView>

      <View style={Styles.legalRow}>
        <Ripple
          onPress={() =>
            Linking.openURL('https://purehalf.com/terms-conditions/')
          }
        >
          <Text style={Styles.underline}>{t('termsAndConditions')}</Text>
        </Ripple>
        <Text style={Styles.legalDot}>·</Text>
        <Ripple
          onPress={() =>
            Linking.openURL('https://purehalf.com/privacy-policy/')
          }
        >
          <Text style={Styles.underline}>{t('privacyPolicy')}</Text>
        </Ripple>
      </View>

      <Animation duration={500}>
        <Button
          text={LanguageKeys.submit}
          buttonStyle={Styles.button}
          loading={loading}
          disabled={!selectedReason?.value || !comment}
          onPress={onSubmit}
        />
      </Animation>

      <Picker
        visible={pickerVisible}
        onClose={onClosePicker}
        onPress={onPickerItemPress}
        data={reasonsList}
        headerTitle={LanguageKeys.selectAReason}
      />
    </Container>
  );
};

export default ContactSupport;

const Styles = StyleSheet.create({
  screen: {
    backgroundColor: Colors.appBg,
  },
  container: {
    flexGrow: 1,
    paddingTop: hp(6),
    alignItems: 'center',
    paddingHorizontal: wp(4),
  },
  animationContainer: {
    alignItems: 'center',
  },
  heading: {
    color: Colors.ink,
    fontSize: Typography.large1,
    includeFontPadding: false,
    alignSelf: 'center',
  },
  description: {
    textAlign: 'center',
    marginHorizontal: wp(4),
    marginTop: hp(2),
    fontFamily: Fonts.APPFONT_R,
    includeFontPadding: false,
    fontSize: Typography.small2,
    color: Colors.muted,
    alignSelf: 'center',
  },
  description1: {
    textAlign: 'center',
    marginHorizontal: wp(4),
    fontFamily: Fonts.APPFONT_R,
    includeFontPadding: false,
    fontSize: Typography.small2,
    alignSelf: 'center',
  },
  reasonBtn: {
    borderWidth: 1.4,
    borderColor: Colors.hairline,
    backgroundColor: Colors.surface,
    marginTop: hp(3.5),
    width: wp(85),
    borderRadius: 14,
    height: 60,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: wp(4),
  },
  arrowCon: {
    backgroundColor: Colors.lavender,
    width: 30,
    height: 30,
    borderRadius: 30 / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reasonBtnTxt: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_M,
    fontSize: Typography.small2,
    includeFontPadding: false,
    alignSelf: 'center',
  },
  input: {
    borderWidth: 1.4,
    borderColor: Colors.hairline,
    backgroundColor: Colors.surface,
    color: Colors.ink,
    fontFamily: Fonts.APPFONT_M,
    fontSize: Typography.small2,
    marginTop: 15,
    width: wp(85),
    height: hp(25),
    borderRadius: 14,
    paddingHorizontal: wp(3),
    paddingTop: hp(1.8),
    textAlignVertical: 'top',
  },
  button: {
    marginHorizontal: wp(6),
    marginVertical: hp(4),
  },
  underline: {
    color: Colors.primary,
    fontFamily: Fonts.APPFONT_M,
    includeFontPadding: false,
    fontSize: Typography.small1,
    alignSelf: 'center',
    textDecorationLine: 'underline',
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: wp(3),
    marginTop: hp(1),
  },
  legalDot: {
    color: Colors.muted,
    fontSize: Typography.small1,
  },
});
