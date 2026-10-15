/** Only member-interaction types may expose a profile target. Never infer it from notification text. */
export function notificationProfileId(
  type: string | null | undefined,
  data: Record<string, unknown> | null | undefined,
  currentUserId?: number | string
): number | null {
  const profileTypes = [
    'profile_liked',
    'profile_visited',
    'someone_liked_your_profile',
    'profile_visit_notification',
  ];
  if (
    ![
      ...profileTypes,
      'photo_access_request',
      'photo_request_approved',
      'photo_request_declined',
      'new_message',
    ].includes(type ?? '')
  )
    return null;
  const actor =
    data?.user && typeof data.user === 'object'
      ? (data.user as Record<string, unknown>).id
      : undefined;
  // Legacy data.id denotes a profile only for like and visit notifications.
  const raw =
    data?.actor_id ??
    actor ??
    (profileTypes.includes(type ?? '') ? data?.id : undefined);
  if (typeof raw !== 'number' && typeof raw !== 'string') return null;
  if (typeof raw === 'string' && !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 && id !== Number(currentUserId)
    ? id
    : null;
}
