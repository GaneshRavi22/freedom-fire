import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

import { StreakMilestoneModal } from '@/components/ui/modals/StreakMilestoneModal';

describe('StreakMilestoneModal', () => {
  it('renders without crashing when visible', () => {
    const { toJSON } = render(
      <StreakMilestoneModal visible={true} streakType="investment" count={7} onClose={jest.fn()} />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders null when not visible', () => {
    const { toJSON } = render(
      <StreakMilestoneModal visible={false} streakType="investment" count={7} onClose={jest.fn()} />
    );
    expect(toJSON()).toBeNull();
  });

  it('shows the Investment streak label', () => {
    const { getByText } = render(
      <StreakMilestoneModal visible={true} streakType="investment" count={7} onClose={jest.fn()} />
    );
    expect(getByText('Investment Streak')).toBeTruthy();
  });

  it('shows the Expense Tracking streak label', () => {
    const { getByText } = render(
      <StreakMilestoneModal visible={true} streakType="tracking" count={3} onClose={jest.fn()} />
    );
    expect(getByText('Expense Tracking Streak')).toBeTruthy();
  });

  it('shows the Review streak label', () => {
    const { getByText } = render(
      <StreakMilestoneModal visible={true} streakType="review" count={14} onClose={jest.fn()} />
    );
    expect(getByText('Review Streak')).toBeTruthy();
  });

  it('shows the streak count number', () => {
    const { getByText } = render(
      <StreakMilestoneModal visible={true} streakType="investment" count={30} onClose={jest.fn()} />
    );
    expect(getByText('30')).toBeTruthy();
  });

  it('shows DAYS label for count > 1', () => {
    const { getByText } = render(
      <StreakMilestoneModal visible={true} streakType="investment" count={7} onClose={jest.fn()} />
    );
    expect(getByText('DAYS')).toBeTruthy();
  });

  it('shows DAY label for count = 1', () => {
    const { getByText } = render(
      <StreakMilestoneModal visible={true} streakType="investment" count={1} onClose={jest.fn()} />
    );
    expect(getByText('DAY')).toBeTruthy();
  });

  it('shows a known message for count = 7', () => {
    const { getByText } = render(
      <StreakMilestoneModal visible={true} streakType="investment" count={7} onClose={jest.fn()} />
    );
    expect(getByText(/One full week/)).toBeTruthy();
  });

  it('shows generic message for an unknown count', () => {
    const { getByText } = render(
      <StreakMilestoneModal visible={true} streakType="tracking" count={42} onClose={jest.fn()} />
    );
    expect(getByText(/42 day streak/)).toBeTruthy();
  });

  it('calls onClose when Keep the Streak! is pressed', () => {
    const onClose = jest.fn();
    const { getByText } = render(
      <StreakMilestoneModal visible={true} streakType="investment" count={7} onClose={onClose} />
    );
    fireEvent.press(getByText('Keep the Streak!'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
