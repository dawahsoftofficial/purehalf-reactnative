import { routeNotification } from './routeNotification';

describe('routeNotification', () => {
  it('opens membership for a generic notification without an actor ID', async () => {
    const navigation = { navigate: jest.fn() };
    const onMembershipRequired = jest.fn();
    await routeNotification(navigation, 'profile_liked', {
      data: { notification_type: 'profile_liked', membership_required: true },
      deps: { onMembershipRequired },
    });
    expect(onMembershipRequired).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
  it('prompts free members instead of opening a profile', async () => {
    const navigation = { navigate: jest.fn() };
    const onMembershipRequired = jest.fn();
    for (const type of [
      'profile_liked',
      'profile_visited',
      'someone_liked_your_profile',
      'profile_visit_notification',
    ]) {
      await routeNotification(navigation, type, {
        data: { actor_id: 42 },
        currentUserId: 7,
        isPremium: false,
        deps: { onMembershipRequired },
      });
    }
    expect(onMembershipRequired).toHaveBeenCalledTimes(4);
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('gates explicit profile links while keeping photo-request actions available', async () => {
    const navigation = { navigate: jest.fn() };
    const onMembershipRequired = jest.fn();
    await routeNotification(navigation, 'photo_request_approved', {
      data: { actor_id: 42 },
      profileOnly: true,
      deps: { onMembershipRequired },
    });
    expect(onMembershipRequired).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).not.toHaveBeenCalled();
    await routeNotification(navigation, 'photo_request_approved', {
      data: { actor_id: 42 },
      profileOnly: true,
      isPremium: true,
    });
    expect(navigation.navigate).toHaveBeenCalledWith('UserProfile', {
      userData: { id: 42 },
    });
  });

  it('does not show a membership prompt for self or system notifications', async () => {
    const navigation = { navigate: jest.fn() };
    const onMembershipRequired = jest.fn();
    for (const type of ['profile_liked', 'profile_approved']) {
      await routeNotification(navigation, type, {
        data: { id: 7 },
        currentUserId: 7,
        deps: { onMembershipRequired },
      });
    }
    expect(onMembershipRequired).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
  it('opens the other member for legacy like and visit notification types', async () => {
    const navigation = { navigate: jest.fn() };
    for (const type of [
      'someone_liked_your_profile',
      'profile_visit_notification',
    ]) {
      await routeNotification(navigation, type, {
        data: { actor_id: 42, id: 7 },
        currentUserId: 7,
        isPremium: true,
      });
    }
    expect(navigation.navigate).toHaveBeenCalledTimes(2);
    expect(navigation.navigate).toHaveBeenCalledWith('UserProfile', {
      userData: { id: 42 },
    });
  });

  it('does not open missing, invalid, or self profile targets', async () => {
    const navigation = { navigate: jest.fn() };
    for (const id of [undefined, 0, 'invalid', 7]) {
      await routeNotification(navigation, 'profile_liked', {
        data: { id },
        currentUserId: 7,
      });
    }
    await routeNotification(navigation, 'profile_approved', {
      data: { id: 42 },
      currentUserId: 7,
    });
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
  it('opens approved private photos on the member requests tab', async () => {
    const navigation = { navigate: jest.fn() };

    await routeNotification(navigation, 'photo_request_approved', {
      data: { id: 42 },
    });

    expect(navigation.navigate).toHaveBeenCalledWith('PrivatePhotoRequest', {
      initialTab: 'yourRequests',
    });
  });

  it('keeps incoming photo requests on the default request tab', async () => {
    const navigation = { navigate: jest.fn() };

    await routeNotification(navigation, 'photo_access_request');

    expect(navigation.navigate).toHaveBeenCalledWith('PrivatePhotoRequest');
  });

  it('opens SingleChat with the conversation id and partner for new_message', async () => {
    const navigation = { navigate: jest.fn() };

    await routeNotification(navigation, 'new_message', {
      data: {
        notification_type: 'new_message',
        conversationId: '12',
        message: 'Salam',
        user: { id: '7', name: 'Aisha', image: 'a.jpg', type: 'User' },
      },
    });

    expect(navigation.navigate).toHaveBeenCalledWith('SingleChat', {
      from: 'notification',
      conversationId: 12,
      message: 'Salam',
      otherUserData: { id: 7, name: 'Aisha', image: 'a.jpg', type: 'User' },
    });
  });

  it('opens SingleChat with only the conversation id when no user is sent', async () => {
    const navigation = { navigate: jest.fn() };

    await routeNotification(navigation, 'new_message', {
      data: { conversationId: 5 },
    });

    expect(navigation.navigate).toHaveBeenCalledWith('SingleChat', {
      from: 'notification',
      conversationId: 5,
    });
  });

  it('falls back to the inbox for new_message without a conversation id', async () => {
    const navigation = { navigate: jest.fn() };

    await routeNotification(navigation, 'new_message', { data: {} });
    await routeNotification(navigation, 'new_message');

    expect(navigation.navigate).toHaveBeenCalledTimes(2);
    expect(navigation.navigate).toHaveBeenNthCalledWith(1, 'Messages');
    expect(navigation.navigate).toHaveBeenNthCalledWith(2, 'Messages');
  });
});
