import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, StyleSheet, Text as RNText, View } from 'react-native';
import Ripple from 'react-native-material-ripple';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Video from 'react-native-video';

import { Text } from '../../../components';
import { hp, Typography, wp } from '../../../global';
import { LanguageKeys } from '../../../languages';
import {
  canViewIntroMedia,
  type IntroMedia,
  type IntroMediaKind,
  type IntroMediaStatus,
  ownerIntroAction,
} from '../../../lib/utils/profile-intro-media';
import { Colors, Fonts } from '../../../res';
import chatAudioService from '../../../services/audio/chat-audio-service';
import { useSettingsStore } from '../../../stores';

type Props = {
  isOwner: boolean;
  media?: IntroMedia | null;
  navigation: any;
};

const statusPresentation = (status?: IntroMediaStatus) => {
  if (status === 'approved') {
    return {
      label: LanguageKeys.approved,
      icon: 'checkmark-circle' as const,
      backgroundColor: 'rgba(46,158,91,0.12)',
      color: Colors.verified,
    };
  }
  if (status === 'rejected') {
    return {
      label: LanguageKeys.needsChanges,
      icon: 'alert-circle' as const,
      backgroundColor: 'rgba(211,72,54,0.12)',
      color: Colors.attention,
    };
  }

  return {
    label: LanguageKeys.pendingReview,
    icon: 'time' as const,
    backgroundColor: '#FCEDE1',
    color: '#D97921',
  };
};

const waveform = [
  0.24, 0.5, 0.82, 0.42, 0.68, 0.95, 0.55, 0.32, 0.7, 0.48, 0.86, 0.4, 0.62,
  0.28,
];

const ProfileIntroMedia = ({ isOwner, media, navigation }: Props) => {
  const { t } = useTranslation();
  const videoEnabled = useSettingsStore().getProfileIntroVideoEnabled();
  const voiceEnabled = useSettingsStore().getProfileIntroVoiceEnabled();
  const [playingKind, setPlayingKind] = useState<IntroMediaKind | null>(null);
  const [videoPaused, setVideoPaused] = useState(false);
  const [voicePlaying, setVoicePlaying] = useState(false);

  const options = useMemo(
    () => [
      {
        kind: 'video' as const,
        enabled: videoEnabled,
        url: media?.intro_video,
        status: media?.intro_video_status,
        reason: media?.intro_video_rejection_reason,
        icon: 'videocam' as const,
        viewerLabel: LanguageKeys.watchVideoIntro,
        route: 'ProfileIntroVideo',
      },
      {
        kind: 'voice' as const,
        enabled: voiceEnabled,
        url: media?.intro_voice,
        status: media?.intro_voice_status,
        reason: media?.intro_voice_rejection_reason,
        icon: 'mic' as const,
        viewerLabel: LanguageKeys.hearVoiceIntro,
        route: 'ProfileIntroVoice',
      },
    ],
    [media, videoEnabled, voiceEnabled]
  );

  const visibleOptions = options.filter((option) =>
    isOwner
      ? option.enabled
      : canViewIntroMedia({
          enabled: option.enabled,
          url: option.url,
          status: option.status,
        })
  );

  useEffect(
    () => () => {
      void chatAudioService.stopPlayback().catch(() => undefined);
    },
    []
  );

  if (visibleOptions.length === 0) return null;

  const closePlayer = () => {
    if (playingKind === 'voice') void chatAudioService.stopPlayback();
    setVoicePlaying(false);
    setVideoPaused(false);
    setPlayingKind(null);
  };

  const toggleVoice = async (url?: string | null) => {
    if (!url) return;
    if (voicePlaying) {
      await chatAudioService.stopPlayback();
      setVoicePlaying(false);
      return;
    }

    setVoicePlaying(true);
    await chatAudioService.play(url, () => setVoicePlaying(false));
  };

  const active = options.find((option) => option.kind === playingKind);

  return (
    <View style={Styles.section}>
      <Text style={Styles.sectionTitle}>{LanguageKeys.introduceYourself}</Text>
      {isOwner ? (
        <Text style={Styles.sectionDescription}>
          {LanguageKeys.introMediaDescription}
        </Text>
      ) : null}
      <View style={Styles.cards}>
        {visibleOptions.map((option) => {
          const hasMedia = Boolean(option.url);
          const status = hasMedia ? statusPresentation(option.status) : null;
          const actionLabel = isOwner
            ? ownerIntroAction(option.kind, hasMedia)
            : option.viewerLabel;

          return (
            <Ripple
              key={option.kind}
              style={Styles.card}
              rippleColor={Colors.primaryLite}
              onPress={() =>
                isOwner
                  ? navigation.navigate(option.route)
                  : setPlayingKind(option.kind)
              }
              accessibilityRole="button"
              accessibilityLabel={t(actionLabel)}
            >
              <View style={Styles.iconCircle}>
                <Ionicons
                  name={option.icon}
                  size={wp(6)}
                  color={Colors.primary}
                />
              </View>
              <Text style={Styles.cardTitle}>{actionLabel}</Text>
              {status ? (
                <View
                  style={[
                    Styles.statusPill,
                    { backgroundColor: status.backgroundColor },
                  ]}
                >
                  <Ionicons
                    name={status.icon}
                    size={wp(3.6)}
                    color={status.color}
                  />
                  <Text style={[Styles.statusText, { color: status.color }]}>
                    {status.label}
                  </Text>
                </View>
              ) : (
                <Text style={Styles.cardCaption}>
                  {LanguageKeys.tenSecondMaximum}
                </Text>
              )}
              {isOwner && option.status === 'rejected' && option.reason ? (
                <RNText style={Styles.rejectionReason} numberOfLines={2}>
                  {option.reason}
                </RNText>
              ) : null}
            </Ripple>
          );
        })}
      </View>

      <Modal
        visible={Boolean(active)}
        transparent
        animationType="fade"
        onRequestClose={closePlayer}
      >
        <View style={Styles.modalBackdrop}>
          <View style={Styles.playerCard}>
            <View style={Styles.playerHeader}>
              <Text style={Styles.playerTitle}>
                {active?.kind === 'video'
                  ? LanguageKeys.videoIntroTitle
                  : LanguageKeys.voiceIntroTitle}
              </Text>
              <Ripple style={Styles.closeButton} onPress={closePlayer}>
                <Ionicons name="close" size={wp(5)} color={Colors.ink} />
              </Ripple>
            </View>
            {active?.kind === 'video' && active.url ? (
              <Ripple
                style={Styles.videoFrame}
                onPress={() => setVideoPaused((value) => !value)}
              >
                <Video
                  source={{ uri: active.url }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                  paused={videoPaused}
                  repeat={false}
                  onEnd={() => setVideoPaused(true)}
                />
                {videoPaused ? (
                  <View style={Styles.playOverlay}>
                    <Ionicons name="play" size={wp(10)} color={Colors.color2} />
                  </View>
                ) : null}
              </Ripple>
            ) : null}
            {active?.kind === 'voice' ? (
              <View style={Styles.voicePlayer}>
                <View style={Styles.waveform}>
                  {waveform.map((peak, index) => (
                    <View
                      key={index}
                      style={[Styles.waveBar, { height: hp(2 + peak * 7) }]}
                    />
                  ))}
                </View>
                <Ripple
                  style={Styles.voicePlayButton}
                  onPress={() => toggleVoice(active.url)}
                >
                  <Ionicons
                    name={voicePlaying ? 'stop' : 'play'}
                    size={wp(7)}
                    color={Colors.color2}
                  />
                </Ripple>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default ProfileIntroMedia;

const Styles = StyleSheet.create({
  section: { marginTop: hp(2.5), marginBottom: hp(0.5) },
  sectionTitle: {
    marginHorizontal: wp(5),
    color: Colors.ink,
    fontFamily: Fonts.APPFONT_B,
    fontSize: Typography.small3,
  },
  sectionDescription: {
    marginHorizontal: wp(5),
    marginTop: hp(0.5),
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small1,
    lineHeight: wp(5),
  },
  cards: {
    flexDirection: 'row',
    gap: wp(3),
    paddingHorizontal: wp(4),
    marginTop: hp(1.4),
  },
  card: {
    flex: 1,
    minHeight: hp(17),
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.hairline,
    borderRadius: 18,
    padding: wp(3.5),
    alignItems: 'flex-start',
  },
  iconCircle: {
    width: wp(11),
    height: wp(11),
    borderRadius: wp(5.5),
    backgroundColor: Colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp(1.2),
  },
  cardTitle: {
    color: Colors.ink,
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small2,
  },
  cardCaption: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.tiny1,
    marginTop: hp(0.6),
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(1),
    borderRadius: 999,
    paddingHorizontal: wp(2),
    paddingVertical: hp(0.4),
    marginTop: hp(0.8),
  },
  statusText: { fontFamily: Fonts.APPFONT_SB, fontSize: Typography.tiny1 },
  rejectionReason: {
    color: Colors.attention,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.tiny1,
    marginTop: hp(0.7),
    lineHeight: wp(4),
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: Colors.blackRGBA70,
    justifyContent: 'center',
    paddingHorizontal: wp(5),
  },
  playerCard: {
    backgroundColor: Colors.surface,
    borderRadius: 22,
    overflow: 'hidden',
  },
  playerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: wp(4),
    paddingVertical: hp(1.5),
  },
  playerTitle: {
    color: Colors.ink,
    fontFamily: Fonts.APPFONT_B,
    fontSize: Typography.small3,
  },
  closeButton: {
    width: wp(9),
    height: wp(9),
    borderRadius: wp(4.5),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.lavender,
  },
  videoFrame: { height: hp(52), backgroundColor: Colors.color1 },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.blackRGBA25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voicePlayer: {
    minHeight: hp(28),
    alignItems: 'center',
    justifyContent: 'center',
    padding: wp(6),
  },
  waveform: {
    height: hp(11),
    flexDirection: 'row',
    gap: wp(1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveBar: {
    width: wp(1.2),
    borderRadius: 99,
    backgroundColor: Colors.primaryMid,
  },
  voicePlayButton: {
    width: wp(16),
    height: wp(16),
    borderRadius: wp(8),
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: hp(2),
  },
});
