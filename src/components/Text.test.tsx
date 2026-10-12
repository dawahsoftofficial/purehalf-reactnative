import { render, screen } from '@testing-library/react-native';
import React from 'react';

import Text from './Text';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => (key === 'hi' ? 'Salaam' : key),
  }),
}));

jest.mock('../languages', () => ({ CheckRtl: () => false }));

describe('Text', () => {
  it('translates its children as i18n keys by default', () => {
    render(<Text>hi</Text>);
    expect(screen.getByText('Salaam')).toBeTruthy();
  });

  it('shows member-written content as typed when translate is false', () => {
    render(<Text translate={false}>hi</Text>);
    expect(screen.getByText('hi')).toBeTruthy();
    expect(screen.queryByText('Salaam')).toBeNull();
  });
});
