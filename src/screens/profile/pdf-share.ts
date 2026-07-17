const UNSAFE_FILENAME_CHARS = /[^a-zA-Z0-9-]/g;

export function buildShareFilename(firstName: string | undefined): string {
  const cleaned = (firstName ?? '').trim().replace(UNSAFE_FILENAME_CHARS, '');
  return cleaned.length > 0
    ? `PureHalf-Profile-${cleaned}.pdf`
    : 'PureHalf-Profile.pdf';
}

export function buildPdfDataUrl(base64: string): string {
  return `data:application/pdf;base64,${base64}`;
}

// Coarse "does this group have anything filled in" check per section, keyed
// by the same apiKey fields Data.tsx groups under appearanceAndHealth /
// familyBackground / lifeStyle / islamicValues / futurePlan. Mirrors the
// backend's section list (admin ProfilePdfService::buildViewData) by title,
// but does not replicate its exact per-row visibility logic — this only
// drives the mobile preview card's "what's going in" checklist.
const SECTION_FIELD_GROUPS: Array<{ title: string; fields: string[] }> = [
  {
    title: 'Islamic Values',
    fields: [
      'prayers_punctuality_id',
      'islamic_practice_level_id',
      'sect_id',
      'have_beard',
      'hijab_level_id',
      'is_new_muslim',
    ],
  },
  {
    title: 'Lifestyle',
    fields: [
      'education_level_id',
      'profession_id',
      'earnings_per_month_id',
      'maritial_status_id',
      'have_children',
      'smoking_id',
      'drinking_id',
      'have_car',
      'have_house',
      'have_business',
      'have_pets',
    ],
  },
  {
    title: 'Appearance & Health',
    fields: [
      'height',
      'body_type_id',
      'eyes_color_id',
      'skin_tone_id',
      'disability_id',
    ],
  },
  {
    title: 'Family Background',
    fields: ['ethinicity_id', 'language_id', 'nationality_id'],
  },
  {
    title: 'Future Plans',
    fields: [
      'marriage_plan_id',
      'family_plan_id',
      'relocation_plan_id',
      'open_for_polygamy',
    ],
  },
];

export function previewSections(
  detail: Record<string, unknown> | undefined
): string[] {
  if (!detail) {
    return [];
  }

  return SECTION_FIELD_GROUPS.filter((group) =>
    group.fields.some((field) => {
      const value = detail[field];
      return value !== null && value !== undefined && value !== '';
    })
  ).map((group) => group.title);
}
