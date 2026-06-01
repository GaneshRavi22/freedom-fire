import { create } from 'zustand';
import { supabase } from '@/services/supabase';
import {
  calculateFreedomDays as calcFD,
  checkNewBadgeUnlocks,
  evaluateStreak,
  getLevelFromXP,
  getQuestExpiry,
  getXPForAction,
  QUEST_DEFINITIONS,
  type BadgeCheckSnapshot,
  type BadgeDefinition,
  type GamificationAction,
  type QuestDefinition,
  type RewardEvent,
  type StreakRecord,
  type StreakType,
  type UserBadge,
  type UserGamification,
  type UserQuest,
} from '@/lib/gamification';

interface GamificationState {
  // ── Persisted ─────────────────────────────────────────────────────────────
  xp: number;
  level: number;
  totalFreedomDays: number;
  unlockedBadges: UserBadge[];
  streaks: StreakRecord[];
  quests: UserQuest[];
  lastLoginDate: string | null;

  // ── Transient UI state ─────────────────────────────────────────────────────
  loading: boolean;
  /** Queued reward events consumed by screens (toast / level-up modal). */
  pendingRewards: RewardEvent[];

  // ── Actions ───────────────────────────────────────────────────────────────
  fetchAll: (userId: string) => Promise<void>;
  /** Awards login XP at most once per calendar day, using the DB date so it
   *  works correctly across devices and after reinstalls. */
  checkAndAwardLoginXP: (userId: string) => Promise<void>;
  awardXP: (
    userId: string,
    action: GamificationAction,
    context?: {
      freedomDaysEarned?: number;
      snapshot?: Partial<BadgeCheckSnapshot>;
    }
  ) => Promise<RewardEvent>;
  awardTaskXP: (
    userId: string,
    xpAmount: number,
    context?: { freedomDaysEarned?: number; snapshot?: Partial<BadgeCheckSnapshot> }
  ) => Promise<RewardEvent>;
  updateStreak: (userId: string, streakType: StreakType) => Promise<number>;
  progressQuest: (
    userId: string,
    questId: string,
    increment?: number
  ) => Promise<{ completed: boolean; xpEarned: number }>;
  consumeReward: () => void;
  seedQuests: (userId: string) => Promise<void>;
}

export const useGamificationStore = create<GamificationState>((set, get) => ({
  xp: 0,
  level: 1,
  totalFreedomDays: 0,
  unlockedBadges: [],
  streaks: [],
  quests: [],
  lastLoginDate: null,
  loading: false,
  pendingRewards: [],

  // ── fetchAll ──────────────────────────────────────────────────────────────
  fetchAll: async (userId) => {
    set({ loading: true });
    try {
      const [gamRow, badgesRow, streaksRow, questsRow] = await Promise.all([
        supabase.from('user_gamification').select('*').eq('user_id', userId).single(),
        supabase.from('user_badges').select('*').eq('user_id', userId),
        supabase.from('user_streaks').select('*').eq('user_id', userId),
        supabase.from('user_quests').select('*').eq('user_id', userId),
      ]);

      const gam = gamRow.data as UserGamification | null;
      const badges = (badgesRow.data ?? []) as UserBadge[];
      const streaks = (streaksRow.data ?? []) as StreakRecord[];
      const quests = (questsRow.data ?? []) as UserQuest[];

      set({
        xp: gam?.xp ?? 0,
        level: gam?.level ?? 1,
        totalFreedomDays: gam?.total_freedom_days ?? 0,
        lastLoginDate: gam?.last_login_date ?? null,
        unlockedBadges: badges,
        streaks,
        quests,
        loading: false,
      });

      // Seed quests if not present or all expired
      await get().seedQuests(userId);
    } catch {
      set({ loading: false });
    }
  },

  // ── checkAndAwardLoginXP ──────────────────────────────────────────────────
  checkAndAwardLoginXP: async (userId) => {
    const today = new Date().toISOString().split('T')[0];
    if (get().lastLoginDate === today) return;
    // Write to DB first so a race on two devices in the same second still only
    // awards once (the second upsert is a no-op since the date won't change).
    try {
      await supabase.from('user_gamification').upsert(
        { user_id: userId, last_login_date: today, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
    } catch {
      // non-fatal
    }
    set({ lastLoginDate: today });
    await get().awardXP(userId, 'login');
  },

  // ── awardXP ───────────────────────────────────────────────────────────────
  awardXP: async (userId, action, context = {}) => {
    const { freedomDaysEarned = 0, snapshot = {} } = context;
    const state = get();
    const xpGain = getXPForAction(action);
    const newXP = state.xp + xpGain;
    const newFD = state.totalFreedomDays + freedomDaysEarned;

    const previousLevelDef = getLevelFromXP(state.xp);
    const newLevelDef = getLevelFromXP(newXP);
    const leveledUp = newLevelDef.level > previousLevelDef.level;

    const fullSnap: BadgeCheckSnapshot = {
      xp: newXP,
      level: newLevelDef.level,
      totalFreedomDays: newFD,
      unlockedBadgeIds: state.unlockedBadges.map((b) => b.badge_id),
      fireCalcSaved: snapshot.fireCalcSaved ?? false,
      spendAnalysisDone: snapshot.spendAnalysisDone ?? false,
      savingsRate: snapshot.savingsRate ?? null,
      streakCounts: Object.fromEntries(state.streaks.map((s) => [s.streak_type, s.current_count])),
      questsCompleted: state.quests.filter((q) => q.completed).length,
      ...snapshot,
    };

    const newBadges = checkNewBadgeUnlocks(fullSnap);

    // Persist to Supabase (fire and forget — errors don't block UI)
    try {
      await supabase.from('user_gamification').upsert(
        {
          user_id: userId,
          xp: newXP,
          level: newLevelDef.level,
          total_freedom_days: newFD,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

      for (const badge of newBadges) {
        await supabase
          .from('user_badges')
          .insert({ user_id: userId, badge_id: badge.id })
          .throwOnError();
      }
    } catch {
      // DB failure is non-fatal — state is already updated locally
    }

    const newBadgeRows: UserBadge[] = newBadges.map((b) => ({
      id: '',
      user_id: userId,
      badge_id: b.id,
      unlocked_at: new Date().toISOString(),
    }));

    const reward: RewardEvent = {
      xpEarned: xpGain,
      freedomDaysEarned,
      newBadges,
      leveledUp,
      previousLevel: previousLevelDef.level,
      newLevel: newLevelDef.level,
      levelDefinition: newLevelDef,
    };

    set((s) => ({
      xp: newXP,
      level: newLevelDef.level,
      totalFreedomDays: newFD,
      unlockedBadges: [...s.unlockedBadges, ...newBadgeRows],
      pendingRewards: [...s.pendingRewards, reward],
    }));

    return reward;
  },

  // ── awardTaskXP ───────────────────────────────────────────────────────────
  awardTaskXP: async (userId, xpAmount, context = {}) => {
    const { freedomDaysEarned = 0, snapshot = {} } = context;
    const state = get();
    const newXP = state.xp + xpAmount;
    const newFD = state.totalFreedomDays + freedomDaysEarned;

    const previousLevelDef = getLevelFromXP(state.xp);
    const newLevelDef = getLevelFromXP(newXP);
    const leveledUp = newLevelDef.level > previousLevelDef.level;

    const fullSnap: BadgeCheckSnapshot = {
      xp: newXP,
      level: newLevelDef.level,
      totalFreedomDays: newFD,
      unlockedBadgeIds: state.unlockedBadges.map((b) => b.badge_id),
      fireCalcSaved: false,
      spendAnalysisDone: false,
      savingsRate: null,
      streakCounts: Object.fromEntries(state.streaks.map((s) => [s.streak_type, s.current_count])),
      questsCompleted: state.quests.filter((q) => q.completed).length,
      ...snapshot,
    };

    const newBadges = checkNewBadgeUnlocks(fullSnap);

    try {
      await supabase.from('user_gamification').upsert(
        { user_id: userId, xp: newXP, level: newLevelDef.level, total_freedom_days: newFD, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
      for (const badge of newBadges) {
        await supabase.from('user_badges').insert({ user_id: userId, badge_id: badge.id }).throwOnError();
      }
    } catch {
      // non-fatal
    }

    const newBadgeRows: UserBadge[] = newBadges.map((b) => ({
      id: '',
      user_id: userId,
      badge_id: b.id,
      unlocked_at: new Date().toISOString(),
    }));

    const reward: RewardEvent = {
      xpEarned: xpAmount,
      freedomDaysEarned,
      newBadges,
      leveledUp,
      previousLevel: previousLevelDef.level,
      newLevel: newLevelDef.level,
      levelDefinition: newLevelDef,
    };

    set((s) => ({
      xp: newXP,
      level: newLevelDef.level,
      totalFreedomDays: newFD,
      unlockedBadges: [...s.unlockedBadges, ...newBadgeRows],
      pendingRewards: [...s.pendingRewards, reward],
    }));

    return reward;
  },

  // ── updateStreak ──────────────────────────────────────────────────────────
  updateStreak: async (userId, streakType) => {
    const existing = get().streaks.find((s) => s.streak_type === streakType);
    const result = existing ? evaluateStreak(existing.last_activity) : 'increment';

    if (result === 'same_day') return existing?.current_count ?? 0;

    const newCount = result === 'increment' ? (existing?.current_count ?? 0) + 1 : 1;
    const longest = Math.max(newCount, existing?.longest_count ?? 0);
    const today = new Date().toISOString().split('T')[0];

    try {
      await supabase.from('user_streaks').upsert(
        {
          user_id: userId,
          streak_type: streakType,
          current_count: newCount,
          longest_count: longest,
          last_activity: today,
        },
        { onConflict: 'user_id,streak_type' }
      );
    } catch {
      // non-fatal
    }

    set((s) => ({
      streaks: s.streaks.some((sr) => sr.streak_type === streakType)
        ? s.streaks.map((sr) =>
            sr.streak_type === streakType
              ? { ...sr, current_count: newCount, longest_count: longest, last_activity: today }
              : sr
          )
        : [
            ...s.streaks,
            { streak_type: streakType, current_count: newCount, longest_count: longest, last_activity: today },
          ],
    }));

    return newCount;
  },

  // ── progressQuest ─────────────────────────────────────────────────────────
  progressQuest: async (userId, questId, increment = 1) => {
    const state = get();
    const questDef = QUEST_DEFINITIONS.find((q) => q.id === questId);
    const existing = state.quests.find((q) => q.quest_id === questId);

    if (!questDef || existing?.completed) return { completed: false, xpEarned: 0 };

    // Re-seed if expired
    if (existing?.expires_at && new Date(existing.expires_at) < new Date()) {
      await get().seedQuests(userId);
      return get().progressQuest(userId, questId, increment);
    }

    const newProgress = Math.min((existing?.progress ?? 0) + increment, questDef.targetCount);
    const completed = newProgress >= questDef.targetCount;
    const xpEarned = completed ? questDef.xpReward : 0;

    try {
      await supabase
        .from('user_quests')
        .upsert(
          {
            user_id: userId,
            quest_id: questId,
            progress: newProgress,
            target: questDef.targetCount,
            completed,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,quest_id' }
        );
    } catch {
      // non-fatal
    }

    set((s) => ({
      quests: s.quests.some((q) => q.quest_id === questId)
        ? s.quests.map((q) =>
            q.quest_id === questId ? { ...q, progress: newProgress, completed } : q
          )
        : [
            ...s.quests,
            {
              quest_id: questId,
              progress: newProgress,
              target: questDef.targetCount,
              completed,
              expires_at: existing?.expires_at ?? null,
            },
          ],
    }));

    if (completed && xpEarned > 0) {
      await get().awardXP(userId, 'complete_quest', {});
      // Award the quest's own XP on top (manual add since 'complete_quest' gives 0)
      set((s) => ({ xp: s.xp + xpEarned }));
      try {
        const currentXP = get().xp;
        const newLevel = getLevelFromXP(currentXP).level;
        await supabase.from('user_gamification').upsert(
          { user_id: userId, xp: currentXP, level: newLevel, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        );
      } catch {
        // non-fatal
      }
    }

    return { completed, xpEarned };
  },

  // ── consumeReward ─────────────────────────────────────────────────────────
  consumeReward: () => {
    set((s) => ({ pendingRewards: s.pendingRewards.slice(1) }));
  },

  // ── seedQuests ────────────────────────────────────────────────────────────
  seedQuests: async (userId) => {
    const state = get();
    const now = new Date();

    for (const def of QUEST_DEFINITIONS) {
      const existing = state.quests.find((q) => q.quest_id === def.id);
      const isExpired = existing?.expires_at ? new Date(existing.expires_at) < now : false;

      if (!existing || isExpired) {
        const expires_at = getQuestExpiry(def.frequency);
        try {
          await supabase.from('user_quests').upsert(
            {
              user_id: userId,
              quest_id: def.id,
              progress: 0,
              target: def.targetCount,
              completed: false,
              expires_at,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,quest_id' }
          );
        } catch {
          // non-fatal
        }

        set((s) => {
          const filtered = s.quests.filter((q) => q.quest_id !== def.id);
          return {
            quests: [
              ...filtered,
              { quest_id: def.id, progress: 0, target: def.targetCount, completed: false, expires_at },
            ],
          };
        });
      }
    }
  },
}));
