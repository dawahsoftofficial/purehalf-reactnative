import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import React, { type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { ApiServices } from '../../../services';
import PrivacyQuickSettingsModal from './privacy-quick-settings-modal';

type ChildrenProps = { children?: ReactNode };
type TextProps = { text?: ReactNode };
type ButtonProps = TextProps & { onPress?: () => void };
type RippleProps = ChildrenProps & {
  disabled?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityState?: { selected?: boolean; disabled?: boolean };
};
type SwitchProps = {
  value?: boolean;
  onValueChange?: (next: boolean) => void;
  disabled?: boolean;
  testID?: string;
};

let mockCurrentUser: any;
const mockUpdateCurrentUser = jest.fn();

jest.mock('react-native-material-ripple', () => {
  const ReactActual = jest.requireActual('react') as typeof React;
  const { View: MockView } = jest.requireActual('react-native') as {
    View: React.ComponentType<any>;
  };

  return ({
    children,
    style,
    testID,
    onPress,
    disabled,
    accessibilityState,
  }: RippleProps) =>
    ReactActual.createElement(
      MockView,
      {
        style,
        testID,
        accessibilityState,
        onPress: disabled ? undefined : onPress,
      },
      children
    );
});

jest.mock('react-native-switch', () => {
  const ReactActual = jest.requireActual('react') as typeof React;
  const { Pressable: MockPressable } = jest.requireActual('react-native') as {
    Pressable: React.ComponentType<any>;
  };

  return {
    Switch: ({ value, onValueChange, disabled, testID }: SwitchProps) =>
      ReactActual.createElement(MockPressable, {
        testID,
        accessibilityState: { checked: value, disabled },
        onPress: disabled ? undefined : () => onValueChange?.(!value),
      }),
  };
});

jest.mock('../../../components', () => {
  const ReactActual = jest.requireActual('react') as typeof React;
  const { Text: MockText, View: MockView } = jest.requireActual(
    'react-native'
  ) as { Text: React.ComponentType<any>; View: React.ComponentType<any> };

  const mockButton = ({ onPress, text }: ButtonProps) =>
    ReactActual.createElement(MockText, { onPress }, text);
  const mockTextComponent = ({
    children,
    style,
  }: ChildrenProps & { style?: unknown }) =>
    ReactActual.createElement(MockText, { style }, children);

  return { Button: mockButton, Text: mockTextComponent };
});

jest.mock('../../../languages', () => ({
  CheckRtl: () => false,
  LanguageKeys: {
    privacySettings: 'Privacy settings',
    privacyQuickSettingsIntro: 'privacyQuickSettingsIntro',
    invisibleMode: 'invisibleMode',
    invisibleModeDesc: 'invisibleModeDesc',
    chooseAnOption: 'chooseAnOption',
    profileVisibilityEveryone: 'profileVisibilityEveryone',
    profileVisibilityEveryoneDesc: 'profileVisibilityEveryoneDesc',
    profileVisibilityLiked: 'profileVisibilityLiked',
    profileVisibilityLikedDesc: 'profileVisibilityLikedDesc',
    profileVisibilityNobody: 'profileVisibilityNobody',
    profileVisibilityNobodyDesc: 'profileVisibilityNobodyDesc',
    save: 'save',
  },
}));

const mockFlashErrorMessage = jest.fn();

jest.mock('../../../services', () => ({
  ApiServices: {
    updateProfilePrivacy: jest.fn(),
    updateUserInfo: jest.fn(),
  },
  flashErrorMessage: (...args: unknown[]) => mockFlashErrorMessage(...args),
  StorageManager: {
    setData: jest.fn(),
    storageKeys: { USER: 'USER' },
  },
  useGlobalContext: () => ({
    currentUser: mockCurrentUser,
    updateCurrentUser: mockUpdateCurrentUser,
  }),
}));

describe('PrivacyQuickSettingsModal', () => {
  beforeEach(() => {
    mockCurrentUser = {
      search_visibility: 1,
      first_name: 'Amina',
      last_name: 'Yusuf',
      gender: 'female',
      date_of_birth: '01 Jan,1998',
      interface_language_id: 1,
      country: 'Pakistan',
      city: 'Islamabad',
      latitude: 33.6,
      longitude: 73.0,
      detail: { profile_visibility: 'everyone' },
    };
    mockUpdateCurrentUser.mockReset();
    mockFlashErrorMessage.mockReset();
    (ApiServices.updateUserInfo as jest.Mock).mockReset().mockResolvedValue({});
    (ApiServices.updateProfilePrivacy as jest.Mock)
      .mockReset()
      .mockResolvedValue({ profile_visibility: 'nobody' });
  });

  it('stages a selection locally without calling the API until Save is pressed', () => {
    render(<PrivacyQuickSettingsModal visible onClose={jest.fn()} />);

    fireEvent.press(screen.getByTestId('quick-privacy-visibility-nobody'));

    expect(ApiServices.updateProfilePrivacy).not.toHaveBeenCalled();
    expect(
      screen.getByTestId('quick-privacy-visibility-nobody').props
        .accessibilityState.selected
    ).toBe(true);
  });

  it('saves Invisible mode only once Save is pressed, sending only search_visibility 0', async () => {
    render(<PrivacyQuickSettingsModal visible onClose={jest.fn()} />);

    fireEvent.press(screen.getByTestId('quick-privacy-invisible-mode-switch'));
    expect(ApiServices.updateUserInfo).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('save'));

    await waitFor(() =>
      // Exactly the flag: re-sending profile fields used to rewrite the
      // birth date and send the profile back for review.
      expect(ApiServices.updateUserInfo).toHaveBeenCalledWith({
        search_visibility: 0,
      })
    );
    await waitFor(() =>
      expect(mockUpdateCurrentUser).toHaveBeenCalledWith(
        expect.objectContaining({ search_visibility: 0 })
      )
    );
  });

  it('saves the "hide completely" selection only once Save is pressed', async () => {
    render(<PrivacyQuickSettingsModal visible onClose={jest.fn()} />);

    fireEvent.press(screen.getByTestId('quick-privacy-visibility-nobody'));
    fireEvent.press(screen.getByText('save'));

    await waitFor(() =>
      expect(ApiServices.updateProfilePrivacy).toHaveBeenCalledWith({
        profile_visibility: 'nobody',
      })
    );
    await waitFor(() =>
      expect(mockUpdateCurrentUser).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: expect.objectContaining({ profile_visibility: 'nobody' }),
        })
      )
    );
  });

  it('closes without any API call when Save is pressed with no changes', () => {
    const onClose = jest.fn();
    render(<PrivacyQuickSettingsModal visible onClose={onClose} />);

    fireEvent.press(screen.getByText('save'));

    expect(onClose).toHaveBeenCalled();
    expect(ApiServices.updateUserInfo).not.toHaveBeenCalled();
    expect(ApiServices.updateProfilePrivacy).not.toHaveBeenCalled();
  });

  it('flashes an error and keeps the selection (for retry) if saving fails', async () => {
    (ApiServices.updateProfilePrivacy as jest.Mock).mockRejectedValue(
      new Error('network')
    );
    const onClose = jest.fn();

    render(<PrivacyQuickSettingsModal visible onClose={onClose} />);

    fireEvent.press(screen.getByTestId('quick-privacy-visibility-nobody'));
    fireEvent.press(screen.getByText('save'));

    await waitFor(() =>
      expect(ApiServices.updateProfilePrivacy).toHaveBeenCalled()
    );
    await waitFor(() => expect(mockFlashErrorMessage).toHaveBeenCalled());
    expect(
      screen.getByTestId('quick-privacy-visibility-nobody').props
        .accessibilityState.selected
    ).toBe(true);
    expect(mockUpdateCurrentUser).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
