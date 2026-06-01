# Feature Spec: Weekly Health Agent

**Purpose:** A scheduled autonomous agent that reads every active user's financial state
weekly, generates structured AI insights, writes them to `ai_insights`, and optionally sends
a push notification summary. No user prompt required.

**Implementation files:**
- `supabase/functions/weekly-health-agent/index.ts`
- `supabase/migrations/015_ai_insights.sql`
- `app/(tabs)/index.tsx` — home dashboard shows `ai_insights` cards

---

## Schedule

- Frequency: Weekly (every Monday, 6am IST = 0:30 UTC Sunday night)
- Trigger: pg_cron or external cron webhook POST
- Can also be manually triggered with `{ userId }` body for testing

---

## Agent Logic

```
for each user with fire_calculations updated in last 90 days:
  context = {
    fireCalc:    SELECT * FROM fire_calculations WHERE user_id = userId
    spendAnalysis: SELECT * FROM spend_analyses WHERE user_id = userId ORDER BY created_at DESC LIMIT 1
    tasks:       SELECT * FROM user_tasks WHERE user_id = userId
    gamification: SELECT xp, level, total_freedom_days FROM user_gamification WHERE user_id = userId
  }
  
  insights = callClaude(context)  // see prompt below
  
  // Dismiss old unread insights (keep dismissed = false for max 2 weeks)
  UPDATE ai_insights SET dismissed = true
  WHERE user_id = userId AND dismissed = false AND created_at < now() - interval '14 days'
  
  // Insert new insights
  INSERT INTO ai_insights (user_id, category, message, confidence, action_id)
  SELECT userId, i.category, i.message, i.confidence, matched_task_id
  FROM json_array_elements(insights)
  
  // Log to ai_request_log
  INSERT INTO ai_request_log (user_id, function_name, model, input_tokens, output_tokens, latency_ms)
```

---

## Claude Prompt

**Model:** `claude-haiku-4-5-20251001` (cost-efficient for batch weekly runs)

**System:**
```
You are a financial health analyst for Indian FIRE planning app FreedomFire. Each week you
review a user's financial data and generate 3–5 actionable insights in JSON format.

Insight categories:
- spending: Observations about spending patterns, anomalies, trends
- fire_progress: Progress toward FIRE corpus, savings rate changes, milestones
- task_opportunity: New actions the user could take (tie to existing or new tasks)
- milestone: Celebrations — level up, badge close, streak achievement

Rules:
- Be specific: use real ₹ amounts and concrete FIRE impact
- Be encouraging, not alarming
- Indian financial context: SIP, EMI, crore/lakh formatting
- Return ONLY valid JSON array

Return format:
[
  {
    "category": "spending" | "fire_progress" | "task_opportunity" | "milestone",
    "message": "...",  // max 200 chars, ₹ amounts, concrete action
    "confidence": 0.0-1.0,
    "related_task_type": "task_type_string" | null
  }
]
```

**User message:**
```
User's financial state this week:
FIRE: Corpus ₹{fireNumber}, retire at {retireAtAge}, savings rate {savingsRate}%
Spend: Avg ₹{avgMonthlySpend}/month, top category: {topCategory} ({topCategoryPct}%)
Tasks: {acceptedCount} accepted, {doneCount} completed this month
Level: {level} ({levelTitle}), {totalFreedomDays} freedom days total
Last analysis: {daysSinceLastAnalysis} days ago

Generate 3-5 weekly insights as JSON.
```

---

## ai_insights Table (migration 015)

```sql
CREATE TABLE ai_insights (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category    text NOT NULL CHECK (category IN ('spending','fire_progress','task_opportunity','milestone')),
  message     text NOT NULL,
  confidence  numeric NOT NULL DEFAULT 0.8,
  action_id   uuid REFERENCES user_tasks(id) ON DELETE SET NULL,
  dismissed   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_ai_insights_select" ON ai_insights FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_ai_insights_update" ON ai_insights FOR UPDATE USING (auth.uid() = user_id);
-- No insert policy — only Edge Functions (service role) write insights
```

---

## Home Dashboard Integration

`app/(tabs)/index.tsx` — new "AI Insights" section above active quests:

```
AI Insights (from ai_insights WHERE dismissed = false ORDER BY created_at DESC LIMIT 3)

[Card]
  sparkles icon | category badge (color-coded)
  message text
  [✕ dismiss] button → UPDATE ai_insights SET dismissed = true WHERE id = insightId

[Card]
  ...
```

Category badge colors:
```
spending:          #FF5A5A (error red — attention needed)
fire_progress:     #06D6A0 (success teal — positive)
task_opportunity:  #FFB547 (warning amber — action)
milestone:         #FFD166 (accent gold — celebration)
```

If `action_id` is set: show "→ View Task" link that navigates to /tasks tab.

---

## Acceptance Criteria

- [ ] Agent reads users active in last 90 days (not all users)
- [ ] Old insights (> 14 days, unread) auto-dismissed before inserting new ones
- [ ] Claude returns valid JSON array matching schema
- [ ] 3–5 insights generated per user per run
- [ ] ai_insights rows created with correct category enum values
- [ ] Home screen shows up to 3 undismissed insights
- [ ] Dismiss button sets dismissed = true (immediate UI update + DB write)
- [ ] ai_request_log row written per user processed
- [ ] If no spend_analyses exists for user: still generates fire_progress/milestone insights
- [ ] Manual trigger with { userId } processes only that user (for testing)
