export interface FireInputs {
  monthlyExpenses: number;
  currentAge: number;
  retirementAge: number;
  expectedReturnPct: number;
  inflationRatePct: number;
  /** Override the safe withdrawal rate (as a percentage, e.g. 4 for 4%).
   *  When omitted the rate is derived from (expectedReturn − inflation). */
  swrPct?: number;
}

export function calculateFireNumber(inputs: FireInputs): number {
  const { monthlyExpenses, currentAge, retirementAge, inflationRatePct, expectedReturnPct, swrPct } = inputs;
  const yearsToRetirement = retirementAge - currentAge;
  const annualExpenses = monthlyExpenses * 12;
  const inflationAdjustedAnnualExpenses =
    annualExpenses * Math.pow(1 + inflationRatePct / 100, yearsToRetirement);
  const swr = swrPct != null
    ? swrPct / 100
    : Math.max((expectedReturnPct - inflationRatePct) / 100, 0.025);
  return Math.round(inflationAdjustedAnnualExpenses / swr);
}

export interface JourneyInputs {
  fireNumber: number;
  currentSavings: number;
  monthlySavings: number;
  expectedReturnPct: number;
  currentAge: number;
}

export interface JourneyInputsWithLoan extends JourneyInputs {
  monthlyEmi?: number;
  loanTenureYears?: number;
}

export function calculateYearsToFire(inputs: JourneyInputs): number {
  return calculateYearsToFireWithPayoff(inputs);
}

export function calculateMonthsToFireWithPayoff(inputs: JourneyInputsWithLoan): number {
  const { fireNumber, currentSavings, monthlySavings, expectedReturnPct, monthlyEmi = 0, loanTenureYears = 0 } = inputs;
  const r = expectedReturnPct / 100 / 12;

  if (monthlySavings <= 0 && monthlyEmi === 0) return 999 * 12;

  let wealth = currentSavings;
  let months = 0;
  const maxMonths = 100 * 12;

  while (wealth < fireNumber && months < maxMonths) {
    const emiFreed = monthlyEmi > 0 && loanTenureYears > 0 && months >= loanTenureYears * 12 ? monthlyEmi : 0;
    wealth = wealth * (1 + r) + monthlySavings + emiFreed;
    months++;
  }
  return months >= maxMonths ? 999 * 12 : months;
}

export function calculateYearsToFireWithPayoff(inputs: JourneyInputsWithLoan): number {
  const months = calculateMonthsToFireWithPayoff(inputs);
  return months >= 999 * 12 ? 999 : Math.ceil(months / 12);
}

export function buildWealthTimeline(
  inputs: JourneyInputs,
  years: number
): Array<{ year: number; wealth: number; age: number; isPayoffYear?: boolean }> {
  return buildWealthTimelineWithPayoff(inputs, years);
}

export function buildWealthTimelineWithPayoff(
  inputs: JourneyInputsWithLoan,
  years: number
): Array<{ year: number; wealth: number; age: number; isPayoffYear?: boolean }> {
  const { currentSavings, monthlySavings, expectedReturnPct, currentAge, monthlyEmi = 0, loanTenureYears = 0 } = inputs;
  const r = expectedReturnPct / 100 / 12;
  const timeline = [];
  let wealth = currentSavings;

  for (let yr = 0; yr <= Math.min(years + 5, 50); yr++) {
    const isPayoffYear = monthlyEmi > 0 && loanTenureYears > 0 && yr === loanTenureYears;
    timeline.push({ year: yr, wealth: Math.round(wealth), age: currentAge + yr, isPayoffYear });
    // Simulate 12 months for this year
    for (let m = 0; m < 12; m++) {
      const month = yr * 12 + m;
      const emiFreed = monthlyEmi > 0 && loanTenureYears > 0 && month >= loanTenureYears * 12 ? monthlyEmi : 0;
      wealth = wealth * (1 + r) + monthlySavings + emiFreed;
    }
  }
  return timeline;
}

export interface RetirementPlanInputs {
  monthlyExpenses: number;
  currentAge: number;
  targetRetirementAge: number;
  expectedReturnPct: number;
  inflationRatePct: number;
  currentSavings: number;
  monthlySavings: number;
  monthlyEmi?: number;
  loanTenureYears?: number;
  swrPct?: number;
}

export interface RetirementPlan {
  fireNumber: number;
  yearsToFire: number;
  retireAtAge: number;
}

/**
 * Computes the FIRE corpus sized for the user's target retirement age, then
 * simulates how many years it takes to accumulate that corpus. The corpus is
 * intentionally anchored to the target age: iterating the retirement age
 * forward amplifies inflation-adjusted expenses exponentially and produces
 * self-reinforcing "insane" numbers for users with temporarily high EMI.
 */
export function calculateRetirementPlan(inputs: RetirementPlanInputs): RetirementPlan {
  const { monthlyExpenses, currentAge, targetRetirementAge, expectedReturnPct,
          inflationRatePct, currentSavings, monthlySavings, monthlyEmi,
          loanTenureYears, swrPct } = inputs;

  const fireNumber = calculateFireNumber({
    monthlyExpenses, currentAge, retirementAge: targetRetirementAge,
    expectedReturnPct, inflationRatePct, swrPct,
  });

  const yearsToFire = calculateYearsToFireWithPayoff({
    fireNumber, currentSavings, monthlySavings, expectedReturnPct, currentAge,
    monthlyEmi, loanTenureYears,
  });

  return { fireNumber, yearsToFire, retireAtAge: currentAge + yearsToFire };
}

export function formatCurrency(amount: number): string {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function formatCurrencyShort(amount: number): string {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(0)}K`;
  return `₹${amount.toLocaleString('en-IN')}`;
}

// Indian average benchmark spending percentages
export const indianBenchmarks: Record<string, number> = {
  food: 19,
  transport: 12,
  shopping: 14,
  health: 7,
  entertainment: 8,
  utilities: 10,
  other: 30,
};

export function generateCostCuttingSuggestions(
  categoryBreakdown: Record<string, number>,
  avgMonthlySpend: number
): Array<{ category: string; suggestion: string; potentialSaving: number; monthsSaved: number; fireNumber: number }> {
  const suggestions: Array<{
    category: string;
    suggestion: string;
    potentialSaving: number;
    monthsSaved: number;
    fireNumber: number;
  }> = [];

  const suggestionMap: Record<string, string> = {
    food: 'Cook at home more often & reduce restaurant visits',
    transport: 'Use public transport or carpool when possible',
    shopping: 'Follow a 30-day rule before non-essential purchases',
    entertainment: 'Audit & cancel unused streaming subscriptions',
    utilities: 'Switch to energy-efficient appliances & prepaid plans',
  };

  for (const [category, amount] of Object.entries(categoryBreakdown)) {
    const userPct = (amount / avgMonthlySpend) * 100;
    const benchmarkPct = indianBenchmarks[category] ?? 100;
    if (userPct > benchmarkPct + 5 && suggestionMap[category]) {
      const targetAmount = (benchmarkPct / 100) * avgMonthlySpend;
      const potentialSaving = Math.round(amount - targetAmount);
      if (potentialSaving > 500) {
        const monthsSaved = Math.round(potentialSaving / (avgMonthlySpend / 12));
        suggestions.push({
          category,
          suggestion: suggestionMap[category],
          potentialSaving,
          monthsSaved,
          fireNumber: potentialSaving,
        });
      }
    }
  }
  return suggestions.sort((a, b) => b.potentialSaving - a.potentialSaving).slice(0, 4);
}
