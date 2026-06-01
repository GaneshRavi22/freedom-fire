import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { InputField } from '@/components/ui/inputs/InputField';

describe('InputField', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<InputField placeholder="Enter value" />);
    expect(toJSON()).toBeTruthy();
  });

  it('displays the label', () => {
    const { getByText } = render(<InputField label="Monthly Expenses" />);
    expect(getByText('Monthly Expenses')).toBeTruthy();
  });

  it('renders an icon when provided', () => {
    const { UNSAFE_getByType } = render(<InputField icon="cash-outline" />);
    const { Ionicons } = require('@expo/vector-icons');
    const icon = UNSAFE_getByType(Ionicons);
    expect(icon.props.name).toBe('cash-outline');
  });

  it('shows error message when error prop is set', () => {
    const { getByText } = render(<InputField error="This field is required" />);
    expect(getByText('This field is required')).toBeTruthy();
  });

  it('does not show error text when error prop is absent', () => {
    const { queryByText } = render(<InputField label="Name" />);
    expect(queryByText(/required/i)).toBeNull();
  });

  it('calls onChangeText when text changes', () => {
    const onChangeText = jest.fn();
    const { getByPlaceholderText } = render(
      <InputField placeholder="Enter email" onChangeText={onChangeText} />
    );
    fireEvent.changeText(getByPlaceholderText('Enter email'), 'test@example.com');
    expect(onChangeText).toHaveBeenCalledWith('test@example.com');
  });

  it('hides text by default when isPassword is true', () => {
    const { UNSAFE_getByType } = render(<InputField isPassword />);
    const { TextInput } = require('react-native');
    const input = UNSAFE_getByType(TextInput);
    expect(input.props.secureTextEntry).toBe(true);
  });

  it('shows password toggle eye icon when isPassword is true', () => {
    const { UNSAFE_getAllByType } = render(<InputField isPassword />);
    const { Ionicons } = require('@expo/vector-icons');
    const icons = UNSAFE_getAllByType(Ionicons);
    const eyeIcon = icons.find(
      (i: any) => i.props.name === 'eye-outline' || i.props.name === 'eye-off-outline'
    );
    expect(eyeIcon).toBeTruthy();
  });

  it('toggles password visibility on eye icon press', () => {
    const { UNSAFE_getAllByType, UNSAFE_getByType } = render(<InputField isPassword />);
    const { TextInput, TouchableOpacity } = require('react-native');

    expect(UNSAFE_getByType(TextInput).props.secureTextEntry).toBe(true);

    const toggleBtn = UNSAFE_getAllByType(TouchableOpacity).at(-1);
    fireEvent.press(toggleBtn);
    expect(UNSAFE_getByType(TextInput).props.secureTextEntry).toBe(false);

    fireEvent.press(toggleBtn);
    expect(UNSAFE_getByType(TextInput).props.secureTextEntry).toBe(true);
  });

  it('does not show password toggle when isPassword is false', () => {
    const { queryByTestId } = render(<InputField />);
    expect(queryByTestId('icon-eye-outline')).toBeNull();
    expect(queryByTestId('icon-eye-off-outline')).toBeNull();
  });

  it('accepts numeric keyboardType', () => {
    const { UNSAFE_getByType } = render(<InputField keyboardType="numeric" />);
    const { TextInput } = require('react-native');
    expect(UNSAFE_getByType(TextInput).props.keyboardType).toBe('numeric');
  });
});
