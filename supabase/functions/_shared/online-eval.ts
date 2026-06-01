// Online evaluation scorers for FreedomFire AI functions.
//
// Rule-based scorers run synchronously (free, zero latency).
// LLM-judge scorer uses Claude Haiku for higher-stakes outputs (advisor chat).
//
// All scores are 0–1. They are:
//   - sent to LangFuse via the caller's LangfuseClient
//   - written to the ai_eval_scores Supabase table for drift detection

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.36.3';

// ── Shared types ──────────────────────────────────────────────────────────────

export interface EvalScore {
  value: number;           // 0-1
  detail: Record<string, unknown>;
  evalType: 'rule_based' | 'llm_judge';
}

// ── weekly-health-agent: insight quality ─────────────────────────────────────
// Criteria:
//   hasAmount    (0.4) — mentions a ₹ figure (specificity)
//   isActionable (0.3) — contains an action verb
//   hasFIRELink  (0.3) — references FIRE progress or freedom days

export function evalInsights(
  insights: Array<{ message: string; category: string; confidence: number }>
): EvalScore {
  if (insights.length === 0) return { value: 0, detail: { count: 0 }, evalType: 'rule_based' };

  const AMOUNT_RE = /₹[\d,]+/;
  const ACTION_RE = /\b(reduce|cancel|prepay|increase|start|consider|cut|save|invest|switch|lower|boost)\b/i;
  const FIRE_RE   = /\b(retire|FIRE|freedom day|corpus|savings rate|year|month)\b/i;

  let totalScore = 0;
  const perInsight: Record<string, number>[] = [];

  for (const ins of insights) {
    const hasAmount    = AMOUNT_RE.test(ins.message) ? 1 : 0;
    const isActionable = ACTION_RE.test(ins.message) ? 1 : 0;
    const hasFIRELink  = FIRE_RE.test(ins.message)   ? 1 : 0;
    const score = hasAmount * 0.4 + isActionable * 0.3 + hasFIRELink * 0.3;
    totalScore += score;
    perInsight.push({ hasAmount, isActionable, hasFIRELink, score });
  }

  return {
    value: Math.round((totalScore / insights.length) * 100) / 100,
    detail: { insightCount: insights.length, perInsight },
    evalType: 'rule_based',
  };
}

// ── generate-tasks: task quality ─────────────────────────────────────────────
// Criteria:
//   hasAmount   (0.4) — mentions a ₹ amount in title or description
//   isSpecific  (0.3) — references a specific product/platform/financial instrument
//   hasFIRELink (0.3) — mentions FIRE impact

export function evalTasks(
  tasks: Array<{ title: string; description: string }>
): EvalScore {
  if (tasks.length === 0) return { value: 0, detail: { count: 0 }, evalType: 'rule_based' };

  const AMOUNT_RE   = /₹[\d,]+/;
  const SPECIFIC_RE = /\b(Zomato|Swiggy|Zepto|Blinkit|Netflix|Amazon Prime|Hotstar|SIP|EMI|loan|credit card|ELSS|PPF|NPS|insurance|subscription|quick commerce)\b/i;
  const FIRE_RE     = /\b(retire|FIRE|freedom day|corpus|savings|year|month|age)\b/i;

  let totalScore = 0;
  const perTask: Record<string, number>[] = [];

  for (const task of tasks) {
    const combined    = `${task.title} ${task.description}`;
    const hasAmount   = AMOUNT_RE.test(combined)   ? 1 : 0;
    const isSpecific  = SPECIFIC_RE.test(combined) ? 1 : 0;
    const hasFIRELink = FIRE_RE.test(combined)     ? 1 : 0;
    const score       = hasAmount * 0.4 + isSpecific * 0.3 + hasFIRELink * 0.3;
    totalScore += score;
    perTask.push({ hasAmount, isSpecific, hasFIRELink, score });
  }

  return {
    value: Math.round((totalScore / tasks.length) * 100) / 100,
    detail: { taskCount: tasks.length, perTask },
    evalType: 'rule_based',
  };
}

// ── sentry-agent: root-cause hypothesis quality ───────────────────────────────
// Criteria:
//   hasFilePath     (0.4) — references a file path
//   hasFunctionName (0.3) — references a specific function or method
//   isSpecific      (0.3) — ≥ 80 characters (not a vague catch-all)

export function evalRootCauseHypothesis(hypothesis: string): EvalScore {
  const hasFilePath     = /[a-z0-9_/-]+\.(ts|tsx|js|jsx|sql)/.test(hypothesis) ? 1 : 0;
  const hasFunctionName = /\b[a-zA-Z_][a-zA-Z0-9_]*\(\)/.test(hypothesis) ? 1 : 0;
  const isSpecific      = hypothesis.length >= 80 ? 1 : 0;

  const value = hasFilePath * 0.4 + hasFunctionName * 0.3 + isSpecific * 0.3;

  return {
    value: Math.round(value * 100) / 100,
    detail: { hasFilePath, hasFunctionName, isSpecific, length: hypothesis.length },
    evalType: 'rule_based',
  };
}

// ── financial-advisor-chat: response quality (LLM judge) ─────────────────────
// Dimensions:
//   groundedness (0.4) — uses real user data from tool calls, not generic advice
//   specificity  (0.3) — mentions ₹ amounts or concrete timeframes
//   helpfulness  (0.3) — actionable and relevant to the question
//
// Sampling: only eval ~20% of turns to keep cost low (caller decides).

export async function evalAdvisorResponse(
  anthropic: Anthropic,
  userMessage: string,
  assistantResponse: string,
  toolsUsed: string[]
): Promise<EvalScore> {
  const prompt = `You are evaluating an AI financial advisor for an Indian FIRE planning app.

Rate this response on three dimensions, each 0.0–1.0:

1. groundedness: Does it use specific data from the user's financial profile (via tools), not generic advice? (1.0 = fully grounded in user data, 0.0 = entirely generic)
2. specificity: Does it mention concrete ₹ amounts, specific percentages, or exact timeframes? (1.0 = very specific, 0.0 = all vague)
3. helpfulness: Is the advice actionable and directly relevant to the user's question? (1.0 = highly actionable, 0.0 = unhelpful)

User message: "${userMessage.slice(0, 200)}"
Tools called: ${toolsUsed.length > 0 ? toolsUsed.join(', ') : 'none'}
Assistant response: "${assistantResponse.slice(0, 400)}"

Respond as JSON only: { "groundedness": 0.0-1.0, "specificity": 0.0-1.0, "helpfulness": 0.0-1.0, "comment": "one sentence" }`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = (response.content[0] as Anthropic.TextBlock).text;
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in judge response');

    const j = JSON.parse(match[0]);
    const g = Math.min(1, Math.max(0, Number(j.groundedness) || 0));
    const s = Math.min(1, Math.max(0, Number(j.specificity)  || 0));
    const h = Math.min(1, Math.max(0, Number(j.helpfulness)  || 0));
    const value = Math.round((g * 0.4 + s * 0.3 + h * 0.3) * 100) / 100;

    return {
      value,
      detail: { groundedness: g, specificity: s, helpfulness: h, comment: j.comment ?? '' },
      evalType: 'llm_judge',
    };
  } catch {
    return { value: 0.5, detail: { error: 'judge_failed' }, evalType: 'llm_judge' };
  }
}
