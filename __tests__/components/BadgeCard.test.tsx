import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

import { BadgeCard } from '@/components/ui/cards/BadgeCard';
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

describe('BadgeCard — small (default)', () => {
  it('renders locked badge without crashing', () => {
    const { toJSON } = render(<BadgeCard badge={mockBadge} unlocked={false} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders unlocked badge without crashing', () => {
    const { toJSON } = render(<BadgeCard badge={mockBadge} unlocked={true} />);
    expect(toJSON()).toBeTruthy();
  });

  it('accepts a custom style prop', () => {
    const { toJSON } = render(<BadgeCard badge={mockBadge} unlocked={false} style={{ margin: 4 }} />);
    expect(toJSON()).toBeTruthy();
  });
});

describe('BadgeCard — large', () => {
  it('shows badge title in large mode', () => {
    const { getByText } = render(<BadgeCard badge={mockBadge} unlocked={true} size="large" />);
    expect(getByText('First Step')).toBeTruthy();
  });

  it('shows rarity label in large mode', () => {
    const { getByText } = render(<BadgeCard badge={mockBadge} unlocked={true} size="large" />);
    expect(getByText('Common')).toBeTruthy();
  });

  it('shows earned date when unlocked with earnedAt', () => {
    const { getByText } = render(
      <BadgeCard badge={mockBadge} unlocked={true} size="large" earnedAt="2026-01-15T00:00:00Z" />
    );
    // Date formatted as "15 Jan '26" or similar
    expect(getByText(/Jan/)).toBeTruthy();
  });

  it('does not show earned date when locked', () => {
    const { queryByText } = render(
      <BadgeCard badge={mockBadge} unlocked={false} size="large" earnedAt="2026-01-15T00:00:00Z" />
    );
    expect(queryByText(/Jan/)).toBeNull();
  });

  it('renders rare badge with correct rarity label', () => {
    const rareBadge: BadgeDefinition = { ...mockBadge, id: 'rare-badge', rarity: 'rare' };
    const { getByText } = render(<BadgeCard badge={rareBadge} unlocked={true} size="large" />);
    expect(getByText('Rare')).toBeTruthy();
  });
});
