import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.36.3';
import { createLangfuseClient } from '../_shared/langfuse.ts';
import { evalTasks } from '../_shared/online-eval.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL = 'claude-haiku-4-5-20251001';

interface GeneratedTask {
  task_type: string;
  title: string;
  description: string;
  xp_reward: number;
  why_relevant: string;
  estimated_monthly_savings: number;
}

const GENERATE_TASKS_TOOL: Anthropic.Tool = {
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
            task_type: { type: 'string', description: 'kebab-case unique identifier' },
            title: { type: 'string', maxLength: 60 },
            description: { type: 'string', maxLength: 200, description: 'Personalised with real ₹ amounts' },
            xp_reward: { type: 'number', enum: [50, 75, 100, 150] },
            why_relevant: { type: 'string', description: '1 sentence — stored in metadata' },
            estimated_monthly_savings: { type: 'number', description: 'INR/month this task saves' },
          },
          required: ['task_type', 'title', 'description', 'xp_reward', 'why_relevant', 'estimated_monthly_savings'],
        },
      },
    },
    required: ['tasks'],
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const { userId } = await req.json();
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Missing userId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const traceId = crypto.randomUUID();
    const lf = createLangfuseClient();
    lf.trace({ id: traceId, name: 'generate-tasks', userId });

    // ── 1. Fetch user context ─────────────────────────────────────────────────
    const [{ data: fireCalc }, { data: spendAnalysis }] = await Promise.all([
      supabase
        .from('fire_calculations')
        .select('fire_number,retire_at_age,years_to_fire,savings_rate,monthly_emi,loan_tenure_years,monthly_expenses')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('spend_analyses')
        .select('avg_monthly_spend,effective_avg_monthly_spend,category_breakdown,insights,analysis_period_months')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const avgSpend = spendAnalysis?.effective_avg_monthly_spend ?? spendAnalysis?.avg_monthly_spend ?? 0;
    const categoryBreakdown: Record<string, number> = spendAnalysis?.category_breakdown ?? {};
    const insights: string[] = spendAnalysis?.insights ?? [];

    const contextLines = [
      `Avg monthly spend: ₹${avgSpend.toLocaleString('en-IN')}`,
      `Spending breakdown: ${JSON.stringify(categoryBreakdown)}`,
      fireCalc ? `FIRE number: ₹${fireCalc.fire_number?.toLocaleString('en-IN')}` : 'FIRE number: not calculated yet',
      fireCalc ? `Retire at age: ${fireCalc.retire_at_age} (in ${fireCalc.years_to_fire?.toFixed(1)} years)` : '',
      fireCalc ? `Savings rate: ${fireCalc.savings_rate}%` : '',
      fireCalc?.monthly_emi ? `Monthly EMI: ₹${fireCalc.monthly_emi.toLocaleString('en-IN')}` : 'No EMI',
      fireCalc?.loan_tenure_years ? `Loan tenure remaining: ${fireCalc.loan_tenure_years} years` : '',
      insights.length > 0 ? `Insights: ${insights.join('; ')}` : '',
    ].filter(Boolean).join('\n');

    // ── 2. Call Claude ────────────────────────────────────────────────────────
    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
    const startMs = Date.now();
    const genId = crypto.randomUUID();
    const genStart = new Date();
    let usage = null;
    let claudeError = null;
    let generatedTasks: GeneratedTask[] = [];

    const systemPrompt = `You are a financial advisor for Indian professionals pursuing FIRE (Financial Independence, Retire Early). Given a user's spending breakdown and FIRE progress, generate 3–5 personalised, actionable tasks that will have the highest impact on their retirement date.

Each task must:
- Be specific to their numbers (mention actual ₹ amounts)
- Show a concrete FIRE impact (earlier retire date or reduced corpus)
- Be achievable within 1–6 months
- Reflect Indian financial context (SIP, EMI, quick commerce, Zomato/Swiggy, etc.)
- Use different task_types (no duplicates)

Call output_tasks with your generated tasks.`;

    const userMessage = `Generate personalised financial tasks based on this user's data:\n\n${contextLines}`;

    try {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        tools: [GENERATE_TASKS_TOOL],
        tool_choice: { type: 'any' },
      });

      usage = response.usage;

      const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      if (toolUse?.name === 'output_tasks') {
        generatedTasks = (toolUse.input as { tasks: GeneratedTask[] }).tasks ?? [];
      }

      lf.generation({
        id: genId,
        traceId,
        name: 'generate-tasks-llm',
        model: MODEL,
        input: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
        output: generatedTasks,
        startTime: genStart,
        endTime: new Date(),
        usage: { input: usage.input_tokens, output: usage.output_tokens },
      });
    } catch (err: any) {
      claudeError = err.message ?? 'Claude API error';
      lf.generation({
        id: genId,
        traceId,
        name: 'generate-tasks-llm',
        model: MODEL,
        input: [{ role: 'user', content: userMessage }],
        startTime: genStart,
        endTime: new Date(),
        level: 'ERROR',
        metadata: { error: claudeError },
      });
    } finally {
      await supabase.from('ai_request_log').insert({
        user_id: userId,
        function_name: 'generate-tasks',
        model: MODEL,
        input_tokens: usage?.input_tokens ?? null,
        output_tokens: usage?.output_tokens ?? null,
        latency_ms: Date.now() - startMs,
        error: claudeError,
      });
    }

    if (generatedTasks.length === 0) {
      await lf.flush();
      return new Response(
        JSON.stringify({ tasks: [], error: claudeError ?? 'No tasks generated' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Online eval — task quality ────────────────────────────────────────────
    const evalResult = evalTasks(
      generatedTasks.map((t) => ({ title: t.title, description: t.description }))
    );

    lf.score({
      traceId,
      observationId: genId,
      name: 'task_quality',
      value: evalResult.value,
      comment: JSON.stringify(evalResult.detail),
    });

    await supabase.from('ai_eval_scores').insert({
      trace_id: traceId,
      function_name: 'generate-tasks',
      score_name: 'task_quality',
      score_value: evalResult.value,
      score_detail: evalResult.detail,
      eval_type: evalResult.evalType,
    });

    // ── 3. Fetch existing tasks to apply seeding rules ────────────────────────
    const { data: existingTasks } = await supabase
      .from('user_tasks')
      .select('task_type,status')
      .eq('user_id', userId);

    const blockedTypes = new Set(
      (existingTasks ?? [])
        .filter((t: any) => ['recommended', 'accepted', 'done'].includes(t.status))
        .map((t: any) => t.task_type)
    );

    const toUpsert = generatedTasks
      .filter((t) => !blockedTypes.has(t.task_type))
      .map((t) => ({
        user_id: userId,
        task_type: t.task_type,
        title: t.title,
        description: t.description,
        metadata: { why_relevant: t.why_relevant, estimated_monthly_savings: t.estimated_monthly_savings },
        xp_reward: t.xp_reward,
        status: 'recommended',
        updated_at: new Date().toISOString(),
      }));

    if (toUpsert.length > 0) {
      await supabase.from('user_tasks').upsert(toUpsert, { onConflict: 'user_id,task_type' });
    }

    const { data: freshTasks } = await supabase
      .from('user_tasks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    await lf.flush();

    return new Response(
      JSON.stringify({ tasks: freshTasks ?? [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message ?? 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
