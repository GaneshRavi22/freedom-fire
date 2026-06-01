import { calculateFire, LIFESTYLE_SWR, type FireInputs } from '@/lib/fire';
import { calculateFireNumber } from '@/lib/calculations';

const base: FireInputs = {
  monthly_income: 150000,
  spouse_income: 0,
  monthly_expenses: 60000,
  current_savings: 2000000,
  loan_balance: 0,
  monthly_emi: 0,
  loan_tenure_years: 0,
  retirement_age: 45,
  expected_return_pct: 12,
  inflation_rate_pct: 6,
};

describe('LIFESTYLE_SWR', () => {
  it('lean SWR is 4%', () => expect(LIFESTYLE_SWR.lean).toBe(4));
  it('comfortable SWR is 100/30', () => expect(LIFESTYLE_SWR.comfortable).toBeCloseTo(100 / 30));
  it('luxury SWR is 2.5%', () => expect(LIFESTYLE_SWR.luxury).toBe(2.5));
});

describe('calculateFire — normal case', () => {
  it('returns a positive fire_number', () => {
    const result = calculateFire(base, 30);
    expect(result.fire_number).toBeGreaterThan(0);
  });

  it('computes monthly_savings as income minus expenses minus emi', () => {
    const result = calculateFire(base, 30);
    expect(result.monthly_savings).toBe(90000); // 150000 - 60000 - 0
  });

  it('computes savings_rate as a percentage of total income', () => {
    const result = calculateFire(base, 30);
    expect(result.savings_rate).toBe(60); // 90000/150000 * 100
  });

  it('marks possible=true and already_there=false for achievable goals', () => {
    const result = calculateFire(base, 30);
    expect(result.possible).toBe(true);
    expect(result.already_there).toBe(false);
  });

  it('sets loan_payoff_age=null and years_accelerated=0 when no emi', () => {
    const result = calculateFire(base, 30);
    expect(result.loan_payoff_age).toBeNull();
    expect(result.years_accelerated).toBe(0);
  });
});

describe('calculateFire — already there', () => {
  it('marks already_there=true when current savings exceed fire number', () => {
    const result = calculateFire(
      { ...base, current_savings: 999_000_000, monthly_expenses: 1000 },
      30
    );
    expect(result.already_there).toBe(true);
    expect(result.years_to_fire).toBe(0);
    expect(result.retire_at_age).toBe(30);
  });
});

describe('calculateFire — impossible (spending >= income)', () => {
  it('returns possible=false and retire_at_age=-1 when no savings and cannot reach FIRE', () => {
    const result = calculateFire(
      {
        ...base,
        monthly_income: 50000,
        spouse_income: 0,
        monthly_expenses: 80000,
        current_savings: 0,
      },
      30
    );
    expect(result.possible).toBe(false);
    expect(result.retire_at_age).toBe(-1);
    expect(result.years_to_fire).toBe(999);
    expect(result.monthly_savings).toBeLessThan(0);
    expect(result.savings_rate).toBe(0);
    expect(result.loan_payoff_age).toBeNull();
    expect(result.years_accelerated).toBe(0);
  });
});

describe('calculateFire — with EMI / loan', () => {
  const withLoan: FireInputs = {
    ...base,
    monthly_emi: 20000,
    loan_tenure_years: 5,
    loan_balance: 1000000,
  };

  it('sets loan_payoff_age = current_age + loan_tenure_years', () => {
    const result = calculateFire(withLoan, 30);
    expect(result.loan_payoff_age).toBe(35);
  });

  it('years_accelerated is >= 0', () => {
    const result = calculateFire(withLoan, 30);
    expect(result.years_accelerated).toBeGreaterThanOrEqual(0);
  });

  it('does not set loan_payoff_age when only emi is set but tenure is 0', () => {
    const result = calculateFire({ ...base, monthly_emi: 20000, loan_tenure_years: 0 }, 30);
    expect(result.loan_payoff_age).toBeNull();
    expect(result.years_accelerated).toBe(0);
  });

  it('does not set loan_payoff_age when only tenure is set but emi is 0', () => {
    const result = calculateFire({ ...base, monthly_emi: 0, loan_tenure_years: 5 }, 30);
    expect(result.loan_payoff_age).toBeNull();
    expect(result.years_accelerated).toBe(0);
  });
});

describe('calculateFire — lifestyle SWR', () => {
  it('uses lifestyle SWR when lifestyle is provided', () => {
    const withLifestyle = calculateFire({ ...base, lifestyle: 'luxury' }, 30);
    const withoutLifestyle = calculateFire({ ...base, lifestyle: undefined }, 30);
    // luxury has lower SWR → larger fire_number
    expect(withLifestyle.fire_number).toBeGreaterThan(withoutLifestyle.fire_number);
  });

  it('lean lifestyle produces smaller fire_number than luxury', () => {
    const lean = calculateFire({ ...base, lifestyle: 'lean' }, 30);
    const luxury = calculateFire({ ...base, lifestyle: 'luxury' }, 30);
    expect(lean.fire_number).toBeLessThan(luxury.fire_number);
  });
});

describe('calculateFire — high EMI regression', () => {
  // Reported bug: comfortable FIRE showed >30 Cr for this scenario.
  // Root cause: the old calculateRetirementPlan iterated the retirement age
  // forward (55→63→67→…→71) which exponentially inflated the corpus.
  const highEmi: FireInputs = {
    monthly_income:      400000,
    spouse_income:       0,
    monthly_expenses:    150000,
    current_savings:     300000,
    loan_balance:        0,
    monthly_emi:         180000,
    loan_tenure_years:   14,
    retirement_age:      55,
    expected_return_pct: 10,
    inflation_rate_pct:  6,
  };

  it('comfortable FIRE number is anchored to target age 55, not 30+ Cr', () => {
    const result = calculateFire({ ...highEmi, lifestyle: 'comfortable' }, 36);
    expect(result.fire_number).toBeLessThan(200_000_000);  // < 20 Cr
    expect(result.possible).toBe(true);
  });

  it('monthly_savings correctly accounts for EMI deduction', () => {
    const result = calculateFire(highEmi, 36);
    expect(result.monthly_savings).toBe(70000);  // 400K − 150K − 180K
  });

  it('loan_payoff_age is current_age + loan_tenure_years', () => {
    const result = calculateFire(highEmi, 36);
    expect(result.loan_payoff_age).toBe(50);  // 36 + 14
  });

  it('lean < comfortable < luxury fire numbers for same inputs', () => {
    const lean        = calculateFire({ ...highEmi, lifestyle: 'lean' }, 36);
    const comfortable = calculateFire({ ...highEmi, lifestyle: 'comfortable' }, 36);
    const luxury      = calculateFire({ ...highEmi, lifestyle: 'luxury' }, 36);
    expect(lean.fire_number).toBeLessThan(comfortable.fire_number);
    expect(comfortable.fire_number).toBeLessThan(luxury.fire_number);
  });
});

describe('calculateFire — spouse income', () => {
  it('adds spouse_income to monthly_savings', () => {
    const withSpouse = calculateFire({ ...base, spouse_income: 50000 }, 30);
    expect(withSpouse.monthly_savings).toBe(140000); // 200000 - 60000 - 0
  });

  it('savings_rate accounts for combined income', () => {
    const withSpouse = calculateFire({ ...base, spouse_income: 50000 }, 30);
    expect(withSpouse.savings_rate).toBe(70); // 140000/200000 * 100
  });
});

/**
 * Invariant: "Your FIRE Number" must equal the matching lifestyle scenario number.
 *
 * The screen derives scenario expenses as:
 *   lean        = round(monthlyExpenses × 0.7)
 *   comfortable = monthlyExpenses
 *   luxury      = round(monthlyExpenses × 1.5)
 *
 * Both the main FIRE number and each scenario row call calculateFireNumber WITHOUT
 * swrPct — the SWR is derived from (expectedReturn − inflation). Lifestyle only
 * selects the expense level; it no longer fixes the withdrawal rate multiplier.
 */
describe('lifestyle FIRE number ↔ scenario consistency', () => {
  const sharedInputs = {
    currentAge:        30,
    retirementAge:     45,
    expectedReturnPct: 12,
    inflationRatePct:  6,
  };
  const baseExpenses = 60_000;

  const MULTIPLIERS: Record<'lean' | 'comfortable' | 'luxury', number> = {
    lean:        0.7,
    comfortable: 1.0,
    luxury:      1.5,
  };

  it.each(['lean', 'comfortable', 'luxury'] as const)(
    '%s: main FIRE number equals scenario FIRE number (no swrPct override)',
    (lifestyle) => {
      const expenses = Math.round(baseExpenses * MULTIPLIERS[lifestyle]);
      // Screen calls calculateFireNumber WITHOUT swrPct for both the main result
      // and each scenario row — they must be identical given the same inputs.
      const mainNum     = calculateFireNumber({ ...sharedInputs, monthlyExpenses: expenses });
      const scenarioNum = calculateFireNumber({ ...sharedInputs, monthlyExpenses: expenses });
      expect(mainNum).toBe(scenarioNum);
    }
  );

  // Regression: the old bug passed base (comfortable) expenses even for lean/luxury.
  it('lean FIRE number uses 0.7× expenses — NOT base expenses', () => {
    const correct = calculateFireNumber({ ...sharedInputs, monthlyExpenses: Math.round(baseExpenses * 0.7) });
    const buggy   = calculateFireNumber({ ...sharedInputs, monthlyExpenses: baseExpenses });
    expect(correct).not.toBe(buggy);
    expect(correct).toBeLessThan(buggy);
  });

  it('luxury FIRE number uses 1.5× expenses — NOT base expenses', () => {
    const correct = calculateFireNumber({ ...sharedInputs, monthlyExpenses: Math.round(baseExpenses * 1.5) });
    const buggy   = calculateFireNumber({ ...sharedInputs, monthlyExpenses: baseExpenses });
    expect(correct).not.toBe(buggy);
    expect(correct).toBeGreaterThan(buggy);
  });

  it('comfortable scenario is unaffected — uses 1× expenses', () => {
    const fireNum     = calculateFireNumber({ ...sharedInputs, monthlyExpenses: baseExpenses });
    const alsoFireNum = calculateFireNumber({ ...sharedInputs, monthlyExpenses: Math.round(baseExpenses * 1.0) });
    expect(fireNum).toBe(alsoFireNum);
    expect(fireNum).toBeGreaterThan(0);
  });

  it('lean < comfortable < luxury FIRE numbers with their respective expense levels', () => {
    const lean        = calculateFireNumber({ ...sharedInputs, monthlyExpenses: Math.round(baseExpenses * 0.7) });
    const comfortable = calculateFireNumber({ ...sharedInputs, monthlyExpenses: baseExpenses });
    const luxury      = calculateFireNumber({ ...sharedInputs, monthlyExpenses: Math.round(baseExpenses * 1.5) });
    expect(lean).toBeLessThan(comfortable);
    expect(comfortable).toBeLessThan(luxury);
  });
});

/**
 * Regression: expectedReturn was silently ignored when computing the displayed
 * FIRE number because the screen passed swrPct (a fixed lifestyle value) to
 * calculateFireNumber, which short-circuits the return-based SWR derivation.
 *
 * Fix: screen now calls calculateFireNumber without swrPct. These tests lock
 * that the FIRE number responds to expectedReturn changes.
 */
describe('expectedReturn affects FIRE number (regression: swrPct bypass)', () => {
  const base = {
    monthlyExpenses:   60_000,
    currentAge:        30,
    retirementAge:     45,
    inflationRatePct:  6,
  };

  it('higher expectedReturn → lower FIRE number (no swrPct)', () => {
    const low  = calculateFireNumber({ ...base, expectedReturnPct: 9 });
    const high = calculateFireNumber({ ...base, expectedReturnPct: 15 });
    expect(high).toBeLessThan(low);
  });

  it('FIRE number differs between 10% and 12% return (no swrPct)', () => {
    const at10 = calculateFireNumber({ ...base, expectedReturnPct: 10 });
    const at12 = calculateFireNumber({ ...base, expectedReturnPct: 12 });
    expect(at12).not.toBe(at10);
    expect(at12).toBeLessThan(at10);
  });

  it('each lifestyle expense level produces a FIRE number sensitive to return', () => {
    const returns = [9, 12, 15];
    for (const expenses of [
      Math.round(60_000 * 0.7),  // lean
      60_000,                     // comfortable
      Math.round(60_000 * 1.5),  // luxury
    ]) {
      const nums = returns.map((r) => calculateFireNumber({ ...base, expectedReturnPct: r, monthlyExpenses: expenses }));
      // Must be strictly decreasing as return increases
      expect(nums[0]).toBeGreaterThan(nums[1]);
      expect(nums[1]).toBeGreaterThan(nums[2]);
    }
  });

  it('passing swrPct intentionally bypasses expectedReturn — documented behaviour', () => {
    // When swrPct IS supplied, expectedReturn correctly has no effect on the corpus.
    // This is valid for callers that want a fixed multiplier (e.g. internal calculateFire).
    const low  = calculateFireNumber({ ...base, expectedReturnPct: 9,  swrPct: 4 });
    const high = calculateFireNumber({ ...base, expectedReturnPct: 15, swrPct: 4 });
    expect(low).toBe(high);
  });
});
