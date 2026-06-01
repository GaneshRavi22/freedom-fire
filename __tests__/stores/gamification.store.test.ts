import { act } from '@testing-library/react-native';
import { useGamificationStore } from '@/stores/gamification.store';

jest.mock('@/services/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from '@/services/supabase';

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeChain(data: unknown = null, error: unknown = null) {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data, error }),
    insert: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockResolvedValue({ data, error }),
    throwOnError: jest.fn().mockResolvedValue({ data, error }),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
  };
  return chain;
}

function toISODate(daysAgo: number): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo));
  return d.toISOString().split('T')[0];
}

beforeEach(() => {
  useGamificationStore.setState({
    xp: 0,
    level: 1,
    totalFreedomDays: 0,
    unlockedBadges: [],
    streaks: [],
    quests: [],
    loading: false,
    pendingRewards: [],
  });
  jest.clearAllMocks();
});

// ── fetchAll ─────────────────────────────────────────────────────────────────
describe('fetchAll', () => {
  it('loads XP, level and freedom days from DB', async () => {
    const gamRow = { xp: 200, level: 2, total_freedom_days: 15 };
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: gamRow, error: null }),
      upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await act(async () => {
      await useGamificationStore.getState().fetchAll('user-1');
    });

    const state = useGamificationStore.getState();
    expect(state.xp).toBe(200);
    expect(state.level).toBe(2);
    expect(state.totalFreedomDays).toBe(15);
    expect(state.loading).toBe(false);
  });

  it('handles missing gamification row gracefully', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await act(async () => {
      await useGamificationStore.getState().fetchAll('user-1');
    });

    const state = useGamificationStore.getState();
    expect(state.xp).toBe(0);
    expect(state.loading).toBe(false);
  });
});

// ── awardXP ───────────────────────────────────────────────────────────────────
describe('awardXP', () => {
  beforeEach(() => {
    const chain = makeChain();
    (supabase.from as jest.Mock).mockReturnValue(chain);
  });

  it('increments XP in state', async () => {
    let reward: Awaited<ReturnType<ReturnType<typeof useGamificationStore.getState>['awardXP']>>;
    await act(async () => {
      reward = await useGamificationStore.getState().awardXP('user-1', 'login');
    });
    expect(useGamificationStore.getState().xp).toBe(5);
    expect(reward!.xpEarned).toBe(5);
  });

  it('awards correct XP for first_fire_calc', async () => {
    await act(async () => {
      await useGamificationStore.getState().awardXP('user-1', 'first_fire_calc');
    });
    expect(useGamificationStore.getState().xp).toBe(150);
  });

  it('detects level-up', async () => {
    // Pre-set XP just below level 2 threshold
    const level2 = 10 * 4 + 40 * 2; // level 2 minXP = 10*4+80 = 120
    useGamificationStore.setState({ xp: level2 - 5 });

    let reward: Awaited<ReturnType<ReturnType<typeof useGamificationStore.getState>['awardXP']>>;
    await act(async () => {
      reward = await useGamificationStore.getState().awardXP('user-1', 'first_fire_calc');
    });
    expect(reward!.leveledUp).toBe(true);
    expect(reward!.newLevel).toBeGreaterThan(reward!.previousLevel);
  });

  it('adds freedom days to total', async () => {
    await act(async () => {
      await useGamificationStore.getState().awardXP('user-1', 'update_fire_calc', {
        freedomDaysEarned: 9.1,
      });
    });
    expect(useGamificationStore.getState().totalFreedomDays).toBeCloseTo(9.1);
  });

  it('unlocks first_steps badge when fireCalcSaved is true', async () => {
    await act(async () => {
      await useGamificationStore.getState().awardXP('user-1', 'first_fire_calc', {
        snapshot: { fireCalcSaved: true },
      });
    });
    const { unlockedBadges, pendingRewards } = useGamificationStore.getState();
    expect(unlockedBadges.map((b) => b.badge_id)).toContain('first_steps');
    expect(pendingRewards[0].newBadges.map((b) => b.id)).toContain('first_steps');
  });

  it('does not re-unlock already unlocked badges', async () => {
    useGamificationStore.setState({
      unlockedBadges: [{ id: '1', user_id: 'user-1', badge_id: 'first_steps', unlocked_at: '' }],
    });
    await act(async () => {
      await useGamificationStore.getState().awardXP('user-1', 'first_fire_calc', {
        snapshot: { fireCalcSaved: true },
      });
    });
    const newBadges = useGamificationStore.getState().pendingRewards[0].newBadges;
    expect(newBadges.map((b) => b.id)).not.toContain('first_steps');
  });

  it('pushes reward to pendingRewards', async () => {
    await act(async () => {
      await useGamificationStore.getState().awardXP('user-1', 'login');
    });
    expect(useGamificationStore.getState().pendingRewards).toHaveLength(1);
  });
});

// ── consumeReward ─────────────────────────────────────────────────────────────
describe('consumeReward', () => {
  it('removes first pending reward', async () => {
    const chain = makeChain();
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await act(async () => {
      await useGamificationStore.getState().awardXP('user-1', 'login');
      await useGamificationStore.getState().awardXP('user-1', 'login');
    });
    expect(useGamificationStore.getState().pendingRewards).toHaveLength(2);

    useGamificationStore.getState().consumeReward();
    expect(useGamificationStore.getState().pendingRewards).toHaveLength(1);
  });
});

// ── updateStreak ──────────────────────────────────────────────────────────────
describe('updateStreak', () => {
  beforeEach(() => {
    const chain = makeChain();
    (supabase.from as jest.Mock).mockReturnValue(chain);
  });

  it('starts a new streak at 1', async () => {
    let count: number;
    await act(async () => {
      count = await useGamificationStore.getState().updateStreak('user-1', 'investment');
    });
    expect(count!).toBe(1);
    expect(useGamificationStore.getState().streaks[0].current_count).toBe(1);
  });

  it('increments streak for yesterday activity', async () => {
    useGamificationStore.setState({
      streaks: [
        { streak_type: 'investment', current_count: 3, longest_count: 3, last_activity: toISODate(1) },
      ],
    });
    let count: number;
    await act(async () => {
      count = await useGamificationStore.getState().updateStreak('user-1', 'investment');
    });
    expect(count!).toBe(4);
  });

  it('resets streak when more than 1 day gap', async () => {
    useGamificationStore.setState({
      streaks: [
        { streak_type: 'investment', current_count: 5, longest_count: 5, last_activity: toISODate(3) },
      ],
    });
    let count: number;
    await act(async () => {
      count = await useGamificationStore.getState().updateStreak('user-1', 'investment');
    });
    expect(count!).toBe(1);
  });

  it('returns current count without change for same-day activity', async () => {
    useGamificationStore.setState({
      streaks: [
        { streak_type: 'investment', current_count: 4, longest_count: 4, last_activity: toISODate(0) },
      ],
    });
    let count: number;
    await act(async () => {
      count = await useGamificationStore.getState().updateStreak('user-1', 'investment');
    });
    expect(count!).toBe(4);
  });

  it('tracks longest streak correctly', async () => {
    useGamificationStore.setState({
      streaks: [
        { streak_type: 'tracking', current_count: 7, longest_count: 10, last_activity: toISODate(1) },
      ],
    });
    await act(async () => {
      await useGamificationStore.getState().updateStreak('user-1', 'tracking');
    });
    const streak = useGamificationStore.getState().streaks.find((s) => s.streak_type === 'tracking')!;
    expect(streak.current_count).toBe(8);
    expect(streak.longest_count).toBe(10); // longest unchanged since 8 < 10
  });
});

// ── progressQuest ─────────────────────────────────────────────────────────────
describe('progressQuest', () => {
  beforeEach(() => {
    const chain = makeChain();
    (supabase.from as jest.Mock).mockReturnValue(chain);
    useGamificationStore.setState({
      quests: [
        {
          quest_id: 'weekly_fire_update',
          progress: 0,
          target: 1,
          completed: false,
          expires_at: new Date(Date.now() + 86400000 * 7).toISOString(),
        },
      ],
    });
  });

  it('marks quest complete when progress hits target', async () => {
    let result: Awaited<ReturnType<ReturnType<typeof useGamificationStore.getState>['progressQuest']>>;
    await act(async () => {
      result = await useGamificationStore.getState().progressQuest('user-1', 'weekly_fire_update');
    });
    expect(result!.completed).toBe(true);
    expect(result!.xpEarned).toBe(25);
    const q = useGamificationStore.getState().quests.find((q) => q.quest_id === 'weekly_fire_update')!;
    expect(q.completed).toBe(true);
  });

  it('does not progress a completed quest', async () => {
    useGamificationStore.setState({
      quests: [
        {
          quest_id: 'weekly_fire_update',
          progress: 1,
          target: 1,
          completed: true,
          expires_at: null,
        },
      ],
    });
    let result: Awaited<ReturnType<ReturnType<typeof useGamificationStore.getState>['progressQuest']>>;
    await act(async () => {
      result = await useGamificationStore.getState().progressQuest('user-1', 'weekly_fire_update');
    });
    expect(result!.completed).toBe(false);
    expect(result!.xpEarned).toBe(0);
  });
});

// ── awardTaskXP ───────────────────────────────────────────────────────────────
describe('awardTaskXP', () => {
  beforeEach(() => {
    const chain = makeChain();
    (supabase.from as jest.Mock).mockReturnValue(chain);
  });

  it('increments XP by the exact amount provided', async () => {
    await act(async () => {
      await useGamificationStore.getState().awardTaskXP('user-1', 75);
    });
    expect(useGamificationStore.getState().xp).toBe(75);
  });

  it('returns a reward with xpEarned equal to the provided amount', async () => {
    let reward: Awaited<ReturnType<ReturnType<typeof useGamificationStore.getState>['awardTaskXP']>>;
    await act(async () => {
      reward = await useGamificationStore.getState().awardTaskXP('user-1', 150);
    });
    expect(reward!.xpEarned).toBe(150);
  });

  it('pushes reward to pendingRewards', async () => {
    await act(async () => {
      await useGamificationStore.getState().awardTaskXP('user-1', 50);
    });
    expect(useGamificationStore.getState().pendingRewards).toHaveLength(1);
  });

  it('detects level-up when XP crosses a level boundary', async () => {
    // Level 2 starts at 120 XP; pre-set to 110 and award 100 to cross boundary
    useGamificationStore.setState({ xp: 110 });

    let reward: Awaited<ReturnType<ReturnType<typeof useGamificationStore.getState>['awardTaskXP']>>;
    await act(async () => {
      reward = await useGamificationStore.getState().awardTaskXP('user-1', 100);
    });

    expect(reward!.leveledUp).toBe(true);
    expect(reward!.newLevel).toBeGreaterThan(reward!.previousLevel);
  });

  it('does not level up when XP stays within current level', async () => {
    useGamificationStore.setState({ xp: 0 });

    let reward: Awaited<ReturnType<ReturnType<typeof useGamificationStore.getState>['awardTaskXP']>>;
    await act(async () => {
      reward = await useGamificationStore.getState().awardTaskXP('user-1', 5);
    });

    expect(reward!.leveledUp).toBe(false);
  });

  it('unlocks number_cruncher badge when XP crosses 100', async () => {
    useGamificationStore.setState({ xp: 90 });

    await act(async () => {
      await useGamificationStore.getState().awardTaskXP('user-1', 75);
    });

    const { unlockedBadges } = useGamificationStore.getState();
    expect(unlockedBadges.map((b) => b.badge_id)).toContain('number_cruncher');
  });

  it('does not re-unlock already unlocked badges', async () => {
    useGamificationStore.setState({
      xp: 90,
      unlockedBadges: [{ id: '1', user_id: 'user-1', badge_id: 'number_cruncher', unlocked_at: '' }],
    });

    await act(async () => {
      await useGamificationStore.getState().awardTaskXP('user-1', 75);
    });

    const badgeIds = useGamificationStore.getState().unlockedBadges.map((b) => b.badge_id);
    const count = badgeIds.filter((id) => id === 'number_cruncher').length;
    expect(count).toBe(1);
  });

  it('accumulates XP across multiple calls', async () => {
    await act(async () => {
      await useGamificationStore.getState().awardTaskXP('user-1', 75);
      await useGamificationStore.getState().awardTaskXP('user-1', 100);
    });
    expect(useGamificationStore.getState().xp).toBe(175);
  });

  it('adds freedom days when context.freedomDaysEarned is provided', async () => {
    await act(async () => {
      await useGamificationStore.getState().awardTaskXP('user-1', 50, { freedomDaysEarned: 5 });
    });
    expect(useGamificationStore.getState().totalFreedomDays).toBeCloseTo(5);
  });
});

// ── checkAndAwardLoginXP ──────────────────────────────────────────────────────

describe('checkAndAwardLoginXP', () => {
  beforeEach(() => {
    const chain = makeChain();
    (supabase.from as jest.Mock).mockReturnValue(chain);
  });

  it('does not award XP when already logged in today', async () => {
    const today = new Date().toISOString().split('T')[0];
    useGamificationStore.setState({ lastLoginDate: today });

    await act(async () => {
      await useGamificationStore.getState().checkAndAwardLoginXP('user-1');
    });

    expect(useGamificationStore.getState().xp).toBe(0);
  });

  it('awards login XP and updates lastLoginDate when not yet logged in today', async () => {
    useGamificationStore.setState({ lastLoginDate: '2020-01-01' });

    await act(async () => {
      await useGamificationStore.getState().checkAndAwardLoginXP('user-1');
    });

    const today = new Date().toISOString().split('T')[0];
    expect(useGamificationStore.getState().lastLoginDate).toBe(today);
    expect(useGamificationStore.getState().xp).toBeGreaterThan(0);
  });
});

// ── updateStreak — multiple streaks ──────────────────────────────────────────

describe('updateStreak — non-matching streak passed through unchanged', () => {
  beforeEach(() => {
    const chain = makeChain();
    (supabase.from as jest.Mock).mockReturnValue(chain);
  });

  it('leaves other streak types unmodified when updating one', async () => {
    useGamificationStore.setState({
      streaks: [
        { streak_type: 'investment', current_count: 3, longest_count: 3, last_activity: toISODate(1) },
        { streak_type: 'tracking', current_count: 7, longest_count: 7, last_activity: toISODate(1) },
      ],
    });

    await act(async () => {
      await useGamificationStore.getState().updateStreak('user-1', 'investment');
    });

    const tracking = useGamificationStore.getState().streaks.find((s) => s.streak_type === 'tracking');
    expect(tracking?.current_count).toBe(7);
  });
});

// ── progressQuest — additional branch coverage ────────────────────────────────

describe('progressQuest — branch coverage', () => {
  beforeEach(() => {
    const chain = makeChain();
    (supabase.from as jest.Mock).mockReturnValue(chain);
  });

  it('does not award XP when increment is 0 (progress added but quest not completed)', async () => {
    useGamificationStore.setState({
      quests: [
        {
          quest_id: 'weekly_fire_update',
          progress: 0,
          target: 1,
          completed: false,
          expires_at: new Date(Date.now() + 86400000 * 7).toISOString(),
        },
      ],
    });

    let result: { completed: boolean; xpEarned: number };
    await act(async () => {
      result = await useGamificationStore.getState().progressQuest('user-1', 'weekly_fire_update', 0);
    });

    expect(result!.completed).toBe(false);
    expect(result!.xpEarned).toBe(0);
  });

  it('creates a new quest entry when quest does not exist in state yet', async () => {
    // No quests in state; quest exists in QUEST_DEFINITIONS → appends new entry
    await act(async () => {
      await useGamificationStore.getState().progressQuest('user-1', 'weekly_fire_update');
    });

    const q = useGamificationStore.getState().quests.find((q) => q.quest_id === 'weekly_fire_update');
    expect(q).toBeDefined();
    expect(q?.completed).toBe(true);
  });

  it('passes non-matching quests through map unchanged', async () => {
    const futureDate = new Date(Date.now() + 86400000 * 7).toISOString();
    useGamificationStore.setState({
      quests: [
        { quest_id: 'weekly_fire_update', progress: 0, target: 1, completed: false, expires_at: futureDate },
        { quest_id: 'log_expense', progress: 0, target: 1, completed: false, expires_at: futureDate },
      ],
    });

    await act(async () => {
      await useGamificationStore.getState().progressQuest('user-1', 'weekly_fire_update');
    });

    const other = useGamificationStore.getState().quests.find((q) => q.quest_id === 'log_expense');
    expect(other?.completed).toBe(false);
    expect(other?.progress).toBe(0);
  });
});

// ── seedQuests — branch coverage ──────────────────────────────────────────────

describe('seedQuests — skips quests that already exist and are valid', () => {
  beforeEach(() => {
    const chain = makeChain();
    (supabase.from as jest.Mock).mockReturnValue(chain);
  });

  it('does not upsert when all quests exist with a future expiry', async () => {
    const { QUEST_DEFINITIONS } = jest.requireActual('@/lib/gamification') as { QUEST_DEFINITIONS: Array<{ id: string; targetCount: number }> };
    const futureDate = new Date(Date.now() + 86400000 * 7).toISOString();

    useGamificationStore.setState({
      quests: QUEST_DEFINITIONS.map((def) => ({
        quest_id: def.id,
        progress: 0,
        target: def.targetCount,
        completed: false,
        expires_at: futureDate,
      })),
    });

    const upsertSpy = (supabase.from as jest.Mock)().upsert as jest.Mock;
    upsertSpy.mockClear();

    await act(async () => {
      await useGamificationStore.getState().seedQuests('user-1');
    });

    expect(upsertSpy).not.toHaveBeenCalled();
  });
});
