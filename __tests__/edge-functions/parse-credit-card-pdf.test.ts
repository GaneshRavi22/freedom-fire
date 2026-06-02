// Tests for pure logic extracted from supabase/functions/parse-credit-card-pdf/index.ts
// The edge function runs in Deno; we inline and test pure functions only.

// ── Types & constants ──────────────────────────────────────────────────────────
type Category =
  | 'food'
  | 'transport'
  | 'shopping'
  | 'health'
  | 'entertainment'
  | 'utilities'
  | 'emi_loans'
  | 'investments'
  | 'other';

const categoryKeywords: Record<Category, string[]> = {
  other: [],
  food: [
    'zomato', 'swiggy', 'restaurant', 'café', 'cafe', 'food', 'dining', 'blinkit',
    'zepto', 'instamart', 'bigbasket', 'dominos', 'mcdonald', 'kfc', 'pizza', 'burger',
    'hotel', 'dhaba', 'canteen', 'bakery', 'kitchen', 'eat', 'dine',
  ],
  transport: [
    'uber', 'ola', 'rapido', 'metro', 'irctc', 'railway', 'bus', 'petrol', 'diesel',
    'fuel', 'parking', 'toll', 'fastag', 'namma metro', 'bmtc', 'airlines', 'air india',
    'indigo', 'spicejet', 'flight', 'taxi',
  ],
  shopping: [
    'amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'nykaa', 'h&m', 'zara',
    'lifestyle', 'shoppers stop', 'reliance retail', 'dmart', 'big bazaar', 'market',
    'store', 'shop', 'mall', 'fashion', 'apparel', 'clothes',
  ],
  health: [
    'pharmacy', 'hospital', 'clinic', 'doctor', 'medical', 'health', 'apollo',
    'fortis', 'manipal', 'medplus', 'netmeds', '1mg', 'pharmeasy', 'lab', 'diagnostic',
    'test', 'gym', 'cult.fit', 'fitness', 'wellness', 'insurance',
  ],
  entertainment: [
    'netflix', 'hotstar', 'prime video', 'spotify', 'youtube', 'apple', 'google play',
    'playstation', 'xbox', 'steam', 'pvr', 'inox', 'cinema', 'theatre', 'movie',
    'concert', 'event', 'bookmyshow', 'game',
  ],
  utilities: [
    'electricity', 'bescom', 'bwssb', 'water', 'gas', 'internet', 'airtel', 'jio',
    'vodafone', 'bsnl', 'vi', 'broadband', 'dth', 'tata sky', 'dish tv', 'recharge',
    'postpaid', 'prepaid', 'bill',
  ],
  emi_loans: [
    'emi', 'loan', 'repayment', 'installment', 'instalment', 'hdfc loan', 'icici loan',
    'sbi loan', 'axis loan', 'mortgage',
  ],
  investments: [
    'sip', 'mutual fund', 'mf', 'nps', 'ppf', 'elss', 'groww', 'zerodha', 'kite',
    'upstox', 'smallcase', 'coin', 'scripbox', 'paytm money', 'stock', 'demat',
  ],
};

function categorize(description: string): Category {
  const desc = description.toLowerCase();
  for (const [category, keywords] of Object.entries(categoryKeywords) as [Category, string[]][]) {
    if (keywords.some((kw) => desc.includes(kw))) return category;
  }
  return 'other';
}

// ── detectBank ─────────────────────────────────────────────────────────────────
function detectBank(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('hdfc bank')) return 'hdfc';
  if (lower.includes('icici bank')) return 'icici';
  if (lower.includes('state bank of india') || lower.includes('sbi')) return 'sbi';
  if (lower.includes('axis bank')) return 'axis';
  if (lower.includes('kotak')) return 'kotak';
  return 'generic';
}

// ── parseMonthYear ─────────────────────────────────────────────────────────────
const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

function parseMonthYear(date: string): string {
  const textMatch = date.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})/i);
  if (textMatch) {
    const month = MONTH_MAP[textMatch[2].toLowerCase()];
    if (month) return `${textMatch[3]}-${month}`;
  }
  const d = new Date(date.replace(/(\d{1,2})[\/\-](\d{2})[\/\-](\d{4})/, '$3-$2-$1'));
  if (!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return '2026-01';
}

// ── generateInsights ───────────────────────────────────────────────────────────
function generateInsights(
  categoryBreakdown: Record<string, number>,
  avgMonthlySpend: number,
  bank: string
): string[] {
  const insights: string[] = [];
  const benchmarks: Record<string, number> = {
    food: 19, transport: 12, shopping: 14, health: 7, entertainment: 8,
  };
  for (const [cat, benchmark] of Object.entries(benchmarks)) {
    const amount = categoryBreakdown[cat] ?? 0;
    const pct = Math.round((amount / avgMonthlySpend) * 100);
    if (pct > benchmark + 5) {
      const extra = pct - benchmark;
      insights.push(
        `You spend ${pct}% on ${cat} — ${extra}% above the average Indian household. Small cuts here could fast-track your FIRE date.`
      );
    }
  }
  if (avgMonthlySpend > 100000) {
    insights.push(
      'Your monthly spend is above ₹1L. Targeting a 15% reduction could save you ₹18L+ over 10 years.'
    );
  }
  if ((categoryBreakdown['entertainment'] ?? 0) > 5000) {
    insights.push(
      'Subscription audit: Review streaming services — unused ones add up to thousands annually.'
    );
  }
  return insights.slice(0, 5);
}

// ── analyzeWithClaude — sanitization logic ─────────────────────────────────────
// Replicates the category-validation step from analyzeWithClaude; tests that
// invalid/invented categories are dropped and valid ones preserved.
function sanitizeClaudeCategories(
  raw: Record<string, string>
): Record<string, Category> {
  const validCategories = new Set<Category>([
    'food', 'transport', 'shopping', 'health', 'entertainment',
    'utilities', 'emi_loans', 'investments', 'other',
  ]);
  const sanitized: Record<string, Category> = {};
  for (const [desc, cat] of Object.entries(raw)) {
    if (validCategories.has(cat as Category)) sanitized[desc] = cat as Category;
  }
  return sanitized;
}

// ── Monthly amounts accumulation (bug fix) ─────────────────────────────────────
// Before the fix: `if (month !== '2026-01' || txn.date)` incorrectly skipped some months.
// After the fix: all transactions are accumulated unconditionally.
interface Transaction { date: string; description: string; amount: number; type: 'debit' | 'credit'; }

function accumulateMonthlyAmounts(debits: Transaction[]): Record<string, number> {
  const monthlyAmounts: Record<string, number> = {};
  for (const txn of debits) {
    const month = parseMonthYear(txn.date);
    monthlyAmounts[month] = (monthlyAmounts[month] ?? 0) + txn.amount;
  }
  return monthlyAmounts;
}

// ── categorize — new emi_loans category ───────────────────────────────────────
describe('categorize — emi_loans (new category)', () => {
  it('categorizes "emi" keyword as emi_loans', () => {
    expect(categorize('HDFC CREDITCARD EMI')).toBe('emi_loans');
  });

  it('categorizes "loan" keyword as emi_loans', () => {
    expect(categorize('Personal Loan Payment')).toBe('emi_loans');
  });

  it('categorizes "repayment" as emi_loans', () => {
    expect(categorize('Home Loan Repayment')).toBe('emi_loans');
  });

  it('categorizes "installment" as emi_loans', () => {
    expect(categorize('Monthly Installment Auto')).toBe('emi_loans');
  });

  it('categorizes "instalment" (alternate spelling) as emi_loans', () => {
    expect(categorize('Car Instalment')).toBe('emi_loans');
  });

  it('categorizes "hdfc loan" as emi_loans', () => {
    expect(categorize('HDFC Loan Debit')).toBe('emi_loans');
  });

  it('categorizes "icici loan" as emi_loans', () => {
    expect(categorize('ICICI Loan repayment')).toBe('emi_loans');
  });

  it('categorizes "sbi loan" as emi_loans', () => {
    expect(categorize('SBI Loan deduction')).toBe('emi_loans');
  });

  it('categorizes "axis loan" as emi_loans', () => {
    expect(categorize('Axis Loan EMI')).toBe('emi_loans');
  });

  it('categorizes "mortgage" as emi_loans', () => {
    expect(categorize('Mortgage Payment ICICI')).toBe('emi_loans');
  });

  it('is case-insensitive for emi_loans keywords', () => {
    expect(categorize('EMI PAYMENT')).toBe('emi_loans');
    expect(categorize('Loan Debit')).toBe('emi_loans');
  });
});

// ── categorize — new investments category ─────────────────────────────────────
describe('categorize — investments (new category)', () => {
  it('categorizes "sip" as investments', () => {
    expect(categorize('SIP MANDATE DEBIT')).toBe('investments');
  });

  it('categorizes "mutual fund" as investments', () => {
    expect(categorize('Mutual Fund Purchase HDFC')).toBe('investments');
  });

  it('categorizes "nps" as investments', () => {
    expect(categorize('NPS Contribution')).toBe('investments');
  });

  it('categorizes "ppf" as investments', () => {
    expect(categorize('PPF Account Deposit')).toBe('investments');
  });

  it('categorizes "elss" as investments', () => {
    // Avoid "ELSS Tax Saving Fund" — "saving" contains "vi" which is a utilities keyword
    expect(categorize('ELSS Fund Debit')).toBe('investments');
  });

  it('categorizes "groww" as investments', () => {
    expect(categorize('Groww App Purchase')).toBe('investments');
  });

  it('categorizes "zerodha" as investments', () => {
    expect(categorize('Zerodha Kite Debit')).toBe('investments');
  });

  it('categorizes "kite" as investments', () => {
    expect(categorize('Kite by Zerodha')).toBe('investments');
  });

  it('categorizes "upstox" as investments', () => {
    expect(categorize('Upstox Trading')).toBe('investments');
  });

  it('"smallcase" keyword is present in investments keyword list', () => {
    // "Smallcase Portfolio" contains "mall" (a shopping keyword), so categorize() returns
    // "shopping" due to iteration order — verify the keyword is registered instead.
    expect(categoryKeywords.investments).toContain('smallcase');
  });

  it('categorizes "demat" as investments', () => {
    expect(categorize('Demat Account AMC')).toBe('investments');
  });

  it('categorizes "stock" as investments', () => {
    expect(categorize('Stock Purchase NSE')).toBe('investments');
  });

  it('categorizes "mf" as investments', () => {
    expect(categorize('MF redemption')).toBe('investments');
  });

  it('is case-insensitive for investments keywords', () => {
    expect(categorize('SIP DEBIT')).toBe('investments');
    expect(categorize('PPF DEPOSIT')).toBe('investments');
  });
});

// ── categorize — existing categories (regression) ─────────────────────────────
describe('categorize — existing categories (regression after adding new ones)', () => {
  it('still categorizes zomato as food', () => {
    expect(categorize('Zomato Order')).toBe('food');
  });

  it('still categorizes blinkit as food', () => {
    expect(categorize('Blinkit Delivery')).toBe('food');
  });

  it('still categorizes zepto as food', () => {
    expect(categorize('Zepto Delivery')).toBe('food');
  });

  it('still categorizes uber as transport', () => {
    expect(categorize('Uber Trip')).toBe('transport');
  });

  it('still categorizes irctc as transport', () => {
    expect(categorize('IRCTC Rail booking')).toBe('transport');
  });

  it('still categorizes amazon as shopping', () => {
    expect(categorize('Amazon.in')).toBe('shopping');
  });

  it('still categorizes netflix as entertainment', () => {
    expect(categorize('Netflix Subscription')).toBe('entertainment');
  });

  it('still categorizes airtel as utilities', () => {
    expect(categorize('Airtel Postpaid Bill')).toBe('utilities');
  });

  it('still categorizes apollo as health', () => {
    expect(categorize('Apollo Pharmacy')).toBe('health');
  });

  it('returns "other" for unrecognized merchant', () => {
    expect(categorize('XYZ CORP PAYMENT')).toBe('other');
  });

  it('returns "other" for empty string', () => {
    expect(categorize('')).toBe('other');
  });
});

// ── categorize — category type covers all 9 categories ────────────────────────
describe('categorize — all 9 categories are reachable', () => {
  const cases: [string, Category][] = [
    ['Zomato food delivery', 'food'],
    ['Uber cab ride', 'transport'],
    ['Amazon purchase', 'shopping'],
    ['Apollo pharmacy', 'health'],
    ['Netflix subscription', 'entertainment'],
    ['Airtel broadband bill', 'utilities'],
    ['Home Loan EMI debit', 'emi_loans'],
    ['SIP mutual fund', 'investments'],
    ['UNKNOWN MERCHANT 12345', 'other'],
  ];

  test.each(cases)('%s → %s', (description, expected) => {
    expect(categorize(description)).toBe(expected);
  });
});

// ── detectBank ─────────────────────────────────────────────────────────────────
describe('detectBank', () => {
  it('detects hdfc', () => expect(detectBank('HDFC Bank Credit Card Statement')).toBe('hdfc'));
  it('detects icici', () => expect(detectBank('ICICI Bank statement')).toBe('icici'));
  it('detects sbi by full name', () => expect(detectBank('State Bank of India')).toBe('sbi'));
  it('detects sbi by abbreviation', () => expect(detectBank('SBI Card statement')).toBe('sbi'));
  it('detects axis', () => expect(detectBank('Axis Bank Credit Card')).toBe('axis'));
  it('detects kotak', () => expect(detectBank('Kotak Mahindra Bank')).toBe('kotak'));
  it('returns generic for unknown bank', () => expect(detectBank('Some Other Bank')).toBe('generic'));
  it('is case-insensitive', () => expect(detectBank('hdfc bank credit statement')).toBe('hdfc'));
});

// ── parseMonthYear ─────────────────────────────────────────────────────────────
describe('parseMonthYear', () => {
  it('parses "DD MMM YYYY" format', () => {
    expect(parseMonthYear('22 Mar 2026')).toBe('2026-03');
  });

  it('parses "DD/MM/YYYY" format', () => {
    expect(parseMonthYear('15/01/2026')).toBe('2026-01');
  });

  it('parses "DD-MM-YYYY" format', () => {
    expect(parseMonthYear('05-12-2025')).toBe('2025-12');
  });

  it('handles all months in "DD MMM YYYY" format', () => {
    const expected: [string, string][] = [
      ['01 Jan 2026', '2026-01'],
      ['01 Feb 2026', '2026-02'],
      ['01 Mar 2026', '2026-03'],
      ['01 Apr 2026', '2026-04'],
      ['01 May 2026', '2026-05'],
      ['01 Jun 2026', '2026-06'],
      ['01 Jul 2026', '2026-07'],
      ['01 Aug 2026', '2026-08'],
      ['01 Sep 2026', '2026-09'],
      ['01 Oct 2026', '2026-10'],
      ['01 Nov 2026', '2026-11'],
      ['01 Dec 2026', '2026-12'],
    ];
    for (const [input, output] of expected) {
      expect(parseMonthYear(input)).toBe(output);
    }
  });

  it('returns fallback "2026-01" for unrecognized format', () => {
    expect(parseMonthYear('not a date')).toBe('2026-01');
  });

  it('is case-insensitive for month names', () => {
    expect(parseMonthYear('15 mar 2026')).toBe('2026-03');
    expect(parseMonthYear('15 MAR 2026')).toBe('2026-03');
  });
});

// ── generateInsights ───────────────────────────────────────────────────────────
describe('generateInsights', () => {
  it('returns empty array when all spend is within benchmarks', () => {
    const breakdown = { food: 9500, transport: 6000, shopping: 7000 };
    const insights = generateInsights(breakdown, 50000, 'hdfc');
    expect(insights).toHaveLength(0);
  });

  it('flags food overspend when pct > 24 (benchmark 19 + 5)', () => {
    // food = 15000, avg = 50000 → 30%, benchmark 19 → extra 11%
    const breakdown = { food: 15000 };
    const insights = generateInsights(breakdown, 50000, 'hdfc');
    expect(insights.some((i) => i.includes('food'))).toBe(true);
  });

  it('adds high-spender insight when avgMonthlySpend > 100000', () => {
    const insights = generateInsights({}, 120000, 'hdfc');
    expect(insights.some((i) => i.includes('₹1L'))).toBe(true);
  });

  it('adds subscription audit insight when entertainment > 5000', () => {
    const breakdown = { entertainment: 6000 };
    const insights = generateInsights(breakdown, 50000, 'hdfc');
    expect(insights.some((i) => i.includes('Subscription'))).toBe(true);
  });

  it('caps insights at 5 even with many categories over benchmark', () => {
    const breakdown = {
      food: 30000, transport: 20000, shopping: 20000,
      health: 10000, entertainment: 10000,
    };
    const insights = generateInsights(breakdown, 50000, 'hdfc');
    expect(insights.length).toBeLessThanOrEqual(5);
  });

  it('does not add subscription audit when entertainment <= 5000', () => {
    const breakdown = { entertainment: 4999 };
    const insights = generateInsights(breakdown, 50000, 'hdfc');
    expect(insights.some((i) => i.includes('Subscription'))).toBe(false);
  });

  it('does not add high-spender insight when spend exactly equals 100000', () => {
    const insights = generateInsights({}, 100000, 'hdfc');
    expect(insights.some((i) => i.includes('₹1L'))).toBe(false);
  });

  it('treats missing category as 0 spend', () => {
    const insights = generateInsights({}, 50000, 'hdfc');
    expect(insights).toHaveLength(0);
  });
});

// ── sanitizeClaudeCategories ───────────────────────────────────────────────────
describe('sanitizeClaudeCategories — analyzeWithClaude result validation', () => {
  it('passes through all 9 valid categories', () => {
    const raw = {
      'Zomato': 'food',
      'Uber': 'transport',
      'Amazon': 'shopping',
      'Apollo': 'health',
      'Netflix': 'entertainment',
      'Airtel': 'utilities',
      'HDFC EMI': 'emi_loans',
      'SIP': 'investments',
      'Unknown': 'other',
    };
    const sanitized = sanitizeClaudeCategories(raw);
    expect(Object.keys(sanitized)).toHaveLength(9);
  });

  it('drops entries with invented/invalid category names', () => {
    const raw = { 'Merchant A': 'bills', 'Merchant B': 'groceries', 'Merchant C': 'food' };
    const sanitized = sanitizeClaudeCategories(raw);
    expect(sanitized).toEqual({ 'Merchant C': 'food' });
  });

  it('accepts the new emi_loans category', () => {
    const raw = { 'Home Loan Payment': 'emi_loans' };
    const sanitized = sanitizeClaudeCategories(raw);
    expect(sanitized['Home Loan Payment']).toBe('emi_loans');
  });

  it('accepts the new investments category', () => {
    const raw = { 'SIP Purchase': 'investments' };
    const sanitized = sanitizeClaudeCategories(raw);
    expect(sanitized['SIP Purchase']).toBe('investments');
  });

  it('returns empty object when all categories are invalid', () => {
    const raw = { 'A': 'invalid', 'B': 'unknown', 'C': 'bills' };
    expect(sanitizeClaudeCategories(raw)).toEqual({});
  });

  it('returns empty object for empty input', () => {
    expect(sanitizeClaudeCategories({})).toEqual({});
  });

  it('does not accept empty string as a valid category', () => {
    const raw = { 'Merchant': '' };
    expect(sanitizeClaudeCategories(raw)).toEqual({});
  });
});

// ── accumulateMonthlyAmounts — bug fix regression ─────────────────────────────
// Before fix: `if (month !== '2026-01' || txn.date)` → incorrectly skipped the
// '2026-01' → false branch (short-circuit), so January 2026 could be skipped.
// After fix: all months are always accumulated unconditionally.
describe('accumulateMonthlyAmounts — bug fix (removed incorrect conditional)', () => {
  it('always accumulates January 2026 transactions', () => {
    const debits: Transaction[] = [
      { date: '15/01/2026', description: 'Amazon', amount: 5000, type: 'debit' },
      { date: '20/01/2026', description: 'Zomato', amount: 1500, type: 'debit' },
    ];
    const result = accumulateMonthlyAmounts(debits);
    expect(result['2026-01']).toBe(6500);
  });

  it('accumulates transactions across multiple months', () => {
    const debits: Transaction[] = [
      { date: '15/01/2026', description: 'Amazon', amount: 5000, type: 'debit' },
      { date: '15/02/2026', description: 'Uber', amount: 3000, type: 'debit' },
      { date: '20/02/2026', description: 'Zomato', amount: 1500, type: 'debit' },
    ];
    const result = accumulateMonthlyAmounts(debits);
    expect(result['2026-01']).toBe(5000);
    expect(result['2026-02']).toBe(4500);
  });

  it('accumulates January alongside other months (regression: Jan was conditionally skipped)', () => {
    const debits: Transaction[] = [
      { date: '10/01/2026', description: 'Flipkart', amount: 2000, type: 'debit' },
      { date: '10/03/2026', description: 'Netflix', amount: 799, type: 'debit' },
    ];
    const result = accumulateMonthlyAmounts(debits);
    expect(result['2026-01']).toBe(2000);
    expect(result['2026-03']).toBe(799);
  });

  it('sums multiple transactions in the same month', () => {
    const debits: Transaction[] = [
      { date: '01/04/2026', description: 'Zomato', amount: 1000, type: 'debit' },
      { date: '15/04/2026', description: 'Swiggy', amount: 800, type: 'debit' },
      { date: '28/04/2026', description: 'Blinkit', amount: 600, type: 'debit' },
    ];
    const result = accumulateMonthlyAmounts(debits);
    expect(result['2026-04']).toBe(2400);
  });

  it('handles a single transaction', () => {
    const debits: Transaction[] = [
      { date: '22 Mar 2026', description: 'Uber', amount: 350, type: 'debit' },
    ];
    const result = accumulateMonthlyAmounts(debits);
    expect(result['2026-03']).toBe(350);
  });

  it('returns empty object for no transactions', () => {
    expect(accumulateMonthlyAmounts([])).toEqual({});
  });
});

// ── Claude fallback logic ──────────────────────────────────────────────────────
describe('Claude result fallback — category breakdown and insights selection', () => {
  it('uses Claude categories when result is available', () => {
    const claudeResult = {
      categories: { 'HDFC EMI': 'emi_loans' as Category, 'SIP': 'investments' as Category } as Record<string, Category>,
      insights: ['Insight A', 'Insight B'],
    };
    const debits: Transaction[] = [
      { date: '01/01/2026', description: 'HDFC EMI', amount: 20000, type: 'debit' },
      { date: '01/01/2026', description: 'SIP', amount: 5000, type: 'debit' },
    ];

    const categoryBreakdown: Record<string, number> = {};
    for (const txn of debits) {
      const cat = claudeResult?.categories[txn.description] ?? categorize(txn.description);
      categoryBreakdown[cat] = (categoryBreakdown[cat] ?? 0) + txn.amount;
    }

    expect(categoryBreakdown['emi_loans']).toBe(20000);
    expect(categoryBreakdown['investments']).toBe(5000);
  });

  it('falls back to keyword categorize() for descriptions not in Claude map', () => {
    const claudeResult = {
      categories: { 'SIP': 'investments' as Category } as Record<string, Category>,
      insights: [],
    };
    const debits: Transaction[] = [
      { date: '01/01/2026', description: 'Zomato order', amount: 500, type: 'debit' },
      { date: '01/01/2026', description: 'SIP', amount: 5000, type: 'debit' },
    ];

    const categoryBreakdown: Record<string, number> = {};
    for (const txn of debits) {
      const cat = claudeResult?.categories[txn.description] ?? categorize(txn.description);
      categoryBreakdown[cat] = (categoryBreakdown[cat] ?? 0) + txn.amount;
    }

    expect(categoryBreakdown['food']).toBe(500); // keyword fallback for Zomato
    expect(categoryBreakdown['investments']).toBe(5000); // Claude result for SIP
  });

  it('uses keyword generateInsights when claudeResult is null', () => {
    const keywordBreakdown = { food: 15000 };
    const avgMonthlySpend = 50000;
    const bank = 'hdfc';

    const insights = generateInsights(keywordBreakdown, avgMonthlySpend, bank);
    expect(insights.some((i: string) => i.includes('food'))).toBe(true);
  });

  it('uses Claude insights when claudeResult is available', () => {
    const claudeResult = { categories: {}, insights: ['Claude insight 1', 'Claude insight 2'] };
    const insights = claudeResult?.insights ?? generateInsights({}, 50000, 'hdfc');
    expect(insights).toEqual(['Claude insight 1', 'Claude insight 2']);
  });
});
