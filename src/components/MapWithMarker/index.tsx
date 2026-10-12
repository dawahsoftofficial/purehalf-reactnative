import React from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, StyleSheet, View } from 'react-native';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import MapView, {
  Marker,
  PROVIDER_GOOGLE,
  type Region,
} from 'react-native-maps';
import Ripple from 'react-native-material-ripple';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AntDesign from 'react-native-vector-icons/AntDesign';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { wp } from '../../global';
import { LanguageKeys } from '../../languages';
import { Colors } from '../../res';
import { Button } from '../buttons';

interface MapWithMarkerProps {
  mapRef?: React.RefObject<MapView>;
  position: Region | any;
  setPosition: (location: Region) => void;
  dragable?: boolean;
  loading?: boolean;
  onUpdate: () => void;
  getCurrentLocation: () => void;
  navigation: any;
}

const MapWithMarker: React.FC<MapWithMarkerProps> = ({
  mapRef,
  position,
  setPosition,
  dragable = true,
  loading,
  onUpdate,
  getCurrentLocation,
  navigation,
}) => {
  const { top } = useSafeAreaInsets();
  const { t } = useTranslation();
  const onPlaceSelected = (data: any, details: any) => {
    Keyboard.dismiss();
    const { lat, lng } = details?.geometry?.location;

    const newPosition = {
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0.0922,
      longitudeDelta: 0.0421,
    };
    setPosition(newPosition);

    if (mapRef && mapRef.current) {
      mapRef.current.animateToRegion(newPosition, 1000);
    }
  };

  const onMarkerDragEnd = (event: {
    nativeEvent: { coordinate: { latitude: number; longitude: number } };
  }) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    const newPosition = {
      ...position,
      latitude,
      longitude,
    };
    setPosition(newPosition);
    if (mapRef?.current) {
      mapRef.current.animateToRegion(newPosition, 500);
    }
  };

  return (
    <View style={Styles.container}>
      <View style={[Styles.headerWrapper, { paddingTop: top + 10 }]}>
        <Ripple
          style={Styles.backBtn}
          onPress={() => navigation?.goBack()}
          rippleColor={Colors.primary}
        >
          <AntDesign name={'arrowleft'} color={Colors.ink} size={wp(5.5)} />
        </Ripple>
        <GooglePlacesAutocomplete
          fetchDetails={true}
          placeholder={t(LanguageKeys.search)}
          onPress={onPlaceSelected}
          // In the default 'auto' mode the library keeps rendering the
          // suggestions whenever it has results, so the dropdown stayed open
          // over the map after a pick. With an explicit value it shows the
          // list on focus and hides it on blur / selection.
          listViewDisplayed={false}
          enablePoweredByContainer={false}
          query={{
            key: 'AIzaSyAuJHAOwye_HX_Zvpn_cR7CE1PdNl401tY',
            language: 'en',
          }}
          styles={{
            container: Styles.autocompleteContainer,
            textInputContainer: Styles.textInputContainer,
            textInput: Styles.textInput,
            listView: Styles.autocompleteListView,
            description: { color: Colors.ink },
          }}
        />
      </View>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={Styles.map}
        initialRegion={position}
        showsUserLocation={dragable}
        showsMyLocationButton={false}
        followsUserLocation={dragable}
        showsCompass={dragable}
        scrollEnabled={dragable}
        zoomEnabled={dragable}
        pitchEnabled={dragable}
        rotateEnabled={dragable}
      >
        <Marker
          title="You are here"
          coordinate={position}
          draggable={dragable}
          onDragEnd={onMarkerDragEnd}
          pinColor={Colors.primary}
        />
      </MapView>
      <Ripple style={Styles.gpsIcon} onPress={getCurrentLocation}>
        <MaterialCommunityIcons
          name="crosshairs-gps"
          color={Colors.primary}
          size={24}
        />
      </Ripple>
      <View style={Styles.footerWrapper}>
        <Button
          text={LanguageKeys.update}
          onPress={onUpdate}
          loading={loading}
        />
      </View>
    </View>
  );
};

const Styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.appBg,
  },
  headerWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '95%',
    gap: wp(2),
    position: 'absolute',
    left: wp(2.5),
    zIndex: 9,
  },
  backBtn: {
    width: wp(11),
    height: wp(11),
    borderRadius: wp(5.5),
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.color1,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  autocompleteContainer: {
    flex: 1,
  },
  textInputContainer: {
    backgroundColor: 'transparent',
  },
  textInput: {
    height: 44,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.hairline,
    color: Colors.ink,
    shadowColor: Colors.color1,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  autocompleteListView: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginTop: 4,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
    height: '105%',
  },
  footerWrapper: {
    width: '95%',
    position: 'absolute',
    bottom: 20,
    left: wp(2.5),
  },
  gpsIcon: {
    backgroundColor: Colors.surface,
    zIndex: 9,
    position: 'absolute',
    bottom: 100,
    right: 20,
    width: wp(11),
    height: wp(11),
    borderRadius: wp(5.5),
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.color1,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
});

export default MapWithMarker;
