import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.36.3';
import { createLangfuseClient } from '../_shared/langfuse.ts';
import { evalInsights } from '../_shared/online-eval.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL = 'claude-haiku-4-5-20251001';
const PROMPT_VERSION = 'weekly-v1.0';

const SYSTEM_PROMPT = `You are a financial health analyst for FreedomFire, an Indian FIRE planning app. Each week you review a user's financial data and generate 3–5 actionable weekly insights.

Insight categories:
- spending: Spending patterns, anomalies, trends
- fire_progress: Progress toward FIRE corpus, savings rate, milestones
- task_opportunity: New actions the user could take
- milestone: Celebrations — level up, badge close, streak achievement

Rules:
- Be specific: use real ₹ amounts and concrete FIRE impact
- Be encouraging, not alarming
- Indian financial context: SIP, EMI, crore/lakh formatting
- Each insight max 200 characters

Call output_insights with your generated insights.`;

interface GeneratedInsight {
  category: 'spending' | 'fire_progress' | 'task_opportunity' | 'milestone';
  message: string;
  confidence: number;
  related_task_type: string | null;
}

const GENERATE_INSIGHTS_TOOL: Anthropic.Tool = {
  name: 'output_insights',
  description: 'Output weekly financial health insights as structured JSON',
  input_schema: {
    type: 'object' as const,
    properties: {
      insights: {
        type: 'array',
        minItems: 3,
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: ['spending', 'fire_progress', 'task_opportunity', 'milestone'],
            },
            message: { type: 'string', maxLength: 200 },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            related_task_type: { type: ['string', 'null'] },
          },
          required: ['category', 'message', 'confidence', 'related_task_type'],
        },
      },
    },
    required: ['insights'],
  },
};

async function processUser(
  supabase: ReturnType<typeof createClient>,
  anthropic: Anthropic,
  userId: string
) {
  const startMs = Date.now();
  const traceId = crypto.randomUUID();
  const lf = createLangfuseClient();

  lf.trace({ id: traceId, name: 'weekly-health-agent', userId, tags: ['weekly', 'scheduled'], metadata: { promptVersion: PROMPT_VERSION } });

  // ── Fetch user context ──────────────────────────────────────────────────────
  const [{ data: fireCalc }, { data: spendAnalysis }, { data: tasks }, { data: gamification }] =
    await Promise.all([
      supabase
        .from('fire_calculations')
        .select('fire_number,retire_at_age,years_to_fire,savings_rate,monthly_expenses')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('spend_analyses')
        .select('effective_avg_monthly_spend,avg_monthly_spend,category_breakdown,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('user_tasks').select('task_type,status,updated_at').eq('user_id', userId),
      supabase
        .from('user_gamification')
        .select('xp,level,total_freedom_days')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

  const acceptedCount = (tasks ?? []).filter((t: any) => t.status === 'accepted').length;
  const doneThisMonth = (tasks ?? []).filter((t: any) => {
    if (t.status !== 'done') return false;
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    return new Date(t.updated_at) > monthAgo;
  }).length;

  const avgSpend = spendAnalysis?.effective_avg_monthly_spend ?? spendAnalysis?.avg_monthly_spend ?? 0;
  const breakdown: Record<string, number> = spendAnalysis?.category_breakdown ?? {};
  const totalSpend = Object.values(breakdown).reduce((s, v) => s + (v as number), 0);
  const topEntry = Object.entries(breakdown).sort(([, a], [, b]) => (b as number) - (a as number))[0];
  const topCategory = topEntry?.[0] ?? 'unknown';
  const topCategoryPct = totalSpend > 0 ? Math.round(((topEntry?.[1] as number ?? 0) / totalSpend) * 100) : 0;
  const daysSinceAnalysis = spendAnalysis
    ? Math.round((Date.now() - new Date(spendAnalysis.created_at).getTime()) / 86400000)
    : null;

  const contextLines = [
    fireCalc
      ? `FIRE: Corpus ₹${fireCalc.fire_number?.toLocaleString('en-IN')}, retire at ${fireCalc.retire_at_age}, savings rate ${fireCalc.savings_rate}%`
      : 'FIRE: Not calculated yet',
    avgSpend > 0
      ? `Spend: Avg ₹${avgSpend.toLocaleString('en-IN')}/month, top category: ${topCategory} (${topCategoryPct}%)`
      : 'Spend: No statement uploaded',
    `Tasks: ${acceptedCount} accepted, ${doneThisMonth} completed this month`,
    gamification
      ? `Level: ${gamification.level}, ${gamification.total_freedom_days?.toFixed(0)} freedom days total`
      : 'Gamification: New user',
    daysSinceAnalysis !== null ? `Last statement: ${daysSinceAnalysis} days ago` : '',
  ].filter(Boolean).join('\n');

  // ── Call Claude ─────────────────────────────────────────────────────────────
  let insights: GeneratedInsight[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let claudeError = null;
  const genId = crypto.randomUUID();
  const genStart = new Date();

  const userMessage = `Generate 3-5 weekly insights for this user:\n\n${contextLines}`;

  // Cache the static system prompt — identical across all users, so every call after
  // the first in a 5-min window is a cache hit, cutting input-token cost ~80%.
  const cachedSystem = [{ type: 'text' as const, text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' as const } }];

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: cachedSystem as Anthropic.TextBlockParam[],
      messages: [{ role: 'user', content: userMessage }],
      tools: [GENERATE_INSIGHTS_TOOL],
      tool_choice: { type: 'any' },
    });

    inputTokens = response.usage.input_tokens;
    outputTokens = response.usage.output_tokens;

    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (toolUse?.name === 'output_insights') {
      insights = (toolUse.input as { insights: GeneratedInsight[] }).insights ?? [];
    }

    lf.generation({
      id: genId,
      traceId,
      name: 'generate-insights',
      model: MODEL,
      input: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userMessage }],
      metadata: { promptVersion: PROMPT_VERSION },
      output: insights,
      startTime: genStart,
      endTime: new Date(),
      usage: { input: inputTokens, output: outputTokens },
    });
  } catch (err: any) {
    claudeError = err.message ?? 'Claude API error';
    lf.generation({
      id: genId,
      traceId,
      name: 'generate-insights',
      model: MODEL,
      input: [{ role: 'user', content: userMessage }],
      startTime: genStart,
      endTime: new Date(),
      level: 'ERROR',
      metadata: { error: claudeError },
    });
  }

  await supabase.from('ai_request_log').insert({
    user_id: userId,
    function_name: 'weekly-health-agent',
    model: MODEL,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    latency_ms: Date.now() - startMs,
    error: claudeError,
  });

  if (insights.length === 0) {
    await lf.flush();
    return { insightsGenerated: 0 };
  }

  // ── Online eval — insight quality ───────────────────────────────────────────
  const evalResult = evalInsights(
    insights.map((i) => ({ message: i.message, category: i.category, confidence: i.confidence }))
  );

  lf.score({
    traceId,
    observationId: genId,
    name: 'insight_quality',
    value: evalResult.value,
    comment: JSON.stringify(evalResult.detail),
  });

  await supabase.from('ai_eval_scores').insert({
    trace_id: traceId,
    function_name: 'weekly-health-agent',
    score_name: 'insight_quality',
    score_value: evalResult.value,
    score_detail: evalResult.detail,
    eval_type: evalResult.evalType,
  });

  // ── Auto-dismiss old unread insights (> 14 days) ────────────────────────────
  await supabase
    .from('ai_insights')
    .update({ dismissed: true })
    .eq('user_id', userId)
    .eq('dismissed', false)
    .lt('created_at', new Date(Date.now() - 14 * 86400000).toISOString());

  // ── Find matching task IDs for task_opportunity insights ────────────────────
  const taskTypesToFind = insights.filter((i) => i.related_task_type).map((i) => i.related_task_type!);
  let taskMap: Record<string, string> = {};

  if (taskTypesToFind.length > 0) {
    const { data: matchedTasks } = await supabase
      .from('user_tasks')
      .select('id,task_type')
      .eq('user_id', userId)
      .in('task_type', taskTypesToFind)
      .in('status', ['recommended', 'accepted']);
    if (matchedTasks) {
      taskMap = Object.fromEntries((matchedTasks as any[]).map((t) => [t.task_type, t.id]));
    }
  }

  await supabase.from('ai_insights').insert(
    insights.map((i) => ({
      user_id: userId,
      category: i.category,
      message: i.message,
      confidence: i.confidence,
      action_id: i.related_task_type ? (taskMap[i.related_task_type] ?? null) : null,
      dismissed: false,
    }))
  );

  await lf.flush();
  return { insightsGenerated: insights.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const singleUserId: string | null = body.userId ?? null;

    let userIds: string[] = [];
    if (singleUserId) {
      userIds = [singleUserId];
    } else {
      const { data: activeUsers } = await supabase
        .from('fire_calculations')
        .select('user_id')
        .gte('updated_at', new Date(Date.now() - 90 * 86400000).toISOString());
      userIds = (activeUsers ?? []).map((u: any) => u.user_id);
    }

    let totalInsights = 0;
    const errors: Array<{ userId: string; error: string }> = [];

    for (const userId of userIds) {
      try {
        const result = await processUser(supabase, anthropic, userId);
        totalInsights += result.insightsGenerated;
      } catch (err: any) {
        errors.push({ userId, error: err.message ?? 'Unknown error' });
      }
    }

    return new Response(
      JSON.stringify({ usersProcessed: userIds.length, insightsGenerated: totalInsights, errors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message ?? 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
