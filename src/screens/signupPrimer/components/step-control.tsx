/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { StyleSheet, Text as RNText, TextInput, View } from 'react-native';
import Ripple from 'react-native-material-ripple';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { hp, Typography, wp } from '../../../global';
import { Colors, Fonts } from '../../../res';
import {
  HABIT_OPTIONS,
  INCOME_BANDS,
  SECOND_MARRIAGE_LABEL,
  SECT_PREFERENCE_OPTIONS,
} from '../journeys';
import { isAutoAdvance } from '../primer-logic';
import type { PrimerOption, PrimerStepDef } from '../primer-types';
import RangeSlider from './range-slider';

type Props = {
  step: PrimerStepDef;
  value: any;
  onChange: (value: any) => void;
  onAdvance: () => void; // used by auto-advance single-selects
};

const asArray = (v: any): string[] => (Array.isArray(v) ? v : []);

const Radio = ({ on }: { on: boolean }) => (
  <View style={[Styles.rk, on && Styles.rkOn]}>
    {on ? (
      <Ionicons name="checkmark" size={wp(3.4)} color={Colors.color2} />
    ) : null}
  </View>
);

const Square = ({ on }: { on: boolean }) => (
  <View style={[Styles.sqk, on && Styles.sqkOn]}>
    {on ? (
      <Ionicons name="checkmark" size={wp(3.4)} color={Colors.color2} />
    ) : null}
  </View>
);

const Chip = ({
  option,
  on,
  onPress,
}: {
  option: PrimerOption;
  on: boolean;
  onPress: () => void;
}) => (
  <Ripple
    onPress={onPress}
    style={[Styles.chip, on && Styles.chipOn]}
    rippleContainerBorderRadius={999}
  >
    <RNText style={[Styles.chipTxt, on && Styles.chipTxtOn]}>
      {option.label}
    </RNText>
  </Ripple>
);

const Row = ({
  label,
  on,
  square,
  tick = true,
  onPress,
}: {
  label: string;
  on: boolean;
  square?: boolean;
  // Auto-advancing rows hide the tick: a tick reads as "confirm this", which is
  // wrong for a row that leaves the screen on tap. rowOn carries the selection.
  tick?: boolean;
  onPress: () => void;
}) => (
  <Ripple onPress={onPress} style={[Styles.row, on && Styles.rowOn]}>
    <RNText style={Styles.rowTxt}>{label}</RNText>
    {tick ? <>{square ? <Square on={on} /> : <Radio on={on} />}</> : null}
  </Ripple>
);

const YesNo = ({
  value,
  onChange,
}: {
  value: 'yes' | 'no' | undefined;
  onChange: (v: 'yes' | 'no') => void;
}) => (
  <View style={Styles.list}>
    <Row label="Yes" on={value === 'yes'} onPress={() => onChange('yes')} />
    <Row label="No" on={value === 'no'} onPress={() => onChange('no')} />
  </View>
);

function StepControl({ step, value, onChange, onAdvance }: Props) {
  const opts = step.options ?? [];

  switch (step.control) {
    case 'single': {
      const auto = isAutoAdvance(step);
      return (
        <View style={Styles.list}>
          {opts.map((op) => (
            <Row
              key={op.id}
              label={op.label}
              on={value === op.id}
              tick={!auto}
              onPress={() => {
                onChange(op.id);
                if (auto) onAdvance();
              }}
            />
          ))}
        </View>
      );
    }

    case 'multi':
    case 'traits': {
      const selected = asArray(value);
      const capped =
        step.max != null && selected.length >= step.max ? step.max : null;
      const toggle = (id: string) => {
        if (selected.includes(id)) {
          onChange(selected.filter((x) => x !== id));
        } else if (capped == null) {
          onChange([...selected, id]);
        }
      };
      if (step.control === 'traits') {
        return (
          <View style={Styles.chips}>
            {opts.map((op) => (
              <Chip
                key={op.id}
                option={op}
                on={selected.includes(op.id)}
                onPress={() => toggle(op.id)}
              />
            ))}
          </View>
        );
      }
      return (
        <View style={Styles.list}>
          {opts.map((op) => (
            <Row
              key={op.id}
              square
              label={op.label}
              on={selected.includes(op.id)}
              onPress={() => toggle(op.id)}
            />
          ))}
        </View>
      );
    }

    case 'text':
      return (
        <TextInput
          style={Styles.textArea}
          multiline
          value={typeof value === 'string' ? value : ''}
          onChangeText={onChange}
          placeholder={step.placeholder}
          placeholderTextColor={Colors.primaryLite}
        />
      );

    case 'slider': {
      const min = step.sliderMin ?? 18;
      const max = step.sliderMax ?? 60;
      const range = value ?? { min: 25, max: 35 };
      return (
        <RangeSlider
          min={min}
          max={max}
          from={range.min}
          to={range.max}
          onChange={onChange}
        />
      );
    }

    case 'status': {
      const v = value ?? {};
      const auto = isAutoAdvance(step);
      return (
        <View style={Styles.list}>
          {opts.map((op) => (
            <Row
              key={op.id}
              label={op.label}
              on={v.status === op.id}
              tick={!auto}
              onPress={() => {
                onChange({ ...v, status: op.id });
                if (auto) onAdvance();
              }}
            />
          ))}
          {step.hasPolygamy ? (
            <Ripple
              style={[
                Styles.row,
                Styles.advancedRow,
                v.polygamy && Styles.rowOn,
              ]}
              onPress={() => onChange({ ...v, polygamy: !v.polygamy })}
            >
              <RNText style={Styles.rowTxt}>{SECOND_MARRIAGE_LABEL}</RNText>
              <Square on={!!v.polygamy} />
            </Ripple>
          ) : null}
        </View>
      );
    }

    case 'casteCombo': {
      const v = value ?? {};
      // Ask whether caste matters first; only collect the khandan text when it
      // does. If it doesn't, there's nothing to type.
      return (
        <View>
          <RNText style={[Styles.subLabel, Styles.firstLabel]}>
            Does it matter in your match?
          </RNText>
          <YesNo
            value={v.matters}
            onChange={(m) => onChange({ ...v, matters: m })}
          />
          {v.matters === 'yes' ? (
            <View style={Styles.casteReveal}>
              <TextInput
                style={Styles.input}
                value={typeof v.caste === 'string' ? v.caste : ''}
                onChangeText={(t) => onChange({ ...v, caste: t })}
                placeholder="e.g. Rajput, Syed, Malik"
                placeholderTextColor={Colors.primaryLite}
              />
            </View>
          ) : null}
        </View>
      );
    }

    case 'sectCombo': {
      const v = value ?? {};
      return (
        <View>
          <View style={Styles.chips}>
            {opts.map((op) => (
              <Chip
                key={op.id}
                option={op}
                on={v.sect === op.id}
                onPress={() => onChange({ ...v, sect: op.id })}
              />
            ))}
          </View>
          <RNText style={Styles.subLabel}>Match preference</RNText>
          <View style={Styles.list}>
            {SECT_PREFERENCE_OPTIONS.map((op) => (
              <Row
                key={op.id}
                label={op.label}
                on={v.matters === op.id}
                onPress={() => onChange({ ...v, matters: op.id })}
              />
            ))}
          </View>
        </View>
      );
    }

    case 'deen': {
      const v = value ?? {};
      const auto = isAutoAdvance(step);
      return (
        <View style={Styles.list}>
          {opts.map((op) => (
            <Row
              key={op.id}
              label={op.label}
              on={v.practice === op.id}
              tick={!auto}
              onPress={() => {
                onChange({ ...v, practice: op.id });
                if (auto) onAdvance();
              }}
            />
          ))}
          {step.hasRevert ? (
            <Ripple
              style={[Styles.row, Styles.advancedRow, v.revert && Styles.rowOn]}
              onPress={() => onChange({ ...v, revert: !v.revert })}
            >
              <Square on={!!v.revert} />
              <RNText style={[Styles.rowTxt, { marginLeft: wp(3) }]}>
                I&apos;m a revert Muslim
              </RNText>
            </Ripple>
          ) : null}
        </View>
      );
    }

    case 'habits': {
      const v = value ?? {};
      return (
        <View>
          <RNText style={Styles.subLabel}>Do you smoke?</RNText>
          <View style={Styles.chips}>
            {HABIT_OPTIONS.map((op) => (
              <Chip
                key={op.id}
                option={op}
                on={v.smoke === op.id}
                onPress={() => onChange({ ...v, smoke: op.id })}
              />
            ))}
          </View>
          <RNText style={Styles.subLabel}>Do you drink?</RNText>
          <View style={Styles.chips}>
            {HABIT_OPTIONS.map((op) => (
              <Chip
                key={op.id}
                option={op}
                on={v.drink === op.id}
                onPress={() => onChange({ ...v, drink: op.id })}
              />
            ))}
          </View>
        </View>
      );
    }

    case 'work': {
      const v = value ?? {};
      return (
        <View style={Styles.list}>
          {opts.map((op) => (
            <Row
              key={op.id}
              label={op.label}
              on={v.profession === op.id}
              onPress={() => onChange({ ...v, profession: op.id })}
            />
          ))}
          {step.hasIncome ? (
            <>
              <RNText style={Styles.subLabel}>
                Monthly income in PKR (optional)
              </RNText>
              <View style={Styles.chips}>
                {INCOME_BANDS.map((op) => (
                  <Chip
                    key={op.id}
                    option={op}
                    on={v.income === op.id}
                    onPress={() => onChange({ ...v, income: op.id })}
                  />
                ))}
              </View>
              <RNText style={Styles.hint}>
                Shared as a range only, never an exact figure.
              </RNText>
            </>
          ) : null}
        </View>
      );
    }

    default:
      return null;
  }
}

export default StepControl;

const Styles = StyleSheet.create({
  list: { gap: hp(1.1) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.hairline,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: wp(4),
    paddingVertical: hp(1.6),
  },
  rowOn: { borderColor: Colors.primary, backgroundColor: Colors.lavender },
  advancedRow: {
    borderColor: Colors.primaryLite,
    backgroundColor: Colors.lavender,
    justifyContent: 'flex-start',
    gap: wp(3),
  },
  rowTxt: {
    flex: 1,
    color: Colors.ink,
    fontFamily: Fonts.APPFONT_M,
    fontSize: Typography.small2,
  },
  rk: {
    width: wp(5.2),
    height: wp(5.2),
    borderRadius: wp(2.6),
    borderWidth: 1.5,
    borderColor: Colors.primaryLite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rkOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  sqk: {
    width: wp(5.2),
    height: wp(5.2),
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.primaryLite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sqkOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: wp(2),
    marginTop: hp(0.5),
  },
  chip: {
    borderWidth: 1,
    borderColor: Colors.hairline,
    backgroundColor: Colors.surface,
    borderRadius: 999,
    paddingHorizontal: wp(4),
    paddingVertical: hp(1),
  },
  chipOn: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  chipTxt: {
    color: Colors.primaryMid,
    fontFamily: Fonts.APPFONT_M,
    fontSize: Typography.small1,
  },
  chipTxtOn: { color: Colors.color2 },
  subLabel: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_SB,
    fontSize: Typography.small1,
    marginTop: hp(2),
    marginBottom: hp(0.5),
  },
  casteReveal: { marginTop: hp(2) },
  firstLabel: { marginTop: 0 },
  hint: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small,
    marginTop: hp(1),
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.hairline,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: wp(4),
    paddingVertical: hp(1.4),
    color: Colors.ink,
    fontFamily: Fonts.APPFONT_M,
    fontSize: Typography.small2,
  },
  textArea: {
    borderWidth: 1,
    borderColor: Colors.hairline,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: wp(4),
    paddingVertical: hp(1.4),
    minHeight: hp(14),
    textAlignVertical: 'top',
    color: Colors.ink,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small2,
  },
});
