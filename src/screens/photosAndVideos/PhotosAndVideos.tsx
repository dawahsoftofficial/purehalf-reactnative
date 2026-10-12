import { t } from 'i18next';
import _ from 'lodash';
import React, { useCallback, useEffect, useReducer, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text as ReactText,
  View,
} from 'react-native';
import * as ImagePickCrop from 'react-native-image-crop-picker';
import Ripple from 'react-native-material-ripple';
import AntDesign from 'react-native-vector-icons/AntDesign';
import Entypo from 'react-native-vector-icons/Entypo';

import {
  AnimatedLoader,
  Button,
  ButtonPicker,
  Container,
  Header,
  ImagePicker,
  ModalLoader,
  Text,
} from '../../components';
import { hp, Typography, wp } from '../../global';
import { CheckRtl, LanguageKeys } from '../../languages';
import { Colors, Fonts } from '../../res';
import {
  ApiServices,
  flashErrorMessage,
  flashSuccessMessage,
  isIOS,
} from '../../services';
import { StorageManager, useGlobalContext } from '../../services';
import ProfileIntroMedia from '../profile/components/profile-intro-media';
import { imageResizer } from './Functions';

const PhotosAndVideos = (props: any) => {
  const deletePickerData = [
    {
      label: 'Delete',
      value: 'delete',
      buttonStyle: { backgroundColor: Colors.color24 },
      buttonTextStyle: { color: Colors.color2 },
    },
    {
      label: 'Cancel',
      value: 'cancel',
    },
  ];

  const [buttonPickerVisible, setButtonPickerVisible] = useState<any>({
    pickerData: [],
    pickerHeaderTitle: '',
    visible: false,
    item: '',
    from: '',
  });
  const [loader, setLoader] = useState({
    visible: false,
    message: '',
  });

  const [ignore, forceUpdate] = useReducer((x) => x + 1, 0);
  const { currentUser, updateCurrentUser } = useGlobalContext();
  const { setData, storageKeys } = StorageManager;
  const [coverImage, setCoverImage] = useState('');
  const [coverImageLoader, setCoverImageLoader] = useState(false);
  const [uploadingCoverLoader, setUploadingCoverLoader] = useState(false);
  const [profileImage, setProfileImage] = useState('');
  const [profileImageLoader, setProfileImageLoader] = useState(false);
  const [uploadingProfileLoader, setUploadingProfileLoader] = useState(false);
  const [toolTipVisible, setToolTipVisible] = useState<boolean>(false);
  const [isUpdatingBlur, setIsUpdatingBlur] = useState(false);

  const Rtl = CheckRtl();
  const [youtubeURL, setYoutubeURL] = useState('');
  const [imagePicker, setImagePicker] = useState({
    visible: false,
    from: '',
  });
  const [publicPhotos, setPublicPhotos] = useState<any>([]);
  const [privatePhotos, setPrivatePhotos] = useState<any>([]);

  const setUserData = useCallback(async () => {
    const { media } = currentUser;
    if (!media) {
      return;
    }

    const {
      cover_image,
      youtube_url,
      public_gallery,
      private_gallery,
      un_blur_primary_image,
      primary_image_to_show,
      primary_image,
    } = media as any;

    if (cover_image) {
      setCoverImage(cover_image);
    }

    const nextProfileImage =
      un_blur_primary_image ?? primary_image_to_show ?? primary_image ?? '';
    if (nextProfileImage) {
      setProfileImage(nextProfileImage);
    }

    if (youtube_url) {
      setYoutubeURL(youtube_url);
    }

    if (public_gallery && public_gallery.length !== 0) {
      const publicPhotosData: any = [];
      for await (const element of public_gallery) {
        publicPhotosData.push({ uri: element, uploadSuccessful: true });
      }
      setPublicPhotos(publicPhotosData);
    }

    if (private_gallery && private_gallery.length !== 0) {
      const privatePhotosData: any = [];
      for await (const element of private_gallery) {
        privatePhotosData.push({ uri: element, uploadSuccessful: true });
      }
      setPrivatePhotos(privatePhotosData);
    }
  }, [currentUser]);

  useEffect(() => {
    setUserData();
  }, [setUserData]);

  const hideLoader = () => {
    setLoader({
      visible: false,
      message: '',
    });
  };

  const blurOn = !!currentUser?.is_blur;
  const onToggleBlur = async () => {
    if (isUpdatingBlur) {
      return;
    }
    const newBlurValue = !currentUser?.is_blur;
    setIsUpdatingBlur(true);
    try {
      const res: any = await ApiServices.updateUserInfo({
        is_blur: newBlurValue ? 1 : 0,
      });
      const updatedUser = {
        ...currentUser,
        ...res,
        is_blur: newBlurValue ? 1 : 0,
      };
      await setData(storageKeys.USER, updatedUser);
      updateCurrentUser(updatedUser);
      flashSuccessMessage(
        newBlurValue ? LanguageKeys.turnOnBlur : LanguageKeys.turnOffBlur
      );
    } catch {
      // error already flashed by updateUserInfo
    } finally {
      setIsUpdatingBlur(false);
    }
  };

  const RenderHeadingDes = ({
    heading,
    description,
    count,
    max,
    lock,
  }: any) => (
    <View style={Styles.headingDesCon}>
      <View
        style={{
          ...Styles.headingRow,
          flexDirection: Rtl ? 'row-reverse' : 'row',
        }}
      >
        <View
          style={{
            ...Styles.headingTitleCon,
            flexDirection: Rtl ? 'row-reverse' : 'row',
          }}
        >
          {lock ? (
            <AntDesign
              name="lock"
              color={Colors.ink}
              size={wp(4)}
              style={Styles.lockIcon}
            />
          ) : null}
          <Text style={Styles.heading}>{heading}</Text>
        </View>
        {count !== undefined ? (
          <View style={Styles.countChip}>
            <ReactText
              style={Styles.countChipTxt}
            >{`${count} / ${max}`}</ReactText>
          </View>
        ) : null}
      </View>
      <Text style={Styles.description}>{description}</Text>
    </View>
  );

  const showDeleteButtonPicker = (item: any, from: any) => {
    setButtonPickerVisible({
      visible: true,
      item: item,
      from: from,
      pickerData: deletePickerData,
      pickerHeaderTitle: 'Options',
    });
  };
  const hideButtonPicker = () => {
    setButtonPickerVisible({
      visible: false,
      item: '',
      from: '',
      pickerData: [],
      pickerHeaderTitle: '',
    });
  };

  const onArrowUpPress = (item: any, from: any) => {
    const { uri } = item;
    setLoader({
      visible: true,
      message: 'Moving image...',
    });
    if (from === 'public_gallery') {
      const params = {
        from: 'public_gallery',
        file_path: uri,
        to: 'primary_image',
      };
      ApiServices.moveMedia(params)
        .then((res: any) => {
          currentUser.media = res;
          setData(storageKeys.USER, currentUser);
          updateCurrentUser(currentUser);
          _.remove(publicPhotos, function (n: any) {
            return n.uri == uri;
          });
          setPublicPhotos(publicPhotos);
          setProfileImage(item.uri);
          hideLoader();
        })
        .catch(hideLoader);
    } else if (from === 'private_gallery') {
      const params = {
        from: 'private_gallery',
        file_path: uri,
        to: 'public_gallery',
      };
      ApiServices.moveMedia(params)
        .then((res: any) => {
          currentUser.media = res;
          setData(storageKeys.USER, currentUser);
          updateCurrentUser(currentUser);
          publicPhotos.unshift({
            uri: uri,
            uploadSuccessful: true,
          });
          _.remove(privatePhotos, function (n: any) {
            return n.uri == uri;
          });
          setPublicPhotos(publicPhotos);
          setPrivatePhotos(privatePhotos);
          hideLoader();
        })
        .catch(hideLoader);
    }
  };

  const onArrowDownPress = (item: any, from: any) => {
    const { uri } = item;
    setLoader({
      visible: true,
      message: 'Moving image...',
    });
    if (from === 'public_gallery') {
      const params = {
        from: 'public_gallery',
        file_path: uri,
        to: 'private_gallery',
      };
      ApiServices.moveMedia(params)
        .then((res: any) => {
          currentUser.media = res;
          setData(storageKeys.USER, currentUser);
          updateCurrentUser(currentUser);
          privatePhotos.unshift({
            uri: uri,
            uploadSuccessful: true,
          });
          _.remove(publicPhotos, function (n: any) {
            return n.uri == uri;
          });
          setPublicPhotos(publicPhotos);
          setPrivatePhotos(privatePhotos);
          hideLoader();
        })
        .catch(hideLoader);
    } else if (from === 'primary_image') {
      const params = {
        from: 'primary_image',
        file_path: uri,
        to: 'public_gallery',
      };
      ApiServices.moveMedia(params)
        .then((res: any) => {
          currentUser.media = res;
          setData(storageKeys.USER, currentUser);
          updateCurrentUser(currentUser);
          publicPhotos.unshift({
            uri: uri,
            uploadSuccessful: true,
          });
          setProfileImage('');
          setPublicPhotos(publicPhotos);
          hideLoader();
        })
        .catch(hideLoader);
    } else {
      hideLoader();
    }
  };

  const onTryAgainPress = (item: any, index: any, from: any) => {
    item.uploadFailed = false;
    forceUpdate();
    imageResizer(item)
      .then((res: any) => {
        res.type = item?.type;
        ApiServices.imageUpload(res, from, youtubeURL)
          .then(async (res: any) => {
            if (res) {
              const { public_gallery, private_gallery } = res;
              currentUser.media = res;
              await setData(storageKeys.USER, currentUser);
              item.uploadSuccessful = true;
              item.uri =
                imagePicker.from === 'public_gallery'
                  ? public_gallery[public_gallery.length - 1]
                  : private_gallery[private_gallery.length - 1];
              forceUpdate();
            }
          })
          .catch(() => {
            item.uploadFailed = true;
            forceUpdate();
          });
      })
      .catch(() => {
        item.uploadFailed = true;
        forceUpdate();
      });
  };

  const RenderPhotosList = ({ item, index, from }: any) => {
    const { uploadSuccessful, uploadFailed } = item;
    return (
      <View
        style={{
          ...Styles.itemOuterCon,
          paddingRight: Rtl ? 0 : wp(4),
          paddingLeft: Rtl ? wp(4) : 0,
        }}
      >
        <View style={Styles.itemCon}>
          {uploadFailed ? (
            <View>
              <Text style={Styles.failedText}>Upload failed</Text>
              <Button
                text="Try again"
                buttonStyle={Styles.tryAgainButton}
                textStyle={Styles.tryAgainTxt}
                onPress={onTryAgainPress.bind(null, item, index, from)}
              />
            </View>
          ) : !uploadSuccessful ? (
            <AnimatedLoader visible={true} />
          ) : (
            <Image
              source={{ uri: item.uri }}
              resizeMode="cover"
              style={Styles.itemCon}
            />
          )}
        </View>
        {uploadSuccessful &&
        from === 'private_gallery' &&
        publicPhotos?.length < 10 ? (
          <View
            style={{
              ...Styles.upBtnCon,
              alignItems: Rtl ? 'flex-start' : 'flex-end',
            }}
          >
            <Ripple
              style={Styles.upBtn}
              onPress={onArrowUpPress.bind(null, item, from)}
            >
              <AntDesign name="arrowup" color={Colors.color2} size={wp(4)} />
            </Ripple>
          </View>
        ) : null}
        {uploadSuccessful && from === 'public_gallery' ? (
          <View
            style={{
              ...Styles.upBtnCon,
              alignItems: Rtl ? 'flex-start' : 'flex-end',
            }}
          >
            <Ripple
              style={Styles.upBtn}
              onPress={onArrowUpPress.bind(null, item, from)}
            >
              <AntDesign name="arrowup" color={Colors.color2} size={wp(4)} />
            </Ripple>
          </View>
        ) : null}
        {uploadSuccessful &&
        from !== 'private_gallery' &&
        privatePhotos?.length < 10 ? (
          <View
            style={{
              ...Styles.downBtnCon,
              alignItems: Rtl ? 'flex-start' : 'flex-end',
            }}
          >
            <Ripple
              style={Styles.downBtn}
              onPress={onArrowDownPress.bind(null, item, from)}
            >
              <AntDesign name="arrowdown" color={Colors.color2} size={wp(4)} />
            </Ripple>
          </View>
        ) : null}
        {uploadSuccessful && (
          <Ripple
            style={{
              ...Styles.menuButtonCon,
              ...Styles.shadowTwo,
              alignSelf: Rtl ? 'flex-end' : 'flex-start',
            }}
            onPress={showDeleteButtonPicker.bind(null, item, from)}
          >
            <Entypo
              name="dots-three-vertical"
              color={Colors.color2}
              size={wp(4.5)}
            />
          </Ripple>
        )}
      </View>
    );
  };

  const onUpoadPicture = (
    imageObj: {
      height: number | string;
      width: number | string;
      uri: string;
      name: string;
      size: number | string;
    },
    fromKey?: string
  ) => {
    const uploadKey = fromKey ?? imagePicker.from;
    const apiKey =
      uploadKey === 'primary_image_to_show' ? 'primary_image' : uploadKey;
    showUploadingLoader(uploadKey);
    hideImagePicker();
    ApiServices.imageUpload(imageObj, apiKey, youtubeURL)
      .then(async (res: any) => {
        if (res) {
          const nextProfileImage =
            res?.un_blur_primary_image ??
            res?.primary_image_to_show ??
            res?.primary_image ??
            '';
          if (nextProfileImage) {
            setProfileImage(nextProfileImage);
          }

          const updatedUser = { ...(currentUser as any), media: res };
          updateCurrentUser(updatedUser);
          await setData(storageKeys.USER, updatedUser);
          hideUploadingLoader(uploadKey);
        }
      })
      .catch(() => hideUploadingLoader(uploadKey));
  };

  const onAddPofilePress = () => {
    setImagePicker({
      visible: true,
      from: 'primary_image_to_show',
    });
  };

  const AddProfilePictureBtn = () => (
    <View
      style={{
        ...Styles.profileRow,
        flexDirection: Rtl ? 'row-reverse' : 'row',
      }}
    >
      {uploadingProfileLoader ? (
        <View style={Styles.profileCircle}>
          <AnimatedLoader visible={true} />
        </View>
      ) : profileImage.length === 0 ? (
        <Ripple
          style={{ ...Styles.profileCircle, ...Styles.profileCircleEmpty }}
          onPress={onAddPofilePress}
        >
          <AntDesign name="camerao" size={wp(6.5)} color={Colors.primary} />
        </Ripple>
      ) : (
        <Ripple style={Styles.profileCircle} onPress={onAddPofilePress}>
          <Image
            source={{ uri: profileImage }}
            resizeMode="cover"
            style={Styles.profileCircleImg}
            onLoadStart={onProfileImageLoadStart}
            onLoadEnd={onProfileImageLoadEnd}
            onError={onProfileImageError}
          />
          <View
            style={{
              ...Styles.editBadge,
              ...(Rtl ? { left: 0 } : { right: 0 }),
            }}
          >
            <Entypo name="pencil" size={wp(3)} color={Colors.color2} />
          </View>
        </Ripple>
      )}
      <View style={Styles.blurCol}>
        <View
          style={{
            ...Styles.blurRow,
            flexDirection: Rtl ? 'row-reverse' : 'row',
          }}
        >
          <Entypo
            name={blurOn ? 'eye-with-line' : 'eye'}
            size={wp(4.5)}
            color={Colors.primary}
          />
          <Text style={Styles.blurLbl}>{LanguageKeys.blurMyPhoto}</Text>
          <Switch
            value={blurOn}
            onValueChange={onToggleBlur}
            disabled={isUpdatingBlur}
            trackColor={{ false: Colors.hairline, true: Colors.primary }}
            thumbColor={Colors.color2}
          />
        </View>
        <Text style={Styles.blurHint}>{LanguageKeys.blurPhotoHint}</Text>
      </View>
    </View>
  );

  const onAddPublicPrivatePress = (from: any) => {
    setImagePicker({
      visible: true,
      from: from,
    });
  };

  const AddPhotoBtn = (from: any) => {
    return (
      <Ripple
        style={{
          ...Styles.addPhotoBtn,
          marginRight: Rtl ? 0 : wp(4),
          marginLeft: Rtl ? wp(4) : 0,
        }}
        onPress={onAddPublicPrivatePress.bind(null, from)}
      >
        <AntDesign name="camerao" size={wp(6.5)} color={Colors.primary} />
        <Text style={Styles.addPhotoLbl}>{LanguageKeys.addPhoto}</Text>
      </Ripple>
    );
  };

  const RenderList = ({ heading, description, data, from, lock }: any) => {
    return (
      <View style={Styles.listOuterCon}>
        <RenderHeadingDes
          heading={heading}
          description={description}
          count={data?.length ?? 0}
          max={10}
          lock={lock}
        />
        <FlatList
          horizontal
          data={data}
          renderItem={({ item, index }) => (
            <RenderPhotosList item={item} index={index} from={from} />
          )}
          ListHeaderComponent={AddPhotoBtn.bind(null, from)}
          contentContainerStyle={Styles.listContainer}
          showsHorizontalScrollIndicator={false}
          inverted={Rtl}
        />
      </View>
    );
  };

  const deleteCoverImage = () => {
    setLoader({
      visible: true,
      message: 'Deleting cover...',
    });
    const params = {
      key: 'cover_image',
      file_path: coverImage,
    };
    ApiServices.deleteImage(params)
      .then(() => {
        setCoverImage('');
        hideLoader();
        currentUser.media.cover_image = null;
        setData(storageKeys.USER, currentUser);
        updateCurrentUser(currentUser);
      })
      .catch(hideLoader);
  };

  const deleteProfileImage = () => {
    setLoader({
      visible: true,
      message: 'Deleting profile image...',
    });
    const params = {
      key: 'primary_image',
      file_path: profileImage,
    };
    ApiServices.deleteImage(params)
      .then(() => {
        currentUser.primary_image_to_show = null;
        setProfileImage('');
        hideLoader();
        setData(storageKeys.USER, currentUser);
        updateCurrentUser(currentUser);
      })
      .catch(hideLoader);
  };

  const onCoverDeletePress = () => {
    setButtonPickerVisible({
      visible: true,
      from: 'cover_image',
      item: coverImage,
      pickerData: deletePickerData,
      pickerHeaderTitle: LanguageKeys.sureDeleteDes,
    });
  };

  const onProfileDeletePress = () => {
    setButtonPickerVisible({
      visible: true,
      from: 'primary_image_to_show',
      item: profileImage,
      pickerData: deletePickerData,
      pickerHeaderTitle: LanguageKeys.sureDeleteDes,
    });
  };

  // const onChangeYoutubeURL = (text: any) => {
  //   setYoutubeURL(text);
  // };

  const hideImagePicker = () =>
    setImagePicker({
      visible: false,
      from: '',
    });

  const onAddCoverPress = () => {
    setImagePicker({
      visible: true,
      from: 'cover_image',
    });
  };

  const showUploadingLoader = (key?: string) => {
    const fromKey = key ?? imagePicker.from;
    if (fromKey === 'cover_image') {
      setUploadingCoverLoader(true);
    } else if (fromKey === 'primary_image_to_show') {
      setUploadingProfileLoader(true);
    }
  };

  const hideUploadingLoader = (key?: string) => {
    const fromKey = key ?? imagePicker.from;
    if (fromKey === 'cover_image') {
      setUploadingCoverLoader(false);
    } else if (fromKey === 'primary_image_to_show') {
      setUploadingProfileLoader(false);
    }
  };

  const onImageProfileCoverSelection = (images: any, fromKey?: string) => {
    const key = fromKey ?? imagePicker.from;
    const first = Array.isArray(images) ? images[0] : images;
    const imagePath = first?.uri ?? first?.path;
    if (!imagePath) {
      return;
    }
    ImagePickCrop.openCropper({
      writeTempFile: true,
      path: imagePath,
      mediaType: 'photo',
      width: key === 'cover_image' ? 600 : 450,
      height: key === 'cover_image' ? 300 : 450,
    })
      .then((image) => {
        const resizedImageObj = {
          height: image?.height,
          width: image?.width,
          uri: image?.path,
          name: image?.path?.split('/')[image?.path?.split('/')?.length - 1],
          size: image?.size,
        };
        onUpoadPicture(resizedImageObj, key);
      })
      .catch(() => hideUploadingLoader(key));
  };

  const onImagePublicPrivateSelection = (images: any) => {
    hideImagePicker();
    if (
      (publicPhotos.length === 10 && imagePicker.from === 'public_gallery') ||
      (privatePhotos.length === 10 && imagePicker.from === 'private_gallery')
    ) {
      flashErrorMessage(LanguageKeys.maxTenImages);
    } else if (images.length !== 0) {
      let newImages: any = [];
      if (imagePicker.from === 'public_gallery') {
        const length = [...publicPhotos, ...images].length;
        if (length > 10) {
          flashErrorMessage(
            t(LanguageKeys.maxTenPublicImages, {
              remaining: 10 - publicPhotos.length,
            })
          );
        } else {
          publicPhotos.unshift(...images);
          setPublicPhotos(publicPhotos);
          newImages = publicPhotos;
          forceUpdate();
        }
      } else if (imagePicker.from === 'private_gallery') {
        const length = [...privatePhotos, ...images].length;
        if (length > 10) {
          flashErrorMessage(
            t(LanguageKeys.maxTenPrivateImages, {
              remaining: 10 - privatePhotos.length,
            })
          );
        } else {
          privatePhotos.unshift(...images);
          setPrivatePhotos(privatePhotos);
          newImages = privatePhotos;
          forceUpdate();
        }
      }

      if (newImages.length <= 10) {
        newImages.forEach((element: any) => {
          if (!element.uploadSuccessful) {
            imageResizer(element)
              .then((res: any) => {
                res.type = element?.type;
                ApiServices.imageUpload(res, imagePicker.from, youtubeURL)
                  .then(async (res: any) => {
                    if (res) {
                      const { public_gallery, private_gallery } = res;
                      currentUser.media = res;
                      await setData(storageKeys.USER, currentUser);
                      element.uploadSuccessful = true;
                      element.uri =
                        imagePicker.from === 'public_gallery'
                          ? public_gallery[public_gallery.length - 1]
                          : private_gallery[private_gallery.length - 1];
                      forceUpdate();
                    }
                  })
                  .catch(() => {
                    element.uploadFailed = true;
                    forceUpdate();
                  });
              })
              .catch(() => {
                element.uploadFailed = true;
                forceUpdate();
              });
          }
        });
      }
    }
  };

  const onImagePrivatePublicDelete = (item: any, from: any) => {
    const { uri } = item;
    setLoader({
      visible: true,
      message: 'Deleting image...',
    });
    const params = {
      key: from,
      file_path: uri,
    };
    ApiServices.deleteImage(params)
      .then((res) => {
        if (from === 'public_gallery') {
          _.remove(publicPhotos, function (n: any) {
            return n.uri == uri;
          });
          setPublicPhotos(publicPhotos);
          forceUpdate();
          hideLoader();
        } else if (from === 'private_gallery') {
          _.remove(privatePhotos, function (n: any) {
            return n.uri == uri;
          });
          setPrivatePhotos(privatePhotos);
          forceUpdate();
          hideLoader();
        }
        currentUser.media = res;
        setData(storageKeys.USER, currentUser);
        updateCurrentUser(currentUser);
      })
      .catch(hideLoader);
  };

  const onButtonPickerButtonPress = (item: any) => {
    const { value } = item;
    hideButtonPicker();
    if (
      value === 'delete' &&
      (buttonPickerVisible.from === 'private_gallery' ||
        buttonPickerVisible.from === 'public_gallery')
    ) {
      onImagePrivatePublicDelete(
        buttonPickerVisible.item,
        buttonPickerVisible.from
      );
    } else if (
      value === 'delete' &&
      buttonPickerVisible.from === 'cover_image'
    ) {
      deleteCoverImage();
    } else if (
      value === 'delete' &&
      buttonPickerVisible.from === 'primary_image_to_show'
    ) {
      deleteProfileImage();
    }
  };

  const onCoverImageLoadStart = () => {
    setCoverImageLoader(true);
  };

  const onCoverImageLoadEnd = () => {
    setCoverImageLoader(false);
  };

  const onProfileImageLoadStart = () => {
    setProfileImageLoader(true);
  };

  const onProfileImageLoadEnd = () => {
    setProfileImageLoader(false);
  };

  const onProfileImageError = () => {
    setProfileImageLoader(false);
  };

  const youtubeURLValidation = (url: any) => {
    const p =
      /^(?:https?:\/\/)?(?:www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})(?:\S+)?$/;
    return url.match(p) ? RegExp.$1 : false;
  };

  const onSavePress = () => {
    if (youtubeURL.length === 0) {
      flashErrorMessage(LanguageKeys.noLinkAdded);
    } else if (!youtubeURLValidation(youtubeURL)) {
      flashErrorMessage(LanguageKeys.youtubeLinkOnly);
    } else {
      setLoader({
        visible: true,
        message: LanguageKeys.savingYoutubeVideo,
      });
      ApiServices.imageUpload({}, {}, youtubeURL)
        .then(async (res) => {
          currentUser.media = res;
          await setData(storageKeys.USER, currentUser);
          flashSuccessMessage(LanguageKeys.saved);
          hideLoader();
        })
        .catch(hideLoader);
    }
  };

  // const RenderCover = () => {
  //   return uploadingCoverLoader ? (
  //     <View style={Styles.coverPhoto}>
  //       <AnimatedLoader text="Uploading cover image..." visible={true} />
  //     </View>
  //   ) : coverImage.length === 0 ? (
  //     <Ripple style={Styles.coverPhoto} onPress={onAddCoverPress}>
  //       <Image
  //         source={Images.camera}
  //         resizeMode="contain"
  //         style={Styles.cameraIcon}
  //       />
  //       <Text style={Styles.uploadPhoto}>{LanguageKeys.uploadPhoto}</Text>
  //     </Ripple>
  //   ) : (
  //     <View style={Styles.coverPhoto}>
  //       <Image
  //         source={{ uri: coverImage }}
  //         resizeMode="cover"
  //         style={Styles.coverPhoto}
  //         onLoadStart={onCoverImageLoadStart}
  //         onLoadEnd={onCoverImageLoadEnd}
  //       />
  //       <View
  //         style={{
  //           ...Styles.deleteCoverBtnCon,
  //           alignItems: Rtl ? 'flex-start' : 'flex-end',
  //         }}
  //       >
  //         <Ripple
  //           style={{ ...Styles.deleteCoverBtn, ...Styles.shadow }}
  //           onPress={onCoverDeletePress}
  //         >
  //           <AntDesign name="delete" color={Colors.color1} size={wp(4.5)} />
  //         </Ripple>
  //       </View>
  //       {coverImageLoader && (
  //         <ActivityIndicator
  //           color={Colors.theme}
  //           size={wp(5)}
  //           style={{ position: 'absolute' }}
  //         />
  //       )}
  //     </View>
  //   );
  // };

  // const onVideoPress = () => {
  //   props.navigation.navigate('MyVideo');
  // };

  return (
    <Container>
      <ModalLoader visible={loader.visible} message={loader.message} />
      <Header
        title={LanguageKeys.photosAndVideos}
        titleVariant="display"
        navigation={props.navigation}
        customConponent={() => (
          <View
            style={{
              ...Styles.headerRight,
              alignItems: Rtl ? 'flex-start' : 'flex-end',
            }}
          >
            <Ripple
              style={Styles.infoBtn}
              onPress={() => setToolTipVisible(true)}
            >
              <AntDesign
                name="infocirlceo"
                size={wp(5)}
                color={Colors.primary}
              />
            </Ripple>
          </View>
        )}
      />
      <Modal
        visible={toolTipVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setToolTipVisible(false)}
      >
        <View style={Styles.sheetBackdrop}>
          <Pressable
            style={Styles.sheetDismissArea}
            onPress={() => setToolTipVisible(false)}
          />
          <View style={Styles.sheet}>
            <View style={Styles.sheetHandle} />
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              <View
                style={{
                  ...Styles.sheetOrnament,
                  alignSelf: Rtl ? 'flex-end' : 'flex-start',
                }}
              >
                <AntDesign name="staro" size={wp(5.5)} color={Colors.primary} />
              </View>
              <Text variant="display" style={Styles.sheetTitle}>
                {LanguageKeys.honoringIslamicValues}
              </Text>
              <Text style={Styles.sheetLead}>
                We request you to uphold modesty, inviting blessings and mercy
                from Allah. Profile pictures can be blurred for privacy — you
                decide who gets to see your images.
              </Text>
              <View
                style={{
                  ...Styles.quoteCard,
                  ...(Rtl
                    ? { borderRightWidth: 3, borderRightColor: Colors.primary }
                    : { borderLeftWidth: 3, borderLeftColor: Colors.primary }),
                }}
              >
                <Text style={Styles.quoteLabel}>
                  {LanguageKeys.quranicVerse}
                </Text>
                <Text style={Styles.quoteText}>
                  {
                    '“And tell the believing women to lower their gaze and guard their private parts and not expose their adornment except that which (necessarily) appears…”'
                  }
                </Text>
                <Text style={Styles.quoteSource}>{"— Qur'an 24:31"}</Text>
              </View>
              <View
                style={{
                  ...Styles.quoteCard,
                  ...(Rtl
                    ? { borderRightWidth: 3, borderRightColor: Colors.primary }
                    : { borderLeftWidth: 3, borderLeftColor: Colors.primary }),
                }}
              >
                <Text style={Styles.quoteLabel}>
                  {LanguageKeys.hadithLabel}
                </Text>
                <Text style={Styles.quoteText}>
                  {
                    '“Modesty is part of faith and faith is in Paradise, but obscenity is a part of hardness of the heart and hardness of the heart is in Hell.”'
                  }
                </Text>
                <Text style={Styles.quoteSource}>— Sahih Muslim</Text>
              </View>
            </ScrollView>
            <Button
              onPress={() => setToolTipVisible(false)}
              buttonStyle={Styles.understoodBtn}
              text={LanguageKeys.understood}
            />
          </View>
        </View>
      </Modal>
      <ScrollView
        contentContainerStyle={Styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* <RenderHeadingDes
          heading={LanguageKeys.cover}
          description={LanguageKeys.coverDes}
        />
        {RenderCover()} */}
        {/* <View
          style={{
            ...Styles.videoVoiceContainer,
            flexDirection: Rtl ? 'row-reverse' : 'row',
          }}
        >
          <Ripple style={Styles.videoVoiceIconWrapper} onPress={onVideoPress}>
            <View style={Styles.videoVoiceIconContainer}>
              <Ionicons
                name="play-outline"
                size={wp(7)}
                color={Colors.color2}
              />
            </View>
            <Text style={Styles.videoVoiceIconText}>My Video</Text>
          </Ripple>
          <Ripple
            style={{ ...Styles.videoVoiceIconWrapper, marginLeft: wp(4) }}
            // onPress={onEditPress}
          >
            <View style={Styles.videoVoiceIconContainer}>
              <AntDesign name="sound" size={wp(7)} color={Colors.color2} />
            </View>
            <Text style={Styles.videoVoiceIconText}>My audio</Text>
          </Ripple>
        </View> */}
        <RenderHeadingDes
          heading={LanguageKeys.profilePhotoHeading}
          description={LanguageKeys.profilePhotoShownDes}
        />
        {AddProfilePictureBtn()}
        <View style={Styles.divider} />
        <ProfileIntroMedia
          isOwner
          media={currentUser?.media}
          navigation={props.navigation}
        />
        <View style={Styles.divider} />
        {/* <View style={{ flexDirection: Rtl ? 'row-reverse' : 'row' }}>
          <IconInput
            label={LanguageKeys.youTubeVideoHeading}
            outerLabelStyle={Styles.heading}
            containerStyle={Styles.inputOuterCon}
            inputStyle={{
              width: wp(75),
              color: Colors.color1,
            }}
            value={youtubeURL}
            onChangeText={onChangeYoutubeURL}
            numberOfLines={1}
          />
          <Ripple onPress={onSavePress} style={Styles.youtubeSaveBtn}>
            <Text style={Styles.youtubeSaveBtnTxt}>Save</Text>
          </Ripple>
        </View> */}

        <RenderList
          heading={LanguageKeys.publicPhotosHeading}
          description={LanguageKeys.publicPhotosVisibility}
          data={publicPhotos}
          from={'public_gallery'}
        />
        <View style={Styles.divider} />
        <RenderList
          heading={LanguageKeys.privatePhotosHeading}
          description={LanguageKeys.privatePhotosVisibility}
          data={privatePhotos}
          from={'private_gallery'}
          lock={true}
        />
      </ScrollView>
      <ImagePicker
        visible={imagePicker.visible}
        from={imagePicker.from}
        onImageSelection={(res: any) => {
          const fromKey = imagePicker.from;
          hideImagePicker();
          if (fromKey === 'public_gallery' || fromKey === 'private_gallery') {
            onImagePublicPrivateSelection(res);
          } else {
            const selection = Array.isArray(res) ? res : res ? [res] : [];
            setTimeout(
              () => onImageProfileCoverSelection(selection, fromKey),
              isIOS ? 1000 : 0
            );
          }
        }}
        onClose={hideImagePicker}
      />
      <ButtonPicker
        visible={buttonPickerVisible.visible}
        data={buttonPickerVisible.pickerData}
        onClose={hideButtonPicker}
        headerTitle={buttonPickerVisible.pickerHeaderTitle}
        onButtonPress={onButtonPickerButtonPress}
      />
    </Container>
  );
};

export default PhotosAndVideos;

const { width } = Dimensions.get('window');

const Styles = StyleSheet.create({
  contentContainer: {
    flexGrow: 1,
    paddingBottom: hp(4),
  },
  headingDesCon: {
    paddingVertical: hp(1.2),
    paddingHorizontal: wp(4),
  },
  headingRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headingTitleCon: {
    alignItems: 'center',
    flexShrink: 1,
  },
  lockIcon: {
    marginHorizontal: wp(1),
  },
  heading: {
    color: Colors.ink,
    fontSize: Typography.medium,
    fontFamily: Fonts.APPFONT_B,
    lineHeight: wp(5.5),
    includeFontPadding: false,
  },
  description: {
    color: Colors.muted,
    fontSize: Typography.small2,
    fontFamily: Fonts.APPFONT_R,
    lineHeight: wp(5),
    marginTop: hp(0.3),
  },
  countChip: {
    backgroundColor: Colors.lavender,
    borderRadius: 999,
    paddingHorizontal: wp(2.5),
    paddingVertical: hp(0.3),
  },
  countChipTxt: {
    color: Colors.primary,
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small,
    includeFontPadding: false,
  },
  headerRight: {
    flex: 1,
  },
  infoBtn: {
    width: wp(9.5),
    height: wp(9.5),
    borderRadius: wp(4.75),
    backgroundColor: Colors.lavender,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: Colors.blackRGBA50,
  },
  sheetDismissArea: {
    flex: 1,
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: wp(5),
    paddingTop: hp(1),
    paddingBottom: hp(3),
    maxHeight: hp(85),
  },
  sheetHandle: {
    width: wp(10),
    height: 4,
    borderRadius: 999,
    backgroundColor: Colors.hairline,
    alignSelf: 'center',
    marginBottom: hp(1.5),
  },
  sheetOrnament: {
    width: wp(11),
    height: wp(11),
    borderRadius: wp(5.5),
    backgroundColor: Colors.appBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: hp(1.2),
  },
  sheetTitle: {
    color: Colors.primary,
    fontSize: Typography.large,
    lineHeight: wp(7.5),
    marginBottom: hp(1),
  },
  sheetLead: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small2,
    lineHeight: wp(5.5),
    marginBottom: hp(1.8),
  },
  quoteCard: {
    backgroundColor: Colors.appBg,
    borderRadius: 12,
    padding: wp(3.5),
    marginBottom: hp(1.2),
  },
  quoteLabel: {
    color: Colors.primary,
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: hp(0.5),
  },
  quoteText: {
    color: Colors.ink,
    fontFamily: Fonts.DISPLAY_R,
    fontSize: Typography.small3,
    lineHeight: wp(6),
    marginBottom: hp(0.8),
  },
  quoteSource: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small,
  },
  understoodBtn: {
    marginTop: hp(1.5),
  },
  italic: { fontStyle: 'italic' },
  coverPhoto: {
    width: wp(100),
    height: hp(30),
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.color21,
  },
  videoVoiceContainer: {
    width: '100%',
    paddingHorizontal: wp(4),
    paddingTop: hp(2),
  },
  videoVoiceIconWrapper: {
    borderTopLeftRadius: 50,
    borderBottomLeftRadius: 50,
    borderTopRightRadius: 25,
    borderBottomRightRadius: 25,
    flexDirection: 'row',
    justifyContent: 'space-between',
    flex: 1,
    borderColor: Colors.color1,
    borderWidth: 1,
  },
  videoVoiceIconContainer: {
    backgroundColor: Colors.color1,
    padding: wp(1),
    borderRadius: 50,
  },
  videoVoiceIconText: {
    color: Colors.color1,
    alignSelf: 'center',
    paddingRight: wp(3),
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small2,
  },
  uploadPhoto: {
    color: Colors.color1,
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.medium,
    alignSelf: 'center',
    textAlign: 'center',
    marginVertical: hp(1.5),
  },
  inputOuterCon: {
    marginTop: hp(4),
    marginHorizontal: wp(4),
    width: wp(75),
  },
  youtubeSaveBtn: {
    marginTop: hp(8.3),
    height: hp(5),
    width: wp(15),
    backgroundColor: Colors.theme,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 30,
    marginLeft: wp(-1.5),
  },
  youtubeSaveBtnTxt: {
    alignSelf: 'center',
    textAlign: 'center',
    color: Colors.color2,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small2,
    includeFontPadding: false,
  },
  listOuterCon: {},
  listContainer: {
    paddingHorizontal: wp(4),
  },
  addPhotoBtn: {
    borderRadius: 14,
    backgroundColor: Colors.appBg,
    borderWidth: 1.5,
    borderColor: Colors.primaryLite,
    borderStyle: 'dashed',
    width: wp(22),
    height: hp(12),
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: hp(1.5),
  },
  addPhotoLbl: {
    color: Colors.primary,
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small,
    marginTop: hp(0.5),
    alignSelf: 'center',
    textAlign: 'center',
    includeFontPadding: false,
  },
  itemOuterCon: {
    paddingVertical: hp(1.5),
  },
  itemCon: {
    borderRadius: 14,
    backgroundColor: Colors.appBg,
    width: wp(22),
    height: hp(12),
    justifyContent: 'center',
    alignItems: 'center',
  },
  upBtnCon: {
    position: 'absolute',
    top: 0,
    width: wp(26),
  },
  upBtn: {
    width: width * 0.075,
    height: width * 0.075,
    borderRadius: (width * 0.075) / 2,
    backgroundColor: Colors.theme,
    justifyContent: 'center',
    alignItems: 'center',
  },
  downBtnCon: {
    position: 'absolute',
    bottom: 0,
    width: wp(26),
  },
  downBtn: {
    width: width * 0.075,
    height: width * 0.075,
    borderRadius: (width * 0.075) / 2,
    backgroundColor: Colors.theme,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileRow: {
    paddingHorizontal: wp(4),
    paddingBottom: hp(1.5),
    alignItems: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.hairline,
    marginHorizontal: wp(4),
  },
  profileCircle: {
    width: wp(20),
    height: wp(20),
    borderRadius: wp(10),
    backgroundColor: Colors.appBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileCircleEmpty: {
    borderWidth: 1.5,
    borderColor: Colors.primaryLite,
    borderStyle: 'dashed',
  },
  profileCircleImg: {
    width: wp(20),
    height: wp(20),
    borderRadius: wp(10),
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    width: wp(6),
    height: wp(6),
    borderRadius: wp(3),
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  blurCol: {
    flex: 1,
    marginHorizontal: wp(4),
  },
  blurRow: {
    alignItems: 'center',
  },
  blurLbl: {
    flex: 1,
    marginHorizontal: wp(2),
    color: Colors.ink,
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small2,
    includeFontPadding: false,
  },
  blurHint: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small,
    lineHeight: wp(4.4),
    marginTop: hp(0.6),
  },
  downBtnConProfile: {
    position: 'absolute',
    bottom: hp(-2),
    width: wp(40.5),
  },
  deleteCoverBtnCon: {
    position: 'absolute',
    width: wp(100),
    paddingHorizontal: wp(5),
    top: hp(3),
  },
  deleteCoverBtn: {
    width: width * 0.09,
    height: width * 1 * 0.09,
    borderRadius: width * 1 * 0.09,
    backgroundColor: Colors.color21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shadow: {
    shadowColor: Colors.color1,
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.18,
    shadowRadius: 1.0,
    elevation: 1,
  },
  failedText: {
    color: Colors.color23,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small2,
    textAlign: 'center',
    includeFontPadding: false,
  },
  tryAgainButton: {
    marginTop: hp(1),
    height: hp(4),
  },
  tryAgainTxt: {
    color: Colors.color2,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small1,
    alignSelf: 'center',
    textAlign: 'center',
  },
  menuButtonCon: {
    position: 'absolute',
    top: hp(1.5),
    paddingVertical: hp(0.6),
    backgroundColor: Colors.blackRGBA15,
    borderBottomRightRadius: 10,
    borderTopLeftRadius: 10,
  },
  shadowTwo: {
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
