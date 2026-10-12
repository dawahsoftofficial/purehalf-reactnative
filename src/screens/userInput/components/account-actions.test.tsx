import { fireEvent, render, screen } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

import AccountActions from './account-actions';

type PickerProps = {
  visible?: boolean;
  headerTitle?: string;
  actionButtonLabel?: string;
  onDeletePress?: () => void;
  onCancelPress?: () => void;
};

jest.mock('react-native-material-ripple', () => {
  const ReactActual = jest.requireActual('react') as typeof React;
  const { View: MockView } = jest.requireActual('react-native') as {
    View: React.ComponentType<any>;
  };
  return ({
    children,
    onPress,
  }: {
    children?: ReactNode;
    onPress?: () => void;
  }) => ReactActual.createElement(MockView, { onPress }, children);
});

jest.mock('../../../components', () => {
  const ReactActual = jest.requireActual('react') as typeof React;
  const { Text: MockText, View: MockView } = jest.requireActual(
    'react-native'
  ) as { Text: React.ComponentType<any>; View: React.ComponentType<any> };

  return {
    Button: ({ onPress, text }: { onPress?: () => void; text?: string }) =>
      ReactActual.createElement(MockText, { onPress }, text),
    Text: ({ children }: { children?: ReactNode }) =>
      ReactActual.createElement(MockText, null, children),
    DeletePicker: ({
      visible,
      headerTitle,
      actionButtonLabel,
      onDeletePress,
      onCancelPress,
    }: PickerProps) =>
      visible
        ? ReactActual.createElement(
            MockView,
            null,
            ReactActual.createElement(MockText, null, headerTitle),
            ReactActual.createElement(
              MockText,
              { onPress: onDeletePress, testID: 'confirm-logout' },
              actionButtonLabel
            ),
            ReactActual.createElement(
              MockText,
              { onPress: onCancelPress, testID: 'cancel-logout' },
              'cancel'
            )
          )
        : null,
  };
});

jest.mock('../../../global', () => ({
  hp: (n: number) => n,
  wp: (n: number) => n,
  Typography: { small2: 12 },
}));

jest.mock('../../../languages', () => ({
  LanguageKeys: {
    logOut: 'logOut',
    logOutConfirm: 'logOutConfirm',
    deleteAccount: 'deleteAccount',
  },
}));

describe('AccountActions', () => {
  it('asks for confirmation before logging out', () => {
    const onLogoutPress = jest.fn();
    render(
      <AccountActions
        onLogoutPress={onLogoutPress}
        onDeleteAccountPress={jest.fn()}
      />
    );

    fireEvent.press(screen.getByText('logOut'));
    expect(onLogoutPress).not.toHaveBeenCalled();
    expect(screen.getByText('logOutConfirm')).toBeTruthy();

    fireEvent.press(screen.getByTestId('confirm-logout'));
    expect(onLogoutPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('logOutConfirm')).toBeNull();
  });

  it('does not log out when the dialog is cancelled', () => {
    const onLogoutPress = jest.fn();
    render(
      <AccountActions
        onLogoutPress={onLogoutPress}
        onDeleteAccountPress={jest.fn()}
      />
    );

    fireEvent.press(screen.getByText('logOut'));
    fireEvent.press(screen.getByTestId('cancel-logout'));

    expect(onLogoutPress).not.toHaveBeenCalled();
    expect(screen.queryByText('logOutConfirm')).toBeNull();
  });
});
