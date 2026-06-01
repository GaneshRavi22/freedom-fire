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

### Claude Prompt

**System:**
```
You are a financial advisor for Indian professionals pursuing FIRE (Financial Independence,
Retire Early). Given a user's spending breakdown and FIRE progress, generate 3–5 personalised,
actionable tasks that will have the highest impact on their retirement date.

Each task must:
- Be specific to their numbers (mention actual ₹ amounts)
- Show a concrete FIRE impact (earlier retire date or reduced corpus)
- Be achievable within 1–6 months
- Reflect Indian financial context (SIP, EMI, quick commerce, etc.)

Return ONLY valid JSON — no explanation, no markdown.
```

**User message:**
```
Financial context:
- Avg monthly spend: ₹{avgMonthlySpend}
- Spending breakdown: {JSON.stringify(categoryBreakdown)}
- FIRE number: ₹{fireNumber}
- Current retire age: {retireAtAge} (in {yearsToFire} years)
- Savings rate: {savingsRate}%
- Monthly EMI: ₹{monthlyEmi}
- Loan tenure remaining: {loanTenureYears} years
- Insights: {insights.join('; ')}

Generate 3–5 tasks as JSON array.
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
