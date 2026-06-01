import { calculateRetirementPlan } from '@/lib/calculations';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Lifestyle = 'lean' | 'comfortable' | 'luxury';

/** Safe withdrawal rates per lifestyle. */
export const LIFESTYLE_SWR: Record<Lifestyle, number> = {
  lean: 4,           // 25× annual spend
  comfortable: 100 / 30, // 30× annual spend
  luxury: 2.5,       // 40× annual spend
};

/**
 * All user-provided inputs for FIRE planning.
 * Field names intentionally match fire_calculations DB column names so there
 * is no rename mapping between the store, DB, and onboarding payload.
 */
export interface FireInputs {
  monthly_income: number;
  spouse_income: number;
  monthly_expenses: number;
  current_savings: number;
  loan_balance: number;
  monthly_emi: number;
  loan_tenure_years: number;
  /** Target / desired retirement age set by the user. */
  retirement_age: number;
  expected_return_pct: number;
  inflation_rate_pct: number;
  lifestyle?: Lifestyle;
}

/** Everything derived from FireInputs + the user's current age. */
export interface FireResult {
  fire_number: number;
  /** Actual computed retirement age (may differ from target when behind schedule). */
  retire_at_age: number;
  /** Years until FIRE corpus is reached. 999 = effectively impossible. */
  years_to_fire: number;
  /** Monthly investable surplus (income − expenses − emi). Can be negative. */
  monthly_savings: number;
  savings_rate: number;
  possible: boolean;
  already_there: boolean;
  loan_payoff_age: number | null;
  /** Years earlier FIRE arrives because the EMI frees up after payoff. */
  years_accelerated: number;
}

// ─── Single calculation entry point ──────────────────────────────────────────

/**
 * The one function all screens call. Accepts canonical FireInputs + the user's
 * current age (sourced from their profile at call time).
 */
export function calculateFire(inputs: FireInputs, current_age: number): FireResult {
  const {
    monthly_income, spouse_income, monthly_expenses, current_savings,
    monthly_emi, loan_tenure_years, retirement_age,
    expected_return_pct, inflation_rate_pct, lifestyle,
  } = inputs;

  const income = monthly_income + spouse_income;
  const monthly_savings = income - monthly_expenses - monthly_emi;
  const savings_rate =
    income > 0 ? Math.max(0, Math.round((monthly_savings / income) * 100)) : 0;

  const swrPct = lifestyle ? LIFESTYLE_SWR[lifestyle] : undefined;

  const base = {
    monthlyExpenses: monthly_expenses,
    currentAge: current_age,
    targetRetirementAge: retirement_age,
    expectedReturnPct: expected_return_pct,
    inflationRatePct: inflation_rate_pct,
    currentSavings: current_savings,
    monthlySavings: Math.max(0, monthly_savings), // clamp so simulation converges
    swrPct,
  };

  const plan = calculateRetirementPlan({
    ...base,
    monthlyEmi: monthly_emi,
    loanTenureYears: loan_tenure_years,
  });

  const already_there = plan.yearsToFire === 0;
  const possible = already_there || plan.yearsToFire < 999;

  if (!possible && monthly_savings <= 0) {
    // Spending ≥ income: surface the shortfall but mark impossible.
    return {
      fire_number: plan.fireNumber,
      retire_at_age: -1,
      years_to_fire: 999,
      monthly_savings,
      savings_rate: 0,
      possible: false,
      already_there: false,
      loan_payoff_age: null,
      years_accelerated: 0,
    };
  }

  let years_accelerated = 0;
  if (monthly_emi > 0 && loan_tenure_years > 0) {
    const noEmiPlan = calculateRetirementPlan({ ...base, monthlyEmi: 0, loanTenureYears: 0 });
    years_accelerated = Math.max(0, noEmiPlan.yearsToFire - plan.yearsToFire);
  }

  const loan_payoff_age =
    monthly_emi > 0 && loan_tenure_years > 0 ? current_age + loan_tenure_years : null;

  return {
    fire_number: plan.fireNumber,
    retire_at_age: already_there ? current_age : plan.retireAtAge,
    years_to_fire: plan.yearsToFire,
    monthly_savings,
    savings_rate,
    possible,
    already_there,
    loan_payoff_age,
    years_accelerated,
  };
}
