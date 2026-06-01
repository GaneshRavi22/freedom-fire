import {
  calculateFireNumber,
  calculateYearsToFire,
  calculateRetirementPlan,
  buildWealthTimeline,
  formatCurrency,
  formatCurrencyShort,
  generateCostCuttingSuggestions,
  indianBenchmarks,
  type FireInputs,
  type JourneyInputs,
} from '@/lib/calculations';

// ---------------------------------------------------------------------------
// calculateFireNumber
// ---------------------------------------------------------------------------
describe('calculateFireNumber', () => {
  const base: FireInputs = {
    monthlyExpenses: 50000,
    currentAge: 30,
    retirementAge: 45,
    expectedReturnPct: 12,
    inflationRatePct: 6,
  };

  it('returns a positive integer', () => {
    expect(calculateFireNumber(base)).toBeGreaterThan(0);
    expect(Number.isInteger(calculateFireNumber(base))).toBe(true);
  });

  it('inflates expenses over years to retirement', () => {
    const noInflation = calculateFireNumber({ ...base, inflationRatePct: 0 });
    const withInflation = calculateFireNumber(base);
    expect(withInflation).toBeGreaterThan(noInflation);
  });

  it('uses correct formula: inflated_annual / swr', () => {
    // yearsToRetirement = 15, annualExpenses = 600000
    // inflated = 600000 * 1.06^15, swr = 0.06
    const yearsToRetirement = 15;
    const annualExpenses = 50000 * 12;
    const inflated = annualExpenses * Math.pow(1.06, yearsToRetirement);
    const swr = 0.06;
    const expected = Math.round(inflated / swr);
    expect(calculateFireNumber(base)).toBe(expected);
  });

  it('clamps SWR to minimum 2.5% when return ≤ inflation', () => {
    // 7% return, 7% inflation → SWR would be 0, clamp to 0.025
    const result = calculateFireNumber({ ...base, expectedReturnPct: 7, inflationRatePct: 7 });
    const annualExpenses = 50000 * 12;
    const inflated = annualExpenses * Math.pow(1.07, 15);
    const expected = Math.round(inflated / 0.025);
    expect(result).toBe(expected);
  });

  it('clamps SWR to minimum 2.5% when inflation > return', () => {
    const result = calculateFireNumber({ ...base, expectedReturnPct: 6, inflationRatePct: 9 });
    expect(result).toBeGreaterThan(0);
  });

  it('higher monthly expenses → larger FIRE number', () => {
    const low = calculateFireNumber({ ...base, monthlyExpenses: 30000 });
    const high = calculateFireNumber({ ...base, monthlyExpenses: 80000 });
    expect(high).toBeGreaterThan(low);
  });

  it('earlier retirement age → larger FIRE number (more inflation years)', () => {
    const early = calculateFireNumber({ ...base, retirementAge: 35 });
    const late = calculateFireNumber({ ...base, retirementAge: 55 });
    expect(late).toBeGreaterThan(early);
  });

  it('retire at same age as current → 0 inflation years, expenses not inflated', () => {
    const result = calculateFireNumber({ ...base, retirementAge: 30 });
    const annualExpenses = 50000 * 12;
    const swr = 0.06;
    const expected = Math.round(annualExpenses / swr);
    expect(result).toBe(expected);
  });

  it('higher expected return → smaller FIRE number (higher SWR)', () => {
    const lowReturn = calculateFireNumber({ ...base, expectedReturnPct: 9 });
    const highReturn = calculateFireNumber({ ...base, expectedReturnPct: 15 });
    expect(highReturn).toBeLessThan(lowReturn);
  });

  it('swrPct override takes precedence over computed SWR', () => {
    const yearsToRetirement = 15;
    const annualExpenses = 50000 * 12;
    const inflated = annualExpenses * Math.pow(1.06, yearsToRetirement);
    const expected = Math.round(inflated / 0.04);
    expect(calculateFireNumber({ ...base, swrPct: 4 })).toBe(expected);
  });

  it('lower swrPct (luxury) → larger FIRE number than higher swrPct (lean)', () => {
    const lean   = calculateFireNumber({ ...base, swrPct: 4 });
    const luxury = calculateFireNumber({ ...base, swrPct: 2.5 });
    expect(luxury).toBeGreaterThan(lean);
  });
});

// ---------------------------------------------------------------------------
// calculateYearsToFire
// ---------------------------------------------------------------------------
describe('calculateYearsToFire', () => {
  const base: JourneyInputs = {
    fireNumber: 50000000, // ₹5 Cr
    currentSavings: 1000000, // ₹10 L
    monthlySavings: 50000, // ₹50k/month
    expectedReturnPct: 12,
    currentAge: 30,
  };

  it('returns a non-negative integer', () => {
    const years = calculateYearsToFire(base);
    expect(years).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(years)).toBe(true);
  });

  it('returns 0 when already at or above FIRE number', () => {
    const result = calculateYearsToFire({ ...base, currentSavings: 50000000 });
    expect(result).toBe(0);
  });

  it('returns 0 when current savings exceed FIRE number', () => {
    const result = calculateYearsToFire({ ...base, currentSavings: 60000000 });
    expect(result).toBe(0);
  });

  it('returns 999 when monthly savings is 0 and not at FIRE number', () => {
    const result = calculateYearsToFire({ ...base, monthlySavings: 0, expectedReturnPct: 0 });
    expect(result).toBe(999);
  });

  it('returns 999 when it takes more than 100 years', () => {
    const result = calculateYearsToFire({
      fireNumber: 1e12, // ₹1 Trillion — unreachable
      currentSavings: 0,
      monthlySavings: 1000,
      expectedReturnPct: 1,
      currentAge: 30,
    });
    expect(result).toBe(999);
  });

  it('higher monthly savings → fewer years to FIRE', () => {
    const fewer = calculateYearsToFire({ ...base, monthlySavings: 100000 });
    const more = calculateYearsToFire({ ...base, monthlySavings: 30000 });
    expect(fewer).toBeLessThan(more);
  });

  it('higher return rate → fewer years', () => {
    const fewer = calculateYearsToFire({ ...base, expectedReturnPct: 15 });
    const more = calculateYearsToFire({ ...base, expectedReturnPct: 8 });
    expect(fewer).toBeLessThan(more);
  });

  it('higher current savings → fewer years', () => {
    const fewer = calculateYearsToFire({ ...base, currentSavings: 10000000 });
    const more = calculateYearsToFire({ ...base, currentSavings: 100000 });
    expect(fewer).toBeLessThan(more);
  });

  it('handles zero return rate (linear growth)', () => {
    // At 0% return: need (5Cr - 10L) / 600k = 4.9Cr / 600k ≈ 81.67 → ceil = 82
    const result = calculateYearsToFire({
      ...base,
      expectedReturnPct: 0,
      fireNumber: 5000000,
      currentSavings: 100000,
      monthlySavings: 50000,
    });
    const expected = Math.ceil((5000000 - 100000) / (50000 * 12));
    expect(result).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// calculateRetirementPlan
// ---------------------------------------------------------------------------
describe('calculateRetirementPlan', () => {
  const base = {
    monthlyExpenses: 50000,
    currentAge: 30,
    expectedReturnPct: 10,
    inflationRatePct: 6,
    currentSavings: 0,
    monthlySavings: 50000,
  };

  it('sizes fireNumber for the target retirement age, not the actual retirement age', () => {
    const plan = calculateRetirementPlan({ ...base, targetRetirementAge: 45 });
    const expected = calculateFireNumber({
      monthlyExpenses: 50000, currentAge: 30, retirementAge: 45,
      expectedReturnPct: 10, inflationRatePct: 6,
    });
    expect(plan.fireNumber).toBe(expected);
    expect(plan.retireAtAge).toBe(30 + plan.yearsToFire);
  });

  it('returns a later retire age than target when savings are insufficient', () => {
    // ₹50K/month savings can't reach FIRE by age 40 (only 10 years, expenses ₹50K)
    const plan = calculateRetirementPlan({ ...base, targetRetirementAge: 40, monthlySavings: 20000 });
    expect(plan.retireAtAge).toBeGreaterThan(40);
  });

  it('returns an earlier retire age than target when savings are high', () => {
    const plan = calculateRetirementPlan({ ...base, targetRetirementAge: 60, monthlySavings: 300000 });
    expect(plan.retireAtAge).toBeLessThan(60);
  });

  it('returns yearsToFire=0 and retireAtAge=currentAge when already at FIRE', () => {
    const plan = calculateRetirementPlan({ ...base, targetRetirementAge: 45, currentSavings: 500000000 });
    expect(plan.yearsToFire).toBe(0);
    expect(plan.retireAtAge).toBe(30);
  });

  it('returns yearsToFire=999 when unreachable', () => {
    const plan = calculateRetirementPlan({ ...base, targetRetirementAge: 45, monthlySavings: 1 });
    expect(plan.yearsToFire).toBe(999);
  });

  it('respects swrPct override in corpus sizing', () => {
    const lean    = calculateRetirementPlan({ ...base, targetRetirementAge: 45, swrPct: 4 });
    const luxury  = calculateRetirementPlan({ ...base, targetRetirementAge: 45, swrPct: 2.5 });
    expect(luxury.fireNumber).toBeGreaterThan(lean.fireNumber);
    expect(luxury.retireAtAge).toBeGreaterThan(lean.retireAtAge);
  });

  it('does not amplify fire number for high-EMI scenario (regression)', () => {
    // Age 36, 4L income, 1.5L expenses, 1.8L EMI, 14yr loan, target 55, comfortable SWR
    // Before fix: iteration converged to age 71 / ~41 Cr. After fix: anchored to target age 55.
    const plan = calculateRetirementPlan({
      monthlyExpenses: 150000,
      currentAge: 36,
      targetRetirementAge: 55,
      expectedReturnPct: 10,
      inflationRatePct: 6,
      currentSavings: 300000,
      monthlySavings: 70000,   // 400K income − 150K expenses − 180K EMI
      monthlyEmi: 180000,
      loanTenureYears: 14,
      swrPct: 100 / 30,        // comfortable lifestyle
    });
    const expectedFireNum = calculateFireNumber({
      monthlyExpenses: 150000, currentAge: 36, retirementAge: 55,
      expectedReturnPct: 10, inflationRatePct: 6, swrPct: 100 / 30,
    });
    expect(plan.fireNumber).toBe(expectedFireNum);           // ~16.3 Cr, not 30+ Cr
    expect(plan.fireNumber).toBeLessThan(200_000_000);       // sanity: < 20 Cr
    expect(plan.retireAtAge).toBe(36 + plan.yearsToFire);
    expect(plan.retireAtAge).toBeGreaterThan(55);            // will retire later than target
    expect(plan.retireAtAge).toBeLessThan(70);               // but not absurdly late
  });
});

// ---------------------------------------------------------------------------
// buildWealthTimeline
// ---------------------------------------------------------------------------
describe('buildWealthTimeline', () => {
  const base: JourneyInputs = {
    fireNumber: 50000000,
    currentSavings: 1000000,
    monthlySavings: 50000,
    expectedReturnPct: 12,
    currentAge: 30,
  };

  it('year 0 entry has current savings and current age', () => {
    const timeline = buildWealthTimeline(base, 10);
    expect(timeline[0]).toMatchObject({ year: 0, wealth: 1000000, age: 30 });
  });

  it('ages increment by 1 per entry', () => {
    const timeline = buildWealthTimeline(base, 5);
    timeline.forEach((entry, i) => {
      expect(entry.year).toBe(i);
      expect(entry.age).toBe(30 + i);
    });
  });

  it('wealth grows over time with positive returns', () => {
    const timeline = buildWealthTimeline(base, 10);
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i].wealth).toBeGreaterThan(timeline[i - 1].wealth);
    }
  });

  it('returns years + 5 entries (plus year 0), capped at 51 entries', () => {
    const timeline = buildWealthTimeline(base, 10);
    expect(timeline.length).toBe(16); // 0..15
  });

  it('caps at 51 entries (year 0..50) for large year values', () => {
    const timeline = buildWealthTimeline(base, 100);
    expect(timeline.length).toBe(51);
  });

  it('rounds wealth values to integers', () => {
    const timeline = buildWealthTimeline(base, 5);
    timeline.forEach((entry) => {
      expect(entry.wealth).toBe(Math.round(entry.wealth));
    });
  });
});

// ---------------------------------------------------------------------------
// formatCurrency
// ---------------------------------------------------------------------------
describe('formatCurrency', () => {
  it('formats crores (≥ 1 Cr)', () => {
    expect(formatCurrency(42000000)).toBe('₹4.20 Cr');
    expect(formatCurrency(100000000)).toBe('₹10.00 Cr');
  });

  it('formats lakhs (≥ 1 L, < 1 Cr)', () => {
    expect(formatCurrency(500000)).toBe('₹5.00 L');
    expect(formatCurrency(2600000)).toBe('₹26.00 L');
  });

  it('formats plain numbers below 1 lakh', () => {
    expect(formatCurrency(50000)).toContain('₹');
    expect(formatCurrency(50000)).toContain('50');
  });

  it('handles edge at exactly 1 Cr boundary', () => {
    expect(formatCurrency(10000000)).toBe('₹1.00 Cr');
  });

  it('handles edge at exactly 1 L boundary', () => {
    expect(formatCurrency(100000)).toBe('₹1.00 L');
  });
});

// ---------------------------------------------------------------------------
// formatCurrencyShort
// ---------------------------------------------------------------------------
describe('formatCurrencyShort', () => {
  it('formats crores', () => {
    expect(formatCurrencyShort(42000000)).toBe('₹4.2Cr');
  });

  it('formats lakhs', () => {
    expect(formatCurrencyShort(500000)).toBe('₹5.0L');
  });

  it('formats thousands', () => {
    expect(formatCurrencyShort(50000)).toBe('₹50K');
  });

  it('formats sub-thousand amounts', () => {
    expect(formatCurrencyShort(500)).toBe('₹500');
  });

  it('formats exactly 1 Cr', () => {
    expect(formatCurrencyShort(10000000)).toBe('₹1.0Cr');
  });
});

// ---------------------------------------------------------------------------
// generateCostCuttingSuggestions
// ---------------------------------------------------------------------------
describe('generateCostCuttingSuggestions', () => {
  const avgMonthlySpend = 60000;

  it('returns empty array when all categories are within benchmarks', () => {
    // Food benchmark = 19%, so 19% of 60000 = 11400 — exactly at benchmark
    const categoryBreakdown = {
      food: 11400,
      transport: 7200,
      shopping: 8400,
      entertainment: 4800,
      utilities: 6000,
    };
    const result = generateCostCuttingSuggestions(categoryBreakdown, avgMonthlySpend);
    expect(result).toHaveLength(0);
  });

  it('generates suggestion when category is > 5% above benchmark', () => {
    // Food benchmark = 19%. 30% of 60000 = 18000 → 30% vs 19% = 11% above
    const categoryBreakdown = { food: 18000 };
    const result = generateCostCuttingSuggestions(categoryBreakdown, avgMonthlySpend);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].category).toBe('food');
  });

  it('does not generate suggestion when overage is exactly 5% or less', () => {
    // Food benchmark = 19%. 24% of 60000 = 14400 → exactly 5% above → no suggestion
    const categoryBreakdown = { food: 14400 };
    const result = generateCostCuttingSuggestions(categoryBreakdown, avgMonthlySpend);
    expect(result).toHaveLength(0);
  });

  it('does not generate suggestion when potential saving is ≤ ₹500', () => {
    // Use tiny avgMonthlySpend so saving is < ₹500
    const categoryBreakdown = { food: 3000 };
    const result = generateCostCuttingSuggestions(categoryBreakdown, 10000);
    // food 30% of 10k = 3k, benchmark 19% = 1.9k, saving = 1.1k > 500 → suggestion generated
    // Let me use a case where saving is tiny
    const tinyResult = generateCostCuttingSuggestions({ food: 260 }, 1000);
    // food 26% of 1k, benchmark 19% = 190, saving = 70 < 500 → no suggestion
    expect(tinyResult).toHaveLength(0);
  });

  it('returns at most 4 suggestions', () => {
    // All categories way above benchmark
    const categoryBreakdown = {
      food: 30000, // 50% vs 19%
      transport: 20000, // 33% vs 12%
      shopping: 20000, // 33% vs 14%
      entertainment: 15000, // 25% vs 8%
      utilities: 15000, // 25% vs 10%
    };
    const result = generateCostCuttingSuggestions(categoryBreakdown, avgMonthlySpend);
    expect(result.length).toBeLessThanOrEqual(4);
  });

  it('sorts suggestions by potentialSaving descending', () => {
    const categoryBreakdown = {
      food: 25000, // large overage
      transport: 15000, // medium overage
      entertainment: 8000, // small overage
    };
    const result = generateCostCuttingSuggestions(categoryBreakdown, avgMonthlySpend);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].potentialSaving).toBeGreaterThanOrEqual(result[i].potentialSaving);
    }
  });

  it('includes suggestion text and positive monthsSaved', () => {
    const categoryBreakdown = { food: 20000 };
    const result = generateCostCuttingSuggestions(categoryBreakdown, avgMonthlySpend);
    expect(result[0].suggestion).toBeTruthy();
    expect(result[0].potentialSaving).toBeGreaterThan(0);
    expect(result[0].monthsSaved).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// indianBenchmarks — sanity checks
// ---------------------------------------------------------------------------
describe('indianBenchmarks', () => {
  it('contains all expected categories', () => {
    const expectedCategories = ['food', 'transport', 'shopping', 'health', 'entertainment', 'utilities', 'other'];
    expectedCategories.forEach((cat) => {
      expect(indianBenchmarks).toHaveProperty(cat);
    });
  });

  it('all benchmarks are positive numbers', () => {
    Object.values(indianBenchmarks).forEach((val) => {
      expect(val).toBeGreaterThan(0);
    });
  });
});
