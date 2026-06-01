import React from 'react';
import { render, act } from '@testing-library/react-native';

// ── Mock useFocusEffect so we can invoke the callback manually ────────────────
// Bug 2 regression: the screen used useEffect([user]) which only fired once.
// The fix replaces it with useFocusEffect, which fires on every navigation focus.
// Capturing the callback lets us simulate multiple focus events in tests.
let capturedFocusCallback: (() => void) | null = null;

jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => {
    capturedFocusCallback = cb;
  },
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/components/ui/cards/TaskCard', () => ({ TaskCard: () => null }));
jest.mock('@/components/ui/modals/TaskCompleteModal', () => ({ TaskCompleteModal: () => null }));
jest.mock('@/lib/tasks', () => ({
  addMonths: jest.fn().mockReturnValue('2027-06-01'),
  formatTargetDate: jest.fn().mockReturnValue('1 Jun 2027'),
  TARGET_DATE_PRESETS: [
    { label: '1 Month', months: 1 },
    { label: '3 Months', months: 3 },
    { label: '6 Months', months: 6 },
    { label: '1 Year', months: 12 },
  ],
}));

const mockFetchTasks = jest.fn();
const mockAwardTaskXP = jest.fn();

jest.mock('@/stores/auth.store', () => ({ useAuthStore: jest.fn() }));
jest.mock('@/stores/tasks.store', () => ({ useTasksStore: jest.fn() }));
jest.mock('@/stores/gamification.store', () => ({ useGamificationStore: jest.fn() }));
jest.mock('@/stores/fire.store', () => ({ useFireStore: jest.fn() }));

import { useAuthStore } from '@/stores/auth.store';
import { useTasksStore } from '@/stores/tasks.store';
import { useGamificationStore } from '@/stores/gamification.store';
import { useFireStore } from '@/stores/fire.store';
import TasksScreen from '@/app/(tabs)/tasks';

function setupMocks({ user = { id: 'user-1' } as { id: string } | null } = {}) {
  (useAuthStore as unknown as jest.Mock).mockReturnValue({ user });
  (useTasksStore as unknown as jest.Mock).mockReturnValue({
    tasks: [],
    loading: false,
    fetchTasks: mockFetchTasks,
    acceptTask: jest.fn(),
    cancelTask: jest.fn(),
    completeTask: jest.fn(),
    markRecommendedSeen: jest.fn(),
  });
  (useGamificationStore as unknown as jest.Mock).mockReturnValue({
    awardTaskXP: mockAwardTaskXP,
  });
  (useFireStore as unknown as jest.Mock).mockReturnValue({ calculation: null });
}

beforeEach(() => {
  capturedFocusCallback = null;
  jest.clearAllMocks();
  setupMocks();
});

// ── Bug 2 regression: Tasks tab must re-fetch on every focus ──────────────────
// Old code: useEffect([user]) fired once after mount and never again.
// Fix: useFocusEffect fires the callback on every navigation focus event.
describe('TasksScreen — useFocusEffect re-fetch (Bug 2 regression)', () => {
  it('registers a useFocusEffect callback on mount', () => {
    render(<TasksScreen />);
    expect(capturedFocusCallback).not.toBeNull();
  });

  it('calls fetchTasks with the user id when focus callback fires', async () => {
    render(<TasksScreen />);

    await act(async () => {
      capturedFocusCallback!();
    });

    expect(mockFetchTasks).toHaveBeenCalledWith('user-1');
  });

  it('re-fetches every time focus is gained, not just once', async () => {
    render(<TasksScreen />);

    // Simulate navigating away and back three times
    await act(async () => { capturedFocusCallback!(); });
    await act(async () => { capturedFocusCallback!(); });
    await act(async () => { capturedFocusCallback!(); });

    expect(mockFetchTasks).toHaveBeenCalledTimes(3);
  });

  it('does not call fetchTasks when user is null', async () => {
    setupMocks({ user: null });
    render(<TasksScreen />);

    await act(async () => {
      capturedFocusCallback!();
    });

    expect(mockFetchTasks).not.toHaveBeenCalled();
  });
});
