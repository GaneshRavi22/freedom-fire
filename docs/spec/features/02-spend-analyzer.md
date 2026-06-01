# Feature Spec: Spend Analyzer

**Purpose:** Upload a credit card PDF statement → automatic transaction extraction and
categorisation → spending insights → FIRE impact of cost-cutting recommendations.

**Implementation files:**
- `supabase/functions/parse-credit-card-pdf/index.ts` — PDF parsing Edge Function
- `stores/spend.store.ts` — upload flow + state
- `app/(tabs)/spend-analyzer.tsx` — UI (two sub-tabs: Spend Insights, EMI Insights)

---

## Two Sub-Tabs

### Sub-tab 1: Spend Insights
Upload flow → outlier toggles → category breakdown → recommendations → charts → insights

### Sub-tab 2: EMI Insights
Read-only — computed from `fire_calculations` row. Does not require a PDF upload.
Shows how EMI delays retirement and how loan tenure inflates corpus requirement.

---

## PDF Upload Flow

```
1. User taps upload zone → expo-document-picker opens (PDF only, single file)
2. Client-side encryption check:
   Read first 1024 bytes of file as latin1 string.
   If contains '/Encrypt' AND no password provided:
     → Store file as pendingFile in spend store
     → Show password modal
     → User enters password → call analyzeWithPassword(userId, password)
     → Proceed to step 3 with password in request
3. Upload to Supabase Storage:
   Bucket: 'statements'
   Path: '{userId}/{Date.now()}_{sanitized_filename}'
4. Invoke parse-credit-card-pdf Edge Function:
   Body: { filePath, userId, password? }
5. On success: save result to spend_analyses table
6. Render outlier card if outlier_transactions.length > 0
```

**Error codes from Edge Function:**
- `PASSWORD_PROTECTED` → show password input
- `WRONG_PASSWORD` → show "Incorrect password. Please try again."
- Any other error → red error banner with message text

---

## Edge Function: parse-credit-card-pdf

### Text Extraction
Uses `unpdf` library (Deno-compatible; avoids Node.js globals that crash Deno).
`extractText(buffer, { mergePages: true })` → single concatenated string.

### Transaction Extraction Algorithm

```
1. Find all date anchors in text using regex:
   Pattern: DD/MM/YYYY  |  DD-MM-YYYY  |  DD MMM YYYY  (case insensitive)
   Store: { date, position_after_date }

2. For each anchor i:
   segment = text[anchor[i].end .. min(anchor[i+1].end, anchor[i].end + 250)]
   (250-char cap prevents one long segment swallowing many transactions)

3. Skip second date in segment (some statements print transaction date + posting date):
   If segment starts with another date pattern, slice it off.

4. Find last amount in segment:
   Pattern: [C₹]? \s* (digits,digits.dd) \s* (Dr|Cr|DR|CR)?
   Note: ₹ is often decoded as "C" by PDF readers — handle both
   Valid amount range: ₹10 – ₹20,00,000
   Type: 'cr' in suffix → 'credit', otherwise → 'debit'

5. Description = segment text before the amount match, trimmed
   Skip if description < 3 chars

6. Only keep debits (type = 'debit') for expense analysis
```

### Categorisation

Keyword lookup (case-insensitive substring match). First matching category wins.
Categories checked in order: food, transport, shopping, health, entertainment, utilities, other.

**Category keywords (India-specific):**
```
food:          zomato, swiggy, restaurant, café, cafe, food, dining, blinkit, zepto,
               instamart, bigbasket, dominos, mcdonald, kfc, pizza, burger, hotel,
               dhaba, canteen, bakery, kitchen, eat, dine
transport:     uber, ola, rapido, metro, irctc, railway, bus, petrol, diesel, fuel,
               parking, toll, fastag, namma metro, bmtc, airlines, air india, indigo,
               spicejet, flight, taxi
shopping:      amazon, flipkart, myntra, ajio, meesho, nykaa, h&m, zara, lifestyle,
               shoppers stop, reliance retail, dmart, big bazaar, market, store, shop,
               mall, fashion, apparel, clothes
health:        pharmacy, hospital, clinic, doctor, medical, health, apollo, fortis,
               manipal, medplus, netmeds, 1mg, pharmeasy, lab, diagnostic, test, gym,
               cult.fit, fitness, wellness, insurance
entertainment: netflix, hotstar, prime video, spotify, youtube, apple, google play,
               playstation, xbox, steam, pvr, inox, cinema, theatre, movie, concert,
               event, bookmyshow, game
utilities:     electricity, bescom, bwssb, water, gas, internet, airtel, jio, vodafone,
               bsnl, vi, broadband, dth, tata sky, dish tv, recharge, postpaid, prepaid, bill
other:         (catch-all — no keywords)
```

### Outlier Detection

```
threshold = avg_monthly_spend × 0.4  // 40% of monthly average

For each debit transaction:
  if amount < threshold: skip
  
  // For multi-month statements: skip if same merchant appears in multiple months
  // (recurring large charges like rent are intentional, not outliers)
  if period_months > 1:
    desc_prefix = description.lower()[0:15]
    months_present = count distinct months where description starts with desc_prefix
    if months_present > 1: skip
  
  // Deterministic ID for stable toggle state across re-renders
  id = "{date}|{round(amount)}|{description.lower().replace(' ','')[0:12]}"
  
  Add to outliers: { id, date, description, amount, category, month }

Sort outliers by amount descending.
```

### Insight Generation

Benchmark table (% of avg monthly spend):
```
food:          19%
transport:     12%
shopping:      14%
health:         7%
entertainment:  8%
```

For each category: if actual_pct > benchmark + 5%, generate message:
`"You spend {pct}% on {category} — {excess}% above the average Indian household.
Small cuts here could fast-track your FIRE date."`

Additional insights:
- If avg_monthly_spend > ₹1,00,000: "Targeting 15% reduction could save ₹18L+ over 10 years"
- If entertainment > ₹5,000: "Subscription audit: Review streaming services"

Return up to 5 insights (prioritised).

### Bank Detection
Scan full text for: 'hdfc bank', 'icici bank', 'state bank of india', 'sbi', 'axis bank', 'kotak'
Returns: 'hdfc' | 'icici' | 'sbi' | 'axis' | 'kotak' | 'generic'

### Edge Function Response
```typescript
{
  avgMonthlySpend: number,
  periodMonths: number,
  categoryBreakdown: Record<string, number>,  // category → total INR
  monthlyTrend: Array<{ month: string, amount: number }>,  // YYYY-MM
  insights: string[],
  outlierTransactions: Array<{
    id: string,
    date: string,
    description: string,
    amount: number,
    category: string,
    month: string,
  }>,
  bank: string,
  transactionCount: number,
}
```

---

## Outlier Toggle Behaviour

User can mark outlier transactions as "Ignore" to exclude them from averages.

```
toggleIgnore(transactionId):
  If id in ignored_transaction_ids: remove it
  Else: add it

effective_avg_monthly_spend = recalculate:
  ignored_total = sum(outliers where id in ignored_ids, amount)
  effective_total = total_debit_spend - ignored_total
  effective_avg = effective_total / period_months

Persist: update spend_analyses SET ignored_transaction_ids = [...], effective_avg_monthly_spend = X
```

"Generate Insights" button triggers this persist and reveals the full analysis.

---

## Recommendations

### Fast-Commerce
If `food > 10% of avg_monthly_spend`:
- Show estimated food delivery + quick commerce breakdown
- Suggestion: "Reduce orders by 30% → Save ₹X/month"
- If `fire_calculations` exists: show FIRE Impact badge:
  - "Retire X months/years earlier"
  - Reduced corpus needed
  - "Investing ₹X/mo note"

### Subscriptions
If `entertainment > ₹5,000/month`:
- Show streaming subscription estimates
- 3 scenarios: cancel 1–2, cancel 3–4, cancel most
- Each with savings amount + FIRE impact badge

### Savings Simulator
Always shown after analysis. User can adjust a custom monthly savings reduction:
- Preset chips: ₹1k, ₹2k, ₹3k, ₹5k, ₹7.5k, ₹10k
- Custom input field
- FIRE Impact badge updates in real time

---

## Sub-tab 2: EMI Insights

Requires `fire_calculations` row with `monthly_emi > 0`.

### EMI Delay Card
```
With EMI:     monthly_savings = income - expenses - emi → years_to_fire_with_emi
Without EMI:  monthly_savings = income - expenses       → years_to_fire_no_emi
Delay = years_to_fire_with_emi - years_to_fire_no_emi
```
Display: "Your EMI is costing you N years of freedom"

### Tenure Impact Card
```
fire_number_at_actual_retire_age     (with full loan tenure)
fire_number_at_earlier_retire_age    (if loan paid off earlier)
extra_corpus = fire_number_actual - fire_number_earlier
```
Display: table comparing target corpus at two retire ages, extra amount highlighted red.

Tip box: prepayment reduces tenure, shrinks corpus target, and frees EMI sooner — triple compounding.

---

## Acceptance Criteria

- [ ] Date regex matches DD/MM/YYYY, DD-MM-YYYY, DD MMM YYYY formats
- [ ] ₹ decoded as "C" is still parsed as valid amount prefix
- [ ] Segment capped at 250 chars (no transaction swallows the next)
- [ ] Only debits (not credits) counted toward spend totals
- [ ] Outlier threshold = 40% of avg_monthly_spend
- [ ] Multi-month recurring charges NOT flagged as outliers
- [ ] Ignoring outlier reduces effective_avg_monthly_spend correctly
- [ ] PASSWORD_PROTECTED vs WRONG_PASSWORD error codes returned correctly
- [ ] Category keywords are case-insensitive substring matches
- [ ] Insights limited to 5 messages max
- [ ] EMI delay correctly shows difference between with-EMI and without-EMI retirement age
