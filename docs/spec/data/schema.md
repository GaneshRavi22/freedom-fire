# Database Schema

All tables are in Supabase Postgres. Row Level Security (RLS) is enabled on every table.
Service role key bypasses RLS — only used in Edge Functions.

---

## profiles
Created by migration `001_initial_schema.sql`. Auto-populated by `handle_new_user()` trigger.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | — | PK, FK → `auth.users(id)` CASCADE |
| `name` | text | YES | — | From Google OAuth or email prefix |
| `age` | integer | YES | — | Set during onboarding |
| `created_at` | timestamptz | NO | `now()` | |

RLS: SELECT and UPDATE for own row (`auth.uid() = id`).

---

## fire_calculations
One row per user (UNIQUE on `user_id`). Upserted on every save.
Built up across migrations 001, 003, 004, 005, 006.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `user_id` | uuid | NO | — | FK → `profiles(id)` CASCADE, UNIQUE |
| `monthly_expenses` | numeric | NO | — | |
| `retirement_age` | integer | NO | — | Target, may be overridden by convergence |
| `expected_return_pct` | numeric | NO | 12 | |
| `inflation_rate_pct` | numeric | NO | 6 | |
| `fire_number` | numeric | NO | — | Computed corpus |
| `current_savings` | numeric | YES | 0 | |
| `monthly_emi` | numeric | YES | 0 | |
| `loan_balance` | numeric | YES | 0 | |
| `loan_tenure_years` | integer | YES | 0 | |
| `monthly_income` | numeric | YES | — | |
| `spouse_income` | numeric | YES | 0 | |
| `monthly_savings` | numeric | YES | — | Computed: income+spouse−expenses−emi |
| `savings_rate` | integer | YES | — | % of total household income |
| `years_to_fire` | numeric | YES | — | Computed by simulation |
| `retire_at_age` | integer | YES | — | Converged retirement age |
| `lifestyle` | text | YES | — | CHECK: 'lean'\|'comfortable'\|'luxury' |
| `onboarding_fire_number` | numeric | YES | — | Snapshot from onboarding form |
| `onboarding_retire_age` | integer | YES | — | Snapshot from onboarding form |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | Used for one-update-per-day gate |

RLS: SELECT, INSERT, UPDATE for own row.

---

## spend_analyses
One row per upload. Multiple rows per user allowed (latest is active).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `user_id` | uuid | NO | — | FK → `profiles(id)` CASCADE |
| `statement_file_path` | text | YES | — | Storage path: `{userId}/{ts}_{name}` |
| `avg_monthly_spend` | numeric | NO | — | Raw average (before ignoring outliers) |
| `effective_avg_monthly_spend` | numeric | YES | — | After ignored outliers subtracted |
| `analysis_period_months` | integer | NO | 1 | |
| `category_breakdown` | jsonb | NO | `{}` | `{ food: 12000, transport: 8000, ... }` |
| `monthly_trend` | jsonb | NO | `[]` | `[{ month: "2026-01", amount: 45000 }]` |
| `insights` | jsonb | NO | `[]` | Array of insight strings |
| `outlier_transactions` | jsonb | NO | `[]` | See parse-credit-card-pdf spec |
| `ignored_transaction_ids` | jsonb | NO | `[]` | User-toggled outlier IDs |
| `created_at` | timestamptz | NO | `now()` | |

RLS: SELECT, INSERT, UPDATE for own row.

---

## user_tasks
One row per `(user_id, task_type)` — UNIQUE constraint.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `user_id` | uuid | NO | — | FK → `profiles(id)` CASCADE |
| `task_type` | text | NO | — | UNIQUE with user_id |
| `title` | text | NO | — | |
| `description` | text | YES | — | Personalised with real ₹ amounts |
| `metadata` | jsonb | NO | `{}` | Task-specific data (amounts, targets) |
| `status` | text | NO | `'recommended'` | CHECK: recommended\|accepted\|done\|canceled |
| `target_completion_date` | date | YES | — | Set when accepted |
| `xp_reward` | integer | NO | 50 | |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | |

RLS: SELECT, INSERT, UPDATE for own row.

---

## user_gamification
One row per user (UNIQUE on `user_id`). Auto-created by `handle_new_user_gamification()` trigger.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `user_id` | uuid | NO | — | FK → `profiles(id)` CASCADE, UNIQUE |
| `xp` | integer | NO | 0 | |
| `level` | integer | NO | 1 | Derived from xp, stored for fast reads |
| `total_freedom_days` | numeric | NO | 0 | |
| `last_login_date` | date | YES | — | UTC date of last login XP award |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | |

RLS: SELECT, INSERT, UPDATE for own row.

---

## user_badges
Many rows per user (one per earned badge).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `user_id` | uuid | NO | — | FK → `profiles(id)` CASCADE |
| `badge_id` | text | NO | — | UNIQUE with user_id |
| `unlocked_at` | timestamptz | NO | `now()` | |

RLS: SELECT, INSERT for own row (no UPDATE — badges never revoked).

---

## user_streaks
One row per `(user_id, streak_type)` — UNIQUE constraint.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `user_id` | uuid | NO | — | FK → `profiles(id)` CASCADE |
| `streak_type` | text | NO | — | CHECK: investment\|tracking\|review; UNIQUE with user_id |
| `current_count` | integer | NO | 0 | |
| `longest_count` | integer | NO | 0 | |
| `last_activity` | date | NO | `CURRENT_DATE` | UTC date, no time component |

RLS: SELECT, INSERT, UPDATE for own row.

---

## user_quests
One row per `(user_id, quest_id)` — UNIQUE constraint.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `user_id` | uuid | NO | — | FK → `profiles(id)` CASCADE |
| `quest_id` | text | NO | — | UNIQUE with user_id |
| `progress` | integer | NO | 0 | |
| `target` | integer | NO | 1 | |
| `completed` | boolean | NO | false | |
| `expires_at` | timestamptz | YES | — | Daily: midnight UTC; Weekly: +7 days |
| `updated_at` | timestamptz | NO | `now()` | |

RLS: SELECT, INSERT, UPDATE for own row.

---

## app_config
Single-row global configuration table. Not user-scoped — one row with `id = 'global'`.
Created by migration `019_app_config.sql`.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | text | NO | `'global'` | PK — always `'global'` |
| `features` | jsonb | NO | `{}` | Map of `FeatureFlag → boolean` |

RLS: SELECT for all authenticated users. No client writes (service role only).

### Feature Flags
Flags are toggled by updating the `features` column directly in Supabase. The app reads them once at startup via `useFeaturesStore`.

| Flag | Description |
|------|-------------|
| `gamification` | XP, levels, badges, streaks, quests |
| `ai_advisor` | AI financial advisor chat |
| `spend_tracking` | Credit card statement upload and analysis |
| `fire_calculator` | FIRE number calculator |
| `tasks` | Insight tasks and recommendations |

---

## analytics_events
Append-only event log. No client reads (service role / Grafana only).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `user_id` | uuid | YES | — | FK → `profiles(id)` SET NULL on delete |
| `event` | text | NO | — | Event type string |
| `properties` | jsonb | NO | `{}` | Event-specific data |
| `created_at` | timestamptz | NO | `now()` | |

Indexes: `user_id`, `event`, `created_at DESC`
RLS: INSERT for authenticated user (own user_id). No SELECT policy (analytics only via service role).

### Event Types
| Event | Properties |
|-------|-----------|
| `screen_viewed` | `{ screen: string }` |
| `fire_calculated` | `{ lifestyle, retire_at_age, years_to_fire, savings_rate, has_loan, is_first }` |
| `statement_uploaded` | `{ is_first, analysis_period_months }` |
| `task_accepted` | `{ task_type }` |
| `task_completed` | `{ task_type }` |
| `task_canceled` | `{ task_type, was_accepted }` |

---

## AI Tables (v2 — migrations 014–016)

### ai_conversations (migration 014)
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid FK profiles | |
| `role` | text | CHECK: 'user'\|'assistant' |
| `content` | text | |
| `tool_calls` | jsonb | Claude tool use records |
| `created_at` | timestamptz | |

### user_ai_context (migration 014)
| Column | Type | Notes |
|--------|------|-------|
| `user_id` | uuid PK FK profiles | |
| `financial_summary` | jsonb | Snapshot: corpus, retire_age, savings_rate, top_category |
| `stated_preferences` | jsonb | User-expressed preferences from chat |
| `last_refreshed_at` | timestamptz | |

### ai_insights (migration 015)
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid FK profiles | |
| `category` | text | CHECK: spending\|fire_progress\|task_opportunity\|milestone |
| `message` | text | Human-readable insight |
| `confidence` | numeric | 0.0–1.0 |
| `action_id` | uuid | FK user_tasks (optional) |
| `dismissed` | boolean | Default false |
| `created_at` | timestamptz | |

### ai_request_log (migration 016)
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid | Nullable (system agents have no user) |
| `function_name` | text | Edge Function name |
| `model` | text | Claude model ID used |
| `input_tokens` | integer | |
| `output_tokens` | integer | |
| `latency_ms` | integer | |
| `error` | text | Nullable |
| `created_at` | timestamptz | |

---

## Postgres RPC Functions (migration 017)

### get_daily_event_counts

Helper RPC used by the `metrics-agent` Edge Function to aggregate `analytics_events` by day
without fetching raw rows into JS.

```sql
get_daily_event_counts(since timestamptz, event_types text[])
  RETURNS TABLE (date text, event_type text, count bigint)
  SECURITY DEFINER
```

Returns one row per `(date, event_type)`, where `date` is `YYYY-MM-DD` in `Asia/Kolkata`
timezone. Callable via `supabase.rpc('get_daily_event_counts', { since, event_types })`.
No public access — service role only.

---

## AI Evaluation Tables (migration 018)

### ai_eval_scores

One row per evaluation event. Written by the online-eval shared utility after every
instrumented LLM call. Read by metrics-agent for daily quality-drift detection.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `trace_id` | text | LangFuse trace ID (or synthetic ID for offline evals) |
| `function_name` | text | e.g. `'weekly-health-agent'`, `'generate-tasks'` |
| `score_name` | text | e.g. `'insight_quality'`, `'task_quality'`, `'response_quality'` |
| `score_value` | numeric | CHECK: 0.0–1.0 |
| `score_detail` | jsonb | Per-criterion breakdown |
| `eval_type` | text | CHECK: `'rule_based'` \| `'llm_judge'` \| `'offline'` |
| `created_at` | timestamptz | |

Indexes: `(function_name, created_at DESC)`, `(score_name, created_at DESC)`.
No RLS — service role only (Edge Functions write, metrics-agent reads).

### ai_eval_daily_avg (view)

```sql
CREATE VIEW ai_eval_daily_avg AS
SELECT function_name, score_name,
       DATE(created_at AT TIME ZONE 'Asia/Kolkata') AS score_date,
       ROUND(AVG(score_value)::numeric, 3) AS avg_score,
       COUNT(*) AS sample_count
FROM ai_eval_scores
GROUP BY function_name, score_name, DATE(created_at AT TIME ZONE 'Asia/Kolkata');
```

Used by the metrics-agent for daily average score reporting and quality drift alerts.

---

## Migration File Reference

| Migration | Description |
|-----------|-------------|
| `001_initial_schema.sql` | profiles, fire_calculations, spend_analyses, fire_journey, storage bucket |
| `002_outlier_transactions.sql` | outlier_transactions, ignored_transaction_ids on spend_analyses |
| `003_onboarding_fields.sql` | fire_journey fields: emi, loan, lifestyle, spouse_income |
| `004_merge_journey_into_calculations.sql` | Copies fire_journey → fire_calculations, drops fire_journey |
| `005_income_fields.sql` | Adds spouse_income to fire_calculations |
| `006_lifestyle.sql` | Adds lifestyle column to fire_calculations |
| `007_remove_onboarding_snapshot.sql` | Removes unused onboarding snapshot column |
| `008_effective_avg_monthly_spend.sql` | Adds effective_avg_monthly_spend to spend_analyses |
| `009_gamification.sql` | user_gamification, user_badges, user_streaks, user_quests |
| `010_tasks.sql` | user_tasks |
| `011_last_login_date.sql` | Adds last_login_date to user_gamification |
| `012_onboarding_retire_age.sql` | Adds onboarding_retire_age to fire_calculations |
| `013_analytics_events.sql` | analytics_events |
| `014_ai_conversations.sql` | ai_conversations, user_ai_context |
| `015_ai_insights.sql` | ai_insights |
| `016_ai_observability.sql` | ai_request_log |
| `017_metrics_agent_helper.sql` | `get_daily_event_counts()` Postgres RPC (service role only) |
| `018_ai_eval_scores.sql` | ai_eval_scores table + ai_eval_daily_avg view |
| `019_app_config.sql` | app_config table with global feature flags |
