# Feature Spec: FIRE Calculator

**Purpose:** Compute the exact corpus a user needs to retire, the year they will hit it, and a
year-by-year wealth timeline — personalised to their income, expenses, loans, and return expectations.

**Implementation files:**
- `lib/fire.ts` — top-level `calculateFire()` orchestrator
- `lib/calculations.ts` — pure math functions
- `stores/fire.store.ts` — DB persistence + Zustand state
- `app/(tabs)/fire-calculator.tsx` — UI
- `supabase/functions/calculate-fire-journey/index.ts` — lightweight Edge Function variant

---

## Inputs

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| `monthly_expenses` | number (INR) | yes | — | > 0 |
| `monthly_income` | number (INR) | yes | — | > 0 |
| `spouse_income` | number (INR) | no | 0 | ≥ 0 |
| `current_savings` | number (INR) | no | 0 | ≥ 0 |
| `monthly_emi` | number (INR) | no | 0 | ≥ 0 |
| `loan_balance` | number (INR) | no | 0 | ≥ 0 |
| `loan_tenure_years` | integer | no | 0 | ≥ 0 |
| `retirement_age` | integer | yes | — | > current_age |
| `expected_return_pct` | number (%) | yes | 12 | 6–20 |
| `inflation_rate_pct` | number (%) | yes | 6 | 3–12 |
| `lifestyle` | 'lean'\|'comfortable'\|'luxury' | yes | 'comfortable' | — |

---

## Outputs (stored in `fire_calculations`)

| Field | Type | Meaning |
|-------|------|---------|
| `fire_number` | number | Inflation-adjusted corpus needed at retirement |
| `monthly_savings` | number | income + spouse_income − expenses − emi |
| `savings_rate` | integer (%) | monthly_savings / (income + spouse_income) × 100 |
| `years_to_fire` | number | Years until wealth ≥ fire_number |
| `retire_at_age` | integer | current_age + years_to_fire |
| `loan_payoff_age` | integer\|null | current_age + loan_tenure_years (null if no loan) |
| `years_accelerated` | number\|null | Years retirement is earlier than without loan |

---

## Algorithm

### Step 1: FIRE Number

```
years_to_retirement = retirement_age - current_age
inflated_annual_expenses = monthly_expenses × 12 × (1 + inflation_rate/100)^years_to_retirement

real_return = expected_return_pct - inflation_rate_pct
SWR = max(real_return, 2.5)   // percent, minimum 2.5%

fire_number = inflated_annual_expenses / (SWR / 100)
```

**Lifestyle SWR overrides:**
```
lean:        SWR uses 4.0%  (corpus multiplier ~25×)
comfortable: SWR uses 3.33% (corpus multiplier ~30×)
luxury:      SWR uses 2.5%  (corpus multiplier ~40×)
```
These override the `max(real_return, 2.5)` formula when lifestyle is set.

**Example:** 30yo, ₹60k/month expenses, retire at 45 (15 years), 12% return, 6% inflation,
comfortable lifestyle:
```
inflated_annual = 60000 × 12 × 1.06^15 = ₹28.73L
SWR = 3.33%
fire_number = 28.73L / 0.0333 = ₹4.78 Cr ≈ ₹4,81,54,000
```

---

### Step 2: Wealth Accumulation (Month-by-Month Simulation)

```
monthly_rate = expected_return_pct / 100 / 12
wealth[0] = current_savings
loan_payoff_month = loan_tenure_years × 12

for month t = 1 to MAX_MONTHS (1200 = 100 years):
  emi_this_month = (t <= loan_payoff_month) ? monthly_emi : 0
  monthly_net = monthly_income + spouse_income - monthly_expenses - emi_this_month
  wealth[t] = wealth[t-1] × (1 + monthly_rate) + monthly_net
  if wealth[t] >= fire_number: return t / 12  // years_to_fire

if never reached: return 999
```

**Key:** When `t > loan_payoff_month`, the freed EMI (e.g. ₹25k/month) adds to monthly
investment, compounding the acceleration effect.

---

### Step 3: Convergence Loop

FIRE number and retirement age are **mutually dependent**: a later retirement age means more
inflation compounding → larger corpus needed → fewer years to accumulate it (circular).

```
retirement_age = target_retirement_age  // initial guess

for iteration = 1 to 10:
  fire_number = calculateFireNumber(..., retirement_age)
  years = calculateYearsToFire(fire_number, ...)
  new_age = current_age + years

  if |new_age - retirement_age| < 0.5: break  // converged
  retirement_age = new_age

return { fire_number, years_to_fire: years, retire_at_age: round(new_age) }
```

Typically converges in 3–5 iterations. Hard cap at 10 to prevent infinite loops.

---

## Edge Cases

| Condition | Behavior |
|-----------|----------|
| `monthly_expenses ≥ monthly_income + spouse_income` | `possible = false`, `retire_at_age = -1`, `years_to_fire = 999`, no corpus shown |
| Wealth ≥ fire_number at month 0 (already at FIRE) | `years_to_fire = 0`, `retire_at_age = current_age`, show celebration |
| Never reaches corpus in 100 years | `years_to_fire = 999`, `retire_at_age = 999`, show warning |
| No loan (`monthly_emi = 0`) | `loan_payoff_age = null`, `years_accelerated = null` |
| `expected_return ≤ inflation` | `SWR` clamped to minimum 2.5% |

---

## One-Update-Per-Day Gate

- `fire_calculations.updated_at` stored in DB
- "Update my FIRE" button disabled when `updated_at` date = today's date
- "Preview my FIRE" always enabled — computes locally, no DB write
- **Why:** Prevents overthinking small parameter tweaks; encourages deliberate weekly updates

---

## UI Specification

### Screen Layout (`app/(tabs)/fire-calculator.tsx`)

1. **Saved Banner** (conditional) — green, "✓ FIRE updated across all screens", auto-hides 2.8s
2. **Collapsible info card** — "What is FIRE?" toggle, hidden by default
3. **Lifestyle selector** — 3 pill buttons: Lean / Comfortable / Luxury, colored badges
4. **Form sections:**
   - Your Lifestyle: monthly expenses, target retirement age
   - Your Income: monthly income, spouse income
   - Your Finances: current savings, monthly EMI, loan amount remaining
   - Assumptions: expected return (6–20%, slider, 0.5 step), inflation (3–12%, slider, 0.5 step)
5. **Action buttons:**
   - "Preview my FIRE" — outline variant, always enabled
   - "Update my FIRE" — gradient, disabled if updated today
6. **Result card** (animated in after first preview/update):
   - "Your FIRE Number" label + highlighted corpus amount
   - 3-stat row: Retire at age | Years away | Real return %
   - Metadata: "Inflation-adjusted to age X"
7. **Wealth chart** (after result exists):
   - Two lines: Your wealth (solid orange) + FIRE target (dashed gold)
   - Crossover badge (green flag) at retirement date
   - Loan payoff badge (amber home icon) if loan exists
8. **Lifestyle scenarios card** — 3 editable rows with live FIRE number per lifestyle

---

## Acceptance Criteria

- [ ] FIRE number matches formula: `inflated_expenses / SWR` (test: `__tests__/lib/calculations.test.ts`)
- [ ] Month-by-month simulation correctly frees EMI after loan_payoff_month
- [ ] Convergence loop terminates within 10 iterations for all valid inputs
- [ ] `expenses ≥ income` → `possible = false` (no crash)
- [ ] Already at FIRE (current_savings ≥ corpus) → `years_to_fire = 0`
- [ ] `real_return ≤ 0` → SWR clamps to 2.5%
- [ ] "Update my FIRE" disabled when `updated_at` is today
- [ ] Upsert uses `user_id` unique constraint (no duplicate rows per user)
- [ ] Lifestyle change recalculates corpus with correct SWR multiplier
