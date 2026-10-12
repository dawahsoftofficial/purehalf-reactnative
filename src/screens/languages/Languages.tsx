import i18next from 'i18next';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet } from 'react-native';
import Ripple from 'react-native-material-ripple';
import AntDesign from 'react-native-vector-icons/AntDesign';

import { AnimatedLoader, Container, Header, Text } from '../../components';
import SearchBar from '../../components/pickers/SearchBar';
import { hp, Typography, wp } from '../../global';
import { CheckRtl, LanguageKeys } from '../../languages';
import { Colors, Fonts } from '../../res';
import {
  flashSuccessMessage,
  StorageManager,
  useGlobalContext,
} from '../../services';

const Languages = (props: any) => {
  const { setData, storageKeys } = StorageManager;
  const { language, updateDirection } = useGlobalContext();
  const Rtl = CheckRtl();
  const [loader, setLoader] = useState(false);
  const [languageChangeLoader, setLanguageChangeLoader] = useState({
    visible: false,
    id: null,
  });

  const hideLangaugeChangeLoader = () =>
    setLanguageChangeLoader({
      visible: false,
      id: null,
    });

  const [languages, setLanguages] = useState([
    { label: LanguageKeys.english, value: 'en', id: '1', selected: false },
    // { label: LanguageKeys.urdu, value: 'ur', id: '2', selected: false }
    // { label: LanguageKeys.romanUrdu, value: 'rur', id: '3', selected: false }
  ]);

  const onChangeSearch = () => {};

  useEffect(() => {
    languages.forEach((element) => {
      if (element?.value === language) {
        element.selected = true;
      }
    });
    setLanguages(languages);
  }, []);

  const onItemPress = (item: any) => {
    setLanguageChangeLoader({
      visible: true,
      id: item?.id,
    });
    languages.forEach((element) => {
      if (element.value === item.value) {
        element.selected = true;
        i18next.changeLanguage(item.value).then(() => {
          setData(storageKeys.LANGUAGE, element.value)
            .then(() => {
              if (element.value === 'ur') {
                updateDirection('rtl', 'ur');
              } else {
                updateDirection('ltr', element?.value);
              }
              hideLangaugeChangeLoader();
              flashSuccessMessage(
                i18next.t(LanguageKeys.languageChangedTo, {
                  language: i18next.t(element?.label),
                })
              );
            })
            .catch(hideLangaugeChangeLoader);
        });
      } else {
        element.selected = false;
      }
    });
  };

  const renderLanguages = ({ item }: any) => {
    return (
      <Ripple
        style={Styles.itemContainer}
        onPress={onItemPress.bind(null, item)}
      >
        <Text style={Styles.itemText}>{item?.label}</Text>
        {item?.selected &&
        !languageChangeLoader.id !== item?.id &&
        !languageChangeLoader.visible ? (
          <AntDesign name="checkcircle" color={Colors.color10} size={wp(5.5)} />
        ) : languageChangeLoader.id === item?.id &&
          languageChangeLoader.visible ? (
          <ActivityIndicator size={'small'} color={Colors.theme} />
        ) : null}
      </Ripple>
    );
  };

  return (
    <Container>
      <Header title={LanguageKeys.language} navigation={props.navigation} />
      <SearchBar onChangeText={onChangeSearch} />
      {loader ? (
        <AnimatedLoader
          text={'Loading...'}
          visible={loader}
          style={Styles.loader}
        />
      ) : (
        <FlatList
          data={languages}
          renderItem={renderLanguages}
          contentContainerStyle={Styles.listContainer}
        />
      )}
    </Container>
  );
};

export default Languages;

const Styles = StyleSheet.create({
  itemContainer: {
    borderBottomWidth: 0.6,
    borderBottomColor: Colors.color4,
    marginHorizontal: wp(3),
    paddingVertical: hp(1.8),
    paddingHorizontal: wp(3),
    justifyContent: 'space-between',
    alignItems: 'center',
    flexDirection: 'row',
  },
  listContainer: {
    paddingTop: hp(3),
  },
  itemText: {
    color: Colors.color1,
    fontFamily: Fonts.APPFONT_M,
    fontSize: Typography.small3,
    includeFontPadding: false,
  },
  loader: {
    marginTop: hp(15),
  },
});
