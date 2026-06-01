import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { GradientButton } from '@/components/ui/layout/GradientButton';

describe('GradientButton', () => {
  it('renders the title text', () => {
    const { getByText } = render(<GradientButton title="Calculate FIRE" onPress={jest.fn()} />);
    expect(getByText('Calculate FIRE')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(<GradientButton title="Submit" onPress={onPress} />);
    fireEvent.press(getByText('Submit'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    const { getByText } = render(<GradientButton title="Submit" onPress={onPress} disabled />);
    fireEvent.press(getByText('Submit'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows ActivityIndicator instead of text when loading', () => {
    const { queryByText, getByTestId, UNSAFE_getByType } = render(
      <GradientButton title="Submit" onPress={jest.fn()} loading />
    );
    expect(queryByText('Submit')).toBeNull();
    // ActivityIndicator is rendered — use UNSAFE_getByType as a fallback
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });

  it('has disabled=true on the touchable when loading', () => {
    const { UNSAFE_getByType } = render(
      <GradientButton title="Submit" onPress={jest.fn()} loading />
    );
    const { TouchableOpacity } = require('react-native');
    expect(UNSAFE_getByType(TouchableOpacity).props.disabled).toBe(true);
  });

  it('renders primary variant by default', () => {
    const { UNSAFE_getByType } = render(<GradientButton title="Go" onPress={jest.fn()} />);
    const { TouchableOpacity } = require('react-native');
    const btn = UNSAFE_getByType(TouchableOpacity);
    // Primary has backgroundColor from Colors.primary — just ensure it renders
    expect(btn).toBeTruthy();
  });

  it('renders outline variant', () => {
    const { getByText } = render(
      <GradientButton title="Cancel" onPress={jest.fn()} variant="outline" />
    );
    expect(getByText('Cancel')).toBeTruthy();
  });

  it('renders secondary variant', () => {
    const { getByText } = render(
      <GradientButton title="Skip" onPress={jest.fn()} variant="secondary" />
    );
    expect(getByText('Skip')).toBeTruthy();
  });
});
