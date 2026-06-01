import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.36.3';
import { evalInsights, evalTasks, EvalScore } from '../_shared/online-eval.ts';
import { createLangfuseClient } from '../_shared/langfuse.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL = 'claude-haiku-4-5-20251001';

// ── Synthetic test profiles ───────────────────────────────────────────────────

interface SyntheticProfile {
  id: string;
  label: string;
  // Mirrors the context lines built in weekly-health-agent and generate-tasks
  fireContext: string;
  spendContext: string;
  taskContext: string;
  gamificationContext: string;
}

const PROFILES: SyntheticProfile[] = [
  {
    id: 'early_career_high_spender',
    label: 'Early career, high spender',
    fireContext: 'FIRE: Corpus ₹3,00,00,000, retire at 55, savings rate 12%',
    spendContext: 'Spend: Avg ₹85,000/month, top category: Food & Delivery (34%)',
    taskContext: 'Tasks: 0 accepted, 0 completed this month',
    gamificationContext: 'Level: 1, 0 freedom days total',
  },
  {
    id: 'mid_career_emi_heavy',
    label: 'Mid career, EMI-heavy',
    fireContext: 'FIRE: Corpus ₹2,40,00,000, retire at 50, savings rate 22%',
    spendContext: 'Spend: Avg ₹1,10,000/month, top category: EMI & Loans (41%)',
    taskContext: 'Tasks: 2 accepted, 1 completed this month',
    gamificationContext: 'Level: 3, 45 freedom days total',
  },
  {
    id: 'near_fire',
    label: 'Near-FIRE, optimising final stretch',
    fireContext: 'FIRE: Corpus ₹4,80,00,000, retire at 42, savings rate 58%',
    spendContext: 'Spend: Avg ₹55,000/month, top category: Groceries & Utilities (28%)',
    taskContext: 'Tasks: 1 accepted, 3 completed this month',
    gamificationContext: 'Level: 8, 210 freedom days total',
  },
];

// ── Tool definitions (mirrors the real functions) ─────────────────────────────

const INSIGHTS_TOOL: Anthropic.Tool = {
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
            category: { type: 'string', enum: ['spending', 'fire_progress', 'task_opportunity', 'milestone'] },
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

const TASKS_TOOL: Anthropic.Tool = {
  name: 'output_tasks',
  description: 'Output the generated personalised tasks as structured JSON',
  input_schema: {
    type: 'object' as const,
    properties: {
      tasks: {
        type: 'array',
        minItems: 3,
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            task_type: { type: 'string' },
            title: { type: 'string', maxLength: 60 },
            description: { type: 'string', maxLength: 200 },
            xp_reward: { type: 'number', enum: [50, 75, 100, 150] },
            why_relevant: { type: 'string' },
            estimated_monthly_savings: { type: 'number' },
          },
          required: ['task_type', 'title', 'description', 'xp_reward', 'why_relevant', 'estimated_monthly_savings'],
        },
      },
    },
    required: ['tasks'],
  },
};

// ── Per-profile eval ─────────────────────────────────────────────────────────

interface ProfileResult {
  profileId: string;
  label: string;
  insightScore: EvalScore | null;
  taskScore: EvalScore | null;
  insightCount: number;
  taskCount: number;
  errors: string[];
  latencyMs: number;
}

async function evalProfile(
  anthropic: Anthropic,
  profile: SyntheticProfile
): Promise<ProfileResult> {
  const errors: string[] = [];
  const startMs = Date.now();
  let insightScore: EvalScore | null = null;
  let taskScore: EvalScore | null = null;
  let insightCount = 0;
  let taskCount = 0;

  const contextLines = [
    profile.fireContext,
    profile.spendContext,
    profile.taskContext,
    profile.gamificationContext,
    'Last statement: 7 days ago',
  ].join('\n');

  // ── Eval insights ────────────────────────────────────────────────────────────
  try {
    const insightSystem = `You are a financial health analyst for FreedomFire, an Indian FIRE planning app. Each week you review a user's financial data and generate 3–5 actionable weekly insights.

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

    const insightResp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: insightSystem,
      messages: [{ role: 'user', content: `Generate 3-5 weekly insights for this user:\n\n${contextLines}` }],
      tools: [INSIGHTS_TOOL],
      tool_choice: { type: 'any' },
    });

    const insightToolUse = insightResp.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );
    if (insightToolUse?.name === 'output_insights') {
      const insights = (insightToolUse.input as { insights: Array<{ message: string; category: string; confidence: number }> }).insights ?? [];
      insightCount = insights.length;
      insightScore = evalInsights(insights);
    } else {
      errors.push('insights: no tool_use block returned');
    }
  } catch (err: any) {
    errors.push(`insights: ${err.message ?? 'unknown error'}`);
  }

  // ── Eval tasks ───────────────────────────────────────────────────────────────
  try {
    const taskContextLines = [
      `Avg monthly spend: ₹${profile.spendContext.match(/₹[\d,]+/)?.[0]?.replace('₹', '') ?? '0'}`,
      `Spending breakdown: ${JSON.stringify({ [profile.spendContext.match(/top category: ([^(]+)/)?.[1]?.trim() ?? 'unknown']: parseInt(profile.spendContext.match(/\((\d+)%\)/)?.[1] ?? '0') })}`,
      profile.fireContext.replace('FIRE: ', '').replace('Corpus ', 'FIRE number: ').replace(', retire at', ' | Retire at age:').replace(', savings rate', ' | Savings rate:'),
    ].join('\n');

    const taskSystem = `You are a financial advisor for Indian professionals pursuing FIRE (Financial Independence, Retire Early). Given a user's spending breakdown and FIRE progress, generate 3–5 personalised, actionable tasks that will have the highest impact on their retirement date.

Each task must:
- Be specific to their numbers (mention actual ₹ amounts)
- Show a concrete FIRE impact (earlier retire date or reduced corpus)
- Be achievable within 1–6 months
- Reflect Indian financial context (SIP, EMI, quick commerce, Zomato/Swiggy, etc.)
- Use different task_types (no duplicates)

Call output_tasks with your generated tasks.`;

    const taskResp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: taskSystem,
      messages: [{ role: 'user', content: `Generate personalised financial tasks based on this user's data:\n\n${taskContextLines}` }],
      tools: [TASKS_TOOL],
      tool_choice: { type: 'any' },
    });

    const taskToolUse = taskResp.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );
    if (taskToolUse?.name === 'output_tasks') {
      const tasks = (taskToolUse.input as { tasks: Array<{ title: string; description: string }> }).tasks ?? [];
      taskCount = tasks.length;
      taskScore = evalTasks(tasks);
    } else {
      errors.push('tasks: no tool_use block returned');
    }
  } catch (err: any) {
    errors.push(`tasks: ${err.message ?? 'unknown error'}`);
  }

  return {
    profileId: profile.id,
    label: profile.label,
    insightScore,
    taskScore,
    insightCount,
    taskCount,
    errors,
    latencyMs: Date.now() - startMs,
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
  if (!anthropicKey) {
    return new Response(
      JSON.stringify({ error: 'Missing ANTHROPIC_API_KEY' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  const anthropic = new Anthropic({ apiKey: anthropicKey });
  const lf = createLangfuseClient();
  const traceId = crypto.randomUUID();
  const startMs = Date.now();

  lf.trace({ id: traceId, name: 'eval-suite', tags: ['offline', 'eval'] });

  // Run all 3 profiles in parallel
  const results = await Promise.all(PROFILES.map(p => evalProfile(anthropic, p)));

  // Write offline scores to ai_eval_scores
  const scoreRows: Array<{
    trace_id: string;
    function_name: string;
    score_name: string;
    score_value: number;
    score_detail: Record<string, unknown>;
    eval_type: string;
  }> = [];

  for (const result of results) {
    const profileTraceId = `${traceId}-${result.profileId}`;

    if (result.insightScore) {
      scoreRows.push({
        trace_id: profileTraceId,
        function_name: 'weekly-health-agent',
        score_name: 'insight_quality',
        score_value: result.insightScore.value,
        score_detail: { ...result.insightScore.detail, profileId: result.profileId },
        eval_type: 'offline',
      });

      lf.score({
        traceId,
        name: `insight_quality_${result.profileId}`,
        value: result.insightScore.value,
        comment: JSON.stringify({ profileId: result.profileId, ...result.insightScore.detail }),
      });
    }

    if (result.taskScore) {
      scoreRows.push({
        trace_id: profileTraceId,
        function_name: 'generate-tasks',
        score_name: 'task_quality',
        score_value: result.taskScore.value,
        score_detail: { ...result.taskScore.detail, profileId: result.profileId },
        eval_type: 'offline',
      });

      lf.score({
        traceId,
        name: `task_quality_${result.profileId}`,
        value: result.taskScore.value,
        comment: JSON.stringify({ profileId: result.profileId, ...result.taskScore.detail }),
      });
    }
  }

  if (scoreRows.length > 0) {
    await supabase.from('ai_eval_scores').insert(scoreRows);
  }

  // Build summary report
  const avgInsightScore = results
    .filter(r => r.insightScore)
    .reduce((s, r) => s + r.insightScore!.value, 0) / results.filter(r => r.insightScore).length;

  const avgTaskScore = results
    .filter(r => r.taskScore)
    .reduce((s, r) => s + r.taskScore!.value, 0) / results.filter(r => r.taskScore).length;

  const report = {
    runAt: new Date().toISOString(),
    traceId,
    latencyMs: Date.now() - startMs,
    profiles: results.map(r => ({
      profileId: r.profileId,
      label: r.label,
      insightScore: r.insightScore?.value ?? null,
      taskScore: r.taskScore?.value ?? null,
      insightCount: r.insightCount,
      taskCount: r.taskCount,
      errors: r.errors,
    })),
    summary: {
      avgInsightScore: isNaN(avgInsightScore) ? null : parseFloat(avgInsightScore.toFixed(3)),
      avgTaskScore: isNaN(avgTaskScore) ? null : parseFloat(avgTaskScore.toFixed(3)),
      totalErrors: results.reduce((s, r) => s + r.errors.length, 0),
      scoresWritten: scoreRows.length,
    },
  };

  await lf.flush();

  return new Response(
    JSON.stringify(report),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
