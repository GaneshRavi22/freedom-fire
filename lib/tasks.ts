import { LIFESTYLE_SWR, type FireInputs } from '@/lib/fire';
import { calculateMonthsToFireWithPayoff, calculateFireNumber } from '@/lib/calculations';
import type { FireRecord } from '@/stores/fire.store';

// ── Task type identifiers ─────────────────────────────────────────────────────
export type TaskType =
  | 'reduce_fast_commerce'
  | 'cancel_subscriptions'
  | 'prepay_loan'
  | 'reduce_loan_tenure';

export type TaskStatus = 'recommended' | 'accepted' | 'done' | 'canceled';

export interface UserTask {
  id: string;
  user_id: string;
  task_type: TaskType;
  title: string;
  description: string;
  metadata: Record<string, any>;
  status: TaskStatus;
  target_completion_date: string | null;
  xp_reward: number;
  created_at: string;
  updated_at: string;
}

// ── Static definitions ────────────────────────────────────────────────────────
export const TASK_DEFINITIONS: Record<TaskType, { title: string; icon: string; xp_reward: number; color: string }> = {
  reduce_fast_commerce: {
    title: 'Cut Delivery & Quick Commerce by 30%',
    icon: 'cart-outline',
    xp_reward: 75,
    color: '#FF6584',
  },
  cancel_subscriptions: {
    title: 'Review & Cancel Unused Subscriptions',
    icon: 'repeat-outline',
    xp_reward: 50,
    color: '#6C63FF',
  },
  prepay_loan: {
    title: 'Start Prepaying Your Home Loan',
    icon: 'home-outline',
    xp_reward: 150,
    color: '#FF5A5A',
  },
  reduce_loan_tenure: {
    title: 'Reduce Your Loan Tenure',
    icon: 'hourglass-outline',
    xp_reward: 100,
    color: '#FFB547',
  },
};

// ── Insight → task seed builder ───────────────────────────────────────────────
interface SpendAnalysisSeed {
  avg_monthly_spend: number;
  category_breakdown: Record<string, number>;
}

export function buildTaskSeeds(
  analysis: SpendAnalysisSeed | null,
  calculation: FireRecord | null
): Array<{ task_type: TaskType; description: string; metadata: Record<string, any>; xp_reward: number }> {
  const seeds: Array<{ task_type: TaskType; description: string; metadata: Record<string, any>; xp_reward: number }> = [];

  if (analysis) {
    const foodSpend = analysis.category_breakdown?.food ?? 0;
    const shoppingSpend = analysis.category_breakdown?.shopping ?? 0;
    const estimatedDelivery = Math.round(foodSpend * 0.6);
    const estimatedQC = Math.round(shoppingSpend * 0.5);
    const total = estimatedDelivery + estimatedQC;
    const saving30 = Math.round(total * 0.3);

    seeds.push({
      task_type: 'reduce_fast_commerce',
      description: saving30 > 0
        ? `Reduce food delivery & quick commerce orders by 30% — save ~₹${saving30.toLocaleString('en-IN')}/mo`
        : 'Reduce food delivery & quick commerce orders by 30% to free up monthly cash',
      metadata: { estimatedDelivery, estimatedQC, saving30 },
      xp_reward: TASK_DEFINITIONS.reduce_fast_commerce.xp_reward,
    });

    const entertainmentSpend = analysis.category_breakdown?.entertainment ?? 0;
    const estimatedSubs = Math.round(entertainmentSpend * 0.75);
    seeds.push({
      task_type: 'cancel_subscriptions',
      description: estimatedSubs > 0
        ? `You may be spending ~₹${estimatedSubs.toLocaleString('en-IN')}/mo on streaming & subscriptions — cancel the ones you barely use`
        : 'Review your streaming & digital subscriptions and cancel unused ones',
      metadata: { estimatedSubscriptions: estimatedSubs },
      xp_reward: TASK_DEFINITIONS.cancel_subscriptions.xp_reward,
    });
  }

  if (calculation) {
    const emi = calculation.monthly_emi ?? 0;
    const tenure = calculation.loan_tenure_years ?? 0;
    if (emi > 0) {
      seeds.push({
        task_type: 'prepay_loan',
        description: `Your EMI of ₹${emi.toLocaleString('en-IN')}/mo is slowing your FIRE journey. Even a small prepayment now compounds into years of freedom`,
        metadata: { monthly_emi: emi, loan_tenure_years: tenure },
        xp_reward: TASK_DEFINITIONS.prepay_loan.xp_reward,
      });
    }
    if (emi > 0 && tenure > 0) {
      seeds.push({
        task_type: 'reduce_loan_tenure',
        description: `Shortening your loan tenure by 3–5 years drastically shrinks the inflation window and your required FIRE corpus`,
        metadata: { loan_tenure_years: tenure, monthly_emi: emi },
        xp_reward: TASK_DEFINITIONS.reduce_loan_tenure.xp_reward,
      });
    }
  }

  return seeds;
}

// ── Date helpers for accept flow ──────────────────────────────────────────────
export const TARGET_DATE_PRESETS = [
  { label: '1 Month', months: 1 },
  { label: '3 Months', months: 3 },
  { label: '6 Months', months: 6 },
  { label: '1 Year', months: 12 },
] as const;

/**
 * Returns a concrete, number-backed description for tasks whose DB description
 * is too generic (loan tasks). For spending tasks falls back to task.description.
 */
export function getConcreteTaskDescription(task: UserTask): string {
  const emi = task.metadata?.monthly_emi ?? 0;
  const tenure = task.metadata?.loan_tenure_years ?? 0;

  if (task.task_type === 'prepay_loan' && emi > 0) {
    return `Pay one extra EMI (₹${emi.toLocaleString('en-IN')}) each year as a lump-sum prepayment — this trims ~1 year off your loan and frees up months of interest`;
  }

  if (task.task_type === 'reduce_loan_tenure' && emi > 0 && tenure > 0) {
    // Suggest a 10% EMI cut, rounded to nearest ₹500 for readability
    const cut = Math.max(Math.round((emi * 0.1) / 500) * 500, 500);
    return `Reduce your monthly EMI by ₹${cut.toLocaleString('en-IN')} (≈10% cut) without extending the tenure — saves ₹${(cut * 12 * tenure).toLocaleString('en-IN')} over your remaining ${tenure}-year loan`;
  }

  return task.description;
}

/**
 * Days earlier the user can retire by completing this task.
 *
 * Applies the task's financial impact to the current FIRE inputs, then computes
 * the difference in months-to-FIRE at month granularity (calculateFire rounds
 * to integer years and would lose sub-year improvements). Each saved month is
 * treated as 365/12 days.
 *
 * Returns null when the task has no measurable impact or required data is missing.
 */
export function freedomDaysForTask(
  task: UserTask,
  calculation: FireRecord | null | undefined,
  currentAge: number,
): number | null {
  if (!calculation || !currentAge || currentAge <= 0) return null;
  if (!calculation.retire_at_age || calculation.retire_at_age < 0) return null;

  const impact = applyTaskFireImpact(task, calculation);
  if (!impact) return null;

  const base: FireInputs = {
    monthly_income: calculation.monthly_income ?? 0,
    spouse_income: calculation.spouse_income ?? 0,
    monthly_expenses: calculation.monthly_expenses ?? 0,
    current_savings: calculation.current_savings ?? 0,
    loan_balance: calculation.loan_balance ?? 0,
    monthly_emi: calculation.monthly_emi ?? 0,
    loan_tenure_years: calculation.loan_tenure_years ?? 0,
    retirement_age: calculation.retirement_age ?? 60,
    expected_return_pct: calculation.expected_return_pct ?? 12,
    inflation_rate_pct: calculation.inflation_rate_pct ?? 6,
    lifestyle: calculation.lifestyle,
  };
  const updated: FireInputs = { ...base, ...impact };

  const swrPct = base.lifestyle ? LIFESTYLE_SWR[base.lifestyle] : undefined;

  const monthsFor = (inputs: FireInputs) => {
    const fireNum = calculateFireNumber({
      monthlyExpenses: inputs.monthly_expenses,
      currentAge,
      retirementAge: inputs.retirement_age,
      expectedReturnPct: inputs.expected_return_pct,
      inflationRatePct: inputs.inflation_rate_pct,
      swrPct,
    });
    const monthlySavings = Math.max(
      0,
      inputs.monthly_income + inputs.spouse_income - inputs.monthly_expenses - inputs.monthly_emi,
    );
    return calculateMonthsToFireWithPayoff({
      fireNumber: fireNum,
      currentSavings: inputs.current_savings,
      monthlySavings,
      expectedReturnPct: inputs.expected_return_pct,
      currentAge,
      monthlyEmi: inputs.monthly_emi,
      loanTenureYears: inputs.loan_tenure_years,
    });
  };

  const currentMonths = monthsFor(base);
  const updatedMonths = monthsFor(updated);

  if (currentMonths >= 999 * 12 || updatedMonths >= 999 * 12) return null;

  const daysEarlier = Math.round((currentMonths - updatedMonths) * (365 / 12));
  return daysEarlier > 0 ? daysEarlier : null;
}

/**
 * Returns the FIRE input deltas produced by completing a task.
 * The caller merges these into the existing FireRecord, re-runs calculateFire,
 * and saves the result to DB so all screens update reactively.
 *
 * Returns null when the task has no measurable FIRE impact (e.g. missing metadata).
 */
export function applyTaskFireImpact(
  task: UserTask,
  calculation: FireRecord
): Partial<FireInputs> | null {
  const meta = task.metadata ?? {};

  switch (task.task_type) {
    case 'reduce_fast_commerce': {
      const saving = meta.saving30 ?? 0;
      if (saving <= 0) return null;
      return { monthly_expenses: Math.max(0, (calculation.monthly_expenses ?? 0) - saving) };
    }

    case 'cancel_subscriptions': {
      const saving = meta.estimatedSubscriptions ?? 0;
      if (saving <= 0) return null;
      return { monthly_expenses: Math.max(0, (calculation.monthly_expenses ?? 0) - saving) };
    }

    case 'prepay_loan': {
      // One extra EMI/year prepayment trims ~1 year off the loan tenure
      const currentTenure = calculation.loan_tenure_years ?? 0;
      if (currentTenure <= 0) return null;
      const newTenure = Math.max(0, currentTenure - 1);
      if (newTenure === 0) return { loan_tenure_years: 0, monthly_emi: 0, loan_balance: 0 };
      return { loan_tenure_years: newTenure };
    }

    case 'reduce_loan_tenure': {
      // Sustained extra payments shorten the loan by ~3 years
      const currentTenure = calculation.loan_tenure_years ?? 0;
      if (currentTenure <= 0) return null;
      const newTenure = Math.max(0, currentTenure - 3);
      if (newTenure === 0) return { loan_tenure_years: 0, monthly_emi: 0, loan_balance: 0 };
      return { loan_tenure_years: newTenure };
    }
  }
}

export function addMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

export function formatTargetDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
