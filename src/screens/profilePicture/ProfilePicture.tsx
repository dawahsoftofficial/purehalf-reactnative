import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import * as ImagePickCrop from 'react-native-image-crop-picker';
import { SafeAreaView } from 'react-native-safe-area-context';

import { hp, wp } from '@/global';
import { Colors } from '@/res';

import { Button, ImagePicker } from '../../components';
import { LanguageKeys } from '../../languages';
import {
  ApiServices,
  flashSuccessMessage,
  isIOS,
  StorageManager,
  useGlobalContext,
} from '../../services';
import { addAnaylatics } from '../../services/firebase/analytics';
import GuidelinesModal from './components/guidelines-modal';
import ProfilePictureHeader from './components/profile-picture-header';
import ProfilePictureUpload from './components/profile-picture-upload';
import UploadProgress from './components/upload-progress';

type ImageData = {
  uri: string;
  type: string;
  [key: string]: unknown;
};

type CroppedImage = {
  path?: string;
  height?: number;
  width?: number;
  size?: number;
  [key: string]: unknown;
};

type ResizedImageObj = {
  uri: string;
  name: string;
  height: number;
  width: number;
  size: number;
};

type User = {
  gender?: string;
  guardian?: boolean;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone_number?: string;
  primary_image_to_show?: string;
  media?: {
    primary_image?: string;
    un_blur_primary_image?: string;
    primary_image_to_show?: string;
  };
  [key: string]: unknown;
};

type ProfilePictureResponse = {
  results?: {
    primary_image?: string;
    un_blur_primary_image?: string;
    primary_image_to_show?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type ProfilePictureProps = {
  navigation: {
    reset: (config: { index: number; routes: Array<{ name: string }> }) => void;
  };
};

function ProfilePicture(props: ProfilePictureProps) {
  const { currentUser, updateCurrentUser } = useGlobalContext();
  const { setData, storageKeys } = StorageManager;
  const [imagePickerVisible, setImagePickerVisible] = useState(false);
  const [image, setImage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadingProgress, setUploadingProgress] = useState(0);
  const [toolTipVisible, setToolTipVisible] = useState(false);

  const onAddImagePress = useCallback(() => {
    setImagePickerVisible(true);
  }, []);

  const hideImagePicker = useCallback(() => {
    setImagePickerVisible(false);
  }, []);

  const showTooltip = useCallback(() => {
    setToolTipVisible(true);
  }, []);

  const hideTooltip = useCallback(() => {
    setToolTipVisible(false);
  }, []);

  const handleUploadProgress = useCallback((progress: number) => {
    let progressValue = Number(progress) || 0;

    // Debug: Log the raw progress value to understand what we're receiving
    console.log('[Upload Progress] Raw value:', progressValue);

    // If progress is between 0 and 1, it's a decimal - convert to percentage
    if (progressValue > 0 && progressValue <= 1) {
      progressValue = progressValue * 100;
    }
    // If progress is between 1 and 10, it might be a scaled value - convert to percentage
    else if (progressValue > 1 && progressValue <= 10) {
      progressValue = (progressValue / 10) * 100;
    }

    // Ensure progress is between 0 and 100
    progressValue = Math.min(Math.max(progressValue, 0), 100);

    console.log('[Upload Progress] Normalized value:', progressValue);

    // Use requestAnimationFrame to ensure state updates happen on next frame
    requestAnimationFrame(() => {
      setUploadingProgress(progressValue);
    });
  }, []);

  const resetUploadState = useCallback(() => {
    setUploading(false);
    setUploadingProgress(0);
  }, []);

  const onImageSelection = useCallback(
    (data: ImageData[]) => {
      console.log('[ProfilePicture] onImageSelection called with data:', data);

      if (!data || data.length === 0) {
        console.log('[ProfilePicture] No data or empty array, returning early');
        return;
      }

      const firstImage = data[0];
      console.log('[ProfilePicture] First image:', firstImage);

      if (!firstImage?.uri) {
        console.log('[ProfilePicture] No URI in first image, returning early');
        return;
      }

      console.log('[ProfilePicture] Opening cropper with URI:', firstImage.uri);
      ImagePickCrop.openCropper({
        path: firstImage.uri,
        mediaType: 'photo',
        width: 450,
        height: 450,
        writeTempFile: true, // Ensure temp file is written (required for iOS)
      })
        .then((croppedImage: unknown) => {
          console.log(
            '[ProfilePicture] Cropper success, cropped image:',
            croppedImage
          );
          const image = croppedImage as CroppedImage;

          if (!image?.path) {
            console.error('[ProfilePicture] Cropped image has no path!', image);
            resetUploadState();
            return;
          }

          const pathParts = image.path?.split('/') || [];
          const resizedImageObj: ResizedImageObj = {
            height: image.height || 0,
            width: image.width || 0,
            uri: image.path || '',
            name: pathParts[pathParts.length - 1] || 'image.jpg',
            size: image.size || 0,
          };

          console.log(
            '[ProfilePicture] Prepared image object:',
            resizedImageObj
          );
          setUploading(true);
          setUploadingProgress(0);

          console.log('[ProfilePicture] Calling addProfilePicture API...');
          ApiServices.addProfilePicture(resizedImageObj, handleUploadProgress)
            .then(async (res: unknown) => {
              console.log(
                '[ProfilePicture] API call successful, response:',
                res
              );
              const response = res as ProfilePictureResponse;
              const result = response?.results;

              // Extract image URLs from API response
              // For current user, primary_image_to_show should be un_blur_primary_image
              // (since they see their own unblurred image)
              const primaryImage = result?.un_blur_primary_image || '';
              const primaryImageToShow =
                result?.primary_image_to_show ||
                result?.un_blur_primary_image ||
                '';

              console.log(
                '[ProfilePicture] Extracted primary image:',
                primaryImage
              );
              console.log(
                '[ProfilePicture] Extracted primary_image_to_show:',
                primaryImageToShow
              );

              // Update user with profile picture from API response
              // Must set both media.un_blur_primary_image AND primary_image_to_show at root level
              // RootNavigation checks primary_image_to_show to determine initial route
              const user: User = {
                ...(currentUser as User),
                primary_image_to_show: primaryImageToShow, // Root level - required for RootNavigation check
                media: {
                  ...(currentUser?.media as Record<string, unknown>),
                  un_blur_primary_image: primaryImage,
                  primary_image_to_show: primaryImageToShow, // Also in media for consistency
                },
              };

              console.log(
                '[ProfilePicture] Saving user with primary_image_to_show:',
                user.primary_image_to_show
              );

              updateCurrentUser(user);
              await setData(storageKeys.USER, user);

              flashSuccessMessage(LanguageKeys.profilePictureUpdated);
              setImage(resizedImageObj.uri);
              resetUploadState();
            })
            .catch((error) => {
              console.error(
                '[ProfilePicture] Error uploading profile picture:',
                error
              );
              resetUploadState();
            });
        })
        .catch((error: unknown) => {
          // Handle cropper cancellation or errors
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const errorCode = (error as { code?: string })?.code;

          console.error('[ProfilePicture] Error cropping image:', {
            error,
            errorMessage,
            errorCode,
            errorType:
              errorCode === 'E_PICKER_CANCELLED' ? 'USER_CANCELLED' : 'ERROR',
          });

          // Only reset state if it's not a user cancellation
          // User cancellation is normal behavior, no need to show error
          if (errorCode !== 'E_PICKER_CANCELLED') {
            resetUploadState();
          }
        });
    },
    [
      currentUser,
      handleUploadProgress,
      resetUploadState,
      setData,
      storageKeys.USER,
      updateCurrentUser,
    ]
  );

  const onContinuePress = useCallback(() => {
    const user = currentUser as User;

    // Check if user has already completed onboarding
    // Indicators: membership_status is set, or they have profile details (detail object with data)
    const hasMembership =
      user?.membership_status !== null &&
      user?.membership_status !== undefined &&
      user?.membership_status !== 0;

    const hasProfileDetails =
      user?.detail &&
      typeof user.detail === 'object' &&
      Object.keys(user.detail).length > 0;

    const hasCompletedOnboarding = hasMembership || hasProfileDetails;

    if (hasCompletedOnboarding) {
      // Existing user updating profile picture - go directly to BottomTab
      props.navigation.reset({
        index: 0,
        routes: [{ name: 'BottomTab' }],
      });
      return;
    }

    // New user during signup - go through onboarding flow.
    // Analytics params must never carry personal data (name, email, phone): Google
    // Analytics and Meta terms forbid it. Gender alone is kept for funnel splits.
    const info = {
      gender: user?.gender || '',
    };

    // Facebook Event For complete Registration
    // AppEventsLogger.logEvent(AppEventsLogger.AppEvents.CompletedRegistration, {
    //   [AppEventsLogger.AppEventParams.RegistrationMethod]: 'email',
    //   ...info,
    // });
    addAnaylatics('complete_registration', info);

    // Wali/guardian signup step hidden for now (comment out only, per explicit
    // direction -- guardian is core functionality, not being removed).
    // // For females: if they already have guardian, skip AddWali
    // const isFemale = user?.gender === 'female';
    // const hasGuardian = Boolean(user?.guardian);
    // const nextRoute = isFemale && !hasGuardian ? 'AddWali' : 'WelcomeUser';
    const nextRoute = 'WelcomeUser';

    props.navigation.reset({
      index: 0,
      routes: [{ name: nextRoute }],
    });
  }, [currentUser, props.navigation]);

  const handleImagePickerSelection = useCallback(
    (res: ImageData[] | undefined | null) => {
      console.log(
        '[ProfilePicture] handleImagePickerSelection called with:',
        res
      );

      // Normalize the response - ImagePicker might pass res.assets which could be undefined
      const imageData = Array.isArray(res) ? res : res ? [res] : [];

      if (imageData.length === 0) {
        console.log('[ProfilePicture] No image data received, returning early');
        return;
      }

      hideImagePicker();
      setTimeout(
        () => {
          console.log(
            '[ProfilePicture] Calling onImageSelection after timeout'
          );
          onImageSelection(imageData);
        },
        isIOS ? 1000 : 0
      );
    },
    [hideImagePicker, onImageSelection]
  );

  const isButtonDisabled = useMemo(() => image.length === 0, [image]);

  return (
    <SafeAreaView style={Styles.container}>
      <GuidelinesModal
        visible={toolTipVisible}
        user={currentUser as User}
        onClose={hideTooltip}
      />
      <ScrollView
        contentContainerStyle={Styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={Styles.content}>
          <ProfilePictureHeader onGuidelinesPress={showTooltip} />
          {uploading ? (
            <UploadProgress progress={uploadingProgress} />
          ) : (
            <ProfilePictureUpload imageUri={image} onPress={onAddImagePress} />
          )}
        </View>
        <View style={Styles.btnWrapper}>
          <Button
            disabled={isButtonDisabled}
            text={LanguageKeys.continue}
            onPress={onContinuePress}
          />
        </View>
      </ScrollView>
      <ImagePicker
        from="primary_image_to_show"
        onClose={hideImagePicker}
        visible={imagePickerVisible}
        onImageSelection={handleImagePickerSelection}
      />
    </SafeAreaView>
  );
}

export default ProfilePicture;

const Styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.appBg,
  },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: wp(5),
    paddingTop: hp(4),
    paddingBottom: hp(2),
    justifyContent: 'space-between',
  },
  content: {
    alignItems: 'center',
  },
  btnWrapper: {
    width: '100%',
    marginTop: hp(4),
  },
});
