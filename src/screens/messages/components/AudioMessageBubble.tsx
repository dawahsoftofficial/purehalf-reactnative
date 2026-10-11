import React, { useMemo } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { wp } from '../../../global';
import { Colors } from '../../../res';
import { getMessageTime } from '../SingleChat.utils';
import MessageStatusIcon, {
  type MessageDisplayStatus,
} from './MessageStatusIcon';

export type AudioPlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused';

export type AudioBubblePlayback = {
  status: AudioPlaybackStatus;
  positionMillis: number;
  durationMillis: number;
  isActive: boolean;
};

type Props = {
  item: any;
  isCurrentUser: boolean;
  textColour: string;
  isRead: boolean;
  messageStatus: MessageDisplayStatus;
  isBlockedYou: boolean;
  playback: AudioBubblePlayback;
  onTogglePlayback: (item: any) => void;
  Styles: any;
};

const formatDuration = (seconds?: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const getFallbackWaveform = (seedValue: number | string): number[] => {
  const seed = String(seedValue || 'audio-message');
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 9973;
  }

  return Array.from({ length: 24 }).map((_, index) => {
    const value = Math.sin((hash + index * 37) * 0.27);
    return Number((0.2 + Math.abs(value) * 0.8).toFixed(2));
  });
};

const getWaveformPeaks = (item: any): number[] => {
  const peaks = item.audio?.waveform_peaks || item.waveform_peaks;
  if (Array.isArray(peaks) && peaks.length > 0) {
    return peaks
      .map((peak) => Number(peak))
      .filter((peak) => Number.isFinite(peak))
      .map((peak) => Math.min(1, Math.max(0.05, peak)));
  }

  return getFallbackWaveform(item.audio?.path || item.id);
};

const AudioMessageBubble = ({
  item,
  isCurrentUser,
  textColour,
  isRead,
  messageStatus,
  isBlockedYou,
  playback,
  onTogglePlayback,
  Styles,
}: Props) => {
  const totalSeconds = item.audio?.duration_seconds || item.duration_seconds;
  const positionSeconds = playback.isActive
    ? Math.floor(playback.positionMillis / 1000)
    : 0;
  const durationSeconds =
    playback.isActive && playback.durationMillis > 0
      ? Math.floor(playback.durationMillis / 1000)
      : totalSeconds;
  const progressRatio =
    playback.isActive && playback.durationMillis > 0
      ? Math.min(1, playback.positionMillis / playback.durationMillis)
      : 0;
  const waveformPeaks = useMemo(() => getWaveformPeaks(item), [item]);
  const activeBars = Math.floor(progressRatio * waveformPeaks.length);
  const iconName = playback.status === 'playing' ? 'pause' : 'play';

  return (
    <>
      <View style={Styles.audioBubbleContent}>
        <TouchableOpacity
          testID="audio-playback-toggle"
          style={Styles.audioPlayButton}
          onPress={() => onTogglePlayback(item)}
          disabled={playback.status === 'loading'}
        >
          {playback.status === 'loading' ? (
            <ActivityIndicator
              testID="audio-loading-spinner"
              color={Colors.primary}
              size="small"
            />
          ) : (
            <Ionicons
              testID={
                playback.status === 'playing'
                  ? 'audio-pause-icon'
                  : 'audio-play-icon'
              }
              name={iconName}
              size={wp(4)}
              color={Colors.primary}
            />
          )}
        </TouchableOpacity>
        <View style={Styles.audioWaveTrack}>
          {waveformPeaks.map((peak, index) => (
            <View
              key={index}
              style={[
                Styles.audioWaveBar,
                {
                  height: wp(1 + peak * 5.2),
                  backgroundColor: textColour,
                  opacity:
                    !playback.isActive || index <= activeBars ? 0.95 : 0.32,
                },
              ]}
            />
          ))}
        </View>
        <Text style={[Styles.audioDuration, { color: textColour }]}>
          {playback.isActive
            ? `${formatDuration(positionSeconds)} / ${formatDuration(durationSeconds)}`
            : formatDuration(totalSeconds)}
        </Text>
      </View>

      <View style={Styles.messageTimeAndStatusWrapper}>
        <Text style={[Styles.messageTimeInline, { color: textColour }]}>
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
  );
};

export default AudioMessageBubble;
