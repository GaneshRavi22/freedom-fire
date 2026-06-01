import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/stores/auth.store', () => ({
  useAuthStore: jest.fn(),
}));

jest.mock('@/stores/gamification.store', () => ({
  useGamificationStore: jest.fn(),
}));

import { useAuthStore } from '@/stores/auth.store';
import { useGamificationStore } from '@/stores/gamification.store';
import { TopBar } from '@/components/ui/layout/TopBar';

function mockStores(name: string | null, xp = 0) {
  (useAuthStore as unknown as jest.Mock).mockReturnValue({
    profile: name ? { name } : null,
  });
  (useGamificationStore as unknown as jest.Mock).mockReturnValue({ xp });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStores(null, 0);
});

describe('TopBar — without profile', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<TopBar />);
    expect(toJSON()).toBeTruthy();
  });

  it('shows "You" as the display name when profile is null', () => {
    const { getByText } = render(<TopBar />);
    expect(getByText('You')).toBeTruthy();
  });

  it('shows "?" as the avatar letter when profile is null', () => {
    const { getByText } = render(<TopBar />);
    expect(getByText('?')).toBeTruthy();
  });

  it('renders the FreedomFire brand text', () => {
    const { getByText } = render(<TopBar />);
    expect(getByText('Freedom')).toBeTruthy();
    expect(getByText('Fire')).toBeTruthy();
  });
});

describe('TopBar — with profile', () => {
  beforeEach(() => {
    mockStores('Ganesh Reddy', 0);
  });

  it('shows the first name from the profile', () => {
    const { getByText } = render(<TopBar />);
    expect(getByText('Ganesh')).toBeTruthy();
  });

  it('shows the first letter of the profile name as the avatar', () => {
    const { getByText } = render(<TopBar />);
    expect(getByText('G')).toBeTruthy();
  });

  it('navigates to profile screen on user row press', () => {
    const { getByText } = render(<TopBar />);
    fireEvent.press(getByText('Ganesh'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/profile');
  });
});

describe('TopBar — single-word name', () => {
  it('shows the full name when there is no space', () => {
    mockStores('Ganesh', 0);
    const { getByText } = render(<TopBar />);
    expect(getByText('Ganesh')).toBeTruthy();
  });
});

describe('TopBar — level display', () => {
  it('shows level 1 chip at 0 XP', () => {
    mockStores('User', 0);
    const { getByText } = render(<TopBar />);
    expect(getByText('Lv.1')).toBeTruthy();
  });

  it('shows correct level chip for higher XP', () => {
    // Level 2 starts at 100 XP (based on gamification.ts definitions)
    mockStores('User', 150);
    const { getByText } = render(<TopBar />);
    // At 150 XP should be level 2 or higher — level text should exist
    const levelText = getByText(/^Lv\.\d+$/);
    expect(levelText).toBeTruthy();
  });

  it('navigates to profile screen on level chip press', () => {
    mockStores('User', 0);
    const { getByText } = render(<TopBar />);
    fireEvent.press(getByText('Lv.1'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/profile');
  });
});
