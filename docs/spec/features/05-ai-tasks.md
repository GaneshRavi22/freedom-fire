# Feature Spec: AI-Generated Tasks

**Purpose:** Replace the 4 hardcoded task types in `lib/tasks.ts` with Claude-generated,
personalised tasks based on the user's actual spending patterns and FIRE situation.

**Implementation files:**
- `supabase/functions/generate-tasks/index.ts` — new Edge Function
- `stores/tasks.store.ts` — `seedInsightTasks()` updated to call Edge Function

---

## Why This Replaces Hardcoded Seeds

v1 tasks are hardcoded: 4 types, same logic for every user. v2 generates tasks dynamically
based on what Claude finds in the user's data — categories with unusual spend, EMI patterns,
savings rate gaps, lifestyle mismatches.

**Fallback:** If Claude call fails (timeout, API error), fall back to v1 hardcoded seed logic.

---

## Edge Function: generate-tasks

### Request
```typescript
{ userId: string }
```

### Behaviour
1. Read `spend_analyses` (latest row) for userId
2. Read `fire_calculations` (latest row) for userId
3. Build context object:
   ```typescript
   {
     avgMonthlySpend: number,
     categoryBreakdown: Record<string, number>,
     insights: string[],
     fireNumber: number,
     retireAtAge: number,
     yearsToFire: number,
     savingsRate: number,
     monthlyEmi: number,
     loanTenureYears: number,
   }
   ```
4. Call Claude (`claude-haiku-4-5-20251001`) with structured output schema
5. Upsert returned tasks to `user_tasks` (same seeding rules as v1: skip recommended/accepted/done, overwrite canceled)
6. Always perform fresh SELECT after upsert

### A/B Prompt Testing

`generate-tasks` runs a stable 50/50 A/B split on every call. The variant is determined by
a hash of `userId` — same user always sees the same variant, regardless of when they call
the function. Variant is stored in `ai_eval_scores.score_detail.promptVariant` so LangFuse
and direct SQL queries can compare quality scores by variant.

See `engineering/ai-development-practices.md` for the full A/B evaluation workflow.

#### Variant A — Control (`tasks-v1.0`)
```
You are a financial advisor for Indian professionals pursuing FIRE (Financial Independence,
Retire Early). Given a user's spending breakdown and FIRE progress, generate 3–5 personalised,
actionable tasks that will have the highest impact on their retirement date.

Each task must:
- Be specific to their numbers (mention actual ₹ amounts)
- Show a concrete FIRE impact (earlier retire date or reduced corpus)
- Be achievable within 1–6 months
- Reflect Indian financial context (SIP, EMI, quick commerce, Zomato/Swiggy, etc.)
- Use different task_types (no duplicates)

Call output_tasks with your generated tasks.
```

#### Variant B — Experiment (`tasks-v1.1`)
Key differences: leads with ₹ saving, requires explicit FIRE delta, 1–3 month window, named platforms.
```
You are a FIRE planning coach for Indian professionals. Your mission: surface the tasks with
the highest measurable impact on retirement date.

Every task you generate must:
- Open with the specific ₹ saving (e.g. "Save ₹3,200/month by...")
- State the FIRE impact explicitly (e.g. "retires you 4 months sooner" or "reduces corpus
  need by ₹2.4L")
- Be completable within 1–3 months, not 6
- Name the exact app or instrument (not generic "food delivery" — say "Zomato/Swiggy";
  not "SIP" — say which fund category)
- Use a different task_type from every other task in the batch

Call output_tasks with your generated tasks.
```

**User message (both variants):**
```
Generate personalised financial tasks based on this user's data:

Avg monthly spend: ₹{avgMonthlySpend}
Spending breakdown: {JSON.stringify(categoryBreakdown)}
FIRE number: ₹{fireNumber}
Retire at age: {retireAtAge} (in {yearsToFire} years)
Savings rate: {savingsRate}%
Monthly EMI: ₹{monthlyEmi}
Loan tenure remaining: {loanTenureYears} years
Insights: {insights.join('; ')}
```

### Claude Output Schema
```typescript
Array<{
  task_type: string;       // kebab-case unique identifier
  title: string;           // max 60 chars
  description: string;     // personalised with real ₹ amounts, max 200 chars
  xp_reward: number;       // 50 | 75 | 100 | 150
  why_relevant: string;    // 1 sentence — not shown in UI, used for metadata
  estimated_monthly_savings: number;  // INR, used for FIRE impact calc
}>
```

### Response
```typescript
{
  tasks: Array<{ task_type, title, description, xp_reward, metadata }>;
  generatedAt: string;  // ISO timestamp
}
```

---

## Integration with tasks.store.ts

`seedInsightTasks(userId, analysis, calculation)` updated to:
```typescript
try {
  const { data } = await supabase.functions.invoke('generate-tasks', {
    body: { userId }
  });
  // upsert data.tasks → user_tasks (same logic as before)
} catch {
  // Fallback: run v1 buildTaskSeeds(analysis, calculation)
  // upsert hardcoded seeds
}
// Always: fresh SELECT
```

---

## Acceptance Criteria

- [ ] generate-tasks returns valid JSON array matching schema
- [ ] Generated tasks upserted to user_tasks with correct status='recommended'
- [ ] Canceled tasks overwritten back to 'recommended' by new generation
- [ ] Accepted/done tasks not overwritten
- [ ] Fresh SELECT runs after upsert
- [ ] If Claude call fails → fallback to hardcoded seeds (no crash)
- [ ] task_type is unique per generation (no duplicate task_types in one run)
- [ ] ai_request_log row written after each Claude call
- [ ] Same userId always resolves to the same variant (stable hash)
- [ ] ai_eval_scores.score_detail includes `promptVariant` ('A' or 'B') and `promptVersion`
- [ ] LangFuse trace metadata includes `variant` and `promptVersion`
