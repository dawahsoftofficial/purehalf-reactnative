import React from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { hp, wp } from '../../../global';
import { LanguageKeys } from '../../../languages';
import { Colors } from '../../../res';
import type { ChatMessage } from '../optimisticMessages';
import {
  getMessageParticipantStatus,
  getMessageTime,
  getTimeAgo,
  hasDeliveredOrReadAt,
  hasReadAt,
} from '../SingleChat.utils';
import AudioMessageBubble, {
  type AudioBubblePlayback,
} from './AudioMessageBubble';
import MessageStatusIcon, {
  type MessageDisplayStatus,
} from './MessageStatusIcon';

type Props = {
  item: any;

  currentUserId: any;
  guardianUserId: any;
  otherUserId: any;

  otherUserImage?: string;

  isBlockedYou: boolean;

  /** This is the message the "seen" avatar sits under (computed once by the list). */
  isLastSeenMessage: boolean;

  /**
   * The composer is locked by the wait-for-reply rule: a failed bubble then
   * explains that instead of offering a retry that would be rejected again.
   */
  isWaitingForReply?: boolean;

  /**
   * Either member has blocked the other: a failed bubble then explains that
   * instead of offering a retry the server would refuse.
   */
  isChatBlocked?: boolean;

  /** Tap on an unsent (failed) bubble: retry. */
  onFailedPress?: (item: ChatMessage) => void;
  /** Long-press on an unsent (failed) bubble: retry / delete menu. */
  onFailedLongPress?: (item: ChatMessage) => void;
  /**
   * Long-press on a received message: report it. Omit to offer nothing (own
   * messages, unsent bubbles, support chats).
   */
  onReportPress?: (item: ChatMessage) => void;

  messagePressedId: any;
  onMessagePress: (messageId: any) => void;
  getAudioPlayback: (messageId: number) => AudioBubblePlayback;
  onToggleAudioPlayback: (item: any) => void;

  Styles: any;
  forceUpdate?: () => void; // optional; not used here but kept for flexibility
};

const MessageBubble = ({
  item,
  currentUserId,
  guardianUserId,
  otherUserId,
  otherUserImage,
  isBlockedYou,
  isLastSeenMessage: isLastSeenMessageProp,
  isWaitingForReply = false,
  isChatBlocked = false,
  onFailedPress,
  onFailedLongPress,
  onReportPress,
  messagePressedId,
  onMessagePress,
  getAudioPlayback,
  onToggleAudioPlayback,
  Styles,
}: Props) => {
  const { t }: any = useTranslation();
  // Use sender_id from API response (new structure)
  // Convert to string for comparison as currentUserId might be string
  const itemSender = item?.sender_id != null ? String(item.sender_id) : null;
  const currentUserIdStr = currentUserId != null ? String(currentUserId) : null;

  // Get status for the other user (recipient) from statuses array
  const otherUserStatus = getMessageParticipantStatus(item, otherUserId);

  const isCurrentUser = itemSender === currentUserIdStr;
  const isGuardian = itemSender === 'guardian' || itemSender === guardianUserId;

  // Determine message status based on delivered_at and read_at
  // Priority: read_at > delivered_at > sending
  // Note: MessageStatusIcon uses isSeen prop for read status (blue double tick)
  const getMessageStatus = (): MessageDisplayStatus => {
    // An unsent bubble is the sender's own optimistic copy: still going out
    // ('pending', shown as a clock) or not delivered ('failed').
    if (item?.send_status) {
      return item.send_status === 'failed' ? 'failed' : 'pending';
    }
    // For messages from current user, check the other user's status
    if (isCurrentUser && otherUserStatus) {
      // If delivered or read, show as 'sent' (MessageStatusIcon will show appropriate icon based on isSeen)
      if (hasDeliveredOrReadAt(otherUserStatus)) {
        return 'sent';
      }
      // If status exists but both delivered_at and read_at are null, show as 'sending' (single tick)
      return 'sending';
    }
    // For messages being sent or if status is not available
    return 'sent';
  };

  const messageStatus = getMessageStatus();
  // isRead should only be true if read_at is explicitly not null
  const isRead = hasReadAt(otherUserStatus);

  const otherUserReadBy = otherUserStatus
    ? {
        seen: isRead,
        seenAt: otherUserStatus.read_at,
      }
    : null;

  const isLastSeenMessage = isCurrentUser && isLastSeenMessageProp;
  const isFailed = item?.send_status === 'failed';
  const failedCaption = isChatBlocked
    ? t(LanguageKeys.chatErrorBlocked)
    : isWaitingForReply && item?.failure_code === 'WAIT_FOR_REPLY'
      ? t(LanguageKeys.chatWaitForReplyHint)
      : `${t(LanguageKeys.chatSendFailed)} · ${t(LanguageKeys.chatTapToRetry)}`;

  const backgroundColor = isCurrentUser
    ? Colors.primary
    : isGuardian
      ? Colors.primaryMid
      : Colors.lavender;

  const textColour = isGuardian || isCurrentUser ? Colors.color2 : Colors.ink;

  // Asymmetric "tail" corner on the side the bubble is aligned to.
  const tailStyle = isCurrentUser
    ? { borderBottomRightRadius: 6 }
    : { borderBottomLeftRadius: 6 };

  return (
    <View
      key={item?.id}
      style={{
        marginTop: hp(1),
        alignItems: isCurrentUser ? 'flex-end' : 'flex-start',
      }}
    >
      <TouchableOpacity
        style={[Styles.messageCon, tailStyle, { backgroundColor }]}
        onPress={() =>
          isFailed ? onFailedPress?.(item) : onMessagePress(item?.id)
        }
        onLongPress={
          isFailed
            ? () => onFailedLongPress?.(item)
            : onReportPress
              ? () => onReportPress(item)
              : undefined
        }
        activeOpacity={0.9}
      >
        {item?.type === 'audio' ? (
          <AudioMessageBubble
            item={item}
            isCurrentUser={isCurrentUser}
            textColour={textColour}
            isRead={isRead}
            messageStatus={messageStatus}
            isBlockedYou={isBlockedYou}
            playback={getAudioPlayback(item.id)}
            onTogglePlayback={onToggleAudioPlayback}
            Styles={Styles}
          />
        ) : (
          <>
            <Text style={[Styles.messageTxt, { color: textColour }]}>
              {item?.body}
            </Text>

            <View style={Styles.messageTimeAndStatusWrapper}>
              <Text
                style={[
                  Styles.messageTimeInline,
                  {
                    color:
                      isCurrentUser || isGuardian
                        ? Colors.whiteRGBA90
                        : Colors.muted,
                  },
                ]}
              >
                {getMessageTime(item?.created_at)}
              </Text>

              {isCurrentUser && (
                <MessageStatusIcon
                  status={messageStatus}
                  isSeen={isRead}
                  isBlocked={isBlockedYou}
                  wasSentWhileBlocked={false}
                />
              )}
            </View>
          </>
        )}
      </TouchableOpacity>

      {isCurrentUser && isFailed && (
        <TouchableOpacity
          style={Styles.messageSendingCon}
          onPress={() => onFailedPress?.(item)}
          onLongPress={() => onFailedLongPress?.(item)}
          activeOpacity={0.7}
        >
          <Ionicons
            name="alert-circle"
            size={wp(4)}
            color={Colors.color24}
            style={{ marginHorizontal: wp(1) }}
          />
          <Text style={[Styles.sendingText, { color: Colors.color24 }]}>
            {failedCaption}
          </Text>
        </TouchableOpacity>
      )}

      {isLastSeenMessage && otherUserImage ? (
        <View
          style={[
            Styles.seenProfileImageContainer,
            { alignSelf: isCurrentUser ? 'flex-end' : 'flex-start' },
          ]}
        >
          <Image
            source={{ uri: otherUserImage }}
            style={Styles.seenProfileImage}
            resizeMode="cover"
          />
        </View>
      ) : null}

      {messagePressedId && messagePressedId === item?.id ? (
        <View style={Styles.messageTimeCon}>
          <Text style={Styles.messageTime}>
            Sent {getTimeAgo(item?.created_at)}
          </Text>

          {otherUserReadBy?.seen && otherUserReadBy?.seenAt ? (
            <Text style={Styles.messageTime}>
              Seen {getTimeAgo(otherUserReadBy.seenAt)}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

export default MessageBubble;
