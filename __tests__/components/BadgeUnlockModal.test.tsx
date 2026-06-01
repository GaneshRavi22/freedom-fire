import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/components/ui/gamification/ConfettiBurst', () => ({ ConfettiBurst: () => null }));
jest.mock('@/components/ui/cards/BadgeCard', () => ({ BadgeCard: () => null }));

import { BadgeUnlockModal } from '@/components/ui/modals/BadgeUnlockModal';
import type { BadgeDefinition } from '@/lib/gamification';

const mockBadge: BadgeDefinition = {
  id: 'first-step',
  title: 'First Step',
  description: 'Completed your first task',
  icon: 'checkmark-circle',
  rarity: 'common',
  category: 'learning',
  condition: () => true,
};

const mockBadge2: BadgeDefinition = {
  id: 'saver',
  title: 'Super Saver',
  description: 'Saved 10%',
  icon: 'wallet',
  rarity: 'rare',
  category: 'savings',
  condition: () => true,
};

describe('BadgeUnlockModal — single badge', () => {
  it('renders without crashing when visible', () => {
    const { toJSON } = render(
      <BadgeUnlockModal visible={true} newBadges={[mockBadge]} onClose={jest.fn()} />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders null when not visible', () => {
    const { toJSON } = render(
      <BadgeUnlockModal visible={false} newBadges={[mockBadge]} onClose={jest.fn()} />
    );
    expect(toJSON()).toBeNull();
  });

  it('shows BADGE UNLOCKED! for a single badge', () => {
    const { getByText } = render(
      <BadgeUnlockModal visible={true} newBadges={[mockBadge]} onClose={jest.fn()} />
    );
    expect(getByText('BADGE UNLOCKED!')).toBeTruthy();
  });

  it('shows the badge title in single badge message', () => {
    const { getByText } = render(
      <BadgeUnlockModal visible={true} newBadges={[mockBadge]} onClose={jest.fn()} />
    );
    expect(getByText(/"First Step"/)).toBeTruthy();
  });

  it('calls onClose when Let\'s Go! is pressed', () => {
    const onClose = jest.fn();
    const { getByText } = render(
      <BadgeUnlockModal visible={true} newBadges={[mockBadge]} onClose={onClose} />
    );
    fireEvent.press(getByText("Let's Go!"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('BadgeUnlockModal — multiple badges', () => {
  it('shows count when multiple badges unlocked', () => {
    const { getByText } = render(
      <BadgeUnlockModal visible={true} newBadges={[mockBadge, mockBadge2]} onClose={jest.fn()} />
    );
    expect(getByText('2 BADGES UNLOCKED!')).toBeTruthy();
  });

  it('shows momentum message for multiple badges', () => {
    const { getByText } = render(
      <BadgeUnlockModal visible={true} newBadges={[mockBadge, mockBadge2]} onClose={jest.fn()} />
    );
    expect(getByText(/momentum/)).toBeTruthy();
  });
});
