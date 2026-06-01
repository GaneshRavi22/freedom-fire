import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { GradientBackground } from '@/components/ui/layout/GradientBackground';

describe('GradientBackground', () => {
  it('renders children', () => {
    const { getByText } = render(
      <GradientBackground><Text>Background content</Text></GradientBackground>
    );
    expect(getByText('Background content')).toBeTruthy();
  });

  it('accepts a custom style prop', () => {
    const { getByText } = render(
      <GradientBackground style={{ flex: 1 }}><Text>Styled</Text></GradientBackground>
    );
    expect(getByText('Styled')).toBeTruthy();
  });
});
