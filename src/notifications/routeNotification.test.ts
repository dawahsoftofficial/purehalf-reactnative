import { routeNotification } from './routeNotification';

describe('routeNotification', () => {
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
