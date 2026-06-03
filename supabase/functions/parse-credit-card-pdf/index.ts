import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractText } from 'https://esm.sh/unpdf@0.11.0';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.36.3';
import { createLangfuseClient, LangfuseClient } from '../_shared/langfuse.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Transaction {
  date: string;
  description: string;
  amount: number;
  type: 'debit' | 'credit';
}

interface OutlierTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  month: string;
}

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

// Categories added in Claude upgrade — keywords kept for initial pass + fallback
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

// ── Claude-powered categorization + insight generation ────────────────────────
// Sends unique transaction descriptions to Claude Haiku for semantic categorization
// and personalized insight generation. Falls back to keyword matching on any error.

const CATEGORIZE_SYSTEM = `You are analyzing Indian credit card statements for a FIRE planning app.

Categories (use exactly these names):
- food: restaurants, delivery apps (Zomato, Swiggy, Blinkit, Zepto), groceries, cafes
- transport: cabs (Uber, Ola, Rapido), fuel, metro, IRCTC/flights, parking/fastag
- shopping: Amazon, Flipkart, fashion, retail, D-Mart, electronics
- health: pharmacies, hospitals, gyms, health insurance premiums, diagnostic labs
- entertainment: streaming (Netflix, Hotstar, Spotify), movies, events, gaming
- utilities: electricity, internet, phone bills, DTH, water/gas
- emi_loans: EMI payments, loan repayments, any credit card bill payment
- investments: SIP, mutual fund purchases, PPF, NPS, ELSS, stock/demat transactions
- other: anything that doesn't fit the above

Indian-specific: quick commerce (Blinkit, Zepto) is food; IRCTC is transport; life/term insurance premiums are investments.

Generate insights that mention actual ₹ amounts, are actionable for FIRE planning, and use Indian financial context (SIP, EMI, corpus, freedom days).`;

interface ClaudeAnalysisResult {
  categories: Record<string, Category>;
  insights: string[];
}

async function analyzeWithClaude(
  anthropic: Anthropic,
  uniqueDescriptions: string[],
  avgMonthlySpend: number,
  bank: string,
  currentBreakdown: Record<string, number>,
  lf: LangfuseClient,
  traceId: string,
): Promise<ClaudeAnalysisResult | null> {
  const ANALYZE_TOOL: Anthropic.Tool = {
    name: 'analyze_transactions',
    description: 'Categorize transactions and generate personalized spending insights',
    input_schema: {
      type: 'object' as const,
      properties: {
        categories: {
          type: 'object' as const,
          description: 'Map of each transaction description to its category',
          additionalProperties: { type: 'string' },
        },
        insights: {
          type: 'array' as const,
          description: '3-5 actionable insights referencing actual ₹ amounts from the breakdown',
          items: { type: 'string' },
          minItems: 3,
          maxItems: 5,
        },
      },
      required: ['categories', 'insights'],
    },
  };

  const spendSummary = Object.entries(currentBreakdown)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .map(([cat, amt]) => `${cat}: ₹${Math.round(amt as number).toLocaleString('en-IN')}`)
    .join(', ');

  const userMessage = `Bank: ${bank}
Avg monthly spend: ₹${avgMonthlySpend.toLocaleString('en-IN')}
Category totals (keyword-matched): ${spendSummary}

Unique merchant descriptions to categorize (${uniqueDescriptions.length}):
${uniqueDescriptions.slice(0, 200).join('\n')}

Categorize each merchant and generate 3–5 actionable spending insights.`;

  // Cache the static system prompt — same for every statement parse
  const cachedSystem = [
    { type: 'text' as const, text: CATEGORIZE_SYSTEM, cache_control: { type: 'ephemeral' as const } },
  ];

  const genStart = new Date();
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: cachedSystem as Anthropic.TextBlockParam[],
      messages: [{ role: 'user', content: userMessage }],
      tools: [ANALYZE_TOOL],
      tool_choice: { type: 'any' },
    });

    lf.generation({
      id: crypto.randomUUID(),
      traceId,
      name: 'analyze-transactions',
      model: 'claude-haiku-4-5-20251001',
      input: userMessage,
      output: response.content,
      startTime: genStart,
      endTime: new Date(),
      usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
      metadata: { bank, uniqueDescriptions: uniqueDescriptions.length },
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );
    if (toolUse?.name !== 'analyze_transactions') return null;

    const { categories, insights } = toolUse.input as { categories: Record<string, string>; insights: string[] };

    // Validate category values — drop any Claude made up
    const validCategories = new Set<Category>([
      'food', 'transport', 'shopping', 'health', 'entertainment',
      'utilities', 'emi_loans', 'investments', 'other',
    ]);
    const sanitized: Record<string, Category> = {};
    for (const [desc, cat] of Object.entries(categories)) {
      if (validCategories.has(cat as Category)) sanitized[desc] = cat as Category;
    }

    return { categories: sanitized, insights: insights ?? [] };
  } catch {
    return null;
  }
}

function categorize(description: string): Category {
  const desc = description.toLowerCase();
  for (const [category, keywords] of Object.entries(categoryKeywords) as [Category, string[]][]) {
    if (keywords.some((kw) => desc.includes(kw))) return category;
  }
  return 'other';
}

// Extracts transactions from flat text (unpdf joins all PDF text items with spaces,
// so we anchor on date patterns and take the segment between consecutive dates).
function extractTransactions(text: string): Transaction[] {
  const transactions: Transaction[] = [];

  // Covers DD/MM/YYYY, DD-MM-YYYY, DD MMM YYYY, DD MMM, YYYY
  const dateRe =
    /\b(\d{1,2}[\/\-]\d{2}[\/\-]\d{4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[,\s]+\d{4})\b/gi;

  const anchors: { date: string; tail: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = dateRe.exec(text)) !== null) {
    anchors.push({ date: m[1].replace(',', '').trim(), tail: m.index + m[0].length });
  }

  for (let i = 0; i < anchors.length; i++) {
    const { date, tail } = anchors[i];
    // Cap at 250 chars so one long segment doesn't swallow many transactions
    const segEnd = Math.min(anchors[i + 1]?.tail ?? text.length, tail + 250);
    let segment = text.slice(tail, segEnd).trim();

    // Some statements print two dates per row (transaction date + posting date); skip the second
    const secondDate =
      /^(\d{1,2}[\/\-]\d{2}[\/\-]\d{4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[,\s]+\d{4})\s+/i.exec(segment);
    if (secondDate) segment = segment.slice(secondDate[0].length);

    // ₹ is often decoded as "C" by pdfjs in some PDFs
    const amountRe = /[C₹]?\s*([\d,]+\.\d{2})\s*(Dr|Cr|DR|CR)?/g;
    let last: { amount: number; type: 'debit' | 'credit'; idx: number } | null = null;
    let am: RegExpExecArray | null;
    while ((am = amountRe.exec(segment)) !== null) {
      const val = parseFloat(am[1].replace(/,/g, ''));
      if (val >= 10 && val <= 2_000_000) {
        last = { amount: val, type: (am[2] ?? '').toLowerCase() === 'cr' ? 'credit' : 'debit', idx: am.index };
      }
    }
    if (!last) continue;

    const desc = segment.slice(0, last.idx).replace(/[C₹]/g, '').trim();
    if (desc.length < 3) continue;

    transactions.push({ date, description: desc, amount: last.amount, type: last.type });
  }

  return transactions;
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

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

function parseMonthYear(date: string): string {
  // DD MMM YYYY  (e.g. "22 Mar 2026")
  const textMatch = date.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})/i);
  if (textMatch) {
    const month = MONTH_MAP[textMatch[2].toLowerCase()];
    if (month) return `${textMatch[3]}-${month}`;
  }
  // DD/MM/YYYY or DD-MM-YYYY
  const d = new Date(date.replace(/(\d{1,2})[\/\-](\d{2})[\/\-](\d{4})/, '$3-$2-$1'));
  if (!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return '2026-01';
}

function generateInsights(
  categoryBreakdown: Record<string, number>,
  avgMonthlySpend: number,
  bank: string
): string[] {
  const insights: string[] = [];
  const benchmarks: Record<string, number> = {
    food: 19,
    transport: 12,
    shopping: 14,
    health: 7,
    entertainment: 8,
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

function detectOutliers(
  debits: Transaction[],
  avgMonthlySpend: number,
  periodMonths: number
): OutlierTransaction[] {
  // Flag any single charge that is >= 40% of the monthly average.
  // These are candidates the user might want to exclude (annual insurance,
  // lump-sum investments, one-off large purchases) so the remaining
  // monthly averages reflect everyday spending.
  const threshold = avgMonthlySpend * 0.4;

  const seen = new Set<string>();
  const outliers: OutlierTransaction[] = [];

  for (const t of debits) {
    if (t.amount < threshold) continue;

    const cat = categorize(t.description);
    const month = parseMonthYear(t.date);
    // Deterministic ID: date + rounded amount + first 12 chars of description
    const id = `${t.date}|${Math.round(t.amount)}|${t.description.replace(/\s+/g, '').slice(0, 12).toLowerCase()}`;

    if (seen.has(id)) continue;
    seen.add(id);

    // For multi-month statements, only flag charges that appear in a single
    // month — recurring large charges (e.g. monthly rent) are intentional.
    if (periodMonths > 1) {
      const descPrefix = t.description.toLowerCase().slice(0, 15);
      const monthsPresent = new Set(
        debits
          .filter((d) => d.description.toLowerCase().slice(0, 15) === descPrefix)
          .map((d) => parseMonthYear(d.date))
      );
      if (monthsPresent.size > 1) continue;
    }

    outliers.push({ id, date: t.date, description: t.description, amount: t.amount, category: cat, month });
  }

  return outliers.sort((a, b) => b.amount - a.amount);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const lf = createLangfuseClient();
  const traceId = crypto.randomUUID();

  try {
    const { filePath, userId, password } = await req.json();
    if (!filePath || !userId) {
      return new Response(JSON.stringify({ error: 'Missing filePath or userId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    lf.trace({
      id: traceId,
      name: 'parse-credit-card-pdf',
      userId,
      input: { filePath },
    });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Download PDF from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('statements')
      .download(filePath);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    const buffer = await fileData.arrayBuffer();

    // Detect encryption before calling pdf-parse — pdf-parse crashes the Deno
    // process on encrypted PDFs rather than throwing, causing a silent
    // "Network Request Failed" on the client. We only block here when no
    // password was supplied; if a password was provided we let pdf-parse try it.
    const rawPdf = new TextDecoder('latin1').decode(new Uint8Array(buffer));
    if (rawPdf.includes('/Encrypt') && !password) {
      return new Response(
        JSON.stringify({ error: 'PASSWORD_PROTECTED' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract text using unpdf (edge-compatible, no Node.js globals)
    let text: string;
    try {
      const { text: pages } = await extractText(new Uint8Array(buffer), { mergePages: true });
      text = Array.isArray(pages) ? pages.join('\n') : pages;
    } catch (parseError: any) {
      const msg = (parseError?.message ?? '').toLowerCase();
      if (msg.includes('password') || msg.includes('encrypt') || msg.includes('incorrect')) {
        return new Response(
          JSON.stringify({ error: password ? 'WRONG_PASSWORD' : 'PASSWORD_PROTECTED' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw parseError;
    }

    const bank = detectBank(text);
    const transactions = extractTransactions(text);

    // Filter to debits only
    const debits = transactions.filter((t) => t.type === 'debit' && t.amount > 0);

    if (debits.length === 0) {
      throw new Error('No transactions found in PDF. Please ensure it is a valid credit card statement.');
    }

    // ── Step 1: keyword-based initial categorization (fast, used as fallback) ──
    const keywordCategoryBreakdown: Record<string, number> = {};
    const monthlyAmounts: Record<string, number> = {};

    for (const txn of debits) {
      const cat = categorize(txn.description);
      keywordCategoryBreakdown[cat] = (keywordCategoryBreakdown[cat] ?? 0) + txn.amount;

      const month = parseMonthYear(txn.date);
      monthlyAmounts[month] = (monthlyAmounts[month] ?? 0) + txn.amount;
    }

    const months = Object.keys(monthlyAmounts).sort();
    const periodMonths = Math.max(months.length, 1);
    const totalSpend = debits.reduce((s, t) => s + t.amount, 0);
    const avgMonthlySpend = Math.round(totalSpend / periodMonths);

    const monthlyTrend = months.map((month) => ({
      month,
      amount: Math.round(monthlyAmounts[month]),
    }));

    // ── Step 2: Claude-powered semantic categorization + richer insights ────────
    const uniqueDescriptions = [...new Set(debits.map((t) => t.description))];
    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
    const claudeResult = await analyzeWithClaude(
      anthropic,
      uniqueDescriptions,
      avgMonthlySpend,
      bank,
      keywordCategoryBreakdown,
      lf,
      traceId,
    );

    // Build final category breakdown using Claude's map; fall back to keyword for any unmapped description
    const categoryBreakdown: Record<string, number> = {};
    for (const txn of debits) {
      const cat = claudeResult?.categories[txn.description] ?? categorize(txn.description);
      categoryBreakdown[cat] = (categoryBreakdown[cat] ?? 0) + txn.amount;
    }

    const insights = claudeResult?.insights ?? generateInsights(keywordCategoryBreakdown, avgMonthlySpend, bank);
    const outlierTransactions = detectOutliers(debits, avgMonthlySpend, periodMonths);

    await lf.flush();
    return new Response(
      JSON.stringify({
        avgMonthlySpend,
        periodMonths,
        categoryBreakdown,
        monthlyTrend,
        insights,
        outlierTransactions,
        bank,
        transactionCount: debits.length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    await lf.flush();
    return new Response(
      JSON.stringify({ error: error.message ?? 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
