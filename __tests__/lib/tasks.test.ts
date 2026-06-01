import {
  applyTaskFireImpact,
  buildTaskSeeds,
  addMonths,
  formatTargetDate,
  freedomDaysForTask,
  getConcreteTaskDescription,
  TASK_DEFINITIONS,
  TARGET_DATE_PRESETS,
  type TaskType,
  type UserTask,
} from '@/lib/tasks';
import { calculateFire, type FireInputs } from '@/lib/fire';
import type { FireRecord } from '@/stores/fire.store';

// ── helpers ───────────────────────────────────────────────────────────────────
function makeTask(overrides: Partial<UserTask> & { task_type: TaskType }): UserTask {
  return {
    id: 'test-id',
    user_id: 'user-1',
    title: TASK_DEFINITIONS[overrides.task_type].title,
    description: 'default description',
    metadata: {},
    status: 'recommended',
    target_completion_date: null,
    xp_reward: TASK_DEFINITIONS[overrides.task_type].xp_reward,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── TASK_DEFINITIONS sanity ───────────────────────────────────────────────────
describe('TASK_DEFINITIONS', () => {
  const expectedTypes: TaskType[] = [
    'reduce_fast_commerce',
    'cancel_subscriptions',
    'prepay_loan',
    'reduce_loan_tenure',
  ];

  it('has exactly 4 task types', () => {
    expect(Object.keys(TASK_DEFINITIONS)).toHaveLength(4);
  });

  it('all expected task types are present', () => {
    expectedTypes.forEach((t) => expect(TASK_DEFINITIONS).toHaveProperty(t));
  });

  it('every definition has title, icon, xp_reward and color', () => {
    expectedTypes.forEach((t) => {
      const def = TASK_DEFINITIONS[t];
      expect(typeof def.title).toBe('string');
      expect(typeof def.icon).toBe('string');
      expect(typeof def.xp_reward).toBe('number');
      expect(def.xp_reward).toBeGreaterThan(0);
      expect(typeof def.color).toBe('string');
    });
  });

  it('xp_reward values match expected amounts', () => {
    expect(TASK_DEFINITIONS.reduce_fast_commerce.xp_reward).toBe(75);
    expect(TASK_DEFINITIONS.cancel_subscriptions.xp_reward).toBe(50);
    expect(TASK_DEFINITIONS.prepay_loan.xp_reward).toBe(150);
    expect(TASK_DEFINITIONS.reduce_loan_tenure.xp_reward).toBe(100);
  });
});

// ── TARGET_DATE_PRESETS ───────────────────────────────────────────────────────
describe('TARGET_DATE_PRESETS', () => {
  it('has exactly 4 presets', () => {
    expect(TARGET_DATE_PRESETS).toHaveLength(4);
  });

  it('presets are ordered by ascending months', () => {
    for (let i = 1; i < TARGET_DATE_PRESETS.length; i++) {
      expect(TARGET_DATE_PRESETS[i].months).toBeGreaterThan(TARGET_DATE_PRESETS[i - 1].months);
    }
  });

  it('includes 1, 3, 6, 12 month options', () => {
    const months = TARGET_DATE_PRESETS.map((p) => p.months);
    expect(months).toEqual([1, 3, 6, 12]);
  });

  it('every preset has a non-empty label', () => {
    TARGET_DATE_PRESETS.forEach((p) => {
      expect(typeof p.label).toBe('string');
      expect(p.label.length).toBeGreaterThan(0);
    });
  });
});

// ── buildTaskSeeds ────────────────────────────────────────────────────────────
describe('buildTaskSeeds', () => {
  const analysis = {
    avg_monthly_spend: 52000,
    category_breakdown: { food: 14000, shopping: 12000, entertainment: 4000 },
  };

  const calculation = { monthly_emi: 30000, loan_tenure_years: 20 };

  it('returns empty array when both inputs are null', () => {
    expect(buildTaskSeeds(null, null)).toHaveLength(0);
  });

  it('returns 2 tasks when only analysis is provided', () => {
    const seeds = buildTaskSeeds(analysis, null);
    expect(seeds).toHaveLength(2);
    const types = seeds.map((s) => s.task_type);
    expect(types).toContain('reduce_fast_commerce');
    expect(types).toContain('cancel_subscriptions');
  });

  it('returns no tasks when only an empty calculation (no EMI) is provided', () => {
    const seeds = buildTaskSeeds(null, { monthly_emi: 0, loan_tenure_years: 0 });
    expect(seeds).toHaveLength(0);
  });

  it('returns only prepay_loan when calculation has EMI but no tenure', () => {
    const seeds = buildTaskSeeds(null, { monthly_emi: 20000, loan_tenure_years: 0 });
    expect(seeds).toHaveLength(1);
    expect(seeds[0].task_type).toBe('prepay_loan');
  });

  it('returns both loan tasks when EMI > 0 and tenure > 0', () => {
    const seeds = buildTaskSeeds(null, calculation);
    expect(seeds).toHaveLength(2);
    const types = seeds.map((s) => s.task_type);
    expect(types).toContain('prepay_loan');
    expect(types).toContain('reduce_loan_tenure');
  });

  it('returns all 4 tasks when both analysis and calculation are provided', () => {
    const seeds = buildTaskSeeds(analysis, calculation);
    expect(seeds).toHaveLength(4);
  });

  it('reduce_fast_commerce metadata contains saving estimate', () => {
    const seeds = buildTaskSeeds(analysis, null);
    const fc = seeds.find((s) => s.task_type === 'reduce_fast_commerce')!;
    expect(fc.metadata.saving30).toBeGreaterThan(0);
    // saving30 = round((round(14000*0.6) + round(12000*0.5)) * 0.3) = round((8400+6000)*0.3) = round(4320) = 4320
    expect(fc.metadata.saving30).toBe(4320);
  });

  it('cancel_subscriptions metadata contains estimatedSubscriptions', () => {
    const seeds = buildTaskSeeds(analysis, null);
    const cs = seeds.find((s) => s.task_type === 'cancel_subscriptions')!;
    // estimatedSubs = round(4000 * 0.75) = 3000
    expect(cs.metadata.estimatedSubscriptions).toBe(3000);
  });

  it('reduce_fast_commerce description mentions savings when saving30 > 0', () => {
    const seeds = buildTaskSeeds(analysis, null);
    const fc = seeds.find((s) => s.task_type === 'reduce_fast_commerce')!;
    expect(fc.description).toMatch(/save ~₹/);
  });

  it('cancel_subscriptions description mentions spending when estimatedSubs > 0', () => {
    const seeds = buildTaskSeeds(analysis, null);
    const cs = seeds.find((s) => s.task_type === 'cancel_subscriptions')!;
    expect(cs.description).toMatch(/₹/);
  });

  it('uses fallback descriptions when spend is zero', () => {
    const zeroAnalysis = {
      avg_monthly_spend: 0,
      category_breakdown: { food: 0, shopping: 0, entertainment: 0 },
    };
    const seeds = buildTaskSeeds(zeroAnalysis, null);
    const fc = seeds.find((s) => s.task_type === 'reduce_fast_commerce')!;
    const cs = seeds.find((s) => s.task_type === 'cancel_subscriptions')!;
    expect(fc.description).not.toMatch(/save ~₹/);
    expect(cs.description).not.toMatch(/₹\d/);
  });

  it('xp_reward matches TASK_DEFINITIONS', () => {
    const seeds = buildTaskSeeds(analysis, calculation);
    seeds.forEach((s) => {
      expect(s.xp_reward).toBe(TASK_DEFINITIONS[s.task_type].xp_reward);
    });
  });

  it('prepay_loan description includes EMI amount', () => {
    const seeds = buildTaskSeeds(null, calculation);
    const loan = seeds.find((s) => s.task_type === 'prepay_loan')!;
    expect(loan.description).toContain('30,000');
  });

  it('prepay_loan metadata stores monthly_emi and loan_tenure_years', () => {
    const seeds = buildTaskSeeds(null, calculation);
    const loan = seeds.find((s) => s.task_type === 'prepay_loan')!;
    expect(loan.metadata.monthly_emi).toBe(30000);
    expect(loan.metadata.loan_tenure_years).toBe(20);
  });

  it('handles missing category_breakdown keys gracefully', () => {
    const minimalAnalysis = { avg_monthly_spend: 10000, category_breakdown: {} };
    expect(() => buildTaskSeeds(minimalAnalysis, null)).not.toThrow();
    const seeds = buildTaskSeeds(minimalAnalysis, null);
    expect(seeds).toHaveLength(2);
    // saving30 and estimatedSubs should be 0 → fallback descriptions
    const fc = seeds.find((s) => s.task_type === 'reduce_fast_commerce')!;
    expect(fc.metadata.saving30).toBe(0);
  });
});

// ── addMonths ─────────────────────────────────────────────────────────────────
describe('addMonths', () => {
  it('returns a string in YYYY-MM-DD format', () => {
    const result = addMonths(1);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns today when called with 0', () => {
    const today = new Date().toISOString().split('T')[0];
    expect(addMonths(0)).toBe(today);
  });

  it('1 month result is after today', () => {
    const today = new Date().toISOString().split('T')[0];
    expect(addMonths(1) > today).toBe(true);
  });

  it('12 months result is after 6 months result', () => {
    expect(addMonths(12) > addMonths(6)).toBe(true);
  });
});

// ── formatTargetDate ──────────────────────────────────────────────────────────
describe('formatTargetDate', () => {
  it('returns a non-empty string for a valid date', () => {
    const result = formatTargetDate('2027-06-15');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formatted date contains year 2027', () => {
    const result = formatTargetDate('2027-06-15');
    expect(result).toContain('2027');
  });

  it('formatted date contains the day number', () => {
    const result = formatTargetDate('2027-06-15');
    expect(result).toContain('15');
  });
});

// ── freedomDaysForTask ────────────────────────────────────────────────────────
describe('freedomDaysForTask', () => {
  // Base FIRE inputs for a 30-year-old with a home loan
  const BASE_AGE = 30;
  const baseInputs: FireInputs = {
    monthly_income: 200_000,
    spouse_income: 0,
    monthly_expenses: 80_000,
    current_savings: 500_000,
    loan_balance: 5_000_000,
    monthly_emi: 40_000,
    loan_tenure_years: 20,
    retirement_age: 60,
    expected_return_pct: 12,
    inflation_rate_pct: 6,
  };
  const baseResult = calculateFire(baseInputs, BASE_AGE);
  const baseCalc: FireRecord = {
    ...baseInputs,
    retire_at_age: baseResult.retire_at_age,
    years_to_fire: baseResult.years_to_fire,
    fire_number: baseResult.fire_number,
  };

  describe('guard conditions', () => {
    it('returns null when calculation is null', () => {
      const task = makeTask({ task_type: 'reduce_fast_commerce', metadata: { saving30: 5000 } });
      expect(freedomDaysForTask(task, null, BASE_AGE)).toBeNull();
    });

    it('returns null when calculation is undefined', () => {
      const task = makeTask({ task_type: 'reduce_fast_commerce', metadata: { saving30: 5000 } });
      expect(freedomDaysForTask(task, undefined, BASE_AGE)).toBeNull();
    });

    it('returns null when currentAge is 0', () => {
      const task = makeTask({ task_type: 'reduce_fast_commerce', metadata: { saving30: 5000 } });
      expect(freedomDaysForTask(task, baseCalc, 0)).toBeNull();
    });

    it('returns null when retire_at_age is missing', () => {
      const task = makeTask({ task_type: 'reduce_fast_commerce', metadata: { saving30: 5000 } });
      const calc = { ...baseCalc, retire_at_age: undefined };
      expect(freedomDaysForTask(task, calc, BASE_AGE)).toBeNull();
    });

    it('returns null for a task with no financial impact (missing metadata)', () => {
      const task = makeTask({ task_type: 'reduce_fast_commerce', metadata: {} });
      expect(freedomDaysForTask(task, baseCalc, BASE_AGE)).toBeNull();
    });

    it('returns null for an unknown task_type at runtime', () => {
      const task = makeTask({ task_type: 'reduce_fast_commerce', metadata: { saving30: 5000 } });
      (task as any).task_type = 'unknown_type';
      expect(freedomDaysForTask(task, baseCalc, BASE_AGE)).toBeNull();
    });
  });

  describe('reduce_fast_commerce', () => {
    it('returns null when saving30 is 0', () => {
      const task = makeTask({ task_type: 'reduce_fast_commerce', metadata: { saving30: 0 } });
      expect(freedomDaysForTask(task, baseCalc, BASE_AGE)).toBeNull();
    });

    it('returns a positive number of days for a meaningful saving', () => {
      const task = makeTask({ task_type: 'reduce_fast_commerce', metadata: { saving30: 5000 } });
      const days = freedomDaysForTask(task, baseCalc, BASE_AGE);
      expect(days).not.toBeNull();
      expect(days!).toBeGreaterThan(0);
    });

    it('larger savings yield more days', () => {
      const t1 = makeTask({ task_type: 'reduce_fast_commerce', metadata: { saving30: 3000 } });
      const t2 = makeTask({ task_type: 'reduce_fast_commerce', metadata: { saving30: 10000 } });
      const d1 = freedomDaysForTask(t1, baseCalc, BASE_AGE)!;
      const d2 = freedomDaysForTask(t2, baseCalc, BASE_AGE)!;
      expect(d2).toBeGreaterThan(d1);
    });
  });

  describe('cancel_subscriptions', () => {
    it('returns null when estimatedSubscriptions is 0', () => {
      const task = makeTask({ task_type: 'cancel_subscriptions', metadata: { estimatedSubscriptions: 0 } });
      expect(freedomDaysForTask(task, baseCalc, BASE_AGE)).toBeNull();
    });

    it('returns a positive number of days for a meaningful saving', () => {
      const task = makeTask({ task_type: 'cancel_subscriptions', metadata: { estimatedSubscriptions: 4000 } });
      const days = freedomDaysForTask(task, baseCalc, BASE_AGE);
      expect(days).not.toBeNull();
      expect(days!).toBeGreaterThan(0);
    });

    it('larger savings yield more days', () => {
      const t1 = makeTask({ task_type: 'cancel_subscriptions', metadata: { estimatedSubscriptions: 2000 } });
      const t2 = makeTask({ task_type: 'cancel_subscriptions', metadata: { estimatedSubscriptions: 8000 } });
      expect(freedomDaysForTask(t2, baseCalc, BASE_AGE)!).toBeGreaterThan(
        freedomDaysForTask(t1, baseCalc, BASE_AGE)!,
      );
    });
  });

  describe('prepay_loan', () => {
    it('returns null when there is no active loan in the calculation', () => {
      const task = makeTask({ task_type: 'prepay_loan', metadata: { monthly_emi: 40_000, loan_tenure_years: 20 } });
      const noLoanCalc = { ...baseCalc, loan_tenure_years: 0, monthly_emi: 0 };
      expect(freedomDaysForTask(task, noLoanCalc, BASE_AGE)).toBeNull();
    });

    it('returns a positive number of days when there is an active loan', () => {
      const task = makeTask({ task_type: 'prepay_loan', metadata: { monthly_emi: 40_000, loan_tenure_years: 20 } });
      const days = freedomDaysForTask(task, baseCalc, BASE_AGE);
      expect(days).not.toBeNull();
      expect(days!).toBeGreaterThan(0);
    });
  });

  describe('reduce_loan_tenure', () => {
    it('returns null when there is no active loan in the calculation', () => {
      const task = makeTask({ task_type: 'reduce_loan_tenure', metadata: { monthly_emi: 40_000, loan_tenure_years: 20 } });
      const noLoanCalc = { ...baseCalc, loan_tenure_years: 0, monthly_emi: 0 };
      expect(freedomDaysForTask(task, noLoanCalc, BASE_AGE)).toBeNull();
    });

    it('returns a positive number of days for a real loan', () => {
      const task = makeTask({ task_type: 'reduce_loan_tenure', metadata: { monthly_emi: 40_000, loan_tenure_years: 20 } });
      const days = freedomDaysForTask(task, baseCalc, BASE_AGE);
      expect(days).not.toBeNull();
      expect(days!).toBeGreaterThan(0);
    });
  });

  describe('cross-type comparison', () => {
    it('reduce_loan_tenure yields more days than prepay_loan for the same loan (bigger impact)', () => {
      const prepay = makeTask({ task_type: 'prepay_loan',        metadata: { monthly_emi: 40_000, loan_tenure_years: 20 } });
      const tenure = makeTask({ task_type: 'reduce_loan_tenure', metadata: { monthly_emi: 40_000, loan_tenure_years: 20 } });
      expect(freedomDaysForTask(tenure, baseCalc, BASE_AGE)!).toBeGreaterThan(
        freedomDaysForTask(prepay, baseCalc, BASE_AGE)!,
      );
    });

    it('spending task with larger saving yields more days than one with smaller saving', () => {
      const small = makeTask({ task_type: 'reduce_fast_commerce', metadata: { saving30: 1000 } });
      const large = makeTask({ task_type: 'reduce_fast_commerce', metadata: { saving30: 8000 } });
      expect(freedomDaysForTask(large, baseCalc, BASE_AGE)!).toBeGreaterThan(
        freedomDaysForTask(small, baseCalc, BASE_AGE)!,
      );
    });
  });
});

// ── applyTaskFireImpact ───────────────────────────────────────────────────────
describe('applyTaskFireImpact', () => {
  const baseCalc = {
    monthly_income: 200_000,
    spouse_income: 0,
    monthly_expenses: 80_000,
    current_savings: 500_000,
    loan_balance: 5_000_000,
    monthly_emi: 40_000,
    loan_tenure_years: 20,
    retirement_age: 50,
    expected_return_pct: 12,
    inflation_rate_pct: 6,
  };

  describe('reduce_fast_commerce', () => {
    it('subtracts saving30 from monthly_expenses', () => {
      const task = makeTask({ task_type: 'reduce_fast_commerce', metadata: { saving30: 5000 } });
      const impact = applyTaskFireImpact(task, baseCalc);
      expect(impact).toEqual({ monthly_expenses: 75_000 });
    });

    it('clamps monthly_expenses to 0', () => {
      const task = makeTask({ task_type: 'reduce_fast_commerce', metadata: { saving30: 200_000 } });
      const impact = applyTaskFireImpact(task, baseCalc);
      expect(impact).toEqual({ monthly_expenses: 0 });
    });

    it('returns null when saving30 is 0', () => {
      const task = makeTask({ task_type: 'reduce_fast_commerce', metadata: { saving30: 0 } });
      expect(applyTaskFireImpact(task, baseCalc)).toBeNull();
    });

    it('returns null when saving30 is missing', () => {
      const task = makeTask({ task_type: 'reduce_fast_commerce', metadata: {} });
      expect(applyTaskFireImpact(task, baseCalc)).toBeNull();
    });
  });

  describe('cancel_subscriptions', () => {
    it('subtracts estimatedSubscriptions from monthly_expenses', () => {
      const task = makeTask({ task_type: 'cancel_subscriptions', metadata: { estimatedSubscriptions: 3000 } });
      const impact = applyTaskFireImpact(task, baseCalc);
      expect(impact).toEqual({ monthly_expenses: 77_000 });
    });

    it('returns null when estimatedSubscriptions is 0', () => {
      const task = makeTask({ task_type: 'cancel_subscriptions', metadata: { estimatedSubscriptions: 0 } });
      expect(applyTaskFireImpact(task, baseCalc)).toBeNull();
    });
  });

  describe('prepay_loan', () => {
    it('reduces loan_tenure_years by 1', () => {
      const task = makeTask({ task_type: 'prepay_loan', metadata: { monthly_emi: 40_000, loan_tenure_years: 20 } });
      const impact = applyTaskFireImpact(task, baseCalc);
      expect(impact).toEqual({ loan_tenure_years: 19 });
    });

    it('zeroes out EMI and balance when tenure reaches 0', () => {
      const task = makeTask({ task_type: 'prepay_loan', metadata: { monthly_emi: 40_000, loan_tenure_years: 1 } });
      const impact = applyTaskFireImpact(task, { ...baseCalc, loan_tenure_years: 1 });
      expect(impact).toEqual({ loan_tenure_years: 0, monthly_emi: 0, loan_balance: 0 });
    });

    it('returns null when current tenure is already 0', () => {
      const task = makeTask({ task_type: 'prepay_loan', metadata: { monthly_emi: 40_000, loan_tenure_years: 0 } });
      expect(applyTaskFireImpact(task, { ...baseCalc, loan_tenure_years: 0 })).toBeNull();
    });
  });

  describe('reduce_loan_tenure', () => {
    it('reduces loan_tenure_years by 3', () => {
      const task = makeTask({ task_type: 'reduce_loan_tenure', metadata: { monthly_emi: 40_000, loan_tenure_years: 20 } });
      const impact = applyTaskFireImpact(task, baseCalc);
      expect(impact).toEqual({ loan_tenure_years: 17 });
    });

    it('clamps to 0 and zeroes out loan when reduction exceeds remaining tenure', () => {
      const task = makeTask({ task_type: 'reduce_loan_tenure', metadata: { monthly_emi: 40_000, loan_tenure_years: 2 } });
      const impact = applyTaskFireImpact(task, { ...baseCalc, loan_tenure_years: 2 });
      expect(impact).toEqual({ loan_tenure_years: 0, monthly_emi: 0, loan_balance: 0 });
    });

    it('returns null when current tenure is already 0', () => {
      const task = makeTask({ task_type: 'reduce_loan_tenure', metadata: { monthly_emi: 40_000, loan_tenure_years: 0 } });
      expect(applyTaskFireImpact(task, { ...baseCalc, loan_tenure_years: 0 })).toBeNull();
    });
  });
});

// ── getConcreteTaskDescription ────────────────────────────────────────────────
describe('getConcreteTaskDescription', () => {
  describe('prepay_loan', () => {
    it('returns a concrete description containing the EMI amount', () => {
      const task = makeTask({ task_type: 'prepay_loan', metadata: { monthly_emi: 30_000, loan_tenure_years: 20 } });
      const desc = getConcreteTaskDescription(task);
      expect(desc).toContain('30,000');
    });

    it('description mentions paying one extra EMI', () => {
      const task = makeTask({ task_type: 'prepay_loan', metadata: { monthly_emi: 30_000, loan_tenure_years: 20 } });
      expect(getConcreteTaskDescription(task)).toMatch(/extra EMI/i);
    });

    it('falls back to task.description when monthly_emi is 0', () => {
      const task = makeTask({ task_type: 'prepay_loan', metadata: { monthly_emi: 0 }, description: 'fallback text' });
      expect(getConcreteTaskDescription(task)).toBe('fallback text');
    });

    it('falls back to task.description when metadata is empty', () => {
      const task = makeTask({ task_type: 'prepay_loan', metadata: {}, description: 'fallback text' });
      expect(getConcreteTaskDescription(task)).toBe('fallback text');
    });

    it('overrides the generic DB description', () => {
      const task = makeTask({
        task_type: 'prepay_loan',
        metadata: { monthly_emi: 30_000, loan_tenure_years: 20 },
        description: 'Your EMI of ₹30,000/mo is slowing your FIRE journey.',
      });
      expect(getConcreteTaskDescription(task)).not.toBe(task.description);
    });
  });

  describe('reduce_loan_tenure', () => {
    it('mentions the 10% EMI cut amount', () => {
      // emi=30000, 10% = 3000 → rounded to nearest 500 = 3000
      const task = makeTask({ task_type: 'reduce_loan_tenure', metadata: { monthly_emi: 30_000, loan_tenure_years: 20 } });
      expect(getConcreteTaskDescription(task)).toContain('3,000');
    });

    it('mentions the loan tenure', () => {
      const task = makeTask({ task_type: 'reduce_loan_tenure', metadata: { monthly_emi: 30_000, loan_tenure_years: 20 } });
      expect(getConcreteTaskDescription(task)).toContain('20');
    });

    it('mentions the total savings amount', () => {
      // cut=3000, tenure=20 → total = 3000*12*20 = 720000 → "7,20,000" (en-IN)
      const task = makeTask({ task_type: 'reduce_loan_tenure', metadata: { monthly_emi: 30_000, loan_tenure_years: 20 } });
      expect(getConcreteTaskDescription(task)).toMatch(/7,20,000/);
    });

    it('enforces minimum ₹500 cut for small EMIs', () => {
      // emi=2000 → 10% = 200, below floor, so cut=500
      const task = makeTask({ task_type: 'reduce_loan_tenure', metadata: { monthly_emi: 2_000, loan_tenure_years: 10 } });
      expect(getConcreteTaskDescription(task)).toContain('500');
    });

    it('falls back to task.description when monthly_emi is 0', () => {
      const task = makeTask({ task_type: 'reduce_loan_tenure', metadata: { monthly_emi: 0, loan_tenure_years: 20 }, description: 'fallback' });
      expect(getConcreteTaskDescription(task)).toBe('fallback');
    });

    it('falls back to task.description when loan_tenure_years is 0', () => {
      const task = makeTask({ task_type: 'reduce_loan_tenure', metadata: { monthly_emi: 30_000, loan_tenure_years: 0 }, description: 'fallback' });
      expect(getConcreteTaskDescription(task)).toBe('fallback');
    });
  });

  describe('spending tasks pass through unchanged', () => {
    it('reduce_fast_commerce returns task.description as-is', () => {
      const task = makeTask({ task_type: 'reduce_fast_commerce', metadata: { saving30: 3000 }, description: 'Cut delivery spend' });
      expect(getConcreteTaskDescription(task)).toBe('Cut delivery spend');
    });

    it('cancel_subscriptions returns task.description as-is', () => {
      const task = makeTask({ task_type: 'cancel_subscriptions', metadata: { estimatedSubscriptions: 2000 }, description: 'Cancel subs' });
      expect(getConcreteTaskDescription(task)).toBe('Cancel subs');
    });
  });
});

// ── Branch coverage: null / undefined field fallbacks ─────────────────────────

describe('buildTaskSeeds — null EMI fields fallback to 0', () => {
  it('treats null monthly_emi and loan_tenure_years as 0 (no loan tasks)', () => {
    const seeds = buildTaskSeeds(null, { monthly_emi: null as any, loan_tenure_years: null as any });
    expect(seeds).toHaveLength(0);
  });
});

describe('applyTaskFireImpact — null calculation fields use ?? fallback', () => {
  const baseCalc = {
    monthly_income: 200_000,
    spouse_income: 0,
    monthly_expenses: 80_000,
    current_savings: 500_000,
    loan_balance: 5_000_000,
    monthly_emi: 40_000,
    loan_tenure_years: 20,
    retirement_age: 50,
    expected_return_pct: 12,
    inflation_rate_pct: 6,
  };

  it('reduce_fast_commerce: null monthly_expenses treated as 0', () => {
    const task = makeTask({ task_type: 'reduce_fast_commerce', metadata: { saving30: 5_000 } });
    const impact = applyTaskFireImpact(task, { ...baseCalc, monthly_expenses: undefined as any });
    expect(impact).toEqual({ monthly_expenses: 0 });
  });

  it('cancel_subscriptions: undefined estimatedSubscriptions treated as 0 → returns null', () => {
    const task = makeTask({ task_type: 'cancel_subscriptions', metadata: {} });
    expect(applyTaskFireImpact(task, baseCalc)).toBeNull();
  });

  it('cancel_subscriptions: null monthly_expenses treated as 0', () => {
    const task = makeTask({ task_type: 'cancel_subscriptions', metadata: { estimatedSubscriptions: 3_000 } });
    const impact = applyTaskFireImpact(task, { ...baseCalc, monthly_expenses: undefined as any });
    expect(impact).toEqual({ monthly_expenses: 0 });
  });

  it('prepay_loan: null loan_tenure_years treated as 0 → returns null', () => {
    const task = makeTask({ task_type: 'prepay_loan', metadata: { monthly_emi: 40_000, loan_tenure_years: 20 } });
    expect(applyTaskFireImpact(task, { ...baseCalc, loan_tenure_years: undefined as any })).toBeNull();
  });

  it('reduce_loan_tenure: null loan_tenure_years treated as 0 → returns null', () => {
    const task = makeTask({ task_type: 'reduce_loan_tenure', metadata: { monthly_emi: 40_000, loan_tenure_years: 20 } });
    expect(applyTaskFireImpact(task, { ...baseCalc, loan_tenure_years: undefined as any })).toBeNull();
  });

  it('null task.metadata treated as {} (returns null for missing saving30)', () => {
    const task = makeTask({ task_type: 'reduce_fast_commerce', metadata: null as any });
    expect(applyTaskFireImpact(task, baseCalc)).toBeNull();
  });
});

describe('freedomDaysForTask — null calculation fields and edge cases', () => {
  const BASE_AGE = 30;
  const baseInputs: FireInputs = {
    monthly_income: 200_000,
    spouse_income: 0,
    monthly_expenses: 80_000,
    current_savings: 500_000,
    loan_balance: 5_000_000,
    monthly_emi: 40_000,
    loan_tenure_years: 20,
    retirement_age: 60,
    expected_return_pct: 12,
    inflation_rate_pct: 6,
  };
  const baseResult = calculateFire(baseInputs, BASE_AGE);
  const baseCalc: FireRecord = {
    ...baseInputs,
    retire_at_age: baseResult.retire_at_age,
    years_to_fire: baseResult.years_to_fire,
    fire_number: baseResult.fire_number,
  };

  it('handles sparse calculation (all fields undefined) without throwing', () => {
    // Tests all ?? 0 fallbacks in freedomDaysForTask and covers lifestyle ternary true branch
    const sparseCalc = { retire_at_age: 60, lifestyle: 'comfortable' as const };
    const task = makeTask({ task_type: 'reduce_fast_commerce', metadata: { saving30: 500 } });
    expect(() => freedomDaysForTask(task, sparseCalc as any, BASE_AGE)).not.toThrow();
  });

  it('returns null when sparse calc results in identical FIRE projections (daysEarlier = 0)', () => {
    // With all expense fields undefined (→ 0), saving30 improvement reduces already-zero expenses
    // to still 0, so base and updated are identical → daysEarlier = 0 → null
    const sparseCalc = { retire_at_age: 60, lifestyle: 'comfortable' as const };
    const task = makeTask({ task_type: 'reduce_fast_commerce', metadata: { saving30: 500 } });
    expect(freedomDaysForTask(task, sparseCalc as any, BASE_AGE)).toBeNull();
  });

  it('returns null when both base and updated calculations hit the 999-year cap', () => {
    // Income = 0, expenses > 0 → monthlySavings clamped to 0 → calculateMonthsToFireWithPayoff
    // returns 999 * 12 for both base and updated → early return null (line 215)
    const impossibleCalc = {
      ...baseCalc,
      monthly_income: 0,
      spouse_income: 0,
      monthly_expenses: 50_000,
      monthly_emi: 0,
      loan_tenure_years: 0,
      current_savings: 0,
    };
    const task = makeTask({ task_type: 'reduce_fast_commerce', metadata: { saving30: 3_000 } });
    expect(freedomDaysForTask(task, impossibleCalc, BASE_AGE)).toBeNull();
  });
});
