# Feature Spec: Metrics Anomaly Agent

**Purpose:** A daily scheduled agent that queries `analytics_events` directly, detects
statistical anomalies in key product metrics, uses Claude to hypothesise root cause, and
posts a Slack summary. No PR opened.

**Implementation files:**
- `supabase/functions/metrics-agent/index.ts`

---

## Why Supabase Directly (Not Grafana API)

Grafana is a lens on top of `analytics_events`. Querying the table directly via Supabase
service role is more reliable: no Grafana API key, no public Grafana URL, no panel JSON
parsing. The agent re-runs the same SQL aggregations Grafana panels use.

---

## Schedule

- Frequency: Daily at 3:30 UTC (9am IST)
- Trigger: pg_cron or external HTTP POST (no body required)
- Analysis window: yesterday's events vs 7-day rolling average

---

## Anomaly Detection Algorithm

```sql
-- For each tracked event type, get daily counts for the last 8 days
SELECT
  event,
  created_at::date AS day,
  COUNT(*) AS event_count
FROM analytics_events
WHERE created_at >= now() - interval '8 days'
GROUP BY event, day
ORDER BY event, day
```

Then in application code:
```typescript
const TRACKED_EVENTS = [
  'fire_calculated',
  'statement_uploaded',
  'task_completed',
  'task_accepted',
  'screen_viewed',   // proxy for DAU
];

const DROP_THRESHOLD = parseFloat(Deno.env.get('ANOMALY_DROP_THRESHOLD') ?? '0.4');
const SPIKE_THRESHOLD = parseFloat(Deno.env.get('ANOMALY_SPIKE_THRESHOLD') ?? '0.8');

for each event in TRACKED_EVENTS:
  yesterdayCount = counts[event][yesterday] ?? 0
  last7Days = counts[event][day-7 to day-1, excluding yesterday]
  rollingAvg = last7Days.length > 0 ? mean(last7Days) : null

  if rollingAvg === null || rollingAvg < 2:
    skip  // not enough baseline data

  if yesterdayCount < rollingAvg * (1 - DROP_THRESHOLD):   // ≥40% drop
    anomaly: { type: 'drop', event, yesterday: yesterdayCount, avg: rollingAvg }
  
  if yesterdayCount > rollingAvg * (1 + SPIKE_THRESHOLD):  // ≥80% spike
    anomaly: { type: 'spike', event, yesterday: yesterdayCount, avg: rollingAvg }
```

**Edge case:** If all of yesterday's counts are 0 (agent runs before midnight UTC),
detect this and exit with "No data yet for today" log — do not send false alarms.

---

## Claude Root Cause Analysis

Only called when `anomalies.length > 0`.

**Model:** `claude-haiku-4-5-20251001`

**Prompt:**
```
You are analyzing product metric anomalies for FreedomFire, an Indian FIRE planning app.

Metrics yesterday vs 7-day rolling average:
{anomalies.map(a => `- ${a.event}: ${a.yesterday} (avg: ${a.avg.toFixed(1)}, ${pct}% ${a.type})`).join('\n')}

Context:
- Day of week: {dayName} (weekends naturally have lower engagement)
- App version deployed recently: {recentDeployInfo ?? 'unknown'}

Provide:
1. root_cause_hypothesis: 1-2 sentences on what likely caused these anomalies
2. suggested_resolution: 1-2 sentences on what to check/fix
3. severity: "low" | "medium" | "high"

Return JSON only:
{
  "root_cause_hypothesis": "...",
  "suggested_resolution": "...",
  "severity": "low|medium|high"
}
```

---

## Slack Messages

### No Anomalies (Daily Digest — configurable via `SEND_DAILY_DIGEST` env var)
```
✅ *FreedomFire Health Check — {YYYY-MM-DD}*
All metrics normal.
FIRE calcs: {n}  |  Uploads: {n}  |  Tasks completed: {n}  |  DAU: {n}
```

### Anomalies Detected
```
{severityEmoji} *Metric Anomaly Detected — {YYYY-MM-DD}*
─────────────────────────────────────
{for each anomaly:}
📉  {event}: {yesterday} yesterday vs {avg} avg ({pct}% drop)
📈  {event}: {yesterday} yesterday vs {avg} avg (+{pct}% spike)
─────────────────────────────────────
🔍  *Root Cause Hypothesis*
{root_cause_hypothesis}

💡  *Suggested Resolution*
{suggested_resolution}
─────────────────────────────────────
Severity: {SEVERITY}
```

Severity emoji mapping:
```
low:    ⚠️
medium: 🟠
high:   🔴
```

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `SLACK_WEBHOOK_URL` | required | Incoming webhook |
| `ANTHROPIC_API_KEY` | required | Claude API |
| `SUPABASE_URL` | auto-injected | |
| `SUPABASE_SERVICE_ROLE_KEY` | auto-injected | |
| `ANOMALY_DROP_THRESHOLD` | `0.4` | 40% drop triggers anomaly |
| `ANOMALY_SPIKE_THRESHOLD` | `0.8` | 80% spike triggers anomaly |
| `SEND_DAILY_DIGEST` | `false` | Send healthy digest when no anomalies |

---

## Acceptance Criteria

- [ ] Anomaly detection: 40% drop → anomaly; 39% drop → no anomaly
- [ ] Anomaly detection: 80% spike → anomaly; 79% spike → no anomaly
- [ ] Rolling average uses exactly last 7 days (not including yesterday)
- [ ] Skip event types with rolling_avg < 2 (no false alarms on sparse data)
- [ ] No data for yesterday → exit cleanly, no Slack message
- [ ] Claude only called when anomalies.length > 0 (saves cost on healthy days)
- [ ] Day-of-week context included in Claude prompt
- [ ] Slack message sent: anomalies present → full analysis; no anomalies + digest enabled → healthy summary
- [ ] ai_request_log row written when Claude is called
- [ ] ANOMALY_DROP_THRESHOLD / ANOMALY_SPIKE_THRESHOLD configurable via env vars
