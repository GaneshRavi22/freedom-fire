// ── Action types ─────────────────────────────────────────────────────────────
export type GamificationAction =
  | 'login'
  | 'track_expenses'
  | 'weekly_review'
  | 'update_fire_calc'
  | 'increase_sip'
  | 'first_fire_calc'
  | 'first_spend_analysis'
  | 'complete_quest'
  | 'complete_task';

// ── Streak ───────────────────────────────────────────────────────────────────
export type StreakType = 'investment' | 'tracking' | 'review';

export interface StreakRecord {
  streak_type: StreakType;
  current_count: number;
  longest_count: number;
  last_activity: string; // ISO date string YYYY-MM-DD
}

// ── Levels ───────────────────────────────────────────────────────────────────
export interface LevelDefinition {
  level: number;
  title: string;
  minXP: number;
  maxXP: number;
  color: string;
  icon: string;
}

// ── Badges ───────────────────────────────────────────────────────────────────
export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type BadgeCategory = 'savings' | 'investing' | 'consistency' | 'learning';

export interface BadgeCheckSnapshot {
  xp: number;
  level: number;
  totalFreedomDays: number;
  unlockedBadgeIds: string[];
  fireCalcSaved: boolean;
  spendAnalysisDone: boolean;
  savingsRate: number | null;
  streakCounts: Record<string, number>;
  questsCompleted: number;
}

export interface BadgeDefinition {
  id: string;
  title: string;
  description: string;
  icon: string;
  rarity: BadgeRarity;
  category: BadgeCategory;
  condition: (snap: BadgeCheckSnapshot) => boolean;
}

// ── Quests ───────────────────────────────────────────────────────────────────
export type QuestFrequency = 'daily' | 'weekly';

export interface QuestDefinition {
  id: string;
  title: string;
  description: string;
  frequency: QuestFrequency;
  targetCount: number;
  xpReward: number;
  icon: string;
}

export interface UserQuest {
  quest_id: string;
  progress: number;
  target: number;
  completed: boolean;
  expires_at: string | null;
}

// ── DB rows ──────────────────────────────────────────────────────────────────
export interface UserGamification {
  id: string;
  user_id: string;
  xp: number;
  level: number;
  total_freedom_days: number;
  last_login_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserBadge {
  id: string;
  user_id: string;
  badge_id: string;
  unlocked_at: string;
}

// ── Reward event (returned to UI for toasts / modals) ────────────────────────
export interface RewardEvent {
  xpEarned: number;
  freedomDaysEarned: number;
  newBadges: BadgeDefinition[];
  leveledUp: boolean;
  previousLevel: number;
  newLevel: number;
  levelDefinition: LevelDefinition;
}

// ─────────────────────────────────────────────────────────────────────────────
// LEVEL DEFINITIONS (50 levels)
// XP curve: minXP[n] ≈ 10n² + 40n  (quadratic for satisfying early progress)
// ─────────────────────────────────────────────────────────────────────────────
function buildLevels(): LevelDefinition[] {
  const tiers: Array<{ minLevel: number; maxLevel: number; title: string; color: string; icon: string }> = [
    { minLevel: 1,  maxLevel: 4,  title: 'Budget Beginner',    color: '#A0A3BD', icon: 'wallet-outline' },
    { minLevel: 5,  maxLevel: 9,  title: 'Smart Saver',        color: '#43D9AD', icon: 'cash-outline' },
    { minLevel: 10, maxLevel: 19, title: 'Wealth Builder',     color: '#6C63FF', icon: 'stats-chart-outline' },
    { minLevel: 20, maxLevel: 34, title: 'FIRE Explorer',      color: '#FFB547', icon: 'compass-outline' },
    { minLevel: 35, maxLevel: 49, title: 'Freedom Strategist', color: '#FF6584', icon: 'shield-checkmark-outline' },
    { minLevel: 50, maxLevel: 50, title: 'Financial Monk',     color: '#FFD700', icon: 'medal-outline' },
  ];

  const levels: LevelDefinition[] = [];
  for (let n = 1; n <= 50; n++) {
    const minXP = n === 1 ? 0 : 10 * n * n + 40 * n;
    const nextMinXP = 10 * (n + 1) * (n + 1) + 40 * (n + 1);
    const maxXP = n === 50 ? 999999 : nextMinXP;
    const tier = tiers.find((t) => n >= t.minLevel && n <= t.maxLevel)!;
    levels.push({ level: n, title: tier.title, minXP, maxXP, color: tier.color, icon: tier.icon });
  }
  return levels;
}

export const LEVEL_DEFINITIONS: LevelDefinition[] = buildLevels();

// ─────────────────────────────────────────────────────────────────────────────
// BADGE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────
export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    id: 'first_steps',
    title: 'First Steps',
    description: 'Completed your first FIRE calculation',
    icon: 'flag-outline',
    rarity: 'common',
    category: 'learning',
    condition: (s) => s.fireCalcSaved,
  },
  {
    id: 'number_cruncher',
    title: 'Number Cruncher',
    description: 'Reached 100 XP',
    icon: 'calculator-outline',
    rarity: 'common',
    category: 'learning',
    condition: (s) => s.xp >= 100,
  },
  {
    id: 'spend_detective',
    title: 'Spend Detective',
    description: 'Analyzed your spending for the first time',
    icon: 'search-outline',
    rarity: 'common',
    category: 'learning',
    condition: (s) => s.spendAnalysisDone,
  },
  {
    id: 'sip_warrior',
    title: 'SIP Warrior',
    description: 'Earned at least 5 Freedom Days from investments',
    icon: 'trending-up-outline',
    rarity: 'common',
    category: 'investing',
    condition: (s) => s.totalFreedomDays >= 5,
  },
  {
    id: 'fire_explorer',
    title: 'FIRE Explorer',
    description: 'Reached Level 5',
    icon: 'compass-outline',
    rarity: 'rare',
    category: 'investing',
    condition: (s) => s.level >= 5,
  },
  {
    id: 'compounding_champion',
    title: 'Compounding Champion',
    description: 'Accumulated 100 Freedom Days',
    icon: 'bar-chart-outline',
    rarity: 'rare',
    category: 'investing',
    condition: (s) => s.totalFreedomDays >= 100,
  },
  {
    id: 'savings_ace',
    title: 'Savings Ace',
    description: 'Achieved a savings rate above 50%',
    icon: 'diamond-outline',
    rarity: 'rare',
    category: 'savings',
    condition: (s) => (s.savingsRate ?? 0) >= 50,
  },
  {
    id: 'streak_starter',
    title: 'Streak Starter',
    description: 'Maintained any streak for 3 weeks',
    icon: 'flash-outline',
    rarity: 'common',
    category: 'consistency',
    condition: (s) => Object.values(s.streakCounts).some((c) => c >= 3),
  },
  {
    id: 'streak_master',
    title: 'Streak Master',
    description: 'Maintained any streak for 8 weeks',
    icon: 'flash',
    rarity: 'rare',
    category: 'consistency',
    condition: (s) => Object.values(s.streakCounts).some((c) => c >= 8),
  },
  {
    id: 'freedom_seeker',
    title: 'Freedom Seeker',
    description: 'Earned 365 Freedom Days — a full free year',
    icon: 'sunny-outline',
    rarity: 'epic',
    category: 'investing',
    condition: (s) => s.totalFreedomDays >= 365,
  },
  {
    id: 'quest_completionist',
    title: 'Completionist',
    description: 'Completed 10 quests',
    icon: 'checkmark-done-outline',
    rarity: 'rare',
    category: 'consistency',
    condition: (s) => s.questsCompleted >= 10,
  },
  {
    id: 'financial_monk',
    title: 'Financial Monk',
    description: 'Reached Level 50',
    icon: 'medal-outline',
    rarity: 'legendary',
    category: 'savings',
    condition: (s) => s.level >= 50,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// QUEST DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────
export const QUEST_DEFINITIONS: QuestDefinition[] = [
  {
    id: 'daily_login',
    title: 'Morning Check-in',
    description: 'Open the app today',
    frequency: 'daily',
    targetCount: 1,
    xpReward: 5,
    icon: 'sunny-outline',
  },
  {
    id: 'daily_dashboard',
    title: 'Dashboard Review',
    description: 'Review your FIRE progress',
    frequency: 'daily',
    targetCount: 1,
    xpReward: 5,
    icon: 'eye-outline',
  },
  {
    id: 'weekly_fire_update',
    title: 'FIRE Tune-up',
    description: 'Update your FIRE calculation',
    frequency: 'weekly',
    targetCount: 1,
    xpReward: 25,
    icon: 'flame-outline',
  },
  {
    id: 'weekly_spend_review',
    title: 'Spend Audit',
    description: 'Review or upload your spending analysis',
    frequency: 'weekly',
    targetCount: 1,
    xpReward: 25,
    icon: 'card-outline',
  },
  {
    id: 'weekly_increase_sip',
    title: 'Level Up Your SIP',
    description: 'Increase your monthly savings in FIRE calc',
    frequency: 'weekly',
    targetCount: 1,
    xpReward: 100,
    icon: 'trending-up-outline',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// PURE ENGINE FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

const XP_TABLE: Record<GamificationAction, number> = {
  login: 5,
  track_expenses: 10,
  weekly_review: 25,
  update_fire_calc: 50,
  increase_sip: 100,
  first_fire_calc: 150,
  first_spend_analysis: 75,
  complete_quest: 0, // quest defines its own xpReward
  complete_task: 0,  // task defines its own xp_reward
};

/**
 * How many days of financial freedom does this amount represent?
 * Formula: amount / (annual_expenses / 365)
 */
export function calculateFreedomDays(amount: number, annualExpenses: number): number {
  if (annualExpenses <= 0 || amount <= 0) return 0;
  return parseFloat((amount / (annualExpenses / 365)).toFixed(1));
}

export function getXPForAction(action: GamificationAction): number {
  return XP_TABLE[action] ?? 0;
}

/**
 * Finds the LevelDefinition whose [minXP, maxXP) range contains xp.
 * Scans linearly — array has 50 entries, fast enough.
 */
export function getLevelFromXP(xp: number): LevelDefinition {
  let result = LEVEL_DEFINITIONS[0];
  for (const def of LEVEL_DEFINITIONS) {
    if (xp >= def.minXP) {
      result = def;
    } else {
      break;
    }
  }
  return result;
}

/** Progress within the current level as a 0–1 fraction, for the XP bar fill. */
export function getLevelProgress(xp: number): number {
  const current = getLevelFromXP(xp);
  const range = current.maxXP - current.minXP;
  if (range <= 0) return 1;
  return Math.min((xp - current.minXP) / range, 1);
}

/** Returns only badges that are newly unlockable (not already in unlockedBadgeIds). */
export function checkNewBadgeUnlocks(snap: BadgeCheckSnapshot): BadgeDefinition[] {
  return BADGE_DEFINITIONS.filter(
    (b) => !snap.unlockedBadgeIds.includes(b.id) && b.condition(snap)
  );
}

/**
 * Returns an ISO timestamp for when a quest of this frequency expires.
 * Daily: tonight at 23:59:59.999
 * Weekly: next Sunday at 23:59:59.999
 */
export function getQuestExpiry(frequency: QuestFrequency): string {
  const now = new Date();
  if (frequency === 'daily') {
    const midnight = new Date(now);
    midnight.setHours(23, 59, 59, 999);
    return midnight.toISOString();
  }
  const sunday = new Date(now);
  const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
  sunday.setDate(now.getDate() + daysUntilSunday);
  sunday.setHours(23, 59, 59, 999);
  return sunday.toISOString();
}

/**
 * Given the last_activity date string (YYYY-MM-DD), determine if today should
 * increment the streak, reset it, or is the same day (no change).
 */
export function evaluateStreak(lastActivity: string): 'increment' | 'reset' | 'same_day' {
  // YYYY-MM-DD strings are parsed as midnight UTC by spec; compare against UTC today
  const lastMs = Date.parse(lastActivity);
  const now = new Date();
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diffDays = Math.round((todayMs - lastMs) / 86400000);
  if (diffDays === 0) return 'same_day';
  if (diffDays === 1) return 'increment';
  return 'reset';
}

/** Rarity display label */
export const RARITY_LABELS: Record<BadgeRarity, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

/** Rarity border color */
export const RARITY_COLORS: Record<BadgeRarity, string> = {
  common: '#2E2C4E',
  rare: '#6C63FF',
  epic: '#FF6584',
  legendary: '#FFD700',
};

/** Human-readable streak type labels */
export const STREAK_LABELS: Record<StreakType, string> = {
  investment: 'Investment',
  tracking: 'Spending',
  review: 'Review',
};
