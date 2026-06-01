import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.36.3';
import { createLangfuseClient } from '../_shared/langfuse.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL = 'claude-haiku-4-5-20251001';

// ── Monitored event types ─────────────────────────────────────────────────────

const MONITORED_EVENTS = [
  'fire_calculated',
  'statement_uploaded',
  'task_accepted',
  'task_completed',
  'screen_viewed', // DAU proxy
] as const;

type EventType = typeof MONITORED_EVENTS[number];

interface DailyCount {
  date: string;
  event_type: EventType;
  count: number;
}

interface Anomaly {
  metric: EventType;
  todayValue: number;
  rollingAvg: number;
  pctChange: number;
  direction: 'drop' | 'spike';
}

interface QualityDrift {
  functionName: string;
  scoreName: string;
  todayAvg: number;
  rollingAvg: number;
  pctChange: number;
  sampleCount: number;
}

interface ClaudeAnalysis {
  summary: string;
  root_cause_hypothesis: string;
  suggested_resolution: string;
  severity: 'low' | 'medium' | 'high';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function postToSlack(webhookUrl: string, text: string): Promise<void> {
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
}

function formatPct(pct: number): string {
  return (pct > 0 ? '+' : '') + pct.toFixed(0) + '%';
}

// ── Fetch 30 days of daily metric counts from analytics_events ────────────────

async function fetchDailyCounts(
  supabase: ReturnType<typeof createClient>
): Promise<DailyCount[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  // Use a raw SQL query via RPC for efficient GROUP BY aggregation.
  // Falls back to JS-side aggregation if the RPC doesn't exist.
  const { data, error } = await supabase.rpc('get_daily_event_counts', {
    since: thirtyDaysAgo,
    event_types: MONITORED_EVENTS as unknown as string[],
  });

  if (!error && data) {
    return data as DailyCount[];
  }

  // Fallback: fetch raw rows and aggregate in JS
  const { data: rows } = await supabase
    .from('analytics_events')
    .select('event_type, created_at')
    .gte('created_at', thirtyDaysAgo)
    .in('event_type', MONITORED_EVENTS as unknown as string[]);

  if (!rows || rows.length === 0) return [];

  const countMap: Record<string, Record<string, number>> = {};
  for (const row of rows as Array<{ event_type: string; created_at: string }>) {
    const date = row.created_at.slice(0, 10); // YYYY-MM-DD
    if (!countMap[date]) countMap[date] = {};
    countMap[date][row.event_type] = (countMap[date][row.event_type] ?? 0) + 1;
  }

  const result: DailyCount[] = [];
  for (const [date, events] of Object.entries(countMap)) {
    for (const [event_type, count] of Object.entries(events)) {
      result.push({ date, event_type: event_type as EventType, count });
    }
  }
  return result;
}

// ── Anomaly detection ─────────────────────────────────────────────────────────

function detectAnomalies(
  counts: DailyCount[],
  dropThreshold: number,
  spikeThreshold: number
): Anomaly[] {
  const today = new Date().toISOString().slice(0, 10);
  // Use previous 7 days (excluding today) as rolling average window
  const windowDates = new Set(
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.now() - (i + 1) * 86400000);
      return d.toISOString().slice(0, 10);
    })
  );

  const anomalies: Anomaly[] = [];

  for (const eventType of MONITORED_EVENTS) {
    const todayEntry = counts.find(c => c.date === today && c.event_type === eventType);
    const todayValue = todayEntry?.count ?? 0;

    const windowEntries = counts.filter(c => windowDates.has(c.date) && c.event_type === eventType);
    if (windowEntries.length === 0) continue; // No historical data for this metric

    const rollingAvg = windowEntries.reduce((sum, c) => sum + c.count, 0) / windowEntries.length;
    if (rollingAvg === 0) continue; // Avoid division by zero for dormant metrics

    const ratio = todayValue / rollingAvg;
    const pctChange = Math.round((ratio - 1) * 100);

    if (ratio < dropThreshold) {
      anomalies.push({ metric: eventType, todayValue, rollingAvg, pctChange, direction: 'drop' });
    } else if (ratio > spikeThreshold) {
      anomalies.push({ metric: eventType, todayValue, rollingAvg, pctChange, direction: 'spike' });
    }
  }

  return anomalies;
}

// ── AI quality drift detection ────────────────────────────────────────────────

async function fetchQualityDrift(
  supabase: ReturnType<typeof createClient>,
  driftThreshold: number
): Promise<QualityDrift[]> {
  const eightDaysAgo = new Date(Date.now() - 8 * 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('ai_eval_daily_avg')
    .select('function_name, score_name, score_date, avg_score, sample_count')
    .gte('score_date', eightDaysAgo)
    .order('score_date', { ascending: false });

  if (error || !data || data.length === 0) return [];

  // Group by (function_name, score_name)
  const grouped: Record<string, Array<{ score_date: string; avg_score: number; sample_count: number }>> = {};
  for (const row of data as Array<{ function_name: string; score_name: string; score_date: string; avg_score: number; sample_count: number }>) {
    const key = `${row.function_name}:::${row.score_name}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({ score_date: row.score_date, avg_score: row.avg_score, sample_count: row.sample_count });
  }

  const drifts: QualityDrift[] = [];
  for (const [key, rows] of Object.entries(grouped)) {
    const [functionName, scoreName] = key.split(':::');
    const todayRow = rows.find(r => r.score_date === today);
    if (!todayRow) continue;

    const windowRows = rows.filter(r => r.score_date !== today);
    if (windowRows.length === 0) continue;

    const rollingAvg = windowRows.reduce((s, r) => s + r.avg_score, 0) / windowRows.length;
    if (rollingAvg === 0) continue;

    const ratio = todayRow.avg_score / rollingAvg;
    const pctChange = Math.round((ratio - 1) * 100);

    if (ratio < driftThreshold) {
      drifts.push({
        functionName,
        scoreName,
        todayAvg: todayRow.avg_score,
        rollingAvg: parseFloat(rollingAvg.toFixed(3)),
        pctChange,
        sampleCount: todayRow.sample_count,
      });
    }
  }
  return drifts;
}

// ── Build Claude analysis prompt ──────────────────────────────────────────────

function buildAnalysisPrompt(anomalies: Anomaly[], allCounts: DailyCount[], todayDate: string): string {
  const anomalyText = anomalies
    .map(a => {
      const arrow = a.direction === 'drop' ? '📉' : '📈';
      return `${arrow} ${a.metric}: ${a.todayValue} today vs ${a.rollingAvg.toFixed(1)} avg (${formatPct(a.pctChange)})`;
    })
    .join('\n');

  const recentDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (i + 1) * 86400000);
    return d.toISOString().slice(0, 10);
  }).reverse();

  const trendText = MONITORED_EVENTS.map(evt => {
    const values = recentDates.map(date => {
      const entry = allCounts.find(c => c.date === date && c.event_type === evt);
      return entry?.count ?? 0;
    });
    return `${evt}: [${values.join(', ')}] (oldest → newest)`;
  }).join('\n');

  return `You are a product analytics engineer for FreedomFire, an Indian FIRE planning app (React Native + Supabase).

Today (${todayDate}) the following metric anomalies were detected:
${anomalyText}

7-day trend per metric (oldest → newest, not including today):
${trendText}

Day of week: ${new Date().toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'Asia/Kolkata' })}

Respond with a JSON object:
{
  "summary": "one sentence describing the anomalies collectively",
  "root_cause_hypothesis": "1-2 sentences on the most likely cause (consider: deploys, day-of-week patterns, correlated drops, seasonal effects)",
  "suggested_resolution": "1-2 actionable sentences (check Sentry? verify Edge Function? look at specific screen?)",
  "severity": "low | medium | high"
}

Severity guide: high = multiple metrics dropped >60% or DAU proxy dropped; medium = single metric dropped 40-60%; low = single metric spiked or mild drop.`;
}

// ── Slack message builders ────────────────────────────────────────────────────

function buildQualityOnlyAlert(drifts: QualityDrift[], todayDate: string): string {
  return [
    `⚠️  *AI Quality Drift — ${todayDate}*`,
    `─────────────────────────────`,
    buildQualityDriftBlock(drifts),
    `─────────────────────────────`,
    `💡  Check LangFuse for trace details and consider re-running offline eval suite.`,
  ].join('\n');
}

function buildQualityDriftBlock(drifts: QualityDrift[]): string {
  if (drifts.length === 0) return '';
  const lines = drifts.map(d =>
    `🤖  ${d.functionName} / ${d.scoreName}: ${d.todayAvg.toFixed(3)} today vs ${d.rollingAvg.toFixed(3)} avg (${formatPct(d.pctChange)}, n=${d.sampleCount})`
  );
  return ['─────────────────────────────', '🧠  *AI Quality Drift Detected*', ...lines].join('\n');
}

function buildHealthyMessage(counts: DailyCount[], drifts: QualityDrift[], todayDate: string): string {
  const today = todayDate;
  const getValue = (evt: EventType) => counts.find(c => c.date === today && c.event_type === evt)?.count ?? 0;

  const lines = [
    `✅ *FreedomFire Health Check — ${today}*`,
    `All metrics normal.  DAU: ${getValue('screen_viewed')}  |  FIRE calcs: ${getValue('fire_calculated')}  |  Uploads: ${getValue('statement_uploaded')}`,
  ];
  if (drifts.length > 0) {
    lines.push('');
    lines.push(buildQualityDriftBlock(drifts));
  }
  return lines.join('\n');
}

function buildAnomalyMessage(
  anomalies: Anomaly[],
  drifts: QualityDrift[],
  analysis: ClaudeAnalysis,
  todayDate: string,
  supabaseUrl: string
): string {
  const severityEmoji = analysis.severity === 'high' ? '🔴' : analysis.severity === 'medium' ? '⚠️' : '🟡';
  const anomalyLines = anomalies
    .map(a => {
      const arrow = a.direction === 'drop' ? '📉' : '📈';
      return `${arrow}  ${a.metric}: ${a.todayValue} today vs ${a.rollingAvg.toFixed(0)} avg (${formatPct(a.pctChange)})`;
    })
    .join('\n');

  const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '');
  const analyticsLink = `https://supabase.com/dashboard/project/${projectRef}/editor`;

  const parts = [
    `${severityEmoji}  *Metric Anomaly Detected — ${todayDate}*`,
    `─────────────────────────────`,
    anomalyLines,
    `─────────────────────────────`,
    `🔍  *Root Cause Hypothesis*`,
    analysis.root_cause_hypothesis,
    ``,
    `💡  *Suggested Resolution*`,
    analysis.suggested_resolution,
  ];

  if (drifts.length > 0) {
    parts.push('');
    parts.push(buildQualityDriftBlock(drifts));
  }

  parts.push(`─────────────────────────────`);
  parts.push(`Severity: ${analysis.severity.toUpperCase()}  |  <${analyticsLink}|View analytics_events in Supabase>`);

  return parts.join('\n');
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
  const slackUrl = Deno.env.get('SLACK_WEBHOOK_URL') ?? '';
  const dropThreshold = parseFloat(Deno.env.get('ANOMALY_DROP_THRESHOLD') ?? '0.6');
  const spikeThreshold = parseFloat(Deno.env.get('ANOMALY_SPIKE_THRESHOLD') ?? '1.8');
  const sendHealthyDigest = Deno.env.get('SEND_HEALTHY_DIGEST') !== 'false';

  if (!anthropicKey || !slackUrl) {
    return new Response(
      JSON.stringify({ error: 'Missing ANTHROPIC_API_KEY or SLACK_WEBHOOK_URL' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const anthropic = new Anthropic({ apiKey: anthropicKey });
  const todayDate = new Date().toISOString().slice(0, 10);
  const startMs = Date.now();
  const driftThreshold = parseFloat(Deno.env.get('QUALITY_DRIFT_THRESHOLD') ?? '0.8');

  const traceId = crypto.randomUUID();
  const lf = createLangfuseClient();
  lf.trace({ id: traceId, name: 'metrics-agent', tags: ['daily', 'scheduled'] });

  // Fetch metric counts and quality drift in parallel
  const [counts, qualityDrifts] = await Promise.all([
    fetchDailyCounts(supabase),
    fetchQualityDrift(supabase, driftThreshold),
  ]);

  // Guard: no data yet for today
  const todayCounts = counts.filter(c => c.date === todayDate);
  if (todayCounts.length === 0 && qualityDrifts.length === 0) {
    const msg = `ℹ️ *FreedomFire Metrics Agent — ${todayDate}*\nNo analytics data yet for today. Check back later.`;
    if (slackUrl) await postToSlack(slackUrl, msg);
    await lf.flush();
    return new Response(
      JSON.stringify({ result: 'no_data_today' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Detect anomalies
  const anomalies = detectAnomalies(counts, dropThreshold, spikeThreshold);

  let inputTokens = 0;
  let outputTokens = 0;
  let claudeError: string | null = null;

  if (anomalies.length > 0 || qualityDrifts.length > 0) {
    // Claude only called when anomalies found (saves cost on healthy days)
    try {
      const genId = crypto.randomUUID();
      const genStart = new Date();
      let analysis: ClaudeAnalysis | null = null;

      if (anomalies.length > 0) {
        const response = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 512,
          messages: [{ role: 'user', content: buildAnalysisPrompt(anomalies, counts, todayDate) }],
        });
        inputTokens = response.usage.input_tokens;
        outputTokens = response.usage.output_tokens;
        const text = (response.content[0] as Anthropic.TextBlock).text;
        try {
          const jsonMatch = text.match(/\{[\s\S]*"summary"[\s\S]*\}/);
          if (jsonMatch) analysis = JSON.parse(jsonMatch[0]) as ClaudeAnalysis;
        } catch { /* fall through to defaults */ }
        if (!analysis) {
          analysis = { summary: 'Metric anomalies detected', root_cause_hypothesis: text.slice(0, 200), suggested_resolution: 'Check Sentry and recent deployments.', severity: 'medium' };
        }
        lf.generation({
          id: genId,
          traceId,
          name: 'metrics-rca',
          model: MODEL,
          input: [{ role: 'user', content: buildAnalysisPrompt(anomalies, counts, todayDate) }],
          output: analysis,
          startTime: genStart,
          endTime: new Date(),
          usage: { input: inputTokens, output: outputTokens },
        });
      }

      const slackMessage = analysis
        ? buildAnomalyMessage(anomalies, qualityDrifts, analysis, todayDate, supabaseUrl)
        : buildQualityOnlyAlert(qualityDrifts, todayDate);
      await postToSlack(slackUrl, slackMessage);
    } catch (err: any) {
      claudeError = err.message ?? 'Claude API error';
      const rawAlert = [
        `⚠️ *Metric Anomalies Detected — ${todayDate}*`,
        anomalies.map(a => `${a.direction === 'drop' ? '📉' : '📈'} ${a.metric}: ${a.todayValue} vs ${a.rollingAvg.toFixed(0)} avg (${formatPct(a.pctChange)})`).join('\n'),
        qualityDrifts.length > 0 ? buildQualityDriftBlock(qualityDrifts) : '',
        `_(AI analysis unavailable: ${claudeError})_`,
      ].filter(Boolean).join('\n');
      await postToSlack(slackUrl, rawAlert).catch(() => {});
    }
  } else if (sendHealthyDigest) {
    const msg = buildHealthyMessage(counts, qualityDrifts, todayDate);
    await postToSlack(slackUrl, msg);
  }

  // Log to ai_request_log for observability
  await supabase.from('ai_request_log').insert({
    user_id: null,
    function_name: 'metrics-agent',
    model: anomalies.length > 0 ? MODEL : null,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    latency_ms: Date.now() - startMs,
    error: claudeError,
  });

  await lf.flush();

  return new Response(
    JSON.stringify({
      date: todayDate,
      anomaliesDetected: anomalies.length,
      anomalies: anomalies.map(a => ({ metric: a.metric, direction: a.direction, pctChange: a.pctChange })),
      qualityDriftsDetected: qualityDrifts.length,
      qualityDrifts: qualityDrifts.map(d => ({ functionName: d.functionName, scoreName: d.scoreName, pctChange: d.pctChange })),
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
