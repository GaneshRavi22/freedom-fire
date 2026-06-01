import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

import { XPBar } from '@/components/ui/gamification/XPBar';

const baseProps = {
  level: 2,
  levelTitle: 'Saver',
  levelIcon: 'leaf',
  levelColor: '#4CAF50',
  xp: 150,
  currentLevelXP: 100,
  nextLevelXP: 300,
};

describe('XPBar', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<XPBar {...baseProps} />);
    expect(toJSON()).toBeTruthy();
  });

  it('shows the level title', () => {
    const { getByText } = render(<XPBar {...baseProps} />);
    expect(getByText('Saver')).toBeTruthy();
  });

  it('shows level number in badge', () => {
    const { getByText } = render(<XPBar {...baseProps} />);
    expect(getByText('2')).toBeTruthy();
  });

  it('shows XP progress text', () => {
    const { getByText } = render(<XPBar {...baseProps} />);
    // xpInLevel = 150 - 100 = 50; xpNeeded = 300 - 100 = 200
    expect(getByText('50 / 200 XP')).toBeTruthy();
  });

  it('handles xp at currentLevelXP boundary (0 in level)', () => {
    const { getByText } = render(<XPBar {...baseProps} xp={100} />);
    expect(getByText('0 / 200 XP')).toBeTruthy();
  });

  it('handles range = 0 without crashing (maxed level)', () => {
    const { toJSON } = render(
      <XPBar {...baseProps} currentLevelXP={300} nextLevelXP={300} xp={300} />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('accepts a custom style prop', () => {
    const { toJSON } = render(<XPBar {...baseProps} style={{ margin: 4 }} />);
    expect(toJSON()).toBeTruthy();
  });
});
