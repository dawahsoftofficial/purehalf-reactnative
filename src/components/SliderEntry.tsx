import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { t } from 'i18next';
import moment from 'moment';
import React, { useRef, useState } from 'react';
import { Dimensions, Image, StyleSheet, Text, View } from 'react-native';
import * as Animatable from 'react-native-animatable';
import LinearGradient from 'react-native-linear-gradient';
import Ripple from 'react-native-material-ripple';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { useSettingsStore } from '@/stores';

import { hp, Typography } from '../global';
import { CheckRtl, LanguageKeys } from '../languages';
import { Colors, Fonts } from '../res';
import {
  ApiServices,
  capitalizeName,
  isIOS,
  useGlobalContext,
} from '../services';
import { Button } from './buttons';
import { ProfileBadges } from './profile-badges';
import ProfilePhotoPlaceholder from './ProfilePhotoPlaceholder';

const { width: viewportWidth } = Dimensions.get('window');

const wp = (percentage: any) => {
  const value = (percentage * viewportWidth) / 100;
  return Math.round(value);
};

// Crisp tactile "pop" for action-button icons — a quick scale up and settle.
// Replaces the old full-button bounce, which read as janky.
const POP = {
  0: { transform: [{ scale: 1 }] },
  0.4: { transform: [{ scale: 1.35 }] },
  1: { transform: [{ scale: 1 }] },
};

export const sliderWidth = viewportWidth;
export const itemWidth = viewportWidth;

const SliderEntry = ({
  data,
  even,
  onLikePress,
  onPassPress,
  onPress,
}: any) => {
  const dailyRecommendations = useSettingsStore().getDailyRecommendations();

  // Format 24-hour time to 12-hour am/pm format
  const formatTimeToAmPm = (hour24: string): string => {
    const hour = parseInt(hour24, 10);
    if (isNaN(hour)) return hour24;

    // Handle 24 as 12 AM (midnight)
    if (hour === 24 || hour === 0) {
      return '12 AM';
    }

    if (hour === 12) {
      return '12 PM';
    }

    if (hour > 12) {
      return `${hour - 12} PM`;
    }

    return `${hour} AM`;
  };

  // Get formatted time range for the message
  const getTimeRangeText = (): string => {
    if (!dailyRecommendations?.start || !dailyRecommendations?.end) {
      return '6 PM and 12 AM'; // Fallback
    }

    const startTime = formatTimeToAmPm(dailyRecommendations.start);
    const endTime = formatTimeToAmPm(dailyRecommendations.end);

    return `${startTime} and ${endTime}`;
  };

  const Rtl = CheckRtl();
  const displayFont = Rtl ? Fonts.APPFONT_B : Fonts.DISPLAY;
  const { currentUser } = useGlobalContext();
  const navigation: any = useNavigation();
  const [profileImageLoader, setProfileImageLoader] = useState(false);
  const [profileImageError, setProfileImageError] = useState(false);
  const [matchingData, setMatchingData] = useState<any>([]);
  const likeIconRef = useRef<any>(null);
  const unLikeIconRef = useRef<any>(null);
  const messageIconRef = useRef<any>(null);

  const chatUserData = {
    ...data,
    id: data?.id,
    name: data?.full_name,
    age: data?.age,
    city: data?.city,
    country: data?.country,
    image: data?.primary_image_to_show,
    token: data?.fcm_token
      ?.map((item: any) => item?.fcm_token)
      .filter((token: any) => token !== undefined && token !== null),
  };

  useFocusEffect(
    React.useCallback(() => {
      if (data?.detail?.interest_id_value?.length) {
        setMatchingData(
          data?.detail?.interest_id_value
            ?.slice(0, 4)
            ?.filter((userData: any) =>
              currentUser?.detail?.interest_id?.includes(userData?.id)
            )
        );
      }
    }, [currentUser?.detail?.interest_id, data?.detail?.interest_id_value])
  );

  const isPremiumUser = () => {
    return new Promise((resolve) => {
      const now = moment();
      const membershipExpiry = currentUser?.membership_expiry;
      if (membershipExpiry !== null && moment(membershipExpiry).isAfter(now)) {
        resolve('premiumUser');
      } else if (
        membershipExpiry === null ||
        moment(membershipExpiry).isBefore(now)
      ) {
        ApiServices.getCurrentUserDetail()
          .then((res: any) => {
            const membershipExpiry = res?.membership_expiry;
            if (
              membershipExpiry === null ||
              moment(membershipExpiry).isBefore(now)
            ) {
              navigation.navigate('ProFeaturesPromotion', {
                navigateTo: 'goBack',
              });
            } else {
              resolve('premiumUser');
            }
          })
          .catch(() => {});
      }
    });
  };

  const onMessagePress = () => {
    messageIconRef.current?.animate(POP, 320);
    // Non-premium male users are routed to the pro-features promotion by
    // isPremiumUser(); everyone else goes straight to the chat. The legacy
    // Firebase RTDB daily-chat-limit gate was removed — chat gating now lives
    // in the REST/chat-credits flow (see profile Header.onMessagePress).
    if (currentUser?.gender === 'male') {
      isPremiumUser().then(() => {
        setProfileImageError(false);
        navigateToChat();
      });
    } else {
      setProfileImageError(false);
      navigateToChat();
    }
  };

  const navigateToChat = () => {
    onPress();
    navigation.navigate('SingleChat', {
      otherUserData: chatUserData,
      // SingleChat looks up the existing conversation (if any) by user id.
      userId: chatUserData.id,
      fromProfile: true,
    });
  };

  // M10 fix: guard against double-taps. Without this, two rapid taps fire
  // both onLikePress and onPassPress (or like twice) before the swipe animation
  // and parent state catch up — server gets duplicate actions for the same card.
  const swipeInFlightRef = useRef(false);
  const onLikeUnlike = (type: string) => {
    if (swipeInFlightRef.current) return;
    swipeInFlightRef.current = true;
    // Release the lock after the bounce animation duration; the parent typically
    // also swaps the card out within this window. If the action never resolves,
    // the next mount of this card resets the ref anyway.
    setTimeout(() => {
      swipeInFlightRef.current = false;
    }, 600);

    if (type === 'like') {
      setProfileImageError(false);
      likeIconRef.current?.animate(POP, 380);
      onLikePress(data?.id);
    } else {
      onPassPress(data?.id);
      setProfileImageError(false);
      unLikeIconRef.current?.animate(POP, 380);
    }
  };

  const onProfileImageLoadStart = () => setProfileImageLoader(true);
  const onProfileImageLoadEnd = () => setProfileImageLoader(false);
  const onProfileImageError = () => {
    setProfileImageLoader(false);
    setProfileImageError(true);
  };

  const image = (
    <View
      style={{
        ...Styles.profileImageCon,
        ...Styles.shadow,
        left: 0,
        right: 0,
        bottom: 0,
      }}
    >
      {!profileImageError && data?.primary_image_to_show ? (
        <Image
          source={{ uri: data?.primary_image_to_show }}
          onLoadStart={onProfileImageLoadStart}
          onLoadEnd={onProfileImageLoadEnd}
          onError={onProfileImageError}
          style={Styles.image}
          resizeMode="cover"
        />
      ) : (
        <ProfilePhotoPlaceholder name={chatUserData?.name} />
      )}
      {/* {profileImageLoader && (
        <ActivityIndicator
          style={{ position: 'absolute' }}
          color={Colors.theme}
          size={wp(8)}
        />
      )} */}
    </View>
  );

  if (!data?.id) {
    return (
      <View style={Styles.nullSlideInnerContainer}>
        <View style={Styles.nullUserInfoContainer}>
          <View style={Styles.nullIconCircle}>
            <Ionicons name="sparkles" size={wp(11)} color={Colors.primary} />
          </View>
          <Text style={Styles.userNullTxtName}>
            {t('noRcommendedUserAvailable', {
              timeRange: getTimeRangeText(),
            })}
          </Text>
          <Button
            text={LanguageKeys.close}
            buttonStyle={Styles.nullCloseBtn}
            onPress={() => onPress()}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={Styles.slideInnerContainer}>
      <View style={Styles.shadow} />
      <View
        style={[Styles.imageContainer, even ? Styles.imageContainerEven : {}]}
      >
        {image}
      </View>
      <View style={Styles.userDataContainer}>
        <View>
          <Text
            style={[
              Styles.userInfoTxtName,
              { fontFamily: displayFont, textAlign: Rtl ? 'right' : 'left' },
            ]}
          >
            {capitalizeName(chatUserData?.name)}, {chatUserData?.age}
          </Text>
          <ProfileBadges
            userData={data}
            iconOnly
            surface="dailyRecommendations"
            containerStyle={Styles.recommendationBadges}
          />
          {chatUserData?.city && (
            <View
              style={[
                Styles.locationRow,
                { flexDirection: Rtl ? 'row-reverse' : 'row' },
              ]}
            >
              <Ionicons
                name="location-sharp"
                size={wp(3.6)}
                color={Colors.whiteRGBA90}
              />
              <Text style={Styles.userInfoTxt}>
                {chatUserData?.city}
                {chatUserData?.city && chatUserData?.country && ', '}
                {chatUserData?.country}
              </Text>
            </View>
          )}
        </View>
        {matchingData?.length ? (
          <View
            style={{
              ...Styles.listItemContainer,
              flexDirection: Rtl ? 'row-reverse' : 'row',
            }}
          >
            {matchingData?.map((item: any, index: number) => (
              <View key={index} style={Styles.item}>
                <Text style={Styles.itemValue}>{item?.value}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <View style={Styles.textContainer}>
          <Ripple
            style={[Styles.actionBtn, Styles.likeBtn, Styles.lightShadow]}
            rippleColor={Colors.primary}
            rippleContainerBorderRadius={wp(4.5)}
            onPress={() => onLikeUnlike('like')}
          >
            <View style={Styles.btnWrapper}>
              <Animatable.View ref={likeIconRef}>
                <Ionicons name="heart" size={wp(5.2)} color={Colors.primary} />
              </Animatable.View>
              <Text style={[Styles.btnTxt, { color: Colors.primary }]}>
                Like
              </Text>
            </View>
          </Ripple>
          <Ripple
            style={[Styles.actionBtn, Styles.passBtn]}
            rippleColor={Colors.surface}
            rippleContainerBorderRadius={wp(4.5)}
            onPress={() => onLikeUnlike('unlike')}
          >
            <View style={Styles.btnWrapper}>
              <Animatable.View ref={unLikeIconRef}>
                <Ionicons name="close" size={wp(5.6)} color={Colors.surface} />
              </Animatable.View>
              <Text style={[Styles.btnTxt, { color: Colors.surface }]}>
                Pass
              </Text>
            </View>
          </Ripple>
          <Ripple
            style={[Styles.actionBtn, Styles.messageBtn, Styles.messageShadow]}
            rippleColor={Colors.whiteRGBA30}
            rippleContainerBorderRadius={wp(4.5)}
            onPress={onMessagePress}
          >
            <View style={Styles.btnWrapper}>
              <Animatable.View ref={messageIconRef}>
                <Ionicons
                  name="chatbubble-ellipses"
                  size={wp(4.8)}
                  color={Colors.surface}
                />
              </Animatable.View>
              <Text style={[Styles.btnTxt, { color: Colors.surface }]}>
                Message
              </Text>
            </View>
          </Ripple>
        </View>
      </View>
      <LinearGradient
        colors={[
          'rgba(0,0,0,0)',
          'rgba(0,0,0,0)',
          'rgba(0,0,0,.7)',
          'rgba(0,0,0,1)',
        ]}
        locations={[0, 0.3, 0.8, 1]}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: '50%',
        }}
      />
    </View>
  );
};

export default SliderEntry;

const Styles = StyleSheet.create({
  nullSlideInnerContainer: {
    width: itemWidth,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nullUserInfoContainer: {
    position: 'absolute',
    height: '100%',
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.appBg,
    paddingHorizontal: wp(10),
  },
  nullIconCircle: {
    width: wp(24),
    height: wp(24),
    borderRadius: wp(12),
    backgroundColor: Colors.lavender,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: hp(3),
  },
  userNullTxtName: {
    color: Colors.ink,
    fontFamily: Fonts.APPFONT_M,
    fontSize: Typography.small3,
    textAlign: 'center',
    lineHeight: hp(3),
  },
  nullCloseBtn: {
    marginTop: hp(3),
    width: wp(55),
  },
  slideInnerContainer: {
    height: '100%',
    backgroundColor: Colors.greyRGBA61,
    width: '100%',
  },
  shadow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    shadowColor: 'rgba(0, 0, 0, 0.7)',
    shadowOpacity: 1,
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 10,
    backgroundColor: Colors.lavender,
  },
  imageContainer: {
    marginBottom: isIOS ? 0 : -1,
    backgroundColor: Colors.lavender,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  imageContainerEven: {
    backgroundColor: Colors.lavender,
  },
  profileImageCon: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    resizeMode: 'cover',
    backgroundColor: Colors.greyRGBA61,
  },
  userDataContainer: {
    position: 'absolute',
    bottom: hp(2.5),
    left: 0,
    right: 0,
    zIndex: 9,
  },
  userInfoTxtName: {
    color: Colors.color2,
    fontSize: Typography.large1,
    paddingHorizontal: wp(3),
    textShadowColor: Colors.blackRGBA70,
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 12,
    textTransform: 'capitalize',
  },
  recommendationBadges: {
    paddingHorizontal: wp(3),
    marginTop: hp(0.8),
  },
  locationRow: {
    alignItems: 'center',
    gap: wp(1.2),
    paddingHorizontal: wp(3),
    marginTop: hp(0.3),
  },
  userInfoTxt: {
    color: Colors.whiteRGBA90,
    fontFamily: Fonts.APPFONT_M,
    fontSize: Typography.small3,
    textShadowColor: Colors.blackRGBA70,
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 12,
  },
  listItemContainer: {
    flexWrap: 'wrap',
    paddingHorizontal: wp(2.5),
    gap: 5,
    marginBottom: 10,
  },
  item: {
    marginTop: 8,
    paddingHorizontal: wp(3),
    paddingVertical: hp(0.6),
    borderRadius: 50,
    backgroundColor: Colors.whiteRGBA18,
  },
  itemValue: {
    color: Colors.color2,
    fontFamily: Fonts.APPFONT_M,
    fontSize: Typography.small,
  },
  textContainer: {
    paddingHorizontal: wp(3),
    justifyContent: 'center',
    flexDirection: 'row',
    gap: wp(2.5),
    marginTop: hp(2),
  },
  actionBtn: {
    flex: 1,
    height: hp(7),
    borderRadius: wp(4.5),
    alignItems: 'center',
    justifyContent: 'center',
  },
  likeBtn: {
    backgroundColor: Colors.surface,
  },
  passBtn: {
    backgroundColor: Colors.whiteRGBA18,
    borderWidth: 1.5,
    borderColor: Colors.whiteRGBA30,
  },
  messageBtn: {
    flex: 1.6,
    backgroundColor: Colors.primary,
  },
  lightShadow: {
    shadowColor: Colors.blackRGBA50,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 6,
  },
  messageShadow: {
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
  },
  btnWrapper: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: wp(1.8),
  },
  btnTxt: {
    color: Colors.color2,
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small3,
    letterSpacing: 0.2,
  },
});
