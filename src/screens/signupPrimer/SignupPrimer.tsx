/* eslint-disable @typescript-eslint/no-explicit-any */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import * as Animatable from 'react-native-animatable';
import Ripple from 'react-native-material-ripple';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { Button, Container } from '../../components';
import { hp, Typography, wp } from '../../global';
import { Colors, Fonts } from '../../res';
import { ApiServices, StorageManager } from '../../services';
import { addAnaylatics } from '../../services/firebase/analytics';
import { useSettingsStore } from '../../stores';
import StepControl from './components/step-control';
import { journeyFor } from './journeys';
import {
  computeProgress,
  formatMatchCount,
  isAutoAdvance,
  nextStepIndex,
  prevStepIndex,
  questionPosition,
} from './primer-logic';
import type { PrimerGender, PrimerStepDef } from './primer-types';

type Phase = 'gender' | 'questions' | 'loading' | 'reveal';

const isAnswered = (step: PrimerStepDef, value: any): boolean => {
  if (!step.required) return true;
  if (step.control === 'habits') return !!(value?.smoke && value?.drink);
  return value != null;
};

// Beat between tapping an auto-advancing option and the next question, so the
// selected row's highlight actually paints. Long enough to register, short
// enough not to feel like lag across eleven questions.
const HIGHLIGHT_PAUSE_MS = 200;

// Continuous twinkle for the reveal's star badge.
const TWINKLE = {
  0: { opacity: 0.7, scale: 0.9 },
  0.5: { opacity: 1, scale: 1.15 },
  1: { opacity: 0.7, scale: 0.9 },
};

// Counts up from 0 to `value` on mount (easeOut), formatted like the final
// number, so the reveal number "grows" into place.
const CountUp = ({ value, style }: { value: number; style: any }) => {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let raf = 0;
    let start = 0;
    const duration = 1200;
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setDisplay(Math.round(eased * value));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <RNText style={style}>{formatMatchCount(display)}</RNText>;
};

const SignupPrimer = ({ navigation }: any) => {
  const { setData, storageKeys } = StorageManager;
  const [phase, setPhase] = useState<Phase>('gender');
  const [gender, setGender] = useState<PrimerGender | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [count, setCount] = useState<number | null>(null);
  const [founding, setFounding] = useState(false);
  const enableMatchCountReveal = useSettingsStore().getEnableMatchCountReveal();

  const steps = useMemo(() => (gender ? journeyFor(gender) : []), [gender]);
  const current = steps[stepIndex];
  const progress = useMemo(
    () => computeProgress(steps, answers, stepIndex),
    [steps, answers, stepIndex]
  );
  const questionCount = useMemo(
    () => questionPosition(steps, answers, stepIndex),
    [steps, answers, stepIndex]
  );

  const markSeen = useCallback(() => {
    setData(storageKeys.PRIMER_SEEN, true);
  }, [setData, storageKeys.PRIMER_SEEN]);

  const persist = useCallback(
    (nextAnswers: Record<string, any>, g: PrimerGender | null) => {
      setData(storageKeys.PRIMER_ANSWERS, { gender: g, answers: nextAnswers });
    },
    [setData, storageKeys.PRIMER_ANSWERS]
  );

  const exitFlow = useCallback(() => {
    markSeen();
    navigation.reset({ index: 0, routes: [{ name: 'AuthWelcome' }] });
  }, [markSeen, navigation]);

  const onSelectGender = useCallback((g: PrimerGender) => {
    setGender(g);
    setPhase('questions');
    setStepIndex(0);
    addAnaylatics('primer_started', { gender: g });
  }, []);

  const onChange = useCallback(
    (value: any) => {
      if (!current) return;
      setAnswers((prev) => {
        const next = { ...prev, [current.id]: value };
        persist(next, gender);
        return next;
      });
    },
    [current, gender, persist]
  );

  const fetchCount = useCallback(async () => {
    if (!gender) return;
    const seeking = gender === 'female' ? 'male' : 'female';
    const age = answers.partner_age ?? {};
    try {
      const res: any = await ApiServices.getMatchCount({
        seeking,
        min_age: age.min,
        max_age: age.max,
      });
      const raw = Number(res?.count ?? res?.raw_count);
      if (res?.founding || !Number.isFinite(raw) || raw < 50) {
        setFounding(true);
      } else {
        setCount(raw);
      }
    } catch {
      setFounding(true); // graceful: number-free founding-member copy
    }
  }, [answers.partner_age, gender]);

  const advance = useCallback(async () => {
    if (!current) return;
    addAnaylatics('primer_step', { gender, step: current.id });
    const next = nextStepIndex(steps, answers, stepIndex);
    if (next === -1) {
      if (!enableMatchCountReveal) {
        exitFlow();
        return;
      }
      setPhase('loading');
      await fetchCount();
      setPhase('reveal');
      markSeen();
    } else {
      setStepIndex(next);
    }
  }, [
    answers,
    current,
    enableMatchCountReveal,
    exitFlow,
    fetchCount,
    gender,
    markSeen,
    stepIndex,
    steps,
  ]);

  // `advance` closes over `answers`, so the copy captured at tap time predates
  // the onChange from that same tap. Calling through a ref means the timeout
  // runs the current `advance` — by then React has re-rendered with the answer.
  const advanceRef = useRef(advance);
  useEffect(() => {
    advanceRef.current = advance;
  });

  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cancel a pending pause whenever we leave the question that scheduled it.
  // Keying on stepIndex/phase (rather than only unmounting) is what stops a
  // tap-then-back inside the 200ms window from firing a stale advance and
  // silently undoing the back. Cleanup still runs on unmount too.
  useEffect(
    () => () => {
      if (advanceTimer.current) {
        clearTimeout(advanceTimer.current);
        advanceTimer.current = null;
      }
    },
    [stepIndex, phase]
  );

  // Used only by auto-advancing options. The Continue button stays instant.
  const advanceAfterHighlight = useCallback(() => {
    if (advanceTimer.current) return; // a second tap must not skip a question
    advanceTimer.current = setTimeout(() => {
      advanceTimer.current = null;
      advanceRef.current();
    }, HIGHLIGHT_PAUSE_MS);
  }, []);

  // Step back to the previous visible question; from the first question, return
  // to the gender step so nothing is a dead end.
  const goBack = useCallback(() => {
    const prev = prevStepIndex(steps, answers, stepIndex);
    if (prev === -1) {
      setPhase('gender');
    } else {
      setStepIndex(prev);
    }
  }, [answers, stepIndex, steps]);

  // --- Gender select -------------------------------------------------------
  if (phase === 'gender') {
    return (
      <Container style={Styles.screen}>
        <ScrollView
          style={Styles.genderScroll}
          contentContainerStyle={Styles.genderWrap}
          showsVerticalScrollIndicator={false}
        >
          <View style={Styles.brandMark}>
            <Ionicons name="heart" size={wp(8)} color={Colors.primary} />
          </View>
          <RNText style={Styles.welcome}>Assalamu Alaikum</RNText>
          <RNText style={Styles.title}>
            Marriage, with faith at the heart
          </RNText>
          <RNText style={Styles.subtitle}>
            A private space to meet sincere Muslims who are ready for nikah.
          </RNText>

          <View style={Styles.missionCard}>
            <View style={Styles.missionItem}>
              <Ionicons
                name="heart-outline"
                size={wp(5)}
                color={Colors.primary}
              />
              <RNText style={Styles.missionText}>Marriage-minded</RNText>
            </View>
            <View style={Styles.missionDivider} />
            <View style={Styles.missionItem}>
              <Ionicons
                name="moon-outline"
                size={wp(5)}
                color={Colors.primary}
              />
              <RNText style={Styles.missionText}>Faith-centered</RNText>
            </View>
            <View style={Styles.missionDivider} />
            <View style={Styles.missionItem}>
              <Ionicons
                name="shield-checkmark-outline"
                size={wp(5)}
                color={Colors.primary}
              />
              <RNText style={Styles.missionText}>Private by design</RNText>
            </View>
          </View>

          <RNText style={Styles.selectionTitle}>
            First, tell us about you
          </RNText>
          <View style={Styles.tiles}>
            <Ripple
              style={Styles.tile}
              onPress={() => onSelectGender('female')}
              rippleContainerBorderRadius={16}
              accessibilityRole="button"
              accessibilityLabel="I am a woman"
            >
              <View style={Styles.tileIcon}>
                <Ionicons name="female" size={wp(7)} color={Colors.primary} />
              </View>
              <RNText style={Styles.tileTxt}>Woman</RNText>
            </Ripple>
            <Ripple
              style={Styles.tile}
              onPress={() => onSelectGender('male')}
              rippleContainerBorderRadius={16}
              accessibilityRole="button"
              accessibilityLabel="I am a man"
            >
              <View style={Styles.tileIcon}>
                <Ionicons name="male" size={wp(7)} color={Colors.primaryMid} />
              </View>
              <RNText style={Styles.tileTxt}>Man</RNText>
            </Ripple>
          </View>
          <RNText style={Styles.timeHint}>
            About 2 minutes · no account needed
          </RNText>
        </ScrollView>
      </Container>
    );
  }

  // --- Loading -------------------------------------------------------------
  if (phase === 'loading') {
    return (
      <Container style={Styles.screen}>
        <View style={Styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </Container>
    );
  }

  // --- Reveal --------------------------------------------------------------
  if (phase === 'reveal') {
    const age = answers.partner_age ?? {};
    const lead =
      gender === 'female'
        ? "They're here, and they're serious. Your wali can be part of every conversation — you're always in control."
        : 'Start with respect. Every match keeps her family in the loop — the way it should be.';
    const subject =
      gender === 'female'
        ? 'practising, marriage-minded men match what you’re looking for'
        : 'sincere, marriage-minded women match what you’re looking for';
    return (
      <Container style={Styles.screen}>
        <View style={Styles.center}>
          <Animatable.View
            animation={TWINKLE}
            iterationCount="infinite"
            duration={1800}
            easing="ease-in-out"
            useNativeDriver
            style={Styles.sparkBadge}
          >
            <Ionicons name="sparkles" size={wp(8)} color={Colors.primary} />
          </Animatable.View>
          {founding || count == null ? (
            <>
              <RNText style={Styles.foundingTitle}>Be among the first</RNText>
              <RNText style={Styles.revealSub}>
                Early members get priority matching. Create your account and
                you&apos;ll be first in line for new members.
              </RNText>
            </>
          ) : (
            <>
              <CountUp value={count} style={Styles.revealNum} />
              <RNText style={Styles.revealSub}>{subject}</RNText>
              {age.min ? (
                <View style={Styles.revealChip}>
                  <RNText style={Styles.revealChipTxt}>
                    {`aged ${age.min}–${age.max}`}
                  </RNText>
                </View>
              ) : null}
              <RNText style={Styles.revealLead}>{lead}</RNText>
            </>
          )}
        </View>
        <View style={Styles.footer}>
          <Button
            text="Create your account to meet them"
            onPress={exitFlow}
            textStyle={Styles.revealBtnTxt}
          />
        </View>
      </Container>
    );
  }

  // --- Questions -----------------------------------------------------------
  const value = answers[current.id];
  const showSupport =
    !!current.support &&
    (current.supportIf ? current.supportIf(answers) : true);
  const continueDisabled = !isAnswered(current, value);

  return (
    <Container style={Styles.screen}>
      <View style={Styles.header}>
        <View style={Styles.headerRow}>
          <View style={Styles.headerLeft}>
            <Ripple
              onPress={goBack}
              style={Styles.backBtn}
              rippleContainerBorderRadius={999}
            >
              <Ionicons name="arrow-back" size={wp(5.6)} color={Colors.ink} />
            </Ripple>
            <RNText style={Styles.questionCount}>
              {`Question ${questionCount.current} of ${questionCount.total}`}
            </RNText>
          </View>
        </View>
        <View style={Styles.meterTrack}>
          <View style={[Styles.meterFill, { width: `${progress}%` }]} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={Styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <RNText style={Styles.qTitle}>{current.question}</RNText>
        {current.subtitle ? (
          current.max != null ? (
            <View style={Styles.subRow}>
              <RNText style={Styles.qSubInline}>{current.subtitle}</RNText>
              <RNText style={Styles.inlineCounter}>
                {`${Array.isArray(value) ? value.length : 0} / ${current.max} selected`}
              </RNText>
            </View>
          ) : (
            <RNText style={Styles.qSub}>{current.subtitle}</RNText>
          )
        ) : null}
        <View
          style={[
            Styles.controlWrap,
            current.max != null && Styles.controlWrapTight,
          ]}
        >
          <StepControl
            key={current.id}
            step={current}
            value={value}
            onChange={onChange}
            onAdvance={advanceAfterHighlight}
          />
        </View>
        {showSupport ? (
          <View style={Styles.supportBox}>
            <RNText style={Styles.supportTxt}>{current.support}</RNText>
          </View>
        ) : null}
      </ScrollView>

      {!isAutoAdvance(current) ? (
        <View style={Styles.footer}>
          <Button
            text={stepIndex >= steps.length - 1 ? 'See my matches' : 'Continue'}
            onPress={advance}
            disabled={continueDisabled}
          />
        </View>
      ) : null}
    </Container>
  );
};

export default SignupPrimer;

const Styles = StyleSheet.create({
  screen: { backgroundColor: Colors.appBg, flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: wp(8),
  },
  header: { paddingHorizontal: wp(5), paddingTop: hp(1.5) },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(1.5),
  },
  questionCount: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small1,
  },
  backBtn: {
    width: wp(9),
    height: wp(9),
    borderRadius: wp(4.5),
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -wp(1.5),
  },
  meterTrack: {
    height: hp(0.7),
    borderRadius: 999,
    backgroundColor: Colors.lavender,
    overflow: 'hidden',
    marginTop: hp(1.2),
  },
  meterFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  body: { paddingHorizontal: wp(5), paddingTop: hp(2.5), paddingBottom: hp(2) },
  qTitle: {
    color: Colors.ink,
    fontFamily: Fonts.APPFONT_B,
    fontSize: Typography.large,
    lineHeight: wp(7),
  },
  qSub: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small2,
    marginTop: hp(0.7),
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: hp(0.7),
  },
  qSubInline: {
    flex: 1,
    marginRight: wp(2),
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small2,
  },
  inlineCounter: {
    flexShrink: 0,
    color: Colors.primary,
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.tiny1,
    backgroundColor: Colors.lavender,
    borderRadius: 999,
    paddingHorizontal: wp(2.5),
    paddingVertical: hp(0.3),
    overflow: 'hidden',
  },
  controlWrap: { marginTop: hp(2.5) },
  controlWrapTight: { marginTop: hp(1) },
  supportBox: {
    marginTop: hp(2),
    backgroundColor: 'rgba(46,158,91,0.12)',
    borderRadius: 12,
    padding: wp(4),
  },
  supportTxt: {
    color: Colors.verified,
    fontFamily: Fonts.APPFONT_M,
    fontSize: Typography.small2,
    lineHeight: wp(5.2),
  },
  footer: {
    paddingHorizontal: wp(5),
    paddingTop: hp(1.2),
    paddingBottom: hp(2),
  },
  // gender
  genderScroll: { flex: 1 },
  genderWrap: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: wp(5),
    paddingTop: hp(3),
    paddingBottom: hp(1),
  },
  brandMark: {
    alignSelf: 'center',
    width: wp(17),
    height: wp(17),
    borderRadius: wp(8.5),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.lavender,
    borderWidth: 1,
    borderColor: Colors.primaryRGBA12,
    marginBottom: hp(1.8),
  },
  welcome: {
    color: Colors.primary,
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small2,
    textAlign: 'center',
    marginBottom: hp(0.7),
  },
  title: {
    color: Colors.ink,
    fontFamily: Fonts.APPFONT_B,
    fontSize: Typography.large2,
    textAlign: 'center',
    lineHeight: wp(8.5),
    paddingHorizontal: wp(3),
  },
  subtitle: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small2,
    textAlign: 'center',
    lineHeight: wp(5.5),
    marginTop: hp(1),
    paddingHorizontal: wp(4),
  },
  missionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.hairline,
    borderRadius: 16,
    marginTop: hp(2.5),
    paddingHorizontal: wp(2),
    paddingVertical: hp(1.6),
  },
  missionItem: {
    flex: 1,
    alignItems: 'center',
    gap: hp(0.5),
  },
  missionDivider: {
    width: 1,
    height: hp(4),
    backgroundColor: Colors.hairline,
  },
  missionText: {
    color: Colors.ink,
    fontFamily: Fonts.APPFONT_M,
    fontSize: Typography.tiny1,
    textAlign: 'center',
  },
  selectionTitle: {
    color: Colors.ink,
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small3,
    textAlign: 'center',
    marginTop: hp(3),
    marginBottom: hp(1.5),
  },
  tiles: { flexDirection: 'row', gap: wp(3) },
  tile: {
    flex: 1,
    borderWidth: 2,
    borderColor: Colors.hairline,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingVertical: hp(3),
    alignItems: 'center',
    gap: hp(1.2),
  },
  tileIcon: {
    width: wp(15),
    height: wp(15),
    borderRadius: wp(7.5),
    backgroundColor: Colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTxt: {
    color: Colors.ink,
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small3,
  },
  timeHint: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small1,
    textAlign: 'center',
    marginTop: hp(1.5),
  },
  // reveal
  sparkBadge: {
    width: wp(18),
    height: wp(18),
    borderRadius: wp(9),
    backgroundColor: Colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp(2),
  },
  revealNum: {
    color: Colors.primary,
    fontFamily: Fonts.APPFONT_B,
    fontSize: wp(14),
  },
  foundingTitle: {
    color: Colors.primary,
    fontFamily: Fonts.APPFONT_B,
    fontSize: Typography.large2,
    textAlign: 'center',
  },
  revealSub: {
    color: Colors.ink,
    fontFamily: Fonts.APPFONT_M,
    fontSize: Typography.small3,
    textAlign: 'center',
    marginTop: hp(1),
    lineHeight: wp(5.6),
  },
  revealChip: {
    marginTop: hp(1.8),
    borderWidth: 1,
    borderColor: Colors.hairline,
    borderRadius: 999,
    paddingHorizontal: wp(4),
    paddingVertical: hp(0.8),
    backgroundColor: Colors.surface,
  },
  revealChipTxt: {
    color: Colors.primaryMid,
    fontFamily: Fonts.APPFONT_M,
    fontSize: Typography.small1,
  },
  revealLead: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small2,
    textAlign: 'center',
    marginTop: hp(2),
    lineHeight: wp(5.4),
  },
  // Smaller than the default button text + a wider cap than the Button's
  // maxWidth:wp(60), so the CTA fits on one line.
  revealBtnTxt: {
    fontSize: Typography.small2,
    maxWidth: wp(85),
  },
});
