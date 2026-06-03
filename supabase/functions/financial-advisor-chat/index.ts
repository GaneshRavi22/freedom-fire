import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.36.3';
import { createLangfuseClient } from '../_shared/langfuse.ts';
import { evalAdvisorResponse } from '../_shared/online-eval.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_HISTORY = 20;
const EVAL_SAMPLE_RATE = 0.2;
const PROMPT_VERSION = 'advisor-v1.0';

// Static rules — identical for every user, so this block is a cache hit after the first
// call per 5-min window, cutting input-token cost by ~80% for the rules portion.
const STATIC_SYSTEM = `You are FreedomFire's AI financial advisor — an expert on FIRE planning for Indian professionals. You have access to the user's real financial data via tools.

Rules:
- Always call a tool before answering questions about the user's data (never guess numbers)
- Give specific numbers in Indian format (₹, use lakhs/crores for large amounts)
- Frame insights as "freedom days" or retirement age impact when relevant
- Be warm and direct — not corporate, not preachy
- Never recommend specific stocks, mutual funds, or investment products by name
- Acknowledge Indian financial context: EMI, SIP, ELSS, PPF, NPS, quick commerce
- If the user states a preference, goal, or important constraint, call update_user_memory to save it for future sessions`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_fire_progress',
    description: "Get the user's current FIRE progress — corpus needed, retire age, savings rate, EMI",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_spending_breakdown',
    description: "Get the user's latest spending analysis — avg monthly spend, category breakdown, insights",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_tasks',
    description: "Get the user's financial tasks — recommended, accepted, and completed",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'calculate_scenario',
    description: 'Calculate how changes to savings or expenses affect the FIRE date',
    input_schema: {
      type: 'object' as const,
      properties: {
        monthly_savings_delta: {
          type: 'number',
          description: 'Change to monthly savings in INR (positive = saving more)',
        },
        monthly_expenses_delta: {
          type: 'number',
          description: 'Change to monthly expenses in INR (positive = spending more)',
        },
      },
    },
  },
  {
    name: 'update_user_memory',
    description: "Save a fact about the user worth remembering in future sessions — a stated preference, financial decision, or important constraint.",
    input_schema: {
      type: 'object' as const,
      properties: {
        item: {
          type: 'string',
          description: 'One concise sentence to remember (e.g. "Wants to retire in Goa", "Risk-averse, prefers FDs over equities", "Has a home loan ending in 2029")',
        },
      },
      required: ['item'],
    },
  },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

  try {
    const { userId, message, conversationHistory = [] } = await req.json();
    if (!userId || !message) {
      return new Response(JSON.stringify({ error: 'Missing userId or message' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const traceId = crypto.randomUUID();
    const sessionId = `advisor-${userId}`;
    const lf = createLangfuseClient();

    lf.trace({
      id: traceId,
      name: 'financial-advisor-chat',
      userId,
      sessionId,
      input: { message },
      metadata: { historyLength: conversationHistory.length, promptVersion: PROMPT_VERSION },
    });

    const [{ data: profile }, { data: userMemoryRow }] = await Promise.all([
      supabase.from('profiles').select('name').eq('id', userId).maybeSingle(),
      supabase.from('user_memory').select('items').eq('user_id', userId).maybeSingle(),
    ]);

    const memoryItems: string[] = userMemoryRow?.items ?? [];
    const memoryBlock = memoryItems.length > 0
      ? `\nLearned about this user:\n${memoryItems.map((m) => `- ${m}`).join('\n')}`
      : '';
    const dynamicText = `The user's name is ${profile?.name ?? 'there'}.${memoryBlock}`;

    // Two-block system: static rules are cached (same for every user/turn);
    // dynamic block (name + memory) is sent fresh without cache_control.
    const systemBlocks = [
      { type: 'text' as const, text: STATIC_SYSTEM, cache_control: { type: 'ephemeral' as const } },
      { type: 'text' as const, text: dynamicText },
    ] as Anthropic.TextBlockParam[];

    async function executeTool(name: string, input: Record<string, any>): Promise<string> {
      if (name === 'get_fire_progress') {
        const { data } = await supabase
          .from('fire_calculations')
          .select('fire_number,retire_at_age,years_to_fire,savings_rate,monthly_savings,monthly_emi')
          .eq('user_id', userId)
          .maybeSingle();
        if (!data) return JSON.stringify({ error: 'No FIRE calculation found. User needs to set up their FIRE plan first.' });
        return JSON.stringify(data);
      }

      if (name === 'get_spending_breakdown') {
        const { data } = await supabase
          .from('spend_analyses')
          .select('avg_monthly_spend,effective_avg_monthly_spend,analysis_period_months,category_breakdown,insights')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!data) return JSON.stringify({ error: 'No spend analysis found. User needs to upload a credit card statement first.' });
        const breakdown: Record<string, number> = data.category_breakdown ?? {};
        const topCategory = Object.entries(breakdown).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'unknown';
        const totalSpend = Object.values(breakdown).reduce((s, v) => s + v, 0);
        const topCategoryPct = totalSpend > 0 ? Math.round((breakdown[topCategory] / totalSpend) * 100) : 0;
        return JSON.stringify({ ...data, topCategory, topCategoryPct });
      }

      if (name === 'get_tasks') {
        const { data } = await supabase
          .from('user_tasks')
          .select('task_type,title,status,target_completion_date,xp_reward')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
        const tasks = data ?? [];
        return JSON.stringify({
          recommended: tasks.filter((t: any) => t.status === 'recommended'),
          accepted:    tasks.filter((t: any) => t.status === 'accepted'),
          completed:   tasks.filter((t: any) => t.status === 'done'),
        });
      }

      if (name === 'calculate_scenario') {
        const { data: fireCalc } = await supabase
          .from('fire_calculations')
          .select('fire_number,monthly_savings,expected_return_pct,current_savings,monthly_expenses,retirement_age,inflation_rate_pct')
          .eq('user_id', userId)
          .maybeSingle();
        if (!fireCalc) return JSON.stringify({ error: 'No FIRE calculation found' });

        const newMonthlySavings = (fireCalc.monthly_savings ?? 0)
          + (input.monthly_savings_delta ?? 0)
          - (input.monthly_expenses_delta ?? 0);

        const monthlyRate = (fireCalc.expected_return_pct ?? 12) / 100 / 12;
        let wealth = fireCalc.current_savings ?? 0;
        let months = 0;
        while (wealth < fireCalc.fire_number && months < 1200) {
          wealth = wealth * (1 + monthlyRate) + newMonthlySavings;
          months++;
        }
        const newYearsToFire = months >= 1200 ? 999 : months / 12;
        const currentYearsToFire = fireCalc.retirement_age ? fireCalc.retirement_age - 30 : 15;

        return JSON.stringify({
          newYearsToFire: parseFloat(newYearsToFire.toFixed(1)),
          deltaYears: parseFloat((currentYearsToFire - newYearsToFire).toFixed(1)),
          newMonthlySavings,
        });
      }

      if (name === 'update_user_memory') {
        const item: string = (input.item as string) ?? '';
        if (item) {
          const { data: existing } = await supabase
            .from('user_memory')
            .select('items')
            .eq('user_id', userId)
            .maybeSingle();
          const currentItems: string[] = existing?.items ?? [];
          const updatedItems = [...currentItems, item].slice(-10); // keep last 10
          await supabase.from('user_memory').upsert({
            user_id: userId,
            items: updatedItems,
            updated_at: new Date().toISOString(),
          });
        }
        return JSON.stringify({ saved: true });
      }

      return JSON.stringify({ error: `Unknown tool: ${name}` });
    }

    const messages: Anthropic.MessageParam[] = [
      ...conversationHistory.slice(-MAX_HISTORY),
      { role: 'user', content: message },
    ];

    const startMs = Date.now();
    let inputTokens = 0;
    let outputTokens = 0;
    let agentError = null;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        let assistantContent = '';
        const toolsUsed: string[] = [];
        let turnIndex = 0;

        try {
          await supabase.from('ai_conversations').insert({ user_id: userId, role: 'user', content: message });

          let continueLoop = true;

          while (continueLoop) {
            const genId = crypto.randomUUID();
            const genStart = new Date();

            const response = await anthropic.messages.create({
              model: MODEL,
              max_tokens: 2048,
              system: systemBlocks,
              messages,
              tools: TOOLS,
            });

            inputTokens  += response.usage.input_tokens;
            outputTokens += response.usage.output_tokens;
            turnIndex++;

            lf.generation({
              id: genId,
              traceId,
              name: `advisor-turn-${turnIndex}`,
              model: MODEL,
              input: messages,
              output: response.content,
              startTime: genStart,
              endTime: new Date(),
              usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
              metadata: { promptVersion: PROMPT_VERSION },
            });

            const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];

            for (const block of response.content) {
              if (block.type === 'text') {
                assistantContent += block.text;
                send({ type: 'text_delta', text: block.text });
              } else if (block.type === 'tool_use') {
                toolsUsed.push(block.name);
                send({ type: 'tool_use', id: block.id, name: block.name, input: block.input });
                const toolResult = await executeTool(block.name, block.input as Record<string, any>);
                send({ type: 'tool_result', tool_use_id: block.id, content: toolResult });
                toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: toolResult });
              }
            }

            if (toolResults.length > 0) {
              messages.push({ role: 'assistant', content: response.content });
              messages.push({ role: 'user', content: toolResults });
            }

            continueLoop = response.stop_reason === 'tool_use';
          }

          if (assistantContent) {
            await supabase.from('ai_conversations').insert({ user_id: userId, role: 'assistant', content: assistantContent });
          }

          send({ type: 'message_stop' });

          // ── Online eval (LLM judge, sampled) ──────────────────────────────
          const shouldEval = Math.random() < EVAL_SAMPLE_RATE;
          if (shouldEval && assistantContent) {
            const evalResult = await evalAdvisorResponse(anthropic, message, assistantContent, toolsUsed);

            lf.score({
              traceId,
              name: 'response_quality',
              value: evalResult.value,
              comment: JSON.stringify(evalResult.detail),
            });

            await supabase.from('ai_eval_scores').insert({
              trace_id: traceId,
              function_name: 'financial-advisor-chat',
              score_name: 'response_quality',
              score_value: evalResult.value,
              score_detail: evalResult.detail,
              eval_type: evalResult.evalType,
            });
          }
        } catch (err: any) {
          agentError = err.message ?? 'Agent error';
          send({ type: 'error', message: agentError });
        } finally {
          await supabase.from('ai_request_log').insert({
            user_id: userId,
            function_name: 'financial-advisor-chat',
            model: MODEL,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            latency_ms: Date.now() - startMs,
            error: agentError,
          });
          await lf.flush();
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message ?? 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
