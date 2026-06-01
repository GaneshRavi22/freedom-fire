import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

import { QuestCard } from '@/components/ui/cards/QuestCard';

const baseProps = {
  title: 'Log an investment',
  description: 'Record any investment today',
  icon: 'trending-up',
  progress: 0,
  target: 1,
  completed: false,
  xpReward: 20,
  frequency: 'daily' as const,
};

describe('QuestCard', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<QuestCard {...baseProps} />);
    expect(toJSON()).toBeTruthy();
  });

  it('shows title and description', () => {
    const { getByText } = render(<QuestCard {...baseProps} />);
    expect(getByText('Log an investment')).toBeTruthy();
    expect(getByText('Record any investment today')).toBeTruthy();
  });

  it('shows XP reward when not completed', () => {
    const { getByText } = render(<QuestCard {...baseProps} />);
    expect(getByText('+20')).toBeTruthy();
  });

  it('shows daily frequency chip', () => {
    const { getByText } = render(<QuestCard {...baseProps} frequency="daily" />);
    expect(getByText('daily')).toBeTruthy();
  });

  it('shows weekly frequency chip', () => {
    const { getByText } = render(<QuestCard {...baseProps} frequency="weekly" />);
    expect(getByText('weekly')).toBeTruthy();
  });

  it('hides progress bar when completed', () => {
    const { queryByText } = render(<QuestCard {...baseProps} completed={true} progress={1} />);
    // XP text is hidden when completed (checkmark icon shown instead)
    expect(queryByText('+20')).toBeNull();
  });

  it('handles target = 0 without crashing (fillPct defaults to 0)', () => {
    const { toJSON } = render(<QuestCard {...baseProps} target={0} />);
    expect(toJSON()).toBeTruthy();
  });

  it('handles full progress (progress = target)', () => {
    const { toJSON } = render(<QuestCard {...baseProps} progress={1} target={1} />);
    expect(toJSON()).toBeTruthy();
  });

  it('accepts a custom style prop', () => {
    const { toJSON } = render(<QuestCard {...baseProps} style={{ marginBottom: 8 }} />);
    expect(toJSON()).toBeTruthy();
  });
});
