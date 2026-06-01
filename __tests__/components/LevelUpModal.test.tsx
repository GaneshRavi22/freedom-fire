import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/components/ui/gamification/ConfettiBurst', () => ({ ConfettiBurst: () => null }));
jest.mock('@/components/ui/cards/BadgeCard', () => ({ BadgeCard: () => null }));

import { LevelUpModal } from '@/components/ui/modals/LevelUpModal';
import type { LevelDefinition, BadgeDefinition } from '@/lib/gamification';

const mockLevel: LevelDefinition = {
  level: 2,
  title: 'Saver',
  icon: 'leaf',
  color: '#4CAF50',
  minXP: 100,
  maxXP: 300,
};

const mockBadge: BadgeDefinition = {
  id: 'first-step',
  title: 'First Step',
  description: 'Completed your first task',
  icon: 'checkmark-circle',
  rarity: 'common',
  category: 'learning',
  condition: () => true,
};

describe('LevelUpModal — visible', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(
      <LevelUpModal
        visible={true}
        previousLevel={1}
        newLevel={2}
        levelDefinition={mockLevel}
        newBadges={[]}
        onClose={jest.fn()}
      />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('shows LEVEL UP! label', () => {
    const { getByText } = render(
      <LevelUpModal
        visible={true}
        previousLevel={1}
        newLevel={2}
        levelDefinition={mockLevel}
        newBadges={[]}
        onClose={jest.fn()}
      />
    );
    expect(getByText('LEVEL UP!')).toBeTruthy();
  });

  it('shows the new level number', () => {
    const { getByText } = render(
      <LevelUpModal
        visible={true}
        previousLevel={1}
        newLevel={2}
        levelDefinition={mockLevel}
        newBadges={[]}
        onClose={jest.fn()}
      />
    );
    expect(getByText('Level 2')).toBeTruthy();
  });

  it('shows the level title', () => {
    const { getByText } = render(
      <LevelUpModal
        visible={true}
        previousLevel={1}
        newLevel={2}
        levelDefinition={mockLevel}
        newBadges={[]}
        onClose={jest.fn()}
      />
    );
    expect(getByText('Saver')).toBeTruthy();
  });

  it('calls onClose when Awesome! is pressed', () => {
    const onClose = jest.fn();
    const { getByText } = render(
      <LevelUpModal
        visible={true}
        previousLevel={1}
        newLevel={2}
        levelDefinition={mockLevel}
        newBadges={[]}
        onClose={onClose}
      />
    );
    fireEvent.press(getByText('Awesome!'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows New Badges Unlocked section when newBadges is non-empty', () => {
    const { getByText } = render(
      <LevelUpModal
        visible={true}
        previousLevel={1}
        newLevel={2}
        levelDefinition={mockLevel}
        newBadges={[mockBadge]}
        onClose={jest.fn()}
      />
    );
    expect(getByText('New Badges Unlocked!')).toBeTruthy();
  });

  it('hides New Badges Unlocked section when newBadges is empty', () => {
    const { queryByText } = render(
      <LevelUpModal
        visible={true}
        previousLevel={1}
        newLevel={2}
        levelDefinition={mockLevel}
        newBadges={[]}
        onClose={jest.fn()}
      />
    );
    expect(queryByText('New Badges Unlocked!')).toBeNull();
  });
});

describe('LevelUpModal — not visible', () => {
  it('renders null when visible=false', () => {
    const { toJSON } = render(
      <LevelUpModal
        visible={false}
        previousLevel={1}
        newLevel={2}
        levelDefinition={mockLevel}
        newBadges={[]}
        onClose={jest.fn()}
      />
    );
    expect(toJSON()).toBeNull();
  });
});
