# AI Development Practices

Cross-cutting engineering conventions for all AI Edge Functions in FreedomFire.
These practices apply to: `financial-advisor-chat`, `generate-tasks`, `weekly-health-agent`,
`sentry-agent`, `metrics-agent`, and `parse-credit-card-pdf`.

---

## Prompt Versioning

Every AI Edge Function declares a `PROMPT_VERSION` constant at the top of its file:

```typescript
const PROMPT_VERSION = 'advisor-v1.0';   // financial-advisor-chat
const PROMPT_VERSION = 'weekly-v1.0';    // weekly-health-agent
const PROMPT_VERSION_A = 'tasks-v1.0';  // generate-tasks (control)
const PROMPT_VERSION_B = 'tasks-v1.1';  // generate-tasks (experiment)
const PROMPT_VERSION = 'parse-v1.0';    // parse-credit-card-pdf
```

### Naming convention

`{function-short-name}-v{major}.{minor}`

- Increment **minor** for wording tweaks, added examples, or reordered rules — changes that
  should improve quality without altering the prompt's intent.
- Increment **major** for structural changes: new tools, removed constraints, changed output
  schema, or a shift in persona.

### Where it flows

`PROMPT_VERSION` is passed as `metadata` on every LangFuse trace and generation:

```typescript
lf.trace({ ..., metadata: { promptVersion: PROMPT_VERSION } });
lf.generation({ ..., metadata: { promptVersion: PROMPT_VERSION } });
```

For `generate-tasks`, the active variant's version also lands in `ai_eval_scores.score_detail`:

```typescript
score_detail: { ...evalResult.detail, promptVariant: variant, promptVersion }
```

This lets you filter in LangFuse and query directly in Postgres:

```sql
SELECT score_detail->>'promptVersion', AVG(score_value)
FROM ai_eval_scores
WHERE function_name = 'generate-tasks'
GROUP BY 1
ORDER BY 2 DESC;
```

---

## Prompt Caching

All AI Edge Functions cache their static system prompt using Anthropic's `cache_control`
mechanism. Send the system prompt as a content block array rather than a plain string:

```typescript
const cachedSystem = [
  { type: 'text' as const, text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' as const } }
] as Anthropic.TextBlockParam[];

await anthropic.messages.create({ model, system: cachedSystem, messages, tools });
```

Anthropic caches the prefix for **5 minutes**. The cache is keyed by model + the exact
text of the cached block. Any change to the prompt text (including whitespace) creates a new
cache entry and incurs a one-time write charge on the first call.

### Two-block pattern for user-specific system prompts

When part of the system prompt is static and part is user-specific (e.g. name + memory),
split them into two blocks. Apply `cache_control` only to the static block:

```typescript
const systemBlocks = [
  // Block 1: cached — same for every user, every turn
  { type: 'text' as const, text: STATIC_SYSTEM, cache_control: { type: 'ephemeral' as const } },
  // Block 2: fresh — user-specific, never cached
  { type: 'text' as const, text: `The user's name is ${name}. Learned: ${memory}` },
] as Anthropic.TextBlockParam[];
```

This pattern is used by `financial-advisor-chat`. The static rules (~200 tokens) are cached;
the dynamic user block is always fresh. Cache hits eliminate ~80% of static system prompt
input token charges.

### Rule of thumb

Cache any block that is **identical across multiple calls within a 5-minute window**:
- System prompts in cron agents (weekly-health-agent, metrics-agent) — identical for every
  user processed in the loop.
- Static tool instructions and persona descriptions.

Do not apply `cache_control` to user messages or conversation history — these change every
turn and would never hit the cache.

---

## A/B Prompt Testing

Use `generate-tasks` as the reference implementation for A/B prompt tests.

### Variant assignment

Variant is determined by a stable hash of `userId`, so the same user always sees the same
variant across sessions:

```typescript
function getVariant(userId: string): 'A' | 'B' {
  const sum = Array.from(userId.replace(/-/g, '').slice(0, 8))
    .reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return sum % 2 === 0 ? 'A' : 'B';
}
```

This gives an approximately 50/50 split. The hash is deterministic — no DB column or cookie
required.

### Tracking

Pass `variant` and `promptVersion` into LangFuse trace metadata:

```typescript
lf.trace({ ..., metadata: { promptVersion, variant } });
```

And include `promptVariant` in `ai_eval_scores.score_detail` so SQL queries can compare
quality by variant without joining to LangFuse:

```typescript
score_detail: { ...evalResult.detail, promptVariant: variant, promptVersion }
```

### Evaluating results

After collecting at least 100 scored calls per variant (check `ai_eval_scores`):

```sql
SELECT
  score_detail->>'promptVariant' AS variant,
  score_detail->>'promptVersion' AS version,
  COUNT(*)                        AS n,
  ROUND(AVG(score_value)::numeric, 3) AS avg_quality
FROM ai_eval_scores
WHERE function_name = 'generate-tasks'
  AND created_at > NOW() - INTERVAL '14 days'
GROUP BY 1, 2
ORDER BY 4 DESC;
```

In LangFuse, filter traces by `metadata.variant = 'B'` and compare `task_quality` score
distributions between A and B.

### Promoting a winner

1. Copy the winning variant's prompt text over `SYSTEM_PROMPT_A` (the new control).
2. Write a new `SYSTEM_PROMPT_B` (the next experiment) or remove the A/B split by collapsing
   to a single `SYSTEM_PROMPT` + `PROMPT_VERSION`.
3. Increment the version string: if B was `tasks-v1.1` and it wins, the new control becomes
   `tasks-v1.1` and the next experiment (if any) starts at `tasks-v1.2`.
4. Update this spec and `features/05-ai-tasks.md` to reflect the new prompt text.

---

## Prompt Authoring Rules

These rules apply to all system prompts across every AI function:

1. **Extract to a module-level constant** — never inline a multi-line prompt inside a
   function call. The constant must be the single source of truth for the prompt text.

2. **Always use forced tool use** for structured output — set `tool_choice: { type: 'any' }`
   and define the output schema as a tool. Do not ask for JSON in prose; it produces
   inconsistent results and is harder to type-safe.

3. **Ground every output rule in Indian context** — rupee formatting (₹, lakhs, crores),
   Indian financial instruments (SIP, EMI, ELSS, PPF, NPS), and local platforms
   (Zomato, Swiggy, Zepto, Blinkit) where relevant.

4. **One PROMPT_VERSION bump per deploy** — if you change the prompt, bump the version in
   the same commit. Never deploy a changed prompt without updating `PROMPT_VERSION`;
   otherwise you cannot correlate score changes to prompt changes in LangFuse.
