import React from 'react';
import { TouchableOpacity } from 'react-native';
import { render, act, fireEvent } from '@testing-library/react-native';

// ── Expo / navigation mocks ───────────────────────────────────────────────────
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useFocusEffect: (cb: () => void) => { cb(); },
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

// ── Component mocks ───────────────────────────────────────────────────────────
jest.mock('@/components/ui/cards/Card', () => {
  const { View } = require('react-native');
  return { Card: ({ children, ...props }: any) => <View {...props}>{children}</View> };
});
jest.mock('@/components/ui/gamification/ProgressRing', () => ({ ProgressRing: () => null }));
jest.mock('@/components/ui/gamification/MilestoneBar', () => ({ MilestoneBar: () => null }));
jest.mock('@/components/ui/cards/FreedomDaysCard', () => ({ FreedomDaysCard: () => null }));
jest.mock('@/components/ui/cards/QuestCard', () => ({ QuestCard: () => null }));
jest.mock('@/components/ui/gamification/RewardToast', () => ({ RewardToast: () => null }));
jest.mock('@/components/ui/modals/LevelUpModal', () => ({ LevelUpModal: () => null }));

// ── Store mocks ───────────────────────────────────────────────────────────────
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('@/stores/auth.store', () => ({ useAuthStore: jest.fn() }));
jest.mock('@/stores/fire.store', () => ({ useFireStore: jest.fn() }));
jest.mock('@/stores/spend.store', () => ({ useSpendStore: jest.fn() }));
jest.mock('@/stores/gamification.store', () => ({ useGamificationStore: jest.fn() }));
jest.mock('@/lib/gamification', () => ({ QUEST_DEFINITIONS: {} }));

jest.mock('@/services/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import { useAuthStore } from '@/stores/auth.store';
import { useFireStore } from '@/stores/fire.store';
import { useSpendStore } from '@/stores/spend.store';
import { useGamificationStore } from '@/stores/gamification.store';
import { supabase } from '@/services/supabase';
import HomeScreen from '@/app/(tabs)/index';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const INSIGHT = {
  id: 'insight-1',
  category: 'spending' as const,
  message: 'Your food delivery spend is 30% above average.',
  action_id: null,
};

const INSIGHT_WITH_ACTION = {
  id: 'insight-2',
  category: 'fire_progress' as const,
  message: 'You are 65% of the way to your FIRE corpus!',
  action_id: 'task-uuid-123',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function setupStoreMocks() {
  (useAuthStore as unknown as jest.Mock).mockReturnValue({
    user: { id: 'user-1' },
    profile: { name: 'Ganesh' },
    fetchProfile: jest.fn().mockResolvedValue(undefined),
  });
  (useFireStore as unknown as jest.Mock).mockReturnValue({
    calculation: null,
    fetchCalculation: jest.fn().mockResolvedValue(undefined),
  });
  (useSpendStore as unknown as jest.Mock).mockReturnValue({
    analysis: null,
    fetchAnalysis: jest.fn().mockResolvedValue(undefined),
  });
  (useGamificationStore as unknown as jest.Mock).mockReturnValue({
    xp: 500,
    level: 3,
    totalFreedomDays: 45,
    unlockedBadges: [],
    quests: [],
    pendingRewards: [],
    fetchAll: jest.fn().mockResolvedValue(undefined),
    checkAndAwardLoginXP: jest.fn().mockResolvedValue(undefined),
    consumeReward: jest.fn(),
  });
}

/** Build a complete mock for supabase.from that controls what ai_insights returns. */
function setupSupabaseMock(insights: any[] = [], updateMock = jest.fn().mockReturnValue({
  eq: jest.fn().mockResolvedValue({ data: null, error: null }),
})) {
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    if (table === 'ai_insights') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({ data: insights, error: null }),
              }),
            }),
          }),
        }),
        update: updateMock,
      };
    }
    // Default for all other tables
    return {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      update: jest.fn().mockReturnThis(),
    };
  });
  return { updateMock };
}

beforeEach(() => {
  jest.clearAllMocks();
  setupStoreMocks();
  setupSupabaseMock();
});

// ── AI Insights rendering ─────────────────────────────────────────────────────

describe('HomeScreen — AI Insights section', () => {
  it('does not show "AI INSIGHTS" heading when no insights returned', async () => {
    setupSupabaseMock([]);
    const { queryByText } = render(<HomeScreen />);
    await act(async () => {});
    expect(queryByText('AI INSIGHTS')).toBeNull();
  });

  it('shows "AI INSIGHTS" heading when insights are available', async () => {
    setupSupabaseMock([INSIGHT]);
    const { findByText } = render(<HomeScreen />);
    expect(await findByText('AI INSIGHTS')).toBeTruthy();
  });

  it('renders insight message text', async () => {
    setupSupabaseMock([INSIGHT]);
    const { findByText } = render(<HomeScreen />);
    expect(await findByText(INSIGHT.message)).toBeTruthy();
  });

  it('renders multiple insight messages', async () => {
    setupSupabaseMock([INSIGHT, INSIGHT_WITH_ACTION]);
    const { findByText } = render(<HomeScreen />);
    expect(await findByText(INSIGHT.message)).toBeTruthy();
    expect(await findByText(INSIGHT_WITH_ACTION.message)).toBeTruthy();
  });

  it('shows "View Task →" link when insight has action_id', async () => {
    setupSupabaseMock([INSIGHT_WITH_ACTION]);
    const { findByText } = render(<HomeScreen />);
    expect(await findByText('View Task →')).toBeTruthy();
  });

  it('does not show "View Task →" when insight has no action_id', async () => {
    setupSupabaseMock([INSIGHT]);
    const { queryByText, findByText } = render(<HomeScreen />);
    await findByText(INSIGHT.message);
    expect(queryByText('View Task →')).toBeNull();
  });

  it('does not show AI INSIGHTS section when query returns null data', async () => {
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'ai_insights') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                order: jest.fn().mockReturnValue({
                  limit: jest.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
          update: jest.fn().mockReturnThis(),
        };
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        update: jest.fn().mockReturnThis(),
      };
    });

    const { queryByText } = render(<HomeScreen />);
    await act(async () => {});
    expect(queryByText('AI INSIGHTS')).toBeNull();
  });

  it('queries ai_insights limited to 3 rows', async () => {
    let capturedLimit: number | undefined;
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'ai_insights') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                order: jest.fn().mockReturnValue({
                  limit: jest.fn().mockImplementation((n: number) => {
                    capturedLimit = n;
                    return Promise.resolve({ data: [], error: null });
                  }),
                }),
              }),
            }),
          }),
          update: jest.fn().mockReturnThis(),
        };
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        update: jest.fn().mockReturnThis(),
      };
    });

    render(<HomeScreen />);
    await act(async () => {});
    expect(supabase.from).toHaveBeenCalledWith('ai_insights');
    expect(capturedLimit).toBe(3);
  });
});

// ── AI Insights dismiss ───────────────────────────────────────────────────────

describe('HomeScreen — dismiss insight', () => {
  it('removes the insight from the UI immediately (optimistic update)', async () => {
    setupSupabaseMock([INSIGHT]);
    const { findByText, queryByText, UNSAFE_getAllByType } = render(<HomeScreen />);
    await findByText(INSIGHT.message);

    const dismissBtn = UNSAFE_getAllByType(TouchableOpacity).find((t) => t.props.hitSlop);

    await act(async () => {
      if (dismissBtn) fireEvent.press(dismissBtn);
    });

    expect(queryByText(INSIGHT.message)).toBeNull();
  });

  it('calls supabase update with dismissed: true on dismiss', async () => {
    const { updateMock } = setupSupabaseMock([INSIGHT]);
    const { findByText, UNSAFE_getAllByType } = render(<HomeScreen />);
    await findByText(INSIGHT.message);

    const dismissBtn = UNSAFE_getAllByType(TouchableOpacity).find((t) => t.props.hitSlop);

    await act(async () => {
      if (dismissBtn) fireEvent.press(dismissBtn);
    });

    expect(updateMock).toHaveBeenCalledWith({ dismissed: true });
  });

  it('passes the correct insight id to the update eq call', async () => {
    let capturedId: string | undefined;
    const updateMock = jest.fn().mockReturnValue({
      eq: jest.fn().mockImplementation((col: string, val: string) => {
        if (col === 'id') capturedId = val;
        return Promise.resolve({ data: null, error: null });
      }),
    });
    setupSupabaseMock([INSIGHT], updateMock);
    const { findByText, UNSAFE_getAllByType } = render(<HomeScreen />);
    await findByText(INSIGHT.message);

    const dismissBtn = UNSAFE_getAllByType(TouchableOpacity).find((t) => t.props.hitSlop);
    await act(async () => {
      if (dismissBtn) fireEvent.press(dismissBtn);
    });

    expect(capturedId).toBe(INSIGHT.id);
  });

  it('still removes insight from UI even when supabase update returns an error', async () => {
    // Supabase returns errors as resolved values with an error object (not rejections).
    // The component fires-and-forgets the update call, so a DB error must not crash it.
    const updateMock = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ data: null, error: { message: 'network error', code: '500' } }),
    });
    setupSupabaseMock([INSIGHT], updateMock);
    const { findByText, queryByText, UNSAFE_getAllByType } = render(<HomeScreen />);
    await findByText(INSIGHT.message);

    const dismissBtn = UNSAFE_getAllByType(TouchableOpacity).find((t) => t.props.hitSlop);

    await act(async () => {
      if (dismissBtn) fireEvent.press(dismissBtn);
    });

    // Optimistic removal happened regardless of the DB error
    expect(queryByText(INSIGHT.message)).toBeNull();
    expect(updateMock).toHaveBeenCalledWith({ dismissed: true });
  });
});
