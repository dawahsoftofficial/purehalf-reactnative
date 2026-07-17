import type { PrimerGender, PrimerOption, PrimerStepDef } from './primer-types';

// Copy is inline English here (rendered through the app Text component, which
// runs it through t()); full localisation is the documented i18n follow-up.

const o = (id: string, label: string): PrimerOption => ({ id, label });

// Sect options mirror the two Sunni madhahib the backend stores (sect-2 Hanafi,
// sect-1 Salafi) so a generic "Sunni" is never collapsed onto one sub-sect on a
// public profile. Shared by both journeys.
const SECT_OPTIONS: PrimerOption[] = [
  o('sunni_hanafi', 'Sunni (Hanafi)'),
  o('sunni_salafi', 'Sunni (Salafi)'),
  o('shia', 'Shia'),
  o('other', 'Other'),
  o('prefer_not_say', 'Prefer not to say'),
];

export const SECT_PREFERENCE_OPTIONS: PrimerOption[] = [
  o('yes', 'Prefer the same sect'),
  o('no', 'Any sect can work'),
];

export const SECOND_MARRIAGE_LABEL = 'Looking for a second marriage';

const femaleJourney: PrimerStepDef[] = [
  {
    id: 'stage',
    control: 'single',
    visibility: 'private',
    question: 'What brings you here?',
    options: [
      o('ready_partner', 'Ready to find my life partner'),
      o('exploring', 'Exploring seriously, no rush'),
      o('tired_rishta', 'Tired of the rishta process, hoping for better'),
      o('family_searching', 'My family is helping me search'),
    ],
  },
  {
    id: 'status',
    control: 'status',
    visibility: 'public',
    question: "What's your current status?",
    options: [
      o('single', 'Single (never married)'),
      o('divorced', 'Divorced'),
      o('widowed', 'Widowed'),
    ],
  },
  {
    id: 'deen',
    control: 'deen',
    visibility: 'public',
    hasRevert: true,
    question: 'Your relationship with deen',
    options: [
      o('pray_5', 'I pray 5 times a day'),
      o('pray_sometimes', 'I pray sometimes'),
      o('working_on_it', 'Working on it'),
      o('prefer_not_say', 'Prefer not to say'),
    ],
  },
  {
    id: 'sect',
    control: 'sectCombo',
    visibility: 'public',
    question: 'Your sect',
    options: SECT_OPTIONS,
  },
  {
    id: 'concerns',
    control: 'multi',
    visibility: 'private',
    question: "What's been weighing on you?",
    subtitle: 'Only you can see this.',
    options: [
      o('pressure_family', 'Pressure from family/relatives'),
      o('worried_age', 'Worried about my age'),
      o('tired_rishta', 'Tired of the rishta process'),
      o('worried_career', 'Worried about my career after marriage'),
      o('need_privacy', 'I need strict privacy'),
    ],
  },
  {
    id: 'priorities',
    control: 'multi',
    max: 4,
    visibility: 'public',
    question: 'What matters most in him?',
    subtitle: 'Pick your top 4.',
    support: 'Knowing what you want is a strength — choose freely.',
    options: [
      o('strong_deen', 'Strong deen & character'),
      o('good_looking', 'Reasonable-looking'),
      o('financially_settled', 'Financially settled'),
      o('respected_family', 'Respected family background'),
      o('well_educated', 'Well educated'),
    ],
  },
  {
    id: 'dealbreakers',
    control: 'multi',
    visibility: 'public',
    question: 'Any of these non-negotiable?',
    support: 'Your standards protect you — never apologise for them.',
    options: [
      o('no_smoking', 'Absolutely no smoking'),
      o('no_drinking', 'No drinking'),
      o('not_second_wife', "He isn't looking for a second wife"),
      o('separate_home', 'Separate home from in-laws'),
      o('continue_working', "I'll continue working after marriage"),
      o('settled_city', 'Must be settled in/near my city'),
      o('no_dealbreakers', "No dealbreakers — I'm flexible"),
    ],
  },
  {
    id: 'partner_age',
    control: 'slider',
    visibility: 'public',
    sliderMin: 18,
    sliderMax: 60,
    question: 'What age range are you hoping for in him?',
  },
  {
    id: 'preferred_work',
    control: 'multi',
    visibility: 'public',
    question: 'His work situation — what suits you?',
    options: [
      o('business_owner', 'Business owner'),
      o('salaried', 'Salaried professional'),
      o('govt_job', 'Government job'),
      o('settled_overseas', 'Settled overseas'),
      o('no_preference', 'No preference, character first'),
    ],
  },
];

const maleJourney: PrimerStepDef[] = [
  {
    id: 'status',
    control: 'status',
    visibility: 'public',
    question: "What's your current status?",
    hasPolygamy: true,
    options: [o('single', 'Single (never married)'), o('divorced', 'Divorced')],
  },
  {
    id: 'stage',
    control: 'single',
    visibility: 'private',
    question: 'What brings you here?',
    options: [
      o('ready_now', 'Ready to marry now'),
      o('getting_late', "It's getting late — I want to settle down"),
      o('guard_deen', 'To complete half my deen'),
      o('been_searching', 'Been searching, hoping to find the one'),
    ],
  },
  {
    id: 'deen',
    control: 'deen',
    visibility: 'public',
    question: 'Your relationship with deen',
    options: [
      o('pray_5', 'I pray 5 times a day'),
      o('pray_sometimes', 'I pray sometimes'),
      o('working_on_it', 'Working on it'),
      o('prefer_not_say', 'Prefer not to say'),
    ],
  },
  {
    id: 'sect',
    control: 'sectCombo',
    visibility: 'public',
    question: 'Your sect',
    options: SECT_OPTIONS,
  },
  {
    id: 'priorities',
    control: 'multi',
    max: 4,
    visibility: 'private',
    question: 'What matters most in her?',
    subtitle: 'Pick your top 4 — just for matching, stays private.',
    options: [
      o('beautiful', 'Beautiful / attractive'),
      o('youthful', 'Youthful and full of life'),
      o('warm_mannered', 'Warm and well-mannered nature'),
      o('easy_going', 'Easy-going and fun to be with'),
      o('practising', 'Practising deen and modesty'),
      o('honest_loyal', 'Honest and loyal'),
    ],
  },
  {
    id: 'partner_age',
    control: 'slider',
    visibility: 'public',
    sliderMin: 18,
    sliderMax: 60,
    question: 'What age range are you hoping for in her?',
  },
];

export const journeyFor = (gender: PrimerGender): PrimerStepDef[] =>
  gender === 'male' ? maleJourney : femaleJourney;

// Bands mirror the backend earn-* attribute boundaries so income resolves to a
// single earnings_per_month_id exactly. Values are monthly, in PKR.
export const INCOME_BANDS: PrimerOption[] = [
  o('up_to_50k', 'Up to 50,000'),
  o('50k_100k', '50,000 – 100,000'),
  o('100k_200k', '100,000 – 200,000'),
  o('200k_500k', '200,000 – 500,000'),
  o('500k_1m', '500,000 – 1,000,000'),
  o('above_1m', 'Above 1,000,000'),
];

export const HABIT_OPTIONS: PrimerOption[] = [
  o('no', 'No'),
  o('occasionally', 'Occasionally'),
  o('yes', 'Yes'),
];

export { femaleJourney, maleJourney };
