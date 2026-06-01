import { create } from 'zustand';
import { supabase } from '@/services/supabase';
import { buildTaskSeeds, TASK_DEFINITIONS, type TaskStatus, type TaskType, type UserTask } from '@/lib/tasks';
import type { FireRecord } from '@/stores/fire.store';

interface SpendAnalysisSeed {
  avg_monthly_spend: number;
  category_breakdown: Record<string, number>;
}

interface TasksState {
  tasks: UserTask[];
  loading: boolean;
  seenRecommendedIds: string[];

  fetchTasks: (userId: string) => Promise<void>;
  markRecommendedSeen: (ids: string[]) => void;
  seedInsightTasks: (
    userId: string,
    analysis: SpendAnalysisSeed | null,
    calculation: FireRecord | null
  ) => Promise<void>;
  updateLoanTasksFromFire: (userId: string, calculation: FireRecord) => Promise<void>;
  acceptTask: (userId: string, taskId: string, targetDate: string) => Promise<void>;
  cancelTask: (userId: string, taskId: string, revertToRecommended: boolean) => Promise<void>;
  completeTask: (userId: string, taskId: string) => Promise<number>;
}

export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: [],
  loading: false,
  seenRecommendedIds: [],

  fetchTasks: async (userId) => {
    set({ loading: true });
    try {
      const { data } = await supabase
        .from('user_tasks')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      set({ tasks: (data ?? []) as UserTask[] });
    } finally {
      set({ loading: false });
    }
  },

  markRecommendedSeen: (ids) => {
    set((s) => ({
      seenRecommendedIds: Array.from(new Set([...s.seenRecommendedIds, ...ids])),
    }));
  },

  seedInsightTasks: async (userId, analysis, calculation) => {
    // Try AI-generated tasks first; fall back to hardcoded seeds on failure
    try {
      const { data, error } = await supabase.functions.invoke('generate-tasks', {
        body: { userId },
      });
      if (!error && data?.tasks?.length > 0) {
        set({ tasks: data.tasks as UserTask[] });
        return;
      }
    } catch {
      // fall through to hardcoded seeds
    }

    // Fallback: hardcoded v1 seed logic
    const seeds = buildTaskSeeds(analysis, calculation);
    if (seeds.length === 0) return;

    const blockedTypes = new Set(
      get().tasks
        .filter((t) => t.status === 'recommended' || t.status === 'accepted' || t.status === 'done')
        .map((t) => t.task_type)
    );
    const toInsert = seeds.filter((s) => !blockedTypes.has(s.task_type));
    if (toInsert.length === 0) return;

    try {
      const rows = toInsert.map((s) => ({
        user_id: userId,
        task_type: s.task_type,
        title: TASK_DEFINITIONS[s.task_type].title,
        description: s.description,
        metadata: s.metadata,
        xp_reward: s.xp_reward,
        status: 'recommended',
      }));
      await supabase
        .from('user_tasks')
        .upsert(rows, { onConflict: 'user_id,task_type' });
    } catch {
      // non-fatal
    }

    // Always fresh SELECT regardless of path taken
    try {
      const { data: freshTasks } = await supabase
        .from('user_tasks')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (freshTasks) {
        set({ tasks: freshTasks as UserTask[] });
      }
    } catch {
      // non-fatal
    }
  },

  updateLoanTasksFromFire: async (userId, calculation) => {
    const seeds = buildTaskSeeds(null, calculation);
    const loanTypes = new Set<TaskType>(['prepay_loan', 'reduce_loan_tenure']);
    const loanSeeds = seeds.filter((s) => loanTypes.has(s.task_type));
    if (loanSeeds.length === 0) return;

    const currentTasks = get().tasks;
    const updates: Array<{ id: string; description: string; metadata: Record<string, any> }> = [];

    for (const seed of loanSeeds) {
      const existing = currentTasks.find(
        (t) => t.task_type === seed.task_type && (t.status === 'recommended' || t.status === 'accepted')
      );
      if (!existing) continue;
      updates.push({ id: existing.id, description: seed.description, metadata: seed.metadata });
    }

    if (updates.length === 0) return;

    set((s) => ({
      tasks: s.tasks.map((t) => {
        const u = updates.find((upd) => upd.id === t.id);
        return u ? { ...t, description: u.description, metadata: u.metadata } : t;
      }),
    }));

    try {
      await Promise.all(
        updates.map((u) =>
          supabase
            .from('user_tasks')
            .update({ description: u.description, metadata: u.metadata, updated_at: new Date().toISOString() })
            .eq('id', u.id)
            .eq('user_id', userId)
        )
      );
    } catch {
      // non-fatal
    }
  },

  acceptTask: async (userId, taskId, targetDate) => {
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId
          ? { ...t, status: 'accepted' as TaskStatus, target_completion_date: targetDate }
          : t
      ),
    }));
    try {
      await supabase
        .from('user_tasks')
        .update({ status: 'accepted', target_completion_date: targetDate, updated_at: new Date().toISOString() })
        .eq('id', taskId)
        .eq('user_id', userId);
    } catch {
      // non-fatal
    }
  },

  cancelTask: async (userId, taskId, revertToRecommended) => {
    const newStatus: TaskStatus = revertToRecommended ? 'recommended' : 'canceled';
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId
          ? { ...t, status: newStatus, target_completion_date: revertToRecommended ? null : t.target_completion_date }
          : t
      ),
    }));
    try {
      await supabase
        .from('user_tasks')
        .update({
          status: newStatus,
          ...(revertToRecommended ? { target_completion_date: null } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId)
        .eq('user_id', userId);
    } catch {
      // non-fatal
    }
  },

  completeTask: async (userId, taskId) => {
    const task = get().tasks.find((t) => t.id === taskId);
    const xpReward = task?.xp_reward ?? 50;

    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId ? { ...t, status: 'done' as TaskStatus } : t
      ),
    }));
    try {
      await supabase
        .from('user_tasks')
        .update({ status: 'done', updated_at: new Date().toISOString() })
        .eq('id', taskId)
        .eq('user_id', userId);
    } catch {
      // non-fatal
    }

    return xpReward;
  },
}));
