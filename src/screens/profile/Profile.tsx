/* eslint-disable @typescript-eslint/no-explicit-any */
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import _ from 'lodash';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ScrollView } from 'react-native';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Loader, Text } from '../../components';
import { LanguageKeys } from '../../languages';
import {
  ApiServices,
  flashSuccessMessage,
  StorageManager,
  useGlobalContext,
} from '../../services';
import messageServices from '../../services/api/message-services';
import type { UserMedia } from '../../services/api/types/user-types';
import { useSettingsStore } from '../../stores';
import PolygamyBadge from './components/polygamy-badge';
import ProfileIntroMedia from './components/profile-intro-media';
import Header from './Header';
import InfoCard from './InfoCard';
import InterestAndHobbyCard from './InterestAndHobbyCard';
import {
  type BlockPickerOption,
  BlockPickerSheet,
  ContentScroll,
  ErrorRetry,
  ScreenLoader,
} from './profile-components';
import {
  computeCompletion,
  DetailSectionList,
  type GroupMeta,
  InterestsPreview,
  SectionLabel,
  SharePdfRow,
} from './profile-hub';
import { type ProfileFieldVisibility } from './profile-privacy';
import Styles from './Styles';

type LoaderState = { visible: boolean; message: string };

type PickerState = {
  pickerData: BlockPickerOption[];
  pickerHeaderTitle: string;
  visible: boolean;
  item: unknown;
  from: string;
};

type UserDetail = {
  tagline?: string;
  personality_id?: number[];
  interest_id?: string[];
  height_scale?: string;
  height_display_scale?: string;
  height?: number;
  weight_scale?: string;
  weight?: number;
  gender?: string;
  open_for_polygamy?: boolean | number | null;
  profile_field_visibility?: ProfileFieldVisibility;
};

type User = {
  id?: number;
  detail?: UserDetail;
  blocked?: number;
  blocked_you?: number;
  match_percentage?: number;
  is_blur?: boolean;
  gender?: string;
  profile_restricted?: boolean;
  media?: Partial<UserMedia>;
};

type Conversation = {
  id?: string;
};

type ProfileProps = {
  navigation: any;
  route?: { params?: { scrollTo?: number } };
  userData?: User;
  fromUserProfile?: boolean;
};

const Profile = ({
  navigation,
  route,
  userData: propUserData,
  fromUserProfile = false,
}: ProfileProps) => {
  const { currentUser, updateCurrentUser } = useGlobalContext();
  const scrollViewRef = useRef<ScrollView | null>(null);
  const isFocused = useIsFocused();
  const scrollToTarget = route?.params?.scrollTo;
  const [tagLineInputVisible, setTagLineInputVisible] = useState(false);
  const [tagLineInput, setTagLineInput] = useState('');
  const [error, setError] = useState<boolean>(false);
  // Existing-conversation detection was dropped with the Firebase RTDB removal.
  // The interaction-level block (interactionAction) is the real block; the
  // conversation-pivot block sync below only runs when a conversation id is
  // known, which no longer happens from the profile screen.
  const [userConversation] = useState<Conversation | null>(null);

  const [loader, setLoader] = useState<LoaderState>({
    visible: true,
    message: LanguageKeys.loading,
  });

  const [buttonPickerVisible, setButtonPickerVisible] = useState<PickerState>({
    pickerData: [],
    pickerHeaderTitle: '',
    visible: false,
    item: '',
    from: '',
  });

  const { getData, storageKeys, setData } = StorageManager;

  const [userData, setUserData] = useState<User>(
    propUserData
      ? propUserData
      : { ...currentUser, media: currentUser?.media ?? undefined }
  );
  const profileUserId = userData?.id;
  const [interestAndHobbies, setIinterestAndHobbies] = useState<any[]>([]);
  const [isBlockedByYou, setIsBlockedByYou] = useState(false);
  const [isBlockedYou, setIsBlockedYou] = useState(false);
  const [categoriesData, setCategoriesData] = useState<any>({});
  const [dataLoader, setDataLoader] = useState(true);

  const blockPickerData: BlockPickerOption[] = useMemo(
    () =>
      isBlockedByYou
        ? [
            { label: LanguageKeys.unBlock, value: 'unBlock' },
            { label: LanguageKeys.cancel, value: 'cancel' },
          ]
        : [
            { label: LanguageKeys.block, value: 'block' },
            { label: LanguageKeys.reportAndBlock, value: 'blockAndReport' },
            { label: LanguageKeys.cancel, value: 'cancel' },
          ],
    [isBlockedByYou]
  );

  const scrollToSection = useCallback(() => {
    if (scrollToTarget && scrollViewRef.current) {
      scrollViewRef.current.scrollTo({
        y: scrollToTarget,
        animated: true,
      });
    }
  }, [scrollToTarget]);

  useEffect(() => {
    scrollToSection();
  }, [scrollToSection]);

  useFocusEffect(
    React.useCallback(() => {
      if (profileUserId !== currentUser?.id) {
        ApiServices.getUserDetail(profileUserId).then((res) => {
          setUserData(res as User);
        });
      }
    }, [currentUser?.id, profileUserId])
  );

  // Sync userData with currentUser when viewing own profile for immediate updates
  useEffect(() => {
    if (
      !fromUserProfile &&
      currentUser?.id === profileUserId &&
      currentUser?.detail
    ) {
      const timeout = setTimeout(() => {
        setUserData((prevUserData) => ({
          ...prevUserData,
          detail: currentUser.detail,
          is_blur: currentUser.is_blur,
        }));
        if (currentUser?.detail?.tagline) {
          setTagLineInput(currentUser.detail.tagline);
        }
      }, 0);

      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [
    currentUser?.detail,
    currentUser?.id,
    currentUser?.is_blur,
    fromUserProfile,
    profileUserId,
  ]);

  const hideButtonPicker = useCallback(() => {
    setButtonPickerVisible({
      visible: false,
      item: '',
      from: '',
      pickerData: [],
      pickerHeaderTitle: '',
    });
  }, []);

  const onOpenGroup = useCallback(
    (group: GroupMeta) => {
      navigation.navigate('EditProfileGroup', {
        title: group.title,
        data: categoriesData?.[group.key] ?? [],
      });
    },
    [navigation, categoriesData]
  );

  const onEditInterests = useCallback(() => {
    navigation.navigate('EditInterests', { data: interestAndHobbies });
  }, [navigation, interestAndHobbies]);

  const onSharePdf = useCallback(() => {
    navigation.navigate('ProfilePdfShare');
  }, [navigation]);

  const profilePdfEnabled = useSettingsStore((s) => s.getProfilePdfEnabled());

  const getAttribute = useCallback(
    async (Data: any, nextUserData: User) => {
      let attributeRes: any;
      try {
        attributeRes = await ApiServices.getAttribute();
        await setData(storageKeys.ATTRIBUTE, attributeRes);
      } catch {
        attributeRes = await getData(storageKeys.ATTRIBUTE);
      }

      if (attributeRes) {
        if (attributeRes.hasOwnProperty('interest-0')) {
          const interest = (attributeRes['interest-0'] as any[]).map(
            (element: any) => ({
              ...element,
              selected: Boolean(
                nextUserData?.detail?.interest_id?.includes(element.id)
              ),
            })
          );
          setIinterestAndHobbies(interest);
        }
        const catData: any = {};
        for (const child in Data) {
          Data[child].forEach((element: any) => {
            if (child !== 'personalityRequirements') {
              const result = attributeRes[element.category]?.[element.id];
              if (result) {
                element.data = result;
              }
            }
            if (
              nextUserData?.detail &&
              Object.keys(nextUserData?.detail).length !== 0
            ) {
              const value = (nextUserData?.detail as any)[element.apiKey];

              if (value !== null && value !== undefined) {
                if (element.type === 'dropDown') {
                  const result = _.find(element?.data, function (n) {
                    if (n.id === value) {
                      return n;
                    }
                  });

                  if (result) {
                    element.selected = result;
                  } else if (
                    element.id === 'language' ||
                    element.id === 'nationality'
                  ) {
                    element.selected = {
                      id: value?.id,
                      value: value?.name,
                    };
                  }
                } else if (element.type === 'scalling') {
                  if (element.id === 'height') {
                    element.selected = {
                      scale: nextUserData?.detail?.height_scale,
                      value: nextUserData?.detail?.height,
                      displayScale:
                        nextUserData?.detail?.height_display_scale ??
                        nextUserData?.detail?.height_scale,
                    };
                  } else {
                    element.selected = {
                      scale: nextUserData?.detail?.weight_scale,
                      value: nextUserData?.detail?.weight,
                    };
                  }
                } else {
                  element.selected = {
                    id: element?.id,
                    value: value,
                    category: element?.category,
                  };
                }
              }
            }
          });
          catData[child] = Data[child];
        }
        console.log('catData', catData);
        setCategoriesData(catData);
        setDataLoader(false);
      }
    },
    [getData, setData, storageKeys.ATTRIBUTE]
  );

  const hideLoader = useCallback(() => {
    setLoader({
      visible: false,
      message: '',
    });
  }, []);

  const fetchData = useCallback(async () => {
    const data = await getData(storageKeys.PROFILE_DETAIL_LOCAL);
    setError(false);
    if (data) {
      if (fromUserProfile && profileUserId !== currentUser?.id) {
        try {
          setLoader({
            visible: true,
            message: LanguageKeys.loading,
          });
          const user = (await ApiServices.getUserDetail(profileUserId)) as User;
          setUserData(user);
          if (user?.detail?.tagline) {
            setTagLineInput(user.detail.tagline);
          }
          setIsBlockedByYou(user?.blocked === 1);
          setIsBlockedYou(user?.blocked_you === 1);
          if (user?.blocked_you !== 1) {
            getAttribute(data, user);
          } else {
            setDataLoader(false);
          }
        } catch {
          setError(true);
          setDataLoader(false);
          hideLoader();
        }
      } else {
        try {
          setLoader({
            visible: true,
            message: LanguageKeys.loading,
          });
          const userData = await ApiServices.getCurrentUserDetail();
          const user: User = {
            ...userData,
            is_blur: userData.is_blur === 1,
            detail: userData.detail ?? undefined,
            match_percentage: userData.match_percentage ?? undefined,
            media: userData.media ?? undefined,
          };
          setUserData(user);
          if (user?.detail?.tagline) {
            setTagLineInput(user.detail.tagline);
          }
          getAttribute(data, user);
        } catch {
          setError(true);
          setDataLoader(false);
          hideLoader();
        }
      }
    }
    setDataLoader(false);
    hideLoader();
  }, [
    currentUser?.id,
    fromUserProfile,
    getAttribute,
    getData,
    hideLoader,
    profileUserId,
    storageKeys.PROFILE_DETAIL_LOCAL,
  ]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void fetchData();
    }, 0);

    return () => clearTimeout(timeout);
  }, [fetchData, isFocused]);

  const onBlockPress = useCallback(() => {
    const pickerHeaderTitle = isBlockedByYou
      ? LanguageKeys.unBlockAlertSureDes
      : LanguageKeys.blockAlertSureDes;
    setButtonPickerVisible({
      visible: true,
      item: userData,
      from: 'block',
      pickerData: blockPickerData,
      pickerHeaderTitle: pickerHeaderTitle,
    });
  }, [blockPickerData, isBlockedByYou, userData]);

  const onLikeUnlikePress = (value: boolean) => {
    const params = {
      type: 2,
      action_user_id: userData?.id,
      allow_photo_request: 0,
    };
    ApiServices.interactionAction(params).then(() => {
      flashSuccessMessage(value ? LanguageKeys.liked : LanguageKeys.unLiked);
    });
  };

  const onButtonPickerButtonPress = (item: BlockPickerOption) => {
    hideButtonPicker();
    const { value } = item;
    if (value === 'block' || value === 'unBlock') {
      setLoader({
        visible: true,
        message: isBlockedByYou
          ? LanguageKeys.unBlockingUser
          : LanguageKeys.blockingUser,
      });
      const params = {
        type: 7,
        action_user_id: userData?.id,
        allow_photo_request: 0,
      };
      ApiServices.interactionAction(params)
        .then(() => {
          // Keep the REST conversation pivot (the gate sendMessage() actually
          // checks) in sync with the interaction-level block. Replaces the
          // legacy Firebase RTDB block flag, which never touched the pivot.
          const willBlock = !isBlockedByYou;
          const convId = Number(userConversation?.id);
          const targetId = Number(userData?.id);
          if (convId && targetId) {
            (willBlock
              ? messageServices.blockConversationParticipant(convId, targetId)
              : messageServices.unblockConversationParticipant(convId, targetId)
            ).catch(() => {});
          }
          flashSuccessMessage(
            willBlock ? LanguageKeys.blocked : LanguageKeys.unBlocked
          );
          const nextUser = { ...userData, blocked: value === 'block' ? 1 : 0 };
          setIsBlockedByYou(willBlock);
          setUserData(nextUser as User);
          hideLoader();
        })
        .catch(hideLoader);
    } else if (value === 'blockAndReport') {
      setLoader({
        visible: true,
        message: isBlockedByYou
          ? LanguageKeys.unBlockingUser
          : LanguageKeys.blockingUser,
      });
      const params = {
        type: 8,
        action_user_id: userData?.id,
        allow_photo_request: 0,
      };
      ApiServices.interactionAction(params)
        .then(() => {
          // Block-and-report is always a block action; mirror it onto the REST
          // conversation pivot so chat delivery is actually gated.
          const convId = Number(userConversation?.id);
          const targetId = Number(userData?.id);
          if (convId && targetId) {
            messageServices
              .blockConversationParticipant(convId, targetId)
              .catch(() => {});
          }
          flashSuccessMessage(LanguageKeys.blocked);
          const nextUser = { ...userData, blocked: 1 };
          setIsBlockedByYou(true);
          setUserData(nextUser as User);
          hideLoader();
        })
        .catch(hideLoader);
    }
  };

  const showTagLineInput = () => setTagLineInputVisible(true);
  const hideTagLineInput = () => {
    setTagLineInputVisible(false);
  };
  const onTagLineSubmit = () => {
    setLoader({
      visible: true,
      message: LanguageKeys.submitting,
    });
    ApiServices.updateDetails({ tagline: tagLineInput })
      .then(async (res) => {
        const updatedUser = { ...currentUser, detail: res };
        await setData(storageKeys.USER, updatedUser);
        updateCurrentUser(updatedUser);
        setUserData(updatedUser);
        fetchData();
        flashSuccessMessage(LanguageKeys.submitted);
        // hideLoader()
        hideTagLineInput();
      })
      .catch(hideLoader);
  };

  const onChangeTagLine = (text: string) => setTagLineInput(text);

  const isOwnProfile = !fromUserProfile;
  const headerUserData = {
    ...userData,
    media: userData.media
      ? {
          primary_image: userData.media.primary_image ?? undefined,
          cover_image: userData.media.cover_image ?? undefined,
          public_gallery: userData.media.public_gallery ?? undefined,
          private_photo_count: userData.media.private_photo_count ?? undefined,
          youtube_url: userData.media.youtube_url ?? undefined,
          un_blur_primary_image:
            userData.media.un_blur_primary_image ?? undefined,
        }
      : undefined,
  };

  return (
    <SafeAreaView style={Styles.container}>
      <ScreenLoader visible={loader.visible} message={loader.message} />
      {/* {currentUser?.membership_status === 0 && <PremiumButton />} */}
      <View style={{ flex: 1 }}>
        <ContentScroll scrollRef={scrollViewRef}>
          <Header
            navigation={navigation}
            fromUserProfile={fromUserProfile}
            userData={headerUserData}
            onBlockPress={onBlockPress}
            onLikeUnlikePress={onLikeUnlikePress}
            isBlockedYou={isBlockedYou}
            profileStrength={
              isOwnProfile
                ? computeCompletion({
                    categoriesData,
                    interests: interestAndHobbies,
                    tagline: userData?.detail?.tagline,
                    gender: userData?.detail?.gender ?? userData?.gender,
                  })
                : undefined
            }
            tagline={userData?.detail?.tagline}
            taglineEditing={tagLineInputVisible}
            taglineInput={tagLineInput}
            onTaglineChange={onChangeTagLine}
            onTaglineSubmit={onTagLineSubmit}
            onTaglineEditPress={showTagLineInput}
            onTaglineCancel={hideTagLineInput}
          />
          {/* Owner manages their intro video/voice from the Photos & videos
              screen; here we only show the viewer version so visitors can
              still watch/hear another member's intro on their profile. */}
          {!isBlockedYou && fromUserProfile ? (
            <ProfileIntroMedia
              isOwner={false}
              media={userData?.media}
              navigation={navigation}
            />
          ) : null}
          {isBlockedYou ? (
            <Text style={Styles.userNotAvailDes}>
              {LanguageKeys.userBlockedYouDes}
            </Text>
          ) : (
            <>
              {dataLoader ? (
                <Loader />
              ) : (
                <View>
                  {error ? (
                    <ErrorRetry onRetry={fetchData} />
                  ) : isOwnProfile ? (
                    <>
                      <SectionLabel label={LanguageKeys.aboutSectionLabel} />
                      <InterestsPreview
                        interests={interestAndHobbies}
                        onEdit={onEditInterests}
                      />
                      <SectionLabel label={LanguageKeys.profileDetailsLabel} />
                      <DetailSectionList
                        categoriesData={categoriesData}
                        gender={userData?.detail?.gender ?? userData?.gender}
                        onOpenGroup={onOpenGroup}
                      />
                      {profilePdfEnabled ? (
                        <SharePdfRow onPress={onSharePdf} />
                      ) : null}
                      <View style={{ height: 28 }} />
                    </>
                  ) : userData?.profile_restricted ? (
                    <View style={Styles.profileRestrictedCard}>
                      <Text style={Styles.profileRestrictedTitle}>
                        {LanguageKeys.profileRestrictedTitle}
                      </Text>
                      <Text style={Styles.profileRestrictedDescription}>
                        {LanguageKeys.profileRestrictedDescription}
                      </Text>
                    </View>
                  ) : (
                    <>
                      {userData?.detail?.open_for_polygamy ? (
                        <PolygamyBadge />
                      ) : null}
                      <InterestAndHobbyCard
                        data={interestAndHobbies}
                        headerHeading={LanguageKeys.myInterestAndHobbies}
                        fromUserProfile={fromUserProfile}
                      />
                      <InfoCard
                        data={categoriesData?.appearanceAndHealth}
                        headerHeading={LanguageKeys.appearanceHealth}
                        fromUserProfile={fromUserProfile}
                      />
                      <InfoCard
                        data={categoriesData?.familyBackground}
                        headerHeading={LanguageKeys.familyBackground}
                        fromUserProfile={fromUserProfile}
                      />
                      <InfoCard
                        data={categoriesData?.lifeStyle}
                        headerHeading={LanguageKeys.lifeStyle}
                        fromUserProfile={fromUserProfile}
                      />
                      <InfoCard
                        data={categoriesData?.personalityRequirements}
                        headerHeading={LanguageKeys.personalityRequirements}
                        fromUserProfile={fromUserProfile}
                      />
                      <InfoCard
                        data={categoriesData?.islamicValues}
                        headerHeading={LanguageKeys.islamicValues}
                        fromUserProfile={fromUserProfile}
                      />
                      <InfoCard
                        data={categoriesData?.futurePlan}
                        headerHeading={LanguageKeys.futurePlans}
                        fromUserProfile={fromUserProfile}
                        userData={{ gender: userData?.detail?.gender }}
                      />
                    </>
                  )}
                </View>
              )}
            </>
          )}
        </ContentScroll>
      </View>

      <BlockPickerSheet
        onClose={hideButtonPicker}
        visible={buttonPickerVisible.visible}
        data={buttonPickerVisible.pickerData}
        onButtonPress={onButtonPickerButtonPress}
        headerTitle={buttonPickerVisible.pickerHeaderTitle}
      />
    </SafeAreaView>
  );
};
export default Profile;
