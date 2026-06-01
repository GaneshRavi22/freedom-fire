# Edge Function Contracts

All functions are Deno-based Supabase Edge Functions (`supabase/functions/*/index.ts`).
All require CORS preflight handling. All use `SUPABASE_SERVICE_ROLE_KEY` for DB access.

## Common Patterns

```typescript
// CORS headers (identical in every function)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// OPTIONS preflight
if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

// Supabase client (service role — bypasses RLS)
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// Import pattern (Deno, not Node)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
```

---

## parse-credit-card-pdf

**Purpose:** Extract and categorise transactions from a credit card PDF statement.

**Trigger:** Called from client via `supabase.functions.invoke('parse-credit-card-pdf', { body })`

### Request
```typescript
{
  filePath: string;    // Supabase Storage path: "{userId}/{ts}_{filename}"
  userId: string;      // Required — for logging
  password?: string;   // Optional — for password-protected PDFs
}
```

### Response (200)
```typescript
{
  avgMonthlySpend: number;
  periodMonths: number;
  categoryBreakdown: Record<string, number>;   // category → total INR
  monthlyTrend: Array<{ month: string; amount: number }>;  // YYYY-MM
  insights: string[];
  outlierTransactions: Array<{
    id: string;          // deterministic: "{date}|{amount}|{desc[0:12]}"
    date: string;
    description: string;
    amount: number;
    category: string;
    month: string;       // YYYY-MM
  }>;
  bank: string;          // 'hdfc'|'icici'|'sbi'|'axis'|'kotak'|'generic'
  transactionCount: number;
}
```

### Error Responses
| Status | Body | Condition |
|--------|------|-----------|
| 400 | `{ error: 'PASSWORD_PROTECTED' }` | PDF encrypted, no password provided |
| 400 | `{ error: 'WRONG_PASSWORD' }` | PDF encrypted, password incorrect |
| 400 | `{ error: 'Missing filePath or userId' }` | Validation failure |
| 500 | `{ error: string }` | Parse error or unknown failure |

### Environment Variables
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### External Libraries
- `https://esm.sh/unpdf@0.11.0` — PDF text extraction (Deno-compatible)

---

## calculate-fire-journey

**Purpose:** Lightweight FIRE timeline calculation for interactive "what-if" scenarios.
(The full convergence loop lives client-side in `lib/calculations.ts`. This function is the
server-side variant used by the Advisor chat tool.)

### Request
```typescript
{
  fireNumber: number;
  currentSavings: number;
  monthlySavings: number;
  expectedReturnPct: number;
  currentAge: number;
}
```

### Response (200)
```typescript
{
  yearsToFire: number;   // 999 if never reached in 100 years
  retireAtAge: number;
  timeline: Array<{
    year: number;   // 0 = today, 1 = 1 year from now, ...
    wealth: number;
    age: number;
  }>;
  // Timeline extends 5 years past FIRE date, capped at 50 years total
}
```

### Error Responses
| Status | Body |
|--------|------|
| 400 | `{ error: 'Missing required fields' }` |
| 500 | `{ error: string }` |

---

## generate-tasks (v2 — new)

**Purpose:** Replace hardcoded task seeding with Claude-generated personalised tasks.

### Request
```typescript
{
  userId: string;
}
```

### Behaviour
1. Reads `spend_analyses` (latest) and `fire_calculations` for userId
2. Calls Claude with structured JSON output schema
3. Upserts generated tasks to `user_tasks` (same lifecycle as v1 tasks)
4. Returns generated tasks

### Response (200)
```typescript
{
  tasks: Array<{
    task_type: string;
    title: string;
    description: string;
    xp_reward: number;
    metadata: Record<string, unknown>;
  }>;
}
```

### Environment Variables
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`

---

## financial-advisor-chat (v2 — new)

**Purpose:** Streaming conversational AI advisor with tool access to user's financial data.

### Request
```typescript
{
  userId: string;
  message: string;
  conversationHistory: Array<{ role: 'user'|'assistant'; content: string }>;
}
```

### Response
Server-Sent Events (SSE) stream:
```
data: {"type":"text","delta":"Am "}
data: {"type":"text","delta":"I on track"}
data: {"type":"tool_use","name":"get_fire_progress","input":{}}
data: {"type":"tool_result","name":"get_fire_progress","result":{...}}
data: {"type":"text","delta":"Yes, based on your corpus..."}
data: {"type":"done"}
```

### Claude Tools
| Tool Name | Description | DB Query |
|-----------|-------------|----------|
| `get_fire_progress` | Returns current FIRE number, retire age, years away, savings rate | `fire_calculations` |
| `get_spending_breakdown` | Returns avg monthly spend and category breakdown | `spend_analyses` (latest) |
| `get_tasks` | Returns pending and completed tasks | `user_tasks` |
| `calculate_scenario` | Runs FIRE sim with modified params | Internal (no DB) |

### Environment Variables
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`

---

## weekly-health-agent (v2 — new)

**Purpose:** Scheduled autonomous agent. Reads all active users' financial state, generates
structured insights, writes to `ai_insights` table.

**Trigger:** pg_cron schedule or external HTTP POST with service auth header.

### Request
```typescript
{} // No body required — agent queries all active users
// OR
{ userId: string }  // To run for a single user (testing / manual trigger)
```

### Response (200)
```typescript
{
  usersProcessed: number;
  insightsGenerated: number;
  errors: Array<{ userId: string; error: string }>;
}
```

### Environment Variables
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`

---

## sentry-agent (v2 — new)

**Purpose:** Receives Sentry crash webhook → enriches → root cause analysis → draft GitHub PR
→ Slack notifications at each stage.

**Trigger:** Sentry webhook (event_alert, production environment only).

### Request
Sentry webhook payload (subset):
```typescript
{
  action: 'triggered';
  data: {
    event: {
      title: string;
      culprit: string;
      level: 'error' | 'warning' | 'fatal';
      environment: string;
      exception: { values: Array<{ type, value, stacktrace }> };
      user: { count: number };
    };
    issue: { id: string; permalink: string };
  };
}
```

### Validation
- Verify `sentry-hook-signature` header (HMAC-SHA256 of body with `SENTRY_WEBHOOK_SECRET`)
- Only process `level: 'error'|'fatal'` AND `environment: 'production'`
- All others: respond 200 immediately (no-op)

### Response (200)
```typescript
{ ok: true; stagesCompleted: number }
```

### Claude Tools (Stages 2–3)
| Tool | Description | API |
|------|-------------|-----|
| `read_file` | Read source file content | GitHub Contents API |
| `search_code` | Search repo for symbol/string | GitHub Code Search API (top 3 results) |

### Environment Variables
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `SENTRY_WEBHOOK_SECRET`
- `SLACK_WEBHOOK_URL`
- `GITHUB_TOKEN` (PAT with `repo` scope)
- `GITHUB_REPO` (e.g., `ganesh/freedomfire`)
- `ANTHROPIC_API_KEY`

---

## metrics-agent (v2 — new)

**Purpose:** Daily scheduled agent. Queries `analytics_events` for anomalies and posts
Slack summary.

**Trigger:** pg_cron or external HTTP POST.

### Request
```typescript
{} // Processes all events for yesterday
```

### Response (200)
```typescript
{
  anomaliesFound: number;
  slackMessageSent: boolean;
}
```

### Anomaly Detection
```
For each event type: [fire_calculated, statement_uploaded, task_completed, screen_viewed]
  today_count    = COUNT events WHERE created_at::date = yesterday
  rolling_avg    = AVG daily counts over last 7 days (excluding yesterday)
  
  anomaly if:
    today_count < rolling_avg × (1 - DROP_THRESHOLD)    // default: 0.4 drop
    today_count > rolling_avg × (1 + SPIKE_THRESHOLD)   // default: 0.8 spike
```

### Environment Variables
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `SLACK_WEBHOOK_URL`
- `ANTHROPIC_API_KEY`
- `ANOMALY_DROP_THRESHOLD` (optional, default 0.4)
- `ANOMALY_SPIKE_THRESHOLD` (optional, default 0.8)
