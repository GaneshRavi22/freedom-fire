import {
  calculateFreedomDays,
  getXPForAction,
  getLevelFromXP,
  getLevelProgress,
  checkNewBadgeUnlocks,
  getQuestExpiry,
  evaluateStreak,
  LEVEL_DEFINITIONS,
  BADGE_DEFINITIONS,
  QUEST_DEFINITIONS,
  type BadgeCheckSnapshot,
} from '@/lib/gamification';

// ── calculateFreedomDays ─────────────────────────────────────────────────────
describe('calculateFreedomDays', () => {
  it('returns 0 for zero amount', () => {
    expect(calculateFreedomDays(0, 600000)).toBe(0);
  });

  it('returns 0 for zero annual expenses', () => {
    expect(calculateFreedomDays(15000, 0)).toBe(0);
  });

  it('returns correct days for typical SIP', () => {
    // 15000 / (600000 / 365) = 15000 / 1643.8 ≈ 9.1
    const days = calculateFreedomDays(15000, 600000);
    expect(days).toBeGreaterThan(9);
    expect(days).toBeLessThan(10);
  });

  it('larger amount earns more days', () => {
    const low = calculateFreedomDays(5000, 600000);
    const high = calculateFreedomDays(50000, 600000);
    expect(high).toBeGreaterThan(low);
  });

  it('lower expenses yield more days per rupee', () => {
    const expensive = calculateFreedomDays(10000, 1200000);
    const lean = calculateFreedomDays(10000, 600000);
    expect(lean).toBeGreaterThan(expensive);
  });
});

// ── getXPForAction ───────────────────────────────────────────────────────────
describe('getXPForAction', () => {
  it('login gives 5 XP', () => expect(getXPForAction('login')).toBe(5));
  it('first_fire_calc gives 150 XP', () => expect(getXPForAction('first_fire_calc')).toBe(150));
  it('increase_sip gives 100 XP', () => expect(getXPForAction('increase_sip')).toBe(100));
  it('first_spend_analysis gives 75 XP', () => expect(getXPForAction('first_spend_analysis')).toBe(75));
  it('complete_quest gives 0 (quest defines its own XP)', () => expect(getXPForAction('complete_quest')).toBe(0));
  it('complete_task gives 0 (task defines its own xp_reward)', () => expect(getXPForAction('complete_task')).toBe(0));
});

// ── getLevelFromXP ───────────────────────────────────────────────────────────
describe('getLevelFromXP', () => {
  it('0 XP is level 1', () => {
    expect(getLevelFromXP(0).level).toBe(1);
    expect(getLevelFromXP(0).title).toBe('Budget Beginner');
  });

  it('level boundaries are correct', () => {
    // Level 1 covers 0 → minXP of level 2
    const level2 = LEVEL_DEFINITIONS[1]; // level 2
    expect(getLevelFromXP(level2.minXP).level).toBe(2);
    expect(getLevelFromXP(level2.minXP - 1).level).toBe(1);
  });

  it('returns level 50 for very high XP', () => {
    expect(getLevelFromXP(999999).level).toBe(50);
    expect(getLevelFromXP(999999).title).toBe('Financial Monk');
  });

  it('level 5 starts the Smart Saver tier', () => {
    const level5 = LEVEL_DEFINITIONS.find((l) => l.level === 5)!;
    expect(getLevelFromXP(level5.minXP).title).toBe('Smart Saver');
  });
});

// ── getLevelProgress ─────────────────────────────────────────────────────────
describe('getLevelProgress', () => {
  it('returns 0 at level start', () => {
    // Level 1 starts at 0
    expect(getLevelProgress(0)).toBe(0);
  });

  it('returns a value between 0 and 1 midway through a level', () => {
    const level1 = LEVEL_DEFINITIONS[0];
    const mid = (level1.minXP + level1.maxXP) / 2;
    const progress = getLevelProgress(mid);
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThanOrEqual(1);
  });

  it('does not exceed 1', () => {
    expect(getLevelProgress(999999)).toBeLessThanOrEqual(1);
  });
});

// ── LEVEL_DEFINITIONS sanity ─────────────────────────────────────────────────
describe('LEVEL_DEFINITIONS', () => {
  it('has exactly 50 levels', () => {
    expect(LEVEL_DEFINITIONS).toHaveLength(50);
  });

  it('levels are in ascending order', () => {
    for (let i = 1; i < LEVEL_DEFINITIONS.length; i++) {
      expect(LEVEL_DEFINITIONS[i].level).toBe(LEVEL_DEFINITIONS[i - 1].level + 1);
      expect(LEVEL_DEFINITIONS[i].minXP).toBeGreaterThan(LEVEL_DEFINITIONS[i - 1].minXP);
    }
  });

  it('each level minXP equals previous level maxXP', () => {
    for (let i = 1; i < LEVEL_DEFINITIONS.length; i++) {
      expect(LEVEL_DEFINITIONS[i].minXP).toBe(LEVEL_DEFINITIONS[i - 1].maxXP);
    }
  });

  it('level 50 has maxXP 999999', () => {
    const last = LEVEL_DEFINITIONS[49];
    expect(last.level).toBe(50);
    expect(last.maxXP).toBe(999999);
  });
});

// ── checkNewBadgeUnlocks ─────────────────────────────────────────────────────
describe('checkNewBadgeUnlocks', () => {
  const emptySnap: BadgeCheckSnapshot = {
    xp: 0,
    level: 1,
    totalFreedomDays: 0,
    unlockedBadgeIds: [],
    fireCalcSaved: false,
    spendAnalysisDone: false,
    savingsRate: null,
    streakCounts: {},
    questsCompleted: 0,
  };

  it('returns no badges for a fresh user', () => {
    expect(checkNewBadgeUnlocks(emptySnap)).toHaveLength(0);
  });

  it('unlocks first_steps when fireCalcSaved is true', () => {
    const snap = { ...emptySnap, fireCalcSaved: true };
    const unlocked = checkNewBadgeUnlocks(snap);
    expect(unlocked.map((b) => b.id)).toContain('first_steps');
  });

  it('unlocks spend_detective when spendAnalysisDone is true', () => {
    const snap = { ...emptySnap, spendAnalysisDone: true };
    const unlocked = checkNewBadgeUnlocks(snap);
    expect(unlocked.map((b) => b.id)).toContain('spend_detective');
  });

  it('does not re-unlock already unlocked badges', () => {
    const snap = { ...emptySnap, fireCalcSaved: true, unlockedBadgeIds: ['first_steps'] };
    const unlocked = checkNewBadgeUnlocks(snap);
    expect(unlocked.map((b) => b.id)).not.toContain('first_steps');
  });

  it('unlocks number_cruncher at 100 XP', () => {
    const snap = { ...emptySnap, xp: 100 };
    const unlocked = checkNewBadgeUnlocks(snap);
    expect(unlocked.map((b) => b.id)).toContain('number_cruncher');
  });

  it('unlocks savings_ace at 50% savings rate', () => {
    const snap = { ...emptySnap, savingsRate: 50 };
    const unlocked = checkNewBadgeUnlocks(snap);
    expect(unlocked.map((b) => b.id)).toContain('savings_ace');
  });

  it('unlocks streak_starter when any streak >= 3', () => {
    const snap = { ...emptySnap, streakCounts: { investment: 3 } };
    const unlocked = checkNewBadgeUnlocks(snap);
    expect(unlocked.map((b) => b.id)).toContain('streak_starter');
  });
});

// ── getQuestExpiry ───────────────────────────────────────────────────────────
describe('getQuestExpiry', () => {
  it('daily expiry is later than now', () => {
    const expiry = new Date(getQuestExpiry('daily'));
    expect(expiry.getTime()).toBeGreaterThan(Date.now());
  });

  it('weekly expiry is further than daily expiry', () => {
    const daily = new Date(getQuestExpiry('daily'));
    const weekly = new Date(getQuestExpiry('weekly'));
    expect(weekly.getTime()).toBeGreaterThan(daily.getTime());
  });

  it('daily expiry is within 24 hours', () => {
    const expiry = new Date(getQuestExpiry('daily'));
    const hoursAhead = (expiry.getTime() - Date.now()) / 3600000;
    expect(hoursAhead).toBeLessThanOrEqual(24);
  });
});

// ── evaluateStreak ───────────────────────────────────────────────────────────
describe('evaluateStreak', () => {
  function toISODate(daysAgo: number): string {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split('T')[0];
  }

  it('returns same_day when last activity is today', () => {
    expect(evaluateStreak(toISODate(0))).toBe('same_day');
  });

  it('returns increment when last activity was yesterday', () => {
    expect(evaluateStreak(toISODate(1))).toBe('increment');
  });

  it('returns reset when last activity was 2+ days ago', () => {
    expect(evaluateStreak(toISODate(2))).toBe('reset');
    expect(evaluateStreak(toISODate(10))).toBe('reset');
  });
});

// ── BADGE_DEFINITIONS sanity ─────────────────────────────────────────────────
describe('BADGE_DEFINITIONS', () => {
  it('has 12 badges', () => {
    expect(BADGE_DEFINITIONS).toHaveLength(12);
  });

  it('all badge IDs are unique', () => {
    const ids = BADGE_DEFINITIONS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── QUEST_DEFINITIONS sanity ─────────────────────────────────────────────────
describe('QUEST_DEFINITIONS', () => {
  it('has 5 quests', () => {
    expect(QUEST_DEFINITIONS).toHaveLength(5);
  });

  it('all quest IDs are unique', () => {
    const ids = QUEST_DEFINITIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('daily quests have targetCount 1', () => {
    const daily = QUEST_DEFINITIONS.filter((q) => q.frequency === 'daily');
    daily.forEach((q) => expect(q.targetCount).toBe(1));
  });
});
