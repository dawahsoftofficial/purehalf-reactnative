import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dimensions, Image, Keyboard, StyleSheet, View } from 'react-native';
import Ripple from 'react-native-material-ripple';
import {
  Menu,
  MenuOption,
  MenuOptions,
  MenuTrigger,
} from 'react-native-popup-menu';
import AntDesign from 'react-native-vector-icons/AntDesign';
import Ionicons from 'react-native-vector-icons/Ionicons';

import {
  DeletePicker,
  ModalLoader,
  PopupMenuRenderer,
  ProfileBadges,
  ProfilePhotoPlaceholder,
  Text,
} from '../../components';
import { hp, Typography, wp } from '../../global';
import { LanguageKeys } from '../../languages';
import { Colors, Fonts, Images } from '../../res';
import {
  ApiServices,
  capitalizeName,
  flashErrorMessage,
  flashSuccessMessage,
} from '../../services';
import messageServices from '../../services/api/message-services';
import type { Message } from '../../services/api/types/message-types';
import { chatErrorMessageKey } from './chat-error-messages';
import {
  buildChatHeaderOptions,
  CHAT_HEADER_OPTION_LABELS,
  type ChatHeaderOptionId,
  isDestructiveChatHeaderOption,
} from './chat-header-options';

type SingleChatHeaderProps = {
  navigation: any;
  otherUserData: any;
  messages: Message[];
  conversationData: any;
  conversationId: string;
  currentUserId: string | number;
  /** Block state is owned by SingleChat so the composer reacts at once. */
  isBlockedByYou: boolean;
  isBlockedYou: boolean;
  /** Called after a successful block / unblock with the new state. */
  onBlockedByYouChange: (blocked: boolean) => void;
  /** Partner's account is gone: no profile, badges or block actions. */
  isPartnerDeleted?: boolean;
  setMessages: (messages: Message[]) => void;
};

const SingleChatHeader = (props: SingleChatHeaderProps) => {
  const {
    navigation,
    conversationData,
    conversationId,
    otherUserData,
    currentUserId,
    isBlockedByYou,
    isBlockedYou,
    onBlockedByYouChange,
    isPartnerDeleted = false,
    setMessages,
  } = props;
  const { t } = useTranslation();

  const isSupportConversation =
    conversationData?.type === 'support' || otherUserData?.type === 'Admin';

  // Block/unblock acts on the conversation pivot, which only needs the
  // conversation id — not the full conversationData object (which can be sparse
  // right after opening a chat). Surface block whenever we have an id.
  const hasConversation = !!conversationId;

  const [isBlurred, setIsBlurred] = useState(true);
  const menuRef = useRef<any>(null);

  const [deleteAlert, setDeleteAlert] = useState({
    visible: false,
    from: '',
  });
  const [modalLoader, setModalLoader] = useState({
    visible: false,
    message: LanguageKeys.loading,
  });

  const onBackPress = () => navigation.goBack();

  const hideModalLoader = () =>
    setModalLoader({
      visible: false,
      message: LanguageKeys.loading,
    });
  const fetchData = async () => {
    ApiServices.getUsers({ page: 1, type: 9 })
      .then((res: any) => {
        if (res?.length) {
          setIsBlurred(
            !!res?.find((user: any) => user?.id !== otherUserData?.id)
          );
        } else {
          setIsBlurred(true);
        }
      })
      .catch((err) => console.log({ err }));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const onViewProfilePress = () => {
    menuRef.current?.close();
    navigation.navigate('UserProfile', { userData: otherUserData });
  };

  const onBlockUnBlockUserPress = async () => {
    menuRef.current?.close();
    if (!conversationId) {
      flashErrorMessage();
      return;
    }

    setModalLoader({
      visible: true,
      message: !isBlockedByYou
        ? LanguageKeys.blockingUser
        : LanguageKeys.unBlockingUser,
    });

    try {
      const willBlock = !isBlockedByYou;

      const conversationIdNum = parseInt(conversationId, 10);
      if (isNaN(conversationIdNum)) {
        throw new Error('Invalid conversation ID');
      }

      // The server keeps the profile block list and this conversation's block
      // flag in sync, so the chat endpoints are the only call needed (a
      // separate profile-block toggle would double-apply).
      if (willBlock) {
        await messageServices.blockConversationParticipant(
          conversationIdNum,
          otherUserData?.id
        );
      } else {
        await messageServices.unblockConversationParticipant(
          conversationIdNum,
          otherUserData?.id
        );
      }

      flashSuccessMessage(
        willBlock ? LanguageKeys.blocked : LanguageKeys.unBlocked
      );
      onBlockedByYouChange(willBlock);
      hideModalLoader();
    } catch (error: unknown) {
      flashErrorMessage(chatErrorMessageKey(error));
      hideModalLoader();
    }
  };

  const onBlockUnBlockAndReportUserPress = async () => {
    menuRef.current?.close();
    if (!conversationId) {
      flashErrorMessage();
      return;
    }

    setModalLoader({
      visible: true,
      message: !isBlockedByYou
        ? LanguageKeys.blockingUser
        : LanguageKeys.unBlockingUser,
    });

    try {
      // Block-and-report is always a block action.
      const params = {
        type: 8,
        action_user_id: otherUserData?.id,
        allow_photo_request: 0,
      };
      await ApiServices.interactionAction(params);

      const conversationIdNum = parseInt(conversationId, 10);
      if (isNaN(conversationIdNum)) {
        throw new Error('Invalid conversation ID');
      }

      await messageServices.blockConversationParticipant(
        conversationIdNum,
        otherUserData?.id
      );

      flashSuccessMessage(LanguageKeys.blocked);
      onBlockedByYouChange(true);
      hideModalLoader();
    } catch (error: unknown) {
      flashErrorMessage(chatErrorMessageKey(error));
      hideModalLoader();
    }
  };

  const conversationDeleteSuccess = () => {
    hideModalLoader();
    flashSuccessMessage(LanguageKeys.conversationDeleted);
    navigation.goBack();
  };

  const conversationClearSuccess = () => {
    hideModalLoader();
    flashSuccessMessage(LanguageKeys.chatCleared);
    // Clear messages in the parent component
    setMessages([]);
  };

  const onClearChatPress = async () => {
    hideDeleteAlert();

    if (!conversationId) {
      flashErrorMessage();
      return;
    }

    setModalLoader({
      visible: true,
      message: LanguageKeys.clearingChat,
    });

    try {
      const conversationIdNum = parseInt(conversationId, 10);
      if (isNaN(conversationIdNum)) {
        throw new Error('Invalid conversation ID');
      }

      await messageServices.clearConversation(conversationIdNum);
      conversationClearSuccess();
    } catch (error: unknown) {
      flashErrorMessage(chatErrorMessageKey(error));
      hideModalLoader();
    }
  };

  const hideDeleteAlert = () => {
    setDeleteAlert({
      visible: false,
      from: '',
    });
  };

  const onDeleteAlertDeletePress = () => {
    // Capture the alert type before closing modal
    const alertType = deleteAlert?.from;

    // Close modal immediately
    hideDeleteAlert();

    // Execute action after modal closes
    if (alertType === 'chat') {
      onDeleteChatPress();
    } else {
      onClearChatPress();
    }
  };

  const onDeleteChatPress = async () => {
    hideDeleteAlert();

    if (!conversationId) {
      flashErrorMessage();
      return;
    }

    setModalLoader({
      visible: true,
      message: LanguageKeys.deleting,
    });

    try {
      const conversationIdNum = parseInt(conversationId, 10);
      if (isNaN(conversationIdNum)) {
        throw new Error('Invalid conversation ID');
      }

      await messageServices.deleteConversation(conversationIdNum);
      conversationDeleteSuccess();
    } catch (error: unknown) {
      flashErrorMessage(chatErrorMessageKey(error));
      hideModalLoader();
    }
  };

  const showClearChatAlert = () => {
    menuRef.current?.close();
    Keyboard.dismiss();
    setDeleteAlert({
      visible: true,
      from: 'clear',
    });
  };

  const showDeleteChatAlert = () => {
    menuRef.current?.close();
    Keyboard.dismiss();
    setDeleteAlert({
      visible: true,
      from: 'chat',
    });
  };

  const onChangeBlur = () => {
    menuRef.current?.close();
    const newParams = {
      type: '9',
      action_user_id: otherUserData?.id,
    };

    ApiServices.interactionAction(newParams)
      .then(async () => {
        setModalLoader({
          visible: false,
          message: LanguageKeys.updating,
        });
        fetchData();
        flashSuccessMessage(
          isBlurred
            ? LanguageKeys.photoUnblurredSuccessfully
            : LanguageKeys.photoBlurredSuccessfully
        );
      })
      .catch(hideModalLoader);
  };

  const menuOptions = buildChatHeaderOptions({
    hideProfileActions: isSupportConversation || isPartnerDeleted,
    isPartnerDeleted,
    hasConversation,
    isBlockedByYou,
  });

  const menuActions: Record<ChatHeaderOptionId, () => void> = {
    viewProfile: onViewProfilePress,
    block: onBlockUnBlockUserPress,
    unblock: onBlockUnBlockUserPress,
    reportAndBlock: onBlockUnBlockAndReportUserPress,
    clearChat: showClearChatAlert,
    deleteConversation: showDeleteChatAlert,
  };

  return (
    <View style={Styles.headerContainer}>
      <ModalLoader
        visible={modalLoader.visible}
        useModalLayout={true}
        message={modalLoader.message}
      />
      <View style={Styles.headerInnerCon}>
        <AntDesign
          name="arrowleft"
          color={Colors.ink}
          size={wp(6)}
          onPress={onBackPress}
        />
        <Ripple
          style={Styles.headerInnerCon}
          onPress={() => {
            if (isSupportConversation || isPartnerDeleted) {
              return;
            }
            props.navigation.navigate('UserProfile', {
              userData: otherUserData,
            });
          }}
        >
          <View style={Styles.userImage}>
            {isSupportConversation ? (
              <Image
                source={Images.logoWithoutTextBlack}
                resizeMode="contain"
                style={Styles.supportLogo}
              />
            ) : otherUserData?.image && !isBlockedYou ? (
              <Image
                source={{ uri: otherUserData.image }}
                resizeMode="cover"
                style={Styles.avatarImage}
              />
            ) : (
              <ProfilePhotoPlaceholder
                name={otherUserData?.name}
                size={width * 0.05}
                centeredInitials
              />
            )}
          </View>
          <View style={Styles.titleRow}>
            <Text
              variant="display"
              style={Styles.userName}
              numberOfLines={1}
              translate={false}
            >
              {capitalizeName(otherUserData?.name)}
            </Text>
            {!isSupportConversation && !isPartnerDeleted ? (
              <ProfileBadges
                userData={otherUserData}
                iconOnly
                surface="chatThread"
                iconSize={wp(5.5)}
                containerStyle={Styles.chatBadges}
              />
            ) : null}
          </View>
        </Ripple>
      </View>
      {currentUserId !== 'guardian' && !isSupportConversation && (
        <Menu ref={menuRef} renderer={PopupMenuRenderer}>
          <MenuTrigger>
            <View style={Styles.menuBtn}>
              <Ionicons
                name="ellipsis-vertical"
                size={wp(5)}
                color={Colors.ink}
              />
            </View>
          </MenuTrigger>
          <MenuOptions optionsContainerStyle={Styles.menuOptionsContainer}>
            {menuOptions.map((option) => (
              <MenuOption
                key={option}
                onSelect={() => {
                  menuRef.current?.close();
                  menuActions[option]();
                }}
                text={t(CHAT_HEADER_OPTION_LABELS[option])}
                customStyles={{
                  optionText: isDestructiveChatHeaderOption(option)
                    ? Styles.menuTextDestructive
                    : Styles.menuText,
                }}
              />
            ))}
          </MenuOptions>
        </Menu>
      )}
      <DeletePicker
        visible={deleteAlert?.visible}
        actionButtonLabel={
          deleteAlert?.from === 'chat'
            ? LanguageKeys.delete
            : LanguageKeys.clear
        }
        headerTitle={
          deleteAlert?.from === 'chat'
            ? LanguageKeys.deleteChatAlert
            : LanguageKeys.clearChatAlert
        }
        onClose={hideDeleteAlert}
        onDeletePress={onDeleteAlertDeletePress}
        onCancelPress={hideDeleteAlert}
        useCustomModal={false}
      />
    </View>
  );
};

export default SingleChatHeader;

const { width } = Dimensions.get('window');

const Styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    paddingVertical: hp(1),
    paddingHorizontal: wp(3),
    borderBottomWidth: 1,
    borderBottomColor: Colors.hairline,
  },
  headerInnerCon: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userImage: {
    width: width * 0.1,
    height: width * 0.1 * 1,
    borderRadius: (width * 0.1 * 1) / 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.lavender,
    marginHorizontal: wp(2),
    overflow: 'hidden',
  },
  userName: {
    alignSelf: 'center',
    fontSize: Typography.medium,
    color: Colors.ink,
    maxWidth: wp(36),
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(1.2),
    flexShrink: 1,
  },
  chatBadges: {
    flexWrap: 'nowrap',
    gap: wp(0.6),
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  supportLogo: {
    height: '68%',
    width: '68%',
  },
  menuBtn: {
    width: wp(9),
    height: wp(9),
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuOptionsContainer: {
    borderRadius: 14,
    paddingVertical: hp(0.6),
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.hairline,
    marginTop: hp(1),
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  menuText: {
    color: Colors.ink,
    fontFamily: Fonts.APPFONT_M,
    fontSize: Typography.small2,
  },
  menuTextDestructive: {
    color: Colors.color24,
    fontFamily: Fonts.APPFONT_M,
    fontSize: Typography.small2,
  },
});
