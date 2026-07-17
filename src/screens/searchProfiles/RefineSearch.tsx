import { useNavigation } from '@react-navigation/native';
import _ from 'lodash';
import React, {
  useEffect,
  useImperativeHandle,
  useReducer,
  useState,
} from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import Ripple from 'react-native-material-ripple';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { Animation } from '../../animations';
import { Loader, ModalLoader, Picker, Text } from '../../components';
import CountryData from '../../components/pickers/country_picker/Countries';
import { hp, Typography, wp } from '../../global';
import { CheckRtl, LanguageKeys } from '../../languages';
import { Colors, Fonts } from '../../res';
import {
  ApiServices,
  flashErrorMessage,
  flashSuccessMessage,
  StorageManager,
  useGlobalContext,
} from '../../services';
import AgeRange from './AgeRange';
import ConfirmAlert from './ConfirmAlert';
import { filtersData } from './Data';
import { onSearch, saveAndSearch } from './Functions';
import SaveAndSearchAlert from './SaveAndSearchAlert';

type RefineSearchRef = {
  onSaveAndSearchPress: () => void;
  onSearchPress: () => void;
  hasFiltersSelected: () => boolean;
};

type RefineSearchProps = {
  premium?: boolean;
  nameQuery?: string;
};

const hasCoordinate = (value: unknown): boolean =>
  value !== null &&
  value !== undefined &&
  value !== '' &&
  Number.isFinite(Number(value));

const RefineSearch = React.forwardRef<RefineSearchRef, RefineSearchProps>(
  ({ premium = false, nameQuery = '' }, ref) => {
    const Rtl = CheckRtl();
    const { currentUser } = useGlobalContext();
    const navigation: any = useNavigation();
    const hasUserCoordinates =
      hasCoordinate(currentUser?.latitude) &&
      hasCoordinate(currentUser?.longitude);

    // Premium filter IDs for male users
    const MALE_PREMIUM_FILTER_IDS = [
      'bdy-0', // Body Type
      'eye-0', // Eye Color
      'skin-0', // Complexion
      'open_for_polygamy', // Available for second marriage (gents only)
      'last_online_at', // Last Online At
      'register_at', // Registered At
    ];

    // Premium filter IDs for female users
    const FEMALE_PREMIUM_FILTER_IDS = [
      'edu-0', // Education
      'prof-0', // Profession
      'earn-0', // Earnings Per Month
      'last_online_at', // Last Online At
      'register_at', // Registered At
    ];

    const isPremiumFilter = (filterId: string, isMale: boolean): boolean => {
      if (isMale) {
        return MALE_PREMIUM_FILTER_IDS.includes(filterId);
      }
      return FEMALE_PREMIUM_FILTER_IDS.includes(filterId);
    };

    const isFilterLocked = (filterId: string): boolean => {
      const isMale = currentUser?.gender !== 'female';
      return isPremiumFilter(filterId, isMale) && !premium;
    };

    const handleLockedFilterPress = () => {
      navigation.navigate('ProFeaturesPromotion');
    };
    const [modalLoader, setModalLoader] = useState({
      visible: false,
      message: '',
    });
    const [peopleSearch, setPeopleSearch] = useState<string>('location');
    const [activeTab, setActiveTab] = useState<'basic' | 'premium'>('basic');
    const [searchTitle, setSearchTitle] = useState('');
    const [minAge, setMinAge] = useState<any>(LanguageKeys.any);
    const [maxAge, setMaxAge] = useState<any>(LanguageKeys.any);
    const [confirmAlertVisible, setConfirmAlertVisible] = useState(false);
    const [saveAndSearchAlertVisble, setSaveAndSearchAlertVisble] =
      useState(false);
    const [filtersDataList, setFiltersDataList] = useState(filtersData);
    const [listLoader, setListLoader] = useState(true);
    const { getData, storageKeys } = StorageManager;
    const [, forceUpdate] = useReducer((x) => x + 1, 0);
    const [pickerDataLoader, setPickerDataLoader] = useState(false);
    const [picker, setPicker] = useState<any>({
      visible: false,
      data: [],
      headerTitle: '',
      activePicker: '',
      item: {},
    });

    const showMissingLocationAlert = () => {
      Alert.alert(
        'Add your location',
        'Near Me search needs your location. Add your location to use nearby filters.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Add Location',
            onPress: () => navigation.navigate('UserLocation'),
          },
        ]
      );
    };

    const onClosePicker = () =>
      setPicker({
        visible: false,
        headerTitle: '',
        data: [],
        activePicker: '',
        item: {},
      });

    const onRadioPress = (data: any, selectedElement: any, item: any) => {
      if (selectedElement?.id === 'location' && !hasUserCoordinates) {
        showMissingLocationAlert();
        return;
      }

      data.forEach((element: any) => {
        if (element.value === selectedElement.value) {
          if (element.id === 'location' || element.id === 'country') {
            setPeopleSearch(element.id);
          }
          element.selected = true;
          item.selected = { ...selectedElement };
        } else {
          element.selected = false;
        }
      });
      forceUpdate();
    };

    useEffect(() => {
      if (hasUserCoordinates) return;

      setPeopleSearch('country');
      setFiltersDataList((prevFilters: any[]) =>
        prevFilters.map((filterItem: any) => {
          if (filterItem?.id !== 'search_for_people') {
            return filterItem;
          }

          return {
            ...filterItem,
            data: filterItem.data.map((option: any) => ({
              ...option,
              selected: option.id === 'country',
            })),
            selected: {
              id: 'country',
              selected: true,
              value: LanguageKeys.byCountry,
            },
          };
        })
      );
    }, [hasUserCoordinates]);

    const onRadioClearPress = (item: any) => {
      filtersDataList?.forEach((element: any) => {
        if (element?.id === item?.id) {
          element.selected = {};
        }
      });
      setFiltersDataList(filtersDataList);
      forceUpdate();
    };

    const renderProPill = () => (
      <View style={Styles.proPill}>
        <Ionicons name="lock-closed" color={Colors.primary} size={wp(3)} />
        <Text style={Styles.proPillTxt}>{LanguageKeys.proTag}</Text>
      </View>
    );

    const renderClearLink = (onPress: () => void) => (
      <Ripple onPress={onPress} hitSlop={12} style={Styles.clearLink}>
        <Text style={Styles.clearLinkTxt}>{LanguageKeys.clear}</Text>
      </Ripple>
    );

    const renderPremiumUpsell = () => (
      <Ripple
        style={{
          ...Styles.upsell,
          flexDirection: Rtl ? 'row-reverse' : 'row',
        }}
        onPress={handleLockedFilterPress}
        rippleColor={Colors.primary}
      >
        <View style={Styles.upsellIcon}>
          <Ionicons name="diamond" color={Colors.primary} size={wp(5)} />
        </View>
        <View style={Styles.upsellTextCol}>
          <Text
            style={{
              ...Styles.upsellTitle,
              textAlign: Rtl ? 'right' : 'left',
            }}
          >
            {LanguageKeys.premiumFiltersUnlockTitle}
          </Text>
          <Text
            style={{
              ...Styles.upsellDesc,
              textAlign: Rtl ? 'right' : 'left',
            }}
          >
            {LanguageKeys.premiumFiltersUnlockDesc}
          </Text>
        </View>
        <Ionicons
          name={Rtl ? 'chevron-back' : 'chevron-forward'}
          color={Colors.primaryMid}
          size={wp(5)}
        />
      </Ripple>
    );

    const renderSegmentedTabs = () => (
      <View
        style={{
          ...Styles.tabsRow,
          flexDirection: Rtl ? 'row-reverse' : 'row',
        }}
      >
        <Ripple
          style={{
            ...Styles.tab,
            backgroundColor:
              activeTab === 'basic' ? Colors.primary : Colors.lavender,
          }}
          onPress={() => setActiveTab('basic')}
          rippleColor={Colors.primary}
        >
          <Text
            style={{
              ...Styles.tabTxt,
              color: activeTab === 'basic' ? Colors.color2 : Colors.muted,
            }}
          >
            {LanguageKeys.filterTabBasic}
          </Text>
        </Ripple>
        <Ripple
          style={{
            ...Styles.tab,
            flexDirection: Rtl ? 'row-reverse' : 'row',
            backgroundColor:
              activeTab === 'premium' ? Colors.primary : Colors.lavender,
          }}
          onPress={() => setActiveTab('premium')}
          rippleColor={Colors.primary}
        >
          <Ionicons
            name="diamond"
            color={activeTab === 'premium' ? Colors.color2 : Colors.primaryMid}
            size={wp(3.6)}
            style={{ marginHorizontal: wp(1.4) }}
          />
          <Text
            style={{
              ...Styles.tabTxt,
              color: activeTab === 'premium' ? Colors.color2 : Colors.muted,
            }}
          >
            {LanguageKeys.filterTabPremium}
          </Text>
        </Ripple>
      </View>
    );

    const renderRadioButtonsList = ({ item }: any) => {
      const { title, data, id } = item;
      const { selected } = item;
      const isLocked = isFilterLocked(id);
      const hasSelection = Object.keys(selected || {}).length !== 0;
      return (
        <View style={Styles.fieldItemCon}>
          <View
            style={{
              ...Styles.fieldTitleRow,
              flexDirection: Rtl ? 'row-reverse' : 'row',
            }}
          >
            <View
              style={{
                ...Styles.fieldTitleLeft,
                flexDirection: Rtl ? 'row-reverse' : 'row',
              }}
            >
              <Text style={Styles.fieldHeading}>{title}</Text>
              {isLocked && renderProPill()}
            </View>
            {!isLocked &&
              hasSelection &&
              renderClearLink(onRadioClearPress.bind(null, item))}
          </View>
          <View
            style={{
              ...Styles.chipsWrap,
              flexDirection: Rtl ? 'row-reverse' : 'row',
              opacity: isLocked ? 0.55 : 1,
            }}
          >
            {data &&
              data.length !== 0 &&
              data.map((element: any, index: any) => {
                const active = element?.id === selected?.id;
                return (
                  <Ripple
                    style={{
                      ...Styles.chip,
                      backgroundColor: active
                        ? Colors.primary
                        : Colors.lavender,
                      borderColor: active ? Colors.primary : Colors.hairline,
                    }}
                    onPress={
                      isLocked
                        ? handleLockedFilterPress
                        : onRadioPress.bind(null, data, element, item)
                    }
                    key={index}
                    hitSlop={6}
                    rippleColor={active ? Colors.color2 : Colors.primary}
                  >
                    <Text
                      style={{
                        ...Styles.chipTxt,
                        color: active ? Colors.color2 : Colors.ink,
                      }}
                    >
                      {element.value}
                    </Text>
                  </Ripple>
                );
              })}
          </View>
        </View>
      );
    };

    const getApiData = (id: any) => {
      return new Promise((resolve, reject) => {
        if (id === 'language') {
          ApiServices.getLanguages()
            .then(async (data: any) => {
              resolve(data);
            })
            .catch(() => reject(''));
        } else if (id === 'nationality') {
          ApiServices.getNationality()
            .then(async (data: any) => {
              resolve(data);
            })
            .catch(() => reject(''));
        } else {
          reject('');
        }
      });
    };

    const openPicker = async (item: any) => {
      const { data, title, id } = item;
      if (isFilterLocked(id)) {
        handleLockedFilterPress();
        return;
      }
      if (id === 'language' || id === 'nationality') {
        setPickerDataLoader(true);
        getApiData(id)
          .then(async (data: any) => {
            if (data) {
              const newData: any = [];
              for await (const element of data) {
                newData.push({
                  id: element?.id,
                  value: element?.name,
                });
              }
              setPicker({
                visible: true,
                headerTitle: title,
                data: newData,
                activePicker: title,
                item: item,
              });
              setPickerDataLoader(false);
            } else {
              setPickerDataLoader(false);
            }
          })
          .catch(() => setPickerDataLoader(false));
      } else if (id === 'country') {
        setPickerDataLoader(true);
        const newData: any = [];
        for await (const element of CountryData) {
          newData.push({
            id: element?.name,
            value: element?.name,
          });
        }
        setPicker({
          visible: true,
          headerTitle: title,
          data: newData,
          activePicker: title,
          item: item,
        });
        setPickerDataLoader(false);
      } else if (id === 'distance') {
        setPickerDataLoader(true);
        const newData: any = [
          {
            id: 10,
            value: LanguageKeys.upTo10KmAway,
          },
          {
            id: 50,
            value: LanguageKeys.upTo50KmAway,
          },
          {
            id: 100,
            value: LanguageKeys.upTo100KmAway,
          },
          {
            id: 250,
            value: LanguageKeys.upTo250KmAway,
          },
          {
            id: 500,
            value: LanguageKeys.upTo500KmAway,
          },
        ];
        setPicker({
          visible: true,
          headerTitle: title,
          data: newData,
          activePicker: title,
          item: item,
        });
        setPickerDataLoader(false);
      } else {
        setPicker({
          visible: true,
          headerTitle: title,
          data: data,
          activePicker: title,
          item: item,
        });
      }
    };

    const onPickerItemPress = (item: any) => {
      picker.item.selected = item;
      const index = _.findIndex(filtersDataList, { id: picker.item.id });
      filtersDataList?.splice(index, 1, picker.item);
      onClosePicker();
    };

    const onPickerClearPress = (item: any) => {
      item.selected = {};
      setFiltersDataList(filtersDataList);
      forceUpdate();
    };

    const renderDropDownList = ({ item }: any) => {
      const { title, selected, id } = item;
      const value = selected?.value ? selected.value : '';
      const isLocked = isFilterLocked(id);
      const hasSelection = Object.keys(selected || {}).length !== 0;
      if (peopleSearch === 'location' && item?.id === 'country') return null;
      if (peopleSearch === 'country' && item?.id === 'distance') return null;

      const isNumber = typeof value === 'number';
      const hasValue = isNumber ? true : !!(value && value.length !== 0);
      const displayValue = isNumber
        ? value === 1
          ? LanguageKeys.yes
          : value === 0
            ? LanguageKeys.no
            : JSON.stringify(value)
        : hasValue
          ? value
          : LanguageKeys.notYetProvided;

      return (
        <Animation
          style={{
            ...Styles.fieldItemCon,
            backgroundColor: isLocked ? Colors.primaryRGBA12 : Colors.surface,
          }}
          animation="fadeIn"
          duration={600}
        >
          <View
            style={{
              ...Styles.fieldTitleRow,
              flexDirection: Rtl ? 'row-reverse' : 'row',
            }}
          >
            <View
              style={{
                ...Styles.fieldTitleLeft,
                flexDirection: Rtl ? 'row-reverse' : 'row',
              }}
            >
              <Text style={Styles.fieldHeading}>{title}</Text>
              {isLocked && renderProPill()}
            </View>
            {!isLocked &&
              hasSelection &&
              renderClearLink(onPickerClearPress.bind(null, item))}
          </View>
          <Ripple
            style={{
              ...Styles.boxedField,
              flexDirection: Rtl ? 'row-reverse' : 'row',
              opacity: isLocked ? 0.55 : 1,
            }}
            onPress={
              isLocked ? handleLockedFilterPress : openPicker.bind(null, item)
            }
            hitSlop={6}
            rippleColor={Colors.primary}
          >
            <Text
              style={{
                ...Styles.boxedValue,
                color: hasValue ? Colors.ink : Colors.muted,
                textAlign: Rtl ? 'right' : 'left',
              }}
            >
              {displayValue}
            </Text>
            <Ionicons name="chevron-down" color={Colors.muted} size={wp(4.5)} />
          </Ripple>
        </Animation>
      );
    };

    // Renders just the Near Me / By Country chips (no title / no clear link) —
    // the group header "Location" names it, and a mode toggle is never cleared.
    const renderLocationToggle = (item: any) => {
      const data = item?.data || [];
      const selected = item?.selected || {};
      return (
        <View style={Styles.locToggleRow}>
          <View
            style={{
              ...Styles.locChipsWrap,
              flexDirection: Rtl ? 'row-reverse' : 'row',
            }}
          >
            {data.map((element: any, index: any) => {
              const active = element?.id === selected?.id;
              const disabledNearMe =
                element?.id === 'location' && !hasUserCoordinates;
              return (
                <Ripple
                  style={{
                    ...Styles.chip,
                    backgroundColor: active ? Colors.primary : Colors.lavender,
                    borderColor: active ? Colors.primary : Colors.hairline,
                    opacity: disabledNearMe ? 0.45 : 1,
                  }}
                  onPress={onRadioPress.bind(null, data, element, item)}
                  key={index}
                  hitSlop={6}
                  rippleColor={active ? Colors.color2 : Colors.primary}
                >
                  <Text
                    style={{
                      ...Styles.chipTxt,
                      color: active ? Colors.color2 : Colors.ink,
                    }}
                  >
                    {element.value}
                  </Text>
                </Ripple>
              );
            })}
          </View>
        </View>
      );
    };

    // Binds the mode toggle and its dependent field (distance OR country) into
    // one card so the relationship reads as a single "Location" setting.
    const renderLocationCard = () => {
      const toggleItem = filtersDataList.find(
        (f: any) => f.id === 'search_for_people'
      );
      const dependentItem = filtersDataList.find(
        (f: any) =>
          f.id === (peopleSearch === 'country' ? 'country' : 'distance')
      );
      if (!toggleItem || !dependentItem) return null;
      return (
        <View style={Styles.locationSection}>
          <Text
            style={{
              ...Styles.groupLabel,
              textAlign: Rtl ? 'right' : 'left',
            }}
          >
            {LanguageKeys.location}
          </Text>
          <View style={Styles.card}>
            {renderLocationToggle(toggleItem)}
            {renderDropDownList({ item: dependentItem })}
          </View>
        </View>
      );
    };

    const setDropDownData = () => {
      getData(storageKeys.ATTRIBUTE)
        .then(async (attributeRes: any) => {
          if (attributeRes) {
            for await (const element of filtersDataList) {
              if (element?.fromAttribute) {
                const result = attributeRes[element.category][element.id];
                if (result) {
                  element.data = result;
                }
              }
            }
            setFiltersDataList(filtersDataList);
            setListLoader(false);
          } else {
            setListLoader(false);
          }
        })
        .catch(() => setListLoader(false));
    };

    const onSaveAndSearchPress = () => {
      if (nameQuery.trim().length === 1) {
        flashErrorMessage('Enter at least 2 characters to search by name.');
        return;
      }
      setSaveAndSearchAlertVisble(true);
    };

    const closeSaveAndSearchAlert = () => {
      setSearchTitle('');
      setSaveAndSearchAlertVisble(false);
    };

    const closeConfirmAlert = () => {
      setSearchTitle('');
      setConfirmAlertVisible(false);
    };

    const hideModalLoader = () => {
      setModalLoader({
        visible: false,
        message: '',
      });
    };

    const onSearchPress = () => {
      if (nameQuery.trim().length === 1) {
        flashErrorMessage('Enter at least 2 characters to search by name.');
        return;
      }
      setModalLoader({
        visible: true,
        message: LanguageKeys.searching,
      });
      const ageRange = {
        minAge: minAge === LanguageKeys.any ? 1 : minAge,
        maxAge: maxAge === LanguageKeys.any ? 99 : maxAge,
      };
      onSearch(ageRange, filtersDataList, nameQuery)
        .then((res: any) => {
          navigation.navigate('SearchResults', {
            searchResults: res.data,
            urlParams: res.urlParams,
          });
          hideModalLoader();
        })
        .catch(hideModalLoader);
    };

    const onSaveAndSearchAlertPress = (searchTitle: any) => {
      if (searchTitle.length === 0) {
        flashErrorMessage(LanguageKeys.searchTitleRequired);
        setSearchTitle('');
      } else {
        setSaveAndSearchAlertVisble(false);
        setConfirmAlertVisible(true);
        setSearchTitle(searchTitle);
      }
    };

    const onConfirmSaveandSearchAlertPress = () => {
      setConfirmAlertVisible(false);
      setModalLoader({
        visible: true,
        message: LanguageKeys.savingAndSearching,
      });
      const ageRange = {
        minAge: minAge === LanguageKeys.any ? 1 : minAge,
        maxAge: maxAge === LanguageKeys.any ? 99 : maxAge,
      };
      saveAndSearch(ageRange, filtersDataList, {
        title: searchTitle,
        nameQuery,
      })
        .then((res: any) => {
          navigation.navigate('SearchResults', {
            searchResults: res.data,
            urlParams: res.urlParams,
          });
          hideModalLoader();
        })
        .catch(hideModalLoader);
    };

    useEffect(() => {
      setDropDownData();
    }, []);

    const onMinAgeChange = (value: any) => setMinAge(value);
    const onMaxAgeChange = (value: any) => setMaxAge(value);

    const onClearAllPress = () => {
      setModalLoader({
        visible: true,
        message: LanguageKeys.clearingFilters,
      });
      setMinAge(LanguageKeys.any);
      setMaxAge(LanguageKeys.any);
      filtersDataList.forEach((element: any) => {
        element.selected = {};
      });
      setFiltersDataList(filtersDataList);
      forceUpdate();
      hideModalLoader();
      flashSuccessMessage(LanguageKeys.allFiltersCleared);
    };

    const onAgeClearPress = () => {
      setMinAge(LanguageKeys.any);
      setMaxAge(LanguageKeys.any);
    };

    const hasFiltersSelected = (): boolean => {
      // Check if age range is selected (not "any")
      const hasAgeRange =
        minAge !== LanguageKeys.any || maxAge !== LanguageKeys.any;

      // Check if any filter (excluding default "Search For People") has a selected value
      const hasFilterSelected = filtersDataList.some(
        (element: any) =>
          element?.id !== 'search_for_people' &&
          Object.keys(element?.selected || {}).length !== 0
      );

      return hasAgeRange || hasFilterSelected;
    };

    useImperativeHandle(ref, () => ({
      onSaveAndSearchPress,
      onSearchPress,
      hasFiltersSelected,
    }));

    const renderList = ({ item, index }: any) => {
      const isMale = currentUser?.gender === 'female' ? false : true;
      const isFemale = currentUser?.gender === 'female';

      // Hide filters for females
      const hideForFemale =
        isFemale &&
        (item?.id === 'hijab-0' || // Hijab Level
          item?.id === 'open_for_polygamy'); // Second-marriage filter is gents-only

      // Hide filters for males
      const hideForMale =
        isMale &&
        (item?.id === 'doYouHaveABeard' || // Beard
          item?.id === 'is_wali'); // With Wali (already hidden)

      const hideItem = hideForFemale || hideForMale;
      return hideItem
        ? null
        : item?.type === 'dropDown'
          ? renderDropDownList({ item, index })
          : renderRadioButtonsList({ item, index });
    };

    const isMale = currentUser?.gender !== 'female';
    const premiumIds = isMale
      ? MALE_PREMIUM_FILTER_IDS
      : FEMALE_PREMIUM_FILTER_IDS;
    // Location items are lifted into their own grouped card, so keep them out
    // of the flat basic list.
    const LOCATION_IDS = ['search_for_people', 'distance', 'country'];
    const basicData = filtersDataList.filter(
      (f: any) => !premiumIds.includes(f.id) && !LOCATION_IDS.includes(f.id)
    );
    const premiumData = filtersDataList.filter((f: any) =>
      premiumIds.includes(f.id)
    );
    const anySelected = hasFiltersSelected();

    return (
      <View style={Styles.container}>
        {renderSegmentedTabs()}
        {anySelected && (
          <View
            style={{
              ...Styles.clearAllRow,
              alignItems: Rtl ? 'flex-start' : 'flex-end',
            }}
          >
            <Ripple
              style={Styles.clearAllLink}
              hitSlop={12}
              onPress={onClearAllPress}
              rippleColor={Colors.primary}
            >
              <Text style={Styles.clearAllTxt}>{LanguageKeys.clearAll}</Text>
            </Ripple>
          </View>
        )}

        {activeTab === 'basic' ? (
          <>
            {renderLocationCard()}
            <View style={Styles.card}>
              <AgeRange
                minAge={minAge}
                maxAge={maxAge}
                onMinAgeChange={onMinAgeChange}
                onMaxAgeChange={onMaxAgeChange}
                onClearPress={onAgeClearPress}
              />
              {listLoader ? (
                <Loader />
              ) : (
                <FlatList
                  data={basicData}
                  renderItem={renderList}
                  scrollEnabled={false}
                />
              )}
            </View>
          </>
        ) : (
          <>
            {!premium && renderPremiumUpsell()}
            <View style={Styles.card}>
              {listLoader ? (
                <Loader />
              ) : (
                <FlatList
                  data={premiumData}
                  renderItem={renderList}
                  scrollEnabled={false}
                />
              )}
            </View>
          </>
        )}

        <ModalLoader
          visible={modalLoader.visible}
          useModalLayout={true}
          message={modalLoader.message}
        />
        <Picker
          visible={picker.visible}
          onClose={onClosePicker}
          onPress={onPickerItemPress}
          data={picker.data}
          headerTitle={picker.headerTitle}
          loader={pickerDataLoader}
        />
        <SaveAndSearchAlert
          visible={saveAndSearchAlertVisble}
          onClose={closeSaveAndSearchAlert}
          onPress={onSaveAndSearchAlertPress}
        />
        <ConfirmAlert
          visible={confirmAlertVisible}
          onClose={closeConfirmAlert}
          onPress={onConfirmSaveandSearchAlertPress}
        />
      </View>
    );
  }
);

export default RefineSearch;

const Styles = StyleSheet.create({
  container: {
    marginTop: hp(2.4),
  },
  locationSection: {
    marginBottom: hp(1.6),
  },
  groupLabel: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    includeFontPadding: false,
    marginBottom: hp(0.8),
  },
  locToggleRow: {
    paddingVertical: hp(1.8),
    paddingHorizontal: wp(4),
    borderBottomWidth: 1,
    borderBottomColor: Colors.hairline,
  },
  locChipsWrap: {
    flexWrap: 'wrap',
    gap: wp(2),
  },
  tabsRow: {
    flexDirection: 'row',
    gap: wp(2.5),
    marginBottom: hp(1.2),
  },
  tab: {
    flex: 1,
    height: hp(5),
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabTxt: {
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small1,
    includeFontPadding: false,
    alignSelf: 'center',
  },
  clearAllRow: {
    marginBottom: hp(1),
  },
  upsell: {
    alignItems: 'center',
    backgroundColor: Colors.lavender,
    borderRadius: 16,
    paddingHorizontal: wp(3.5),
    paddingVertical: hp(1.6),
    marginBottom: hp(1.4),
    gap: wp(3),
  },
  upsellIcon: {
    width: wp(11),
    height: wp(11),
    borderRadius: wp(5.5),
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upsellTextCol: {
    flex: 1,
  },
  upsellTitle: {
    color: Colors.ink,
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small2,
    includeFontPadding: false,
  },
  upsellDesc: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small,
    includeFontPadding: false,
    marginTop: hp(0.3),
  },
  clearAllLink: {
    paddingHorizontal: wp(2),
    paddingVertical: hp(0.4),
  },
  clearAllTxt: {
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small,
    color: Colors.primaryMid,
    includeFontPadding: false,
  },
  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.hairline,
    overflow: 'hidden',
    borderRadius: 16,
  },
  fieldItemCon: {
    paddingVertical: hp(1.8),
    paddingHorizontal: wp(4),
    borderBottomWidth: 1,
    borderBottomColor: Colors.hairline,
  },
  fieldTitleRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldTitleLeft: {
    alignItems: 'center',
    flexShrink: 1,
  },
  fieldHeading: {
    color: Colors.ink,
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small2,
    includeFontPadding: false,
  },
  proPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.lavender,
    borderRadius: 999,
    paddingHorizontal: wp(2),
    paddingVertical: hp(0.3),
    marginHorizontal: wp(2),
  },
  proPillTxt: {
    color: Colors.primary,
    fontFamily: Fonts.APPFONT_B,
    fontSize: Typography.tiny,
    letterSpacing: 0.5,
    includeFontPadding: false,
    marginLeft: wp(1),
  },
  clearLink: {
    paddingHorizontal: wp(1),
  },
  clearLinkTxt: {
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small,
    color: Colors.primaryMid,
    includeFontPadding: false,
  },
  chipsWrap: {
    flexWrap: 'wrap',
    marginTop: hp(1.2),
    gap: wp(2),
  },
  chip: {
    paddingHorizontal: wp(3.5),
    paddingVertical: hp(0.9),
    borderRadius: 999,
    borderWidth: 1,
  },
  chipTxt: {
    fontFamily: Fonts.APPFONT_M,
    fontSize: Typography.small1,
    includeFontPadding: false,
  },
  boxedField: {
    borderWidth: 1.4,
    borderColor: Colors.hairline,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    paddingHorizontal: wp(3.5),
    height: hp(6),
    marginTop: hp(1.1),
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  boxedValue: {
    flex: 1,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small3,
    includeFontPadding: false,
    marginHorizontal: wp(1),
    alignSelf: 'center',
  },
});
