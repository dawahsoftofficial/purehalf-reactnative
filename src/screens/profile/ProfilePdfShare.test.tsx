import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import LanguageKeys from '../../languages/Keys';
import ProfilePdfShare from './ProfilePdfShare';

const mockGetProfilePdf = jest.fn().mockResolvedValue({
  pdf_base64: 'JVBERi0xLjQ=',
  filename: 'PureHalf-Profile-Ahmed.pdf',
  reference: 'PH-00042',
  generated_at: '2026-07-13T00:00:00Z',
});

jest.mock('../../services', () => ({
  ApiServices: {
    getProfilePdf: (...args: unknown[]) => mockGetProfilePdf(...args),
  },
  useGlobalContext: () => ({
    currentUser: {
      first_name: 'Ahmed',
      last_name: 'Khan',
      city: 'Manchester',
      country: 'United Kingdom',
      detail: { prayers_punctuality_id: 3, height: 175 },
    },
  }),
  flashErrorMessage: jest.fn(),
}));

const mockShareOpen = jest.fn().mockResolvedValue({ action: 'shared' });
jest.mock('react-native-share', () => ({
  __esModule: true,
  default: { open: (...args: unknown[]) => mockShareOpen(...args) },
}));

// The real Container/Header pull in a chain (RevenueCat) jest can't transform,
// so mock the shared components with lightweight passthroughs — mirrors
// EditProfileGroup.test.tsx. Text renders its children directly (the test
// asserts on computed values like "Ahmed K.", not translated language keys).
jest.mock('react-native-material-ripple', () => {
  const ReactActual = jest.requireActual('react') as typeof React;
  const { View } = jest.requireActual('react-native');
  return ({ children, style, testID, onPress, disabled }: any) =>
    ReactActual.createElement(
      View,
      { style, testID, onPress: disabled ? undefined : onPress },
      children
    );
});

jest.mock('react-native-switch', () => {
  const ReactActual = jest.requireActual('react') as typeof React;
  const { View } = jest.requireActual('react-native');
  return {
    Switch: ({ testID, value, onValueChange }: any) =>
      ReactActual.createElement(View, { testID, value, onValueChange }),
  };
});

jest.mock('react-native-vector-icons/Ionicons', () => 'Ionicons');

jest.mock('../../components', () => {
  const ReactActual = jest.requireActual('react') as typeof React;
  const { Text, View } = jest.requireActual('react-native');
  return {
    Container: ({ children }: any) =>
      ReactActual.createElement(View, null, children),
    Header: ({ title }: any) => ReactActual.createElement(Text, null, title),
    ModalLoader: ({ visible, message }: any) =>
      visible ? ReactActual.createElement(Text, null, message) : null,
    Text: ({ children, style, testID }: any) =>
      ReactActual.createElement(Text, { style, testID }, children),
  };
});

const mockAddAnaylatics = jest.fn();
jest.mock('../../services/firebase/analytics', () => ({
  addAnaylatics: (...args: unknown[]) => mockAddAnaylatics(...args),
}));

describe('ProfilePdfShare', () => {
  beforeEach(() => {
    mockGetProfilePdf.mockClear();
    mockShareOpen.mockClear();
    mockAddAnaylatics.mockClear();
  });

  it('requests the PDF with both toggles off by default when Share is pressed', async () => {
    render(<ProfilePdfShare navigation={{ goBack: jest.fn() }} />);

    fireEvent.press(screen.getByTestId('share-pdf-cta'));

    await screen.findByTestId('share-pdf-cta');
    expect(mockGetProfilePdf).toHaveBeenCalledWith(false, false);
  });

  it('passes the toggled flags through to the request', async () => {
    render(<ProfilePdfShare navigation={{ goBack: jest.fn() }} />);

    fireEvent(
      screen.getByTestId('toggle-include-photo'),
      'onValueChange',
      true
    );
    fireEvent(screen.getByTestId('toggle-include-wali'), 'onValueChange', true);
    fireEvent.press(screen.getByTestId('share-pdf-cta'));

    await screen.findByTestId('share-pdf-cta');
    expect(mockGetProfilePdf).toHaveBeenCalledWith(true, true);
  });

  it('shares the fetched PDF as a base64 data URL with the built filename', async () => {
    render(<ProfilePdfShare navigation={{ goBack: jest.fn() }} />);

    fireEvent.press(screen.getByTestId('share-pdf-cta'));

    await screen.findByTestId('share-pdf-cta');
    expect(mockShareOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'data:application/pdf;base64,JVBERi0xLjQ=',
        filename: 'PureHalf-Profile-Ahmed.pdf',
        useInternalStorage: true,
      })
    );
  });

  it('shows a preview summary with the member identity and included sections', () => {
    render(<ProfilePdfShare navigation={{ goBack: jest.fn() }} />);

    expect(screen.getByText('Ahmed K.')).toBeTruthy();
    expect(screen.getByText('Manchester, United Kingdom')).toBeTruthy();
    expect(screen.getByText(LanguageKeys.islamicValues)).toBeTruthy();
  });

  it('logs generated and shared analytics events with the current toggle flags', async () => {
    render(<ProfilePdfShare navigation={{ goBack: jest.fn() }} />);

    fireEvent(screen.getByTestId('toggle-include-wali'), 'onValueChange', true);
    fireEvent.press(screen.getByTestId('share-pdf-cta'));

    await screen.findByTestId('share-pdf-cta');
    expect(mockAddAnaylatics).toHaveBeenCalledWith('profile_pdf_generated', {
      include_photo: false,
      include_wali: true,
    });
    expect(mockAddAnaylatics).toHaveBeenCalledWith('profile_pdf_shared', {
      include_photo: false,
      include_wali: true,
    });
  });
});
