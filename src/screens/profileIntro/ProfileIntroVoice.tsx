import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import Ripple from 'react-native-material-ripple';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { Container, Header, Text } from '../../components';
import { hp, Typography, wp } from '../../global';
import { LanguageKeys } from '../../languages';
import { type IntroMediaStatus } from '../../lib/utils/profile-intro-media';
import { Colors, Fonts } from '../../res';
import {
  ApiServices,
  flashErrorMessage,
  flashSuccessMessage,
  StorageManager,
  useGlobalContext,
} from '../../services';
import chatAudioService, {
  type RecordedChatAudio,
} from '../../services/audio/chat-audio-service';

const idlePeaks = [
  0.2, 0.38, 0.62, 0.32, 0.74, 0.5, 0.9, 0.44, 0.68, 0.28, 0.8, 0.56, 0.36, 0.7,
  0.46, 0.24,
];

const statusLabel = (status?: IntroMediaStatus) => {
  if (status === 'approved') return LanguageKeys.approved;
  if (status === 'rejected') return LanguageKeys.needsChanges;
  return LanguageKeys.pendingReview;
};

const statusColor = (status?: IntroMediaStatus) => {
  if (status === 'approved') return Colors.verified;
  if (status === 'rejected') return Colors.attention;
  return '#D97921';
};

const ProfileIntroVoice = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { currentUser, updateCurrentUser } = useGlobalContext();
  const { setData, storageKeys } = StorageManager;

  // The screen opens in "existing" mode when a voice intro is already saved,
  // so the owner can play, delete, or re-record it. With no saved intro it
  // opens straight into the record flow (first-time add).
  const [serverVoice, setServerVoice] = useState<string | null>(
    currentUser?.media?.intro_voice ?? null
  );
  const [serverStatus, setServerStatus] = useState<IntroMediaStatus>(
    currentUser?.media?.intro_voice_status ?? null
  );
  const [mode, setMode] = useState<'existing' | 'record'>(
    currentUser?.media?.intro_voice ? 'existing' : 'record'
  );
  const [deleting, setDeleting] = useState(false);

  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [recorded, setRecorded] = useState<RecordedChatAudio | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const recordingRef = useRef(false);
  const elapsedRef = useRef(0);
  const startedAtRef = useRef(0);
  const stoppingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const finishRecording = useCallback(async () => {
    if (!recordingRef.current || stoppingRef.current) return;
    stoppingRef.current = true;
    clearTimer();
    try {
      const duration = Math.max(1, Math.min(10, Math.ceil(elapsedRef.current)));
      const result = await chatAudioService.stopRecording(duration);
      setRecorded(result);
      setPeaks(result.waveform_peaks ?? []);
    } catch {
      flashErrorMessage();
    } finally {
      recordingRef.current = false;
      stoppingRef.current = false;
      setRecording(false);
    }
  }, []);

  useEffect(
    () => () => {
      clearTimer();
      if (recordingRef.current) void chatAudioService.cancelRecording();
      void chatAudioService.stopPlayback().catch(() => undefined);
    },
    []
  );

  // Shared playback used by both the just-recorded clip (local uri) and the
  // already-saved intro (remote url); drives the waveform fill via progress.
  const playAudio = async (url?: string | null) => {
    if (!url) return;
    if (playing) {
      await chatAudioService.stopPlayback();
      setPlaying(false);
      setProgress(0);
      return;
    }
    setProgress(0);
    setPlaying(true);
    await chatAudioService.play(url, {
      onProgress: ({ currentPosition, duration }) => {
        if (duration > 0) {
          setProgress(Math.min(1, currentPosition / duration));
        }
      },
      onPlaybackEnd: () => {
        setPlaying(false);
        setProgress(0);
      },
    });
  };

  const startRecording = async () => {
    const granted = await chatAudioService.requestRecordPermission();
    if (!granted) {
      flashErrorMessage(LanguageKeys.microphonePermissionRequired);
      return;
    }

    setRecorded(null);
    setPeaks([]);
    setElapsed(0);
    elapsedRef.current = 0;
    try {
      await chatAudioService.startRecording({
        onWaveformPeak: (peak) =>
          setPeaks((current) => [...current.slice(-23), peak]),
      });
      recordingRef.current = true;
      setRecording(true);
      // Measure wall-clock time: interval ticks run late on a busy JS thread,
      // so counting ticks let recordings run past the server's 10 s limit.
      startedAtRef.current = Date.now();
      timerRef.current = setInterval(() => {
        elapsedRef.current = Number(
          ((Date.now() - startedAtRef.current) / 1000).toFixed(1)
        );
        setElapsed(Math.min(10, elapsedRef.current));
        if (elapsedRef.current >= 10) void finishRecording();
      }, 100);
    } catch {
      flashErrorMessage();
    }
  };

  const retake = async () => {
    if (playing) await chatAudioService.stopPlayback().catch(() => undefined);
    setPlaying(false);
    setProgress(0);
    setRecorded(null);
    setPeaks([]);
    setElapsed(0);
  };

  // "Re-record" from the existing screen: switch to the record flow without
  // touching the saved intro yet — submitting the new take replaces it, and
  // backing out keeps the original.
  const reRecord = async () => {
    if (playing) await chatAudioService.stopPlayback().catch(() => undefined);
    setPlaying(false);
    setProgress(0);
    setRecorded(null);
    setPeaks([]);
    setElapsed(0);
    setMode('record');
  };

  const performDelete = async () => {
    if (!serverVoice || deleting) return;
    if (playing) await chatAudioService.stopPlayback().catch(() => undefined);
    setPlaying(false);
    setProgress(0);
    setDeleting(true);
    try {
      const media = await ApiServices.deleteImage({
        key: 'intro_voice',
        file_path: serverVoice,
      });
      const updatedUser = { ...currentUser, media };
      updateCurrentUser(updatedUser);
      await setData(storageKeys.USER, updatedUser);
      setServerVoice(null);
      setServerStatus(null);
      setMode('record');
    } catch {
      // deleteImage already surfaces the error to the user.
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = () => {
    if (deleting) return;
    Alert.alert(t(LanguageKeys.delete), t(LanguageKeys.sureDeleteDes), [
      { text: t(LanguageKeys.cancel), style: 'cancel' },
      {
        text: t(LanguageKeys.delete),
        style: 'destructive',
        onPress: () => void performDelete(),
      },
    ]);
  };

  const submit = async () => {
    if (!recorded || uploading) return;
    setUploading(true);
    try {
      const media = await ApiServices.imageUpload(recorded, 'intro_voice', []);
      const updatedUser = { ...currentUser, media };
      updateCurrentUser(updatedUser);
      await setData(storageKeys.USER, updatedUser);
      flashSuccessMessage(LanguageKeys.mediaSubmittedForReview);
      navigation.goBack();
    } catch (error: any) {
      flashErrorMessage(error?.message);
    } finally {
      setUploading(false);
    }
  };

  const shownPeaks = peaks.length > 0 ? peaks : idlePeaks;
  const secondsLeft = Math.max(0, 10 - elapsed);
  const playedBars = playing ? progress * shownPeaks.length : 0;

  const renderWaveform = () => (
    <View style={Styles.waveform}>
      {shownPeaks.map((peak, index) => (
        <View
          key={index}
          style={[
            Styles.waveBar,
            recording && Styles.waveBarRecording,
            index < playedBars && Styles.waveBarPlayed,
            { height: hp(2 + Math.min(1, Math.max(0.05, peak)) * 11) },
          ]}
        />
      ))}
    </View>
  );

  if (mode === 'existing') {
    return (
      <Container style={Styles.screen} barBg={Colors.appBg}>
        <Header title={LanguageKeys.voiceIntroTitle} navigation={navigation} />
        <View style={Styles.content}>
          <View style={Styles.timerPill}>
            <View
              style={[
                Styles.liveDot,
                { backgroundColor: statusColor(serverStatus) },
              ]}
            />
            <Text style={Styles.timerText}>{statusLabel(serverStatus)}</Text>
          </View>

          <View style={Styles.waveCard}>
            {renderWaveform()}
            <Text style={Styles.stateLabel}>{LanguageKeys.playRecording}</Text>
          </View>

          <Ripple
            style={Styles.playButton}
            onPress={() => playAudio(serverVoice)}
            disabled={deleting}
          >
            <Ionicons
              name={playing ? 'stop' : 'play'}
              size={wp(9)}
              color={Colors.color2}
            />
          </Ripple>

          <View style={Styles.actions}>
            <Ripple
              style={Styles.deleteButton}
              onPress={confirmDelete}
              disabled={deleting}
            >
              {deleting ? (
                <ActivityIndicator color={Colors.attention} />
              ) : (
                <Ionicons
                  name="trash-outline"
                  size={wp(5)}
                  color={Colors.attention}
                />
              )}
              <Text style={Styles.deleteText}>{LanguageKeys.delete}</Text>
            </Ripple>
            <Ripple
              style={Styles.submitButton}
              onPress={reRecord}
              disabled={deleting}
            >
              <Ionicons name="refresh" size={wp(5)} color={Colors.color2} />
              <Text style={Styles.submitText}>{LanguageKeys.retake}</Text>
            </Ripple>
          </View>
        </View>
      </Container>
    );
  }

  return (
    <Container style={Styles.screen} barBg={Colors.appBg}>
      <Header title={LanguageKeys.voiceIntroTitle} navigation={navigation} />
      <View style={Styles.content}>
        <View style={Styles.timerPill}>
          <View style={[Styles.liveDot, recording && Styles.liveDotActive]} />
          <Text style={Styles.timerText}>
            {recording
              ? `${secondsLeft.toFixed(1)}s`
              : LanguageKeys.tenSecondMaximum}
          </Text>
        </View>

        <View style={Styles.waveCard}>
          {renderWaveform()}
          <Text style={Styles.stateLabel}>
            {recording
              ? LanguageKeys.recording
              : recorded
                ? LanguageKeys.playRecording
                : LanguageKeys.tapToRecord}
          </Text>
        </View>

        {!recorded ? (
          <Ripple
            style={[Styles.recordButton, recording && Styles.stopButton]}
            onPress={recording ? finishRecording : startRecording}
          >
            <View style={recording ? Styles.stopSquare : Styles.recordDot} />
          </Ripple>
        ) : (
          <Ripple
            style={Styles.playButton}
            onPress={() => playAudio(recorded?.uri)}
            disabled={uploading}
          >
            <Ionicons
              name={playing ? 'stop' : 'play'}
              size={wp(9)}
              color={Colors.color2}
            />
          </Ripple>
        )}

        {recorded ? (
          <View style={Styles.actions}>
            <Ripple
              style={Styles.secondaryButton}
              onPress={retake}
              disabled={uploading}
            >
              <Ionicons name="refresh" size={wp(5)} color={Colors.primary} />
              <Text style={Styles.secondaryText}>{LanguageKeys.retake}</Text>
            </Ripple>
            <Ripple
              style={Styles.submitButton}
              onPress={submit}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color={Colors.color2} />
              ) : (
                <Ionicons name="checkmark" size={wp(5)} color={Colors.color2} />
              )}
              <Text style={Styles.submitText}>
                {LanguageKeys.submitForReview}
              </Text>
            </Ripple>
          </View>
        ) : null}
      </View>
    </Container>
  );
};

export default ProfileIntroVoice;

const Styles = StyleSheet.create({
  screen: { backgroundColor: Colors.appBg },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: wp(5),
    paddingTop: hp(5),
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(2),
    backgroundColor: Colors.surface,
    borderRadius: 999,
    paddingHorizontal: wp(4),
    paddingVertical: hp(0.9),
    borderWidth: 1,
    borderColor: Colors.hairline,
  },
  liveDot: {
    width: wp(2.2),
    height: wp(2.2),
    borderRadius: wp(1.1),
    backgroundColor: Colors.primaryLite,
  },
  liveDotActive: { backgroundColor: Colors.attention },
  timerText: {
    color: Colors.ink,
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small2,
    alignSelf: 'center',
  },
  waveCard: {
    width: '100%',
    minHeight: hp(30),
    backgroundColor: Colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.hairline,
    marginTop: hp(4),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: wp(5),
  },
  waveform: {
    height: hp(15),
    flexDirection: 'row',
    gap: wp(0.9),
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  waveBar: {
    width: wp(1.1),
    borderRadius: 99,
    backgroundColor: Colors.primaryLite,
  },
  waveBarRecording: { backgroundColor: Colors.attention },
  waveBarPlayed: { backgroundColor: Colors.primary },
  stateLabel: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_M,
    fontSize: Typography.small2,
    marginTop: hp(1),
    alignSelf: 'center',
  },
  recordButton: {
    width: wp(25),
    height: wp(25),
    borderRadius: wp(12.5),
    backgroundColor: Colors.surface,
    borderWidth: 4,
    borderColor: Colors.attention,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: hp(5),
    shadowColor: Colors.attention,
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 5,
  },
  stopButton: { backgroundColor: 'rgba(211,72,54,0.08)' },
  recordDot: {
    width: wp(17),
    height: wp(17),
    borderRadius: wp(8.5),
    backgroundColor: Colors.attention,
  },
  stopSquare: {
    width: wp(10),
    height: wp(10),
    borderRadius: 5,
    backgroundColor: Colors.attention,
  },
  playButton: {
    width: wp(22),
    height: wp(22),
    borderRadius: wp(11),
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: hp(5),
  },
  actions: {
    flexDirection: 'row',
    gap: wp(3),
    width: '100%',
    marginTop: 'auto',
    marginBottom: hp(3),
  },
  secondaryButton: {
    flex: 1,
    minHeight: hp(6),
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.primaryLite,
    flexDirection: 'row',
    gap: wp(2),
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    flex: 1,
    minHeight: hp(6),
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.attention,
    flexDirection: 'row',
    gap: wp(2),
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButton: {
    flex: 1.7,
    minHeight: hp(6),
    borderRadius: 16,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    gap: wp(2),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: wp(2),
  },
  secondaryText: {
    color: Colors.primary,
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small1,
    alignSelf: 'center',
  },
  deleteText: {
    color: Colors.attention,
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small1,
    alignSelf: 'center',
  },
  submitText: {
    color: Colors.color2,
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small1,
    alignSelf: 'center',
  },
});
