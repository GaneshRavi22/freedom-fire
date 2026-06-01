/**
 * Tests for the pure logic functions inside the parse-credit-card-pdf Edge Function.
 * Since the edge function runs on Deno and can't be imported by Jest, the pure
 * functions are replicated here and kept in sync with the edge function source.
 */

// ── Types ────────────────────────────────────────────────────────────────────
type Category = 'food' | 'transport' | 'shopping' | 'health' | 'entertainment' | 'utilities' | 'other';

interface Transaction {
  date: string;
  description: string;
  amount: number;
  type: 'debit' | 'credit';
}

// ── Pure functions (mirror of supabase/functions/parse-credit-card-pdf/index.ts) ──

const categoryKeywords: Record<Category, string[]> = {
  other: [],
  food: ['zomato', 'swiggy', 'restaurant', 'café', 'cafe', 'food', 'dining', 'blinkit', 'zepto', 'instamart', 'bigbasket', 'dominos', 'mcdonald', 'kfc', 'pizza', 'burger', 'hotel', 'dhaba', 'canteen', 'bakery', 'kitchen', 'eat', 'dine'],
  transport: ['uber', 'ola', 'rapido', 'metro', 'irctc', 'railway', 'bus', 'petrol', 'diesel', 'fuel', 'parking', 'toll', 'fastag', 'namma metro', 'bmtc', 'airlines', 'air india', 'indigo', 'spicejet', 'flight', 'taxi'],
  shopping: ['amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'nykaa', 'h&m', 'zara', 'lifestyle', 'shoppers stop', 'reliance retail', 'dmart', 'big bazaar', 'market', 'store', 'shop', 'mall', 'fashion', 'apparel', 'clothes'],
  health: ['pharmacy', 'hospital', 'clinic', 'doctor', 'medical', 'health', 'apollo', 'fortis', 'manipal', 'medplus', 'netmeds', '1mg', 'pharmeasy', 'lab', 'diagnostic', 'test', 'gym', 'cult.fit', 'fitness', 'wellness', 'insurance'],
  entertainment: ['netflix', 'hotstar', 'prime video', 'spotify', 'youtube', 'apple', 'google play', 'playstation', 'xbox', 'steam', 'pvr', 'inox', 'cinema', 'theatre', 'movie', 'concert', 'event', 'bookmyshow', 'game'],
  utilities: ['electricity', 'bescom', 'bwssb', 'water', 'gas', 'internet', 'airtel', 'jio', 'vodafone', 'bsnl', 'vi', 'broadband', 'dth', 'tata sky', 'dish tv', 'recharge', 'postpaid', 'prepaid', 'bill'],
};

function categorize(description: string): Category {
  const desc = description.toLowerCase();
  for (const [category, keywords] of Object.entries(categoryKeywords) as [Category, string[]][]) {
    if (keywords.some((kw) => desc.includes(kw))) return category;
  }
  return 'other';
}

function detectBank(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('hdfc bank')) return 'hdfc';
  if (lower.includes('icici bank')) return 'icici';
  if (lower.includes('state bank of india') || lower.includes('sbi')) return 'sbi';
  if (lower.includes('axis bank')) return 'axis';
  if (lower.includes('kotak')) return 'kotak';
  return 'generic';
}

function extractTransactionsHDFC(text: string): Transaction[] {
  const transactions: Transaction[] = [];
  const pattern = /(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([\d,]+\.\d{2})\s+(Dr|Cr)/gi;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    transactions.push({
      date: match[1],
      description: match[2].trim(),
      amount: parseFloat(match[3].replace(/,/g, '')),
      type: match[4].toLowerCase() === 'dr' ? 'debit' : 'credit',
    });
  }
  return transactions;
}

function extractTransactionsICICI(text: string): Transaction[] {
  const transactions: Transaction[] = [];
  const pattern = /(\d{2}\s+\w{3}\s+\d{4})\s+(.+?)\s+([\d,]+\.\d{2})/gi;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const amount = parseFloat(match[3].replace(/,/g, ''));
    if (amount > 0) {
      transactions.push({ date: match[1], description: match[2].trim(), amount, type: 'debit' });
    }
  }
  return transactions;
}

function extractTransactionsSBI(text: string): Transaction[] {
  const transactions: Transaction[] = [];
  const pattern = /(\d{2}-\d{2}-\d{4})\s+(.+?)\s+([\d,]+\.\d{2})\s+Debit/gi;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    transactions.push({
      date: match[1],
      description: match[2].trim(),
      amount: parseFloat(match[3].replace(/,/g, '')),
      type: 'debit',
    });
  }
  return transactions;
}

function extractTransactionsGeneric(text: string): Transaction[] {
  const transactions: Transaction[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const amountMatch = line.match(/([\d,]+\.\d{2})/);
    if (!amountMatch) continue;
    const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    if (amount < 1 || amount > 500000) continue;
    const descMatch = line.match(/([A-Za-z][A-Za-z0-9\s\-\/&*@.]{4,50})/);
    if (!descMatch) continue;
    const dateMatch = line.match(/\d{2}[\/\-]\d{2}[\/\-]\d{2,4}/);
    transactions.push({ date: dateMatch?.[0] ?? '', description: descMatch[1].trim(), amount, type: 'debit' });
  }
  return transactions;
}

function parseMonthYear(date: string): string {
  const d = new Date(date.replace(/(\d{2})[\/\-](\d{2})[\/\-](\d{2,4})/, '$3-$2-$1'));
  if (isNaN(d.getTime())) return '2026-01';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── detectBank ───────────────────────────────────────────────────────────────
describe('detectBank', () => {
  it('detects HDFC', () => expect(detectBank('HDFC Bank Credit Card Statement')).toBe('hdfc'));
  it('detects ICICI', () => expect(detectBank('ICICI Bank statement')).toBe('icici'));
  it('detects SBI by full name', () => expect(detectBank('State Bank of India')).toBe('sbi'));
  it('detects SBI by abbreviation', () => expect(detectBank('SBI Credit Card')).toBe('sbi'));
  it('detects Axis Bank', () => expect(detectBank('Axis Bank statement')).toBe('axis'));
  it('detects Kotak', () => expect(detectBank('Kotak Mahindra Bank')).toBe('kotak'));
  it('falls back to generic for unknown banks', () => expect(detectBank('Yes Bank statement')).toBe('generic'));
  it('is case-insensitive', () => expect(detectBank('hdfc bank')).toBe('hdfc'));
});

// ── categorize ───────────────────────────────────────────────────────────────
describe('categorize', () => {
  it.each([
    ['Zomato Order', 'food'],
    ['SWIGGY DELIVERY', 'food'],
    ['Uber Ride', 'transport'],
    ['OLA CAB', 'transport'],
    ['IRCTC Train Booking', 'transport'],
    ['Amazon Purchase', 'shopping'],
    ['FLIPKART ORDER', 'shopping'],
    ['Apollo Pharmacy', 'health'],
    ['Gym Membership', 'health'],
    ['Netflix Subscription', 'entertainment'],
    ['PVR Cinemas', 'entertainment'],
    ['Airtel Bill', 'utilities'],
    ['JIO Recharge', 'utilities'],
  ])('categorizes "%s" as %s', (description, expected) => {
    expect(categorize(description)).toBe(expected);
  });

  it('returns "other" for unrecognised descriptions', () => {
    expect(categorize('Random XYZ transaction')).toBe('other');
  });

  it('is case-insensitive', () => {
    expect(categorize('ZOMATO')).toBe('food');
    expect(categorize('zomato')).toBe('food');
  });
});

// ── HDFC parser ──────────────────────────────────────────────────────────────
describe('extractTransactionsHDFC', () => {
  const sample = `
HDFC Bank Credit Card Statement
15/01/2026 Zomato Food Order 1,250.00 Dr
16/01/2026 Flipkart Purchase 3,499.00 Dr
17/01/2026 Payment Received 10,000.00 Cr
18/01/2026 Uber Ride 450.00 Dr
`;

  it('extracts all transactions', () => {
    const txns = extractTransactionsHDFC(sample);
    expect(txns).toHaveLength(4);
  });

  it('parses debit transactions correctly', () => {
    const txns = extractTransactionsHDFC(sample);
    const debit = txns.find((t) => t.description === 'Zomato Food Order');
    expect(debit).toBeDefined();
    expect(debit!.amount).toBe(1250);
    expect(debit!.type).toBe('debit');
    expect(debit!.date).toBe('15/01/2026');
  });

  it('parses credit transactions correctly', () => {
    const txns = extractTransactionsHDFC(sample);
    const credit = txns.find((t) => t.type === 'credit');
    expect(credit).toBeDefined();
    expect(credit!.amount).toBe(10000);
  });

  it('handles amounts with commas', () => {
    const txns = extractTransactionsHDFC(sample);
    const txn = txns.find((t) => t.description === 'Flipkart Purchase');
    expect(txn!.amount).toBe(3499);
  });

  it('returns empty array for non-HDFC text', () => {
    expect(extractTransactionsHDFC('no transactions here')).toHaveLength(0);
  });
});

// ── ICICI parser ─────────────────────────────────────────────────────────────
describe('extractTransactionsICICI', () => {
  const sample = `
ICICI Bank Credit Card
15 Jan 2026 Amazon Shopping 2,500.00
16 Jan 2026 Netflix Subscription 649.00
17 Jan 2026 Petrol Station 3,200.00
`;

  it('extracts transactions from ICICI format', () => {
    const txns = extractTransactionsICICI(sample);
    expect(txns).toHaveLength(3);
  });

  it('parses date and description correctly', () => {
    const txns = extractTransactionsICICI(sample);
    const txn = txns.find((t) => t.description.includes('Amazon'));
    expect(txn).toBeDefined();
    expect(txn!.amount).toBe(2500);
    expect(txn!.type).toBe('debit');
  });
});

// ── SBI parser ───────────────────────────────────────────────────────────────
describe('extractTransactionsSBI', () => {
  const sample = `
State Bank of India
15-01-2026 Swiggy Food 850.00 Debit
16-01-2026 Metro Card Recharge 200.00 Debit
17-01-2026 Credit Entry 5000.00 Credit
`;

  it('extracts only debit transactions', () => {
    const txns = extractTransactionsSBI(sample);
    expect(txns).toHaveLength(2);
    txns.forEach((t) => expect(t.type).toBe('debit'));
  });

  it('parses dash-separated dates', () => {
    const txns = extractTransactionsSBI(sample);
    expect(txns[0].date).toBe('15-01-2026');
  });
});

// ── Generic parser ───────────────────────────────────────────────────────────
describe('extractTransactionsGeneric', () => {
  const sample = `
Some Bank Statement
15/01/2026 Zomato Order 1200.00
16/01/2026 Amazon Purchase 4500.00
Tiny amount 0.50
Too large 600000.00
`;

  it('extracts transactions with valid amounts', () => {
    const txns = extractTransactionsGeneric(sample);
    // Should include Zomato and Amazon, exclude 0.50 (< 1) and 600000 (> 500000)
    expect(txns.length).toBeGreaterThanOrEqual(2);
  });

  it('filters out amounts below ₹1', () => {
    const txns = extractTransactionsGeneric(sample);
    txns.forEach((t) => expect(t.amount).toBeGreaterThanOrEqual(1));
  });

  it('filters out amounts above ₹5,00,000', () => {
    const txns = extractTransactionsGeneric(sample);
    txns.forEach((t) => expect(t.amount).toBeLessThanOrEqual(500000));
  });

  it('assigns empty date when no date pattern found', () => {
    const noDate = 'Zomato Order 1200.00\n';
    const txns = extractTransactionsGeneric(noDate);
    if (txns.length > 0) {
      expect(txns[0].date).toBe('');
    }
  });
});

// ── parseMonthYear ───────────────────────────────────────────────────────────
describe('parseMonthYear', () => {
  it('parses DD/MM/YYYY format', () => {
    expect(parseMonthYear('15/01/2026')).toBe('2026-01');
    expect(parseMonthYear('03/12/2025')).toBe('2025-12');
  });

  it('parses DD-MM-YYYY format', () => {
    expect(parseMonthYear('15-01-2026')).toBe('2026-01');
  });

  it('pads single-digit months', () => {
    expect(parseMonthYear('15/01/2026')).toBe('2026-01');
  });

  it('returns fallback for invalid date', () => {
    expect(parseMonthYear('invalid')).toBe('2026-01');
    expect(parseMonthYear('')).toBe('2026-01');
  });
});
