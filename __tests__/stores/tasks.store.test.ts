import { act } from '@testing-library/react-native';
import { useTasksStore } from '@/stores/tasks.store';
import type { UserTask } from '@/lib/tasks';

jest.mock('@/services/supabase', () => ({
  supabase: {
    from: jest.fn(),
    functions: {
      // Default: returns an error so existing fallback-path tests are unaffected.
      invoke: jest.fn().mockResolvedValue({ data: null, error: new Error('not configured in this test') }),
    },
  },
}));

import { supabase } from '@/services/supabase';

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeSelectChain(data: unknown = null, error: unknown = null) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data, error }),
    then: undefined,
    // resolves directly for await on the chain itself
    [Symbol.iterator]: undefined,
  };
}

function makeUpdateChain() {
  return {
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    select: jest.fn().mockResolvedValue({ data: null, error: null }),
  };
}

function makeUpsertChain(data: unknown = null) {
  return {
    upsert: jest.fn().mockReturnThis(),
    select: jest.fn().mockResolvedValue({ data, error: null }),
  };
}

function makeTask(overrides: Partial<UserTask> = {}): UserTask {
  return {
    id: 'task-1',
    user_id: 'user-1',
    task_type: 'reduce_fast_commerce',
    title: 'Cut Delivery & Quick Commerce by 30%',
    description: 'Save some money',
    metadata: {},
    status: 'recommended',
    target_completion_date: null,
    xp_reward: 75,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const ANALYSIS = {
  avg_monthly_spend: 52000,
  category_breakdown: { food: 14000, shopping: 12000, entertainment: 4000 },
};

const CALCULATION = { monthly_emi: 30000, loan_tenure_years: 20 };

beforeEach(() => {
  useTasksStore.setState({ tasks: [], loading: false });
  jest.clearAllMocks();
});

// ── fetchTasks ────────────────────────────────────────────────────────────────
describe('fetchTasks', () => {
  it('loads tasks from DB and sets state', async () => {
    const tasks = [makeTask(), makeTask({ id: 'task-2', task_type: 'cancel_subscriptions' })];
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: tasks, error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await act(async () => {
      await useTasksStore.getState().fetchTasks('user-1');
    });

    expect(supabase.from).toHaveBeenCalledWith('user_tasks');
    expect(useTasksStore.getState().tasks).toHaveLength(2);
    expect(useTasksStore.getState().loading).toBe(false);
  });

  it('sets loading to false even when DB returns null', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await act(async () => {
      await useTasksStore.getState().fetchTasks('user-1');
    });

    expect(useTasksStore.getState().tasks).toHaveLength(0);
    expect(useTasksStore.getState().loading).toBe(false);
  });

  it('sets loading to false on DB error', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockRejectedValue(new Error('DB error')),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    // fetchTasks has finally{} but no catch, so error propagates — handle it here
    try {
      await act(async () => {
        await useTasksStore.getState().fetchTasks('user-1');
      });
    } catch {
      // expected
    }

    expect(useTasksStore.getState().loading).toBe(false);
  });

  it('orders tasks by created_at descending', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await act(async () => {
      await useTasksStore.getState().fetchTasks('user-1');
    });

    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });
});

// ── seedInsightTasks ──────────────────────────────────────────────────────────
//
// The implementation makes exactly TWO supabase.from('user_tasks') calls:
//   1. upsert  — writes/updates rows; does NOT use ignoreDuplicates so canceled
//                tasks get reset to 'recommended' on re-seed
//   2. fetch   — SELECT * to refresh store state regardless of upsert outcome
//
// Re-seeding rules:
//   - 'recommended', 'accepted', 'done'  → blocked (skip, don't overwrite)
//   - 'canceled'                         → re-seed (reset to recommended)
//   - not present                        → insert new
//
// Tests use mockReturnValueOnce to provide separate mock chains for each call.
describe('seedInsightTasks', () => {
  function makeUpsertOnlyChain() {
    return { upsert: jest.fn().mockResolvedValue({ data: null, error: null }) };
  }

  function makeFreshFetchChain(tasks: unknown[] | null = []) {
    return {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: tasks, error: null }),
    };
  }

  function mockBothCalls(freshTasks: unknown[] | null) {
    (supabase.from as jest.Mock)
      .mockReturnValueOnce(makeUpsertOnlyChain())
      .mockReturnValueOnce(makeFreshFetchChain(freshTasks));
  }

  it('does nothing when buildTaskSeeds returns empty (both null)', async () => {
    await act(async () => {
      await useTasksStore.getState().seedInsightTasks('user-1', null, null);
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('skips all DB calls when every seed type already exists in state', async () => {
    useTasksStore.setState({
      tasks: [
        makeTask({ task_type: 'reduce_fast_commerce' }),
        makeTask({ id: 'task-2', task_type: 'cancel_subscriptions' }),
      ],
    });

    await act(async () => {
      await useTasksStore.getState().seedInsightTasks('user-1', ANALYSIS, null);
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('inserts new tasks when none exist in state', async () => {
    const freshTasks = [makeTask()];
    const upsertChain = makeUpsertOnlyChain();
    (supabase.from as jest.Mock)
      .mockReturnValueOnce(upsertChain)
      .mockReturnValueOnce(makeFreshFetchChain(freshTasks));

    await act(async () => {
      await useTasksStore.getState().seedInsightTasks('user-1', ANALYSIS, null);
    });

    expect(supabase.from).toHaveBeenCalledWith('user_tasks');
    expect(upsertChain.upsert).toHaveBeenCalledWith(
      expect.any(Array),
      { onConflict: 'user_id,task_type' }
    );
    expect(useTasksStore.getState().tasks).toHaveLength(1);
  });

  it('only sends missing task types to upsert', async () => {
    useTasksStore.setState({
      tasks: [makeTask({ task_type: 'reduce_fast_commerce' })],
    });
    const upsertChain = makeUpsertOnlyChain();
    (supabase.from as jest.Mock)
      .mockReturnValueOnce(upsertChain)
      .mockReturnValueOnce(makeFreshFetchChain([
        makeTask({ task_type: 'reduce_fast_commerce' }),
        makeTask({ id: 'task-2', task_type: 'cancel_subscriptions' }),
      ]));

    await act(async () => {
      await useTasksStore.getState().seedInsightTasks('user-1', ANALYSIS, null);
    });

    const rows = upsertChain.upsert.mock.calls[0][0] as Array<{ task_type: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].task_type).toBe('cancel_subscriptions');
    expect(useTasksStore.getState().tasks).toHaveLength(2);
  });

  // ── Bug 1 regression ───────────────────────────────────────────────────────
  // Old code: relied on upsert().select() return value. With ignoreDuplicates: true,
  // pre-existing rows return no data → store stayed empty even though DB had tasks.
  // Fix: always do a fresh SELECT after upserting so store reflects DB truth.

  it('always performs a fresh DB fetch after upserting', async () => {
    const fetchChain = makeFreshFetchChain([makeTask()]);
    (supabase.from as jest.Mock)
      .mockReturnValueOnce(makeUpsertOnlyChain())
      .mockReturnValueOnce(fetchChain);

    await act(async () => {
      await useTasksStore.getState().seedInsightTasks('user-1', ANALYSIS, null);
    });

    expect(fetchChain.select).toHaveBeenCalledWith('*');
    expect(fetchChain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(fetchChain.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('populates store from fresh fetch even when upsert was a no-op (ignoreDuplicates regression)', async () => {
    // Scenario: tasks already in DB (previous session) but not in memory.
    // The upsert is a no-op (ignoreDuplicates), but the fresh fetch must still load them.
    const dbTask = makeTask();
    mockBothCalls([dbTask]); // upsert no-op; fresh fetch returns the existing DB row

    await act(async () => {
      await useTasksStore.getState().seedInsightTasks('user-1', ANALYSIS, null);
    });

    expect(useTasksStore.getState().tasks).toHaveLength(1);
    expect(useTasksStore.getState().tasks[0].id).toBe('task-1');
  });

  it('replaces entire tasks array with fresh fetch result', async () => {
    // Fresh fetch is a full replacement, not additive, so stale state is overwritten.
    const freshTasks = [
      makeTask({ task_type: 'reduce_fast_commerce' }),
      makeTask({ id: 'task-2', task_type: 'cancel_subscriptions' }),
    ];
    mockBothCalls(freshTasks);

    await act(async () => {
      await useTasksStore.getState().seedInsightTasks('user-1', ANALYSIS, null);
    });

    expect(useTasksStore.getState().tasks).toHaveLength(2);
  });

  it('does not update store when fresh fetch returns null', async () => {
    mockBothCalls(null);

    await act(async () => {
      await useTasksStore.getState().seedInsightTasks('user-1', ANALYSIS, null);
    });

    expect(useTasksStore.getState().tasks).toHaveLength(0);
  });

  it('seeding with calculation sends loan task types to upsert', async () => {
    const upsertChain = makeUpsertOnlyChain();
    (supabase.from as jest.Mock)
      .mockReturnValueOnce(upsertChain)
      .mockReturnValueOnce(makeFreshFetchChain([makeTask({ id: 'task-2', task_type: 'prepay_loan' })]));

    await act(async () => {
      await useTasksStore.getState().seedInsightTasks('user-1', null, CALCULATION);
    });

    const rows = upsertChain.upsert.mock.calls[0][0] as Array<{ task_type: string }>;
    expect(rows.map((r) => r.task_type)).toContain('prepay_loan');
  });

  it('rows sent to upsert contain all required fields', async () => {
    const upsertChain = makeUpsertOnlyChain();
    (supabase.from as jest.Mock)
      .mockReturnValueOnce(upsertChain)
      .mockReturnValueOnce(makeFreshFetchChain([]));

    await act(async () => {
      await useTasksStore.getState().seedInsightTasks('user-1', ANALYSIS, null);
    });

    const rows = upsertChain.upsert.mock.calls[0][0] as Array<Record<string, unknown>>;
    rows.forEach((row) => {
      expect(row).toHaveProperty('user_id', 'user-1');
      expect(row).toHaveProperty('task_type');
      expect(row).toHaveProperty('title');
      expect(row).toHaveProperty('description');
      expect(row).toHaveProperty('metadata');
      expect(row).toHaveProperty('xp_reward');
      expect(row).toHaveProperty('status', 'recommended');
    });
  });

  it('is non-fatal when upsert throws', async () => {
    (supabase.from as jest.Mock).mockReturnValue({
      upsert: jest.fn().mockRejectedValue(new Error('network error')),
    });

    await expect(
      act(async () => {
        await useTasksStore.getState().seedInsightTasks('user-1', ANALYSIS, null);
      })
    ).resolves.not.toThrow();
  });

  // ── Canceled-task re-seeding regression tests ──────────────────────────────
  it('re-seeds a canceled task — resets it to recommended with fresh description', async () => {
    useTasksStore.setState({
      tasks: [makeTask({ status: 'canceled' })],
    });
    const upsertChain = makeUpsertOnlyChain();
    const freshTask = makeTask({ status: 'recommended', description: 'new desc' });
    (supabase.from as jest.Mock)
      .mockReturnValueOnce(upsertChain)
      .mockReturnValueOnce(makeFreshFetchChain([freshTask]));

    await act(async () => {
      await useTasksStore.getState().seedInsightTasks('user-1', ANALYSIS, null);
    });

    const rows = upsertChain.upsert.mock.calls[0][0] as Array<{ task_type: string; status: string }>;
    expect(rows.some((r) => r.task_type === 'reduce_fast_commerce')).toBe(true);
    expect(rows.every((r) => r.status === 'recommended')).toBe(true);
  });

  it('does NOT re-seed a done task', async () => {
    useTasksStore.setState({
      tasks: [
        makeTask({ task_type: 'reduce_fast_commerce', status: 'done' }),
        makeTask({ id: 'task-2', task_type: 'cancel_subscriptions', status: 'done' }),
      ],
    });

    await act(async () => {
      await useTasksStore.getState().seedInsightTasks('user-1', ANALYSIS, null);
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('does NOT re-seed an accepted task', async () => {
    useTasksStore.setState({
      tasks: [makeTask({ status: 'accepted' })],
    });
    const upsertChain = makeUpsertOnlyChain();
    (supabase.from as jest.Mock)
      .mockReturnValueOnce(upsertChain)
      .mockReturnValueOnce(makeFreshFetchChain([]));

    await act(async () => {
      await useTasksStore.getState().seedInsightTasks('user-1', ANALYSIS, null);
    });

    const rows = upsertChain.upsert.mock.calls[0][0] as Array<{ task_type: string }>;
    expect(rows.some((r) => r.task_type === 'reduce_fast_commerce')).toBe(false);
    expect(rows.some((r) => r.task_type === 'cancel_subscriptions')).toBe(true);
  });

  it('upsert does not use ignoreDuplicates so canceled tasks can be reset', async () => {
    const upsertChain = makeUpsertOnlyChain();
    (supabase.from as jest.Mock)
      .mockReturnValueOnce(upsertChain)
      .mockReturnValueOnce(makeFreshFetchChain([]));

    await act(async () => {
      await useTasksStore.getState().seedInsightTasks('user-1', ANALYSIS, null);
    });

    const upsertOptions = upsertChain.upsert.mock.calls[0][1] as Record<string, unknown>;
    expect(upsertOptions).not.toHaveProperty('ignoreDuplicates');
    expect(upsertOptions).toHaveProperty('onConflict', 'user_id,task_type');
  });

  it('is non-fatal when the fresh fetch throws', async () => {
    (supabase.from as jest.Mock)
      .mockReturnValueOnce(makeUpsertOnlyChain())
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockRejectedValue(new Error('network error')),
      });

    await expect(
      act(async () => {
        await useTasksStore.getState().seedInsightTasks('user-1', ANALYSIS, null);
      })
    ).resolves.not.toThrow();
  });
});

// ── markRecommendedSeen ───────────────────────────────────────────────────────
describe('markRecommendedSeen', () => {
  beforeEach(() => {
    useTasksStore.setState({ seenRecommendedIds: [] });
  });

  it('adds ids to seenRecommendedIds', () => {
    useTasksStore.getState().markRecommendedSeen(['id1', 'id2']);
    expect(useTasksStore.getState().seenRecommendedIds).toContain('id1');
    expect(useTasksStore.getState().seenRecommendedIds).toContain('id2');
  });

  it('deduplicates ids that already exist', () => {
    useTasksStore.setState({ seenRecommendedIds: ['id1'] });
    useTasksStore.getState().markRecommendedSeen(['id1', 'id2']);
    const seen = useTasksStore.getState().seenRecommendedIds;
    expect(seen.filter((id) => id === 'id1')).toHaveLength(1);
    expect(seen).toContain('id2');
  });

  it('accumulates ids across multiple calls', () => {
    useTasksStore.getState().markRecommendedSeen(['id1']);
    useTasksStore.getState().markRecommendedSeen(['id2']);
    expect(useTasksStore.getState().seenRecommendedIds).toEqual(['id1', 'id2']);
  });

  it('handles empty array without crashing', () => {
    useTasksStore.getState().markRecommendedSeen([]);
    expect(useTasksStore.getState().seenRecommendedIds).toHaveLength(0);
  });
});

// ── updateLoanTasksFromFire ───────────────────────────────────────────────────
describe('updateLoanTasksFromFire', () => {
  const noLoanCalc = { monthly_emi: 0, loan_tenure_years: 0 } as any;

  it('does nothing when calculation has no loan (emi = 0)', async () => {
    useTasksStore.setState({ tasks: [] });
    await act(async () => {
      await useTasksStore.getState().updateLoanTasksFromFire('user-1', noLoanCalc);
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('does nothing when no matching loan tasks are in state', async () => {
    useTasksStore.setState({ tasks: [makeTask({ task_type: 'reduce_fast_commerce', status: 'recommended' })] });
    await act(async () => {
      await useTasksStore.getState().updateLoanTasksFromFire('user-1', CALCULATION as any);
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('optimistically updates description and metadata for recommended loan task', async () => {
    const loanTask = makeTask({ task_type: 'prepay_loan', status: 'recommended', description: 'old desc' });
    useTasksStore.setState({ tasks: [loanTask] });
    const chain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await act(async () => {
      await useTasksStore.getState().updateLoanTasksFromFire('user-1', CALCULATION as any);
    });

    const updated = useTasksStore.getState().tasks[0];
    expect(updated.description).not.toBe('old desc');
  });

  it('also updates accepted loan tasks', async () => {
    const loanTask = makeTask({ task_type: 'prepay_loan', status: 'accepted', description: 'old desc' });
    useTasksStore.setState({ tasks: [loanTask] });
    const chain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await act(async () => {
      await useTasksStore.getState().updateLoanTasksFromFire('user-1', CALCULATION as any);
    });

    expect(useTasksStore.getState().tasks[0].description).not.toBe('old desc');
  });

  it('does not update a done loan task', async () => {
    const doneTask = makeTask({ task_type: 'prepay_loan', status: 'done', description: 'old desc' });
    useTasksStore.setState({ tasks: [doneTask] });

    await act(async () => {
      await useTasksStore.getState().updateLoanTasksFromFire('user-1', CALCULATION as any);
    });

    expect(useTasksStore.getState().tasks[0].description).toBe('old desc');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('does not update a canceled loan task', async () => {
    const canceledTask = makeTask({ task_type: 'prepay_loan', status: 'canceled', description: 'old desc' });
    useTasksStore.setState({ tasks: [canceledTask] });

    await act(async () => {
      await useTasksStore.getState().updateLoanTasksFromFire('user-1', CALCULATION as any);
    });

    expect(useTasksStore.getState().tasks[0].description).toBe('old desc');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('calls Supabase update with new description and metadata', async () => {
    const loanTask = makeTask({ task_type: 'prepay_loan', status: 'recommended' });
    useTasksStore.setState({ tasks: [loanTask] });
    const chain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await act(async () => {
      await useTasksStore.getState().updateLoanTasksFromFire('user-1', CALCULATION as any);
    });

    expect(supabase.from).toHaveBeenCalledWith('user_tasks');
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.any(String), metadata: expect.any(Object) })
    );
  });

  it('is non-fatal when Supabase update throws', async () => {
    const loanTask = makeTask({ task_type: 'prepay_loan', status: 'recommended' });
    useTasksStore.setState({ tasks: [loanTask] });
    (supabase.from as jest.Mock).mockReturnValue({
      update: jest.fn().mockImplementation(() => { throw new Error('network'); }),
      eq: jest.fn().mockReturnThis(),
    });

    await expect(
      act(async () => {
        await useTasksStore.getState().updateLoanTasksFromFire('user-1', CALCULATION as any);
      })
    ).resolves.not.toThrow();
  });
});

// ── acceptTask ────────────────────────────────────────────────────────────────
describe('acceptTask', () => {
  const targetDate = '2026-08-01';

  beforeEach(() => {
    useTasksStore.setState({ tasks: [makeTask()] });
    const chain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);
  });

  it('optimistically sets task status to accepted', async () => {
    await act(async () => {
      await useTasksStore.getState().acceptTask('user-1', 'task-1', targetDate);
    });

    const task = useTasksStore.getState().tasks[0];
    expect(task.status).toBe('accepted');
    expect(task.target_completion_date).toBe(targetDate);
  });

  it('calls Supabase update with correct payload', async () => {
    const chain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await act(async () => {
      await useTasksStore.getState().acceptTask('user-1', 'task-1', targetDate);
    });

    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'accepted', target_completion_date: targetDate })
    );
  });

  it('does not affect other tasks', async () => {
    useTasksStore.setState({
      tasks: [makeTask(), makeTask({ id: 'task-2', task_type: 'cancel_subscriptions' })],
    });

    await act(async () => {
      await useTasksStore.getState().acceptTask('user-1', 'task-1', targetDate);
    });

    const otherTask = useTasksStore.getState().tasks.find((t) => t.id === 'task-2')!;
    expect(otherTask.status).toBe('recommended');
  });
});

// ── cancelTask ────────────────────────────────────────────────────────────────
describe('cancelTask', () => {
  beforeEach(() => {
    useTasksStore.setState({
      tasks: [makeTask({ status: 'accepted', target_completion_date: '2026-08-01' })],
    });
    const chain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);
  });

  it('reverts to recommended and clears target_completion_date when revertToRecommended=true', async () => {
    await act(async () => {
      await useTasksStore.getState().cancelTask('user-1', 'task-1', true);
    });

    const task = useTasksStore.getState().tasks[0];
    expect(task.status).toBe('recommended');
    expect(task.target_completion_date).toBeNull();
  });

  it('sets status to canceled when revertToRecommended=false', async () => {
    useTasksStore.setState({ tasks: [makeTask({ status: 'recommended' })] });

    await act(async () => {
      await useTasksStore.getState().cancelTask('user-1', 'task-1', false);
    });

    const task = useTasksStore.getState().tasks[0];
    expect(task.status).toBe('canceled');
  });

  it('preserves target_completion_date when canceling (not reverting)', async () => {
    await act(async () => {
      await useTasksStore.getState().cancelTask('user-1', 'task-1', false);
    });

    const task = useTasksStore.getState().tasks[0];
    expect(task.target_completion_date).toBe('2026-08-01');
  });

  it('calls Supabase update with canceled status', async () => {
    const chain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await act(async () => {
      await useTasksStore.getState().cancelTask('user-1', 'task-1', false);
    });

    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'canceled' })
    );
  });

  it('sends target_completion_date: null when reverting', async () => {
    const chain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await act(async () => {
      await useTasksStore.getState().cancelTask('user-1', 'task-1', true);
    });

    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'recommended', target_completion_date: null })
    );
  });
});

// ── completeTask ──────────────────────────────────────────────────────────────
describe('completeTask', () => {
  beforeEach(() => {
    const chain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);
  });

  it('sets task status to done', async () => {
    useTasksStore.setState({ tasks: [makeTask({ status: 'accepted' })] });

    await act(async () => {
      await useTasksStore.getState().completeTask('user-1', 'task-1');
    });

    expect(useTasksStore.getState().tasks[0].status).toBe('done');
  });

  it('returns the task xp_reward', async () => {
    useTasksStore.setState({ tasks: [makeTask({ xp_reward: 75 })] });

    let xp: number;
    await act(async () => {
      xp = await useTasksStore.getState().completeTask('user-1', 'task-1');
    });

    expect(xp!).toBe(75);
  });

  it('returns default 50 XP when task is not found', async () => {
    useTasksStore.setState({ tasks: [] });

    let xp: number;
    await act(async () => {
      xp = await useTasksStore.getState().completeTask('user-1', 'nonexistent-id');
    });

    expect(xp!).toBe(50);
  });

  it('calls Supabase update with status done', async () => {
    useTasksStore.setState({ tasks: [makeTask()] });
    const chain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await act(async () => {
      await useTasksStore.getState().completeTask('user-1', 'task-1');
    });

    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'done' })
    );
  });

  it('does not affect other tasks when completing one', async () => {
    useTasksStore.setState({
      tasks: [
        makeTask({ status: 'accepted' }),
        makeTask({ id: 'task-2', task_type: 'cancel_subscriptions', status: 'accepted' }),
      ],
    });

    await act(async () => {
      await useTasksStore.getState().completeTask('user-1', 'task-1');
    });

    const other = useTasksStore.getState().tasks.find((t) => t.id === 'task-2')!;
    expect(other.status).toBe('accepted');
  });

  it('is non-fatal when Supabase update throws', async () => {
    useTasksStore.setState({ tasks: [makeTask()] });
    // Throw synchronously in update so no unhandled rejection is created
    const chain = {
      update: jest.fn().mockImplementation(() => { throw new Error('network'); }),
      eq: jest.fn().mockReturnThis(),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await expect(
      act(async () => {
        await useTasksStore.getState().completeTask('user-1', 'task-1');
      })
    ).resolves.not.toThrow();
  });
});

// ── seedInsightTasks — generate-tasks Edge Function path ──────────────────────
//
// The store tries supabase.functions.invoke('generate-tasks') first.
// If it returns tasks, those are set directly (no DB upsert/fetch).
// If it fails for any reason, the store falls through to the hardcoded seed path.

describe('seedInsightTasks — generate-tasks Edge Function integration', () => {
  const invokeMock = supabase.functions.invoke as jest.Mock;

  function makeRemoteTask(overrides: Partial<UserTask> = {}): UserTask {
    return {
      id: 'remote-task-1',
      user_id: 'user-1',
      task_type: 'reduce_fast_commerce',
      title: 'AI-generated: Cut food delivery',
      description: 'Claude says you should reduce food delivery by 40%',
      metadata: { suggested_saving: 4000 },
      status: 'recommended',
      target_completion_date: null,
      xp_reward: 100,
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-01T00:00:00Z',
      ...overrides,
    };
  }

  function makeUpsertOnlyChain() {
    return { upsert: jest.fn().mockResolvedValue({ data: null, error: null }) };
  }

  function makeFreshFetchChain(tasks: unknown[] = []) {
    return {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: tasks, error: null }),
    };
  }

  beforeEach(() => {
    // Reset to error default so fallback-path tests in other suites still work
    invokeMock.mockResolvedValue({ data: null, error: new Error('not configured') });
  });

  it('calls generate-tasks with the userId', async () => {
    invokeMock.mockResolvedValue({ data: { tasks: [] }, error: null });
    const fetchChain = makeFreshFetchChain([]);
    (supabase.from as jest.Mock).mockReturnValue(fetchChain);

    await act(async () => {
      await useTasksStore.getState().seedInsightTasks('user-99', ANALYSIS, null);
    });

    expect(invokeMock).toHaveBeenCalledWith('generate-tasks', {
      body: { userId: 'user-99' },
    });
  });

  it('sets tasks directly from Edge Function response and skips DB upsert', async () => {
    const remoteTasks = [makeRemoteTask(), makeRemoteTask({ id: 'remote-2', task_type: 'cancel_subscriptions' })];
    invokeMock.mockResolvedValue({ data: { tasks: remoteTasks }, error: null });

    await act(async () => {
      await useTasksStore.getState().seedInsightTasks('user-1', ANALYSIS, null);
    });

    expect(useTasksStore.getState().tasks).toHaveLength(2);
    expect(useTasksStore.getState().tasks[0].title).toBe('AI-generated: Cut food delivery');
    // DB should NOT be called when Edge Function succeeds
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('returns early after successful Edge Function response (no hardcoded seeds)', async () => {
    const remoteTasks = [makeRemoteTask()];
    invokeMock.mockResolvedValue({ data: { tasks: remoteTasks }, error: null });

    await act(async () => {
      await useTasksStore.getState().seedInsightTasks('user-1', ANALYSIS, null);
    });

    // Confirm DB was never touched
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('falls back to hardcoded seeds when Edge Function returns an error', async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error('Claude API unavailable') });

    const upsertChain = makeUpsertOnlyChain();
    (supabase.from as jest.Mock)
      .mockReturnValueOnce(upsertChain)
      .mockReturnValueOnce(makeFreshFetchChain([makeTask()]));

    await act(async () => {
      await useTasksStore.getState().seedInsightTasks('user-1', ANALYSIS, null);
    });

    expect(upsertChain.upsert).toHaveBeenCalled();
  });

  it('falls back to hardcoded seeds when Edge Function returns empty tasks array', async () => {
    invokeMock.mockResolvedValue({ data: { tasks: [] }, error: null });

    const upsertChain = makeUpsertOnlyChain();
    (supabase.from as jest.Mock)
      .mockReturnValueOnce(upsertChain)
      .mockReturnValueOnce(makeFreshFetchChain([makeTask()]));

    await act(async () => {
      await useTasksStore.getState().seedInsightTasks('user-1', ANALYSIS, null);
    });

    expect(upsertChain.upsert).toHaveBeenCalled();
  });

  it('falls back to hardcoded seeds when invoke throws', async () => {
    invokeMock.mockRejectedValue(new Error('Network timeout'));

    const upsertChain = makeUpsertOnlyChain();
    (supabase.from as jest.Mock)
      .mockReturnValueOnce(upsertChain)
      .mockReturnValueOnce(makeFreshFetchChain([makeTask()]));

    await act(async () => {
      await useTasksStore.getState().seedInsightTasks('user-1', ANALYSIS, null);
    });

    expect(upsertChain.upsert).toHaveBeenCalled();
  });

  it('falls back when Edge Function returns data without tasks property', async () => {
    invokeMock.mockResolvedValue({ data: { something: 'unexpected' }, error: null });

    const upsertChain = makeUpsertOnlyChain();
    (supabase.from as jest.Mock)
      .mockReturnValueOnce(upsertChain)
      .mockReturnValueOnce(makeFreshFetchChain([makeTask()]));

    await act(async () => {
      await useTasksStore.getState().seedInsightTasks('user-1', ANALYSIS, null);
    });

    expect(upsertChain.upsert).toHaveBeenCalled();
  });

  it('stores AI-generated tasks preserving all fields from the response', async () => {
    const aiTask = makeRemoteTask({ xp_reward: 150, metadata: { custom_field: 'value' } });
    invokeMock.mockResolvedValue({ data: { tasks: [aiTask] }, error: null });

    await act(async () => {
      await useTasksStore.getState().seedInsightTasks('user-1', ANALYSIS, null);
    });

    const stored = useTasksStore.getState().tasks[0];
    expect(stored.xp_reward).toBe(150);
    expect(stored.metadata).toEqual({ custom_field: 'value' });
  });
});
