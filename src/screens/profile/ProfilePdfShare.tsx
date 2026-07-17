/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Ripple from 'react-native-material-ripple';
import Share from 'react-native-share';
import { Switch } from 'react-native-switch';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { Container, Header, ModalLoader, Text } from '../../components';
import { hp, Typography, wp } from '../../global';
import { LanguageKeys } from '../../languages';
import { Colors, Fonts } from '../../res';
import {
  ApiServices,
  flashErrorMessage,
  useGlobalContext,
} from '../../services';
import { addAnaylatics } from '../../services/firebase/analytics';
import {
  buildPdfDataUrl,
  buildShareFilename,
  previewSections,
} from './pdf-share';

type ProfilePdfShareProps = {
  navigation: any;
};

const ProfilePdfShare = ({ navigation }: ProfilePdfShareProps) => {
  const { currentUser } = useGlobalContext();
  const [includePhoto, setIncludePhoto] = useState(false);
  const [includeWali, setIncludeWali] = useState(false);
  const [loading, setLoading] = useState(false);

  const displayName = [
    currentUser?.first_name,
    currentUser?.last_name ? `${currentUser.last_name.charAt(0)}.` : null,
  ]
    .filter(Boolean)
    .join(' ');
  const location = [currentUser?.city, currentUser?.country]
    .filter(Boolean)
    .join(', ');
  const sections = previewSections(currentUser?.detail);

  const onShare = async () => {
    setLoading(true);
    try {
      const result = await ApiServices.getProfilePdf(includePhoto, includeWali);
      await addAnaylatics('profile_pdf_generated', {
        include_photo: includePhoto,
        include_wali: includeWali,
      });
      await Share.open({
        url: buildPdfDataUrl(result.pdf_base64),
        filename:
          result.filename ?? buildShareFilename(currentUser?.first_name),
        useInternalStorage: true,
        failOnCancel: false,
      });
      await addAnaylatics('profile_pdf_shared', {
        include_photo: includePhoto,
        include_wali: includeWali,
      });
    } catch {
      flashErrorMessage(LanguageKeys.sharePdfFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container style={Styles.screen}>
      <Header
        title={LanguageKeys.shareProfilePdf}
        navigation={navigation}
        titleVariant="display"
      />
      <ModalLoader
        visible={loading}
        message={LanguageKeys.sharePdfGenerating}
      />

      <ScrollView
        contentContainerStyle={Styles.innerCon}
        showsVerticalScrollIndicator={false}
      >
        <Text style={Styles.subtitle}>
          {LanguageKeys.shareProfilePdfSubtitle}
        </Text>

        <View style={Styles.previewCard}>
          <Text style={Styles.previewName}>{displayName}</Text>
          {location ? (
            <Text style={Styles.previewLocation}>{location}</Text>
          ) : null}
          {sections.length > 0 ? (
            <View style={Styles.previewSections}>
              {sections.map((title) => (
                <View key={title} style={Styles.previewSectionRow}>
                  <Ionicons
                    name="checkmark-circle"
                    size={wp(4)}
                    color={Colors.verified}
                  />
                  <Text style={Styles.previewSectionTxt}>{title}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={Styles.groupCard}>
          <View style={Styles.fieldCon}>
            <View style={Styles.fieldTxtCon}>
              <Text style={Styles.fieldTxt}>
                {LanguageKeys.sharePdfIncludePhoto}
              </Text>
            </View>
            <Switch
              testID="toggle-include-photo"
              value={includePhoto}
              onValueChange={setIncludePhoto}
              renderActiveText={false}
              renderInActiveText={false}
              circleSize={25}
              backgroundActive={Colors.primary}
              backgroundInactive={Colors.color18}
            />
          </View>
          <View style={[Styles.fieldCon, Styles.divider]}>
            <View style={Styles.fieldTxtCon}>
              <Text style={Styles.fieldTxt}>
                {LanguageKeys.sharePdfIncludeWali}
              </Text>
              <Text style={Styles.fieldDesc}>
                {LanguageKeys.sharePdfIncludeWaliDesc}
              </Text>
            </View>
            <Switch
              testID="toggle-include-wali"
              value={includeWali}
              onValueChange={setIncludeWali}
              renderActiveText={false}
              renderInActiveText={false}
              circleSize={25}
              backgroundActive={Colors.primary}
              backgroundInactive={Colors.color18}
            />
          </View>
        </View>

        <Ripple
          testID="share-pdf-cta"
          onPress={onShare}
          disabled={loading}
          style={Styles.cta}
        >
          <Text style={Styles.ctaTxt}>{LanguageKeys.sharePdfCta}</Text>
        </Ripple>
      </ScrollView>
    </Container>
  );
};

const Styles = StyleSheet.create({
  screen: { flex: 1 },
  innerCon: {
    paddingHorizontal: wp(5),
    paddingTop: hp(2),
    paddingBottom: hp(4),
  },
  subtitle: {
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small2,
    color: Colors.muted,
    marginBottom: hp(2.5),
  },
  previewCard: {
    backgroundColor: Colors.lavender,
    borderRadius: 16,
    padding: wp(4),
    marginBottom: hp(2.5),
  },
  previewName: {
    fontFamily: Fonts.APPFONT_B,
    fontSize: Typography.small3,
    color: Colors.ink,
  },
  previewLocation: {
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small1,
    color: Colors.muted,
    marginTop: hp(0.2),
  },
  previewSections: { marginTop: hp(1.4), gap: hp(0.6) },
  previewSectionRow: { flexDirection: 'row', alignItems: 'center', gap: wp(2) },
  previewSectionTxt: {
    fontFamily: Fonts.APPFONT_M,
    fontSize: Typography.small1,
    color: Colors.ink,
  },
  groupCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.hairline,
    borderRadius: 16,
    overflow: 'hidden',
  },
  fieldCon: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: hp(1.8),
    paddingHorizontal: wp(4),
  },
  divider: { borderTopWidth: 1, borderTopColor: Colors.hairline },
  fieldTxtCon: { flex: 1, marginRight: wp(3) },
  fieldTxt: {
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small2,
    color: Colors.ink,
  },
  fieldDesc: {
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small1,
    color: Colors.muted,
    marginTop: hp(0.3),
  },
  cta: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: hp(1.8),
    alignItems: 'center',
    marginTop: hp(3),
  },
  ctaTxt: {
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small3,
    color: Colors.color2,
  },
});

export default ProfilePdfShare;
