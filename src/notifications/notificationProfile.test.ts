import { notificationProfileId } from './notificationProfile';

it('handles canonical and legacy profile types and prefers the explicit actor', () => {
  expect(
    notificationProfileId('someone_liked_your_profile', { id: '42' }, 7)
  ).toBe(42);
  expect(
    notificationProfileId('profile_visit_notification', { id: '42' }, 7)
  ).toBe(42);
  expect(
    notificationProfileId('profile_liked', { actor_id: 42, id: 7 }, 7)
  ).toBe(42);
  expect(
    notificationProfileId('photo_request_approved', { actor_id: 42 }, 7)
  ).toBe(42);
  expect(notificationProfileId('new_message', { user: { id: 42 } }, 7)).toBe(
    42
  );
});
it('does not infer a person from self notices, unknown types, conversations or malformed IDs', () => {
  for (const type of ['profile_approved', 'account_suspended', 'unknown'])
    expect(notificationProfileId(type, { id: 42, actor_id: 42 }, 7)).toBeNull();
  for (const id of [7, 0, -1, 'abc', '../42', 1.5, {}, true])
    expect(notificationProfileId('profile_liked', { id }, 7)).toBeNull();
  expect(notificationProfileId('new_message', { id: 42 }, 7)).toBeNull();
  expect(
    notificationProfileId('photo_access_request', { id: 42 }, 7)
  ).toBeNull();
});
