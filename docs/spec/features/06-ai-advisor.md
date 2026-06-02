# Feature Spec: AI Financial Advisor

**Purpose:** A conversational chat interface where users can ask natural language questions
about their finances and get precise, data-grounded answers from Claude.

**Implementation files:**
- `supabase/functions/financial-advisor-chat/index.ts`
- `app/(tabs)/advisor.tsx` — tab UI + `ChatBubble` local component (defined inline, not a separate file)
- `stores/advisor.store.ts` — conversation state

---

## User Experience

User opens the Advisor tab. Claude introduces itself:
> "Hi [Name], I know your numbers. You're on track to retire at 48 with a ₹4.8 crore corpus.
> Ask me anything."

User asks: *"What's my biggest spending leak?"*
Claude calls `get_spending_breakdown` tool → sees food is 32% of spend →
> "Your biggest leak is food delivery at ₹18,400/month — 32% of your total spend vs 19%
> Indian average. Cutting this by 30% would save ₹5,520/month and retire you 14 months earlier."

User asks: *"What if I start a ₹10k SIP today?"*
Claude calls `calculate_scenario` tool with `+10000` monthly savings →
> "Adding a ₹10k SIP brings your retire age from 48 to 45.2 — 2.8 years earlier. Your new
> FIRE number would be ₹4.4 crore."

---

## Edge Function: financial-advisor-chat

### Request
```typescript
{
  userId: string;
  message: string;
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}
```

### Response
Server-Sent Events stream. The client accumulates text deltas.

```
data: {"type":"text_delta","text":"Your "}
data: {"type":"text_delta","text":"biggest leak "}
data: {"type":"tool_use","id":"tu_1","name":"get_spending_breakdown","input":{}}
data: {"type":"tool_result","tool_use_id":"tu_1","content":"{...}"}
data: {"type":"text_delta","text":"is food delivery at ₹18,400..."}
data: {"type":"message_stop"}
```

### System Prompt

The system prompt is split into two blocks sent to Claude on every turn:

**Block 1 — Static rules (cached with `cache_control: ephemeral`)**
Identical for every user and every turn. Cached by Anthropic for up to 5 minutes, so all turns
after the first within a session are a cache hit and do not re-bill these tokens.

```
You are FreedomFire's AI financial advisor — an expert on FIRE planning for Indian
professionals. You have access to the user's real financial data via tools.

Rules:
- Always call a tool before answering questions about the user's data (never guess numbers)
- Give specific numbers in Indian format (₹, use lakhs/crores for large amounts)
- Frame insights as "freedom days" or retirement age impact when relevant
- Be warm and direct — not corporate, not preachy
- Never recommend specific stocks, mutual funds, or investment products by name
- Acknowledge Indian financial context: EMI, SIP, ELSS, PPF, NPS, quick commerce
- If the user states a preference, goal, or important constraint, call update_user_memory
  to save it for future sessions
```

**Block 2 — Dynamic context (sent fresh each turn, never cached)**
```
The user's name is {profile.name}.
[Learned about this user:             ← only present when user_memory.items is non-empty
- Wants to retire in Goa
- Risk-averse, prefers FDs over equities]
```

Version: `PROMPT_VERSION = 'advisor-v1.0'` — tracked in LangFuse trace metadata.
Increment when the static rules change (see `engineering/ai-development-practices.md`).

### Claude Tools

#### get_fire_progress
```typescript
// No input parameters
// Returns:
{
  fireNumber: number;         // ₹ corpus needed
  retireAtAge: number;
  yearsToFire: number;
  savingsRate: number;        // %
  monthlySavings: number;
  monthlyEmi: number;
  loanPayoffAge: number | null;
}
```
DB: `SELECT * FROM fire_calculations WHERE user_id = userId`

#### get_spending_breakdown
```typescript
// No input parameters
// Returns:
{
  avgMonthlySpend: number;
  effectiveAvgMonthlySpend: number;
  periodMonths: number;
  categoryBreakdown: Record<string, number>;
  topCategory: string;
  topCategoryPct: number;
  insights: string[];
}
```
DB: `SELECT * FROM spend_analyses WHERE user_id = userId ORDER BY created_at DESC LIMIT 1`

#### get_tasks
```typescript
// No input parameters
// Returns:
{
  recommended: Array<{ task_type, title, xp_reward }>;
  accepted: Array<{ task_type, title, target_completion_date }>;
  completed: Array<{ task_type, title, completed_at }>;
}
```
DB: `SELECT * FROM user_tasks WHERE user_id = userId`

#### calculate_scenario
```typescript
// Input:
{
  monthlySavingsDelta?: number;    // + or - change to monthly savings
  expensesDelta?: number;          // + or - change to monthly expenses
  expectedReturnPct?: number;      // override return %
}
// Returns:
{
  newRetireAtAge: number;
  newYearsToFire: number;
  newFireNumber: number;
  deltaYears: number;              // positive = earlier
  freedomDaysDelta: number;
}
```
Implementation: calls `calculate-fire-journey` internally with modified params

#### update_user_memory
```typescript
// Input:
{
  item: string;   // One concise sentence to remember across sessions
                  // e.g. "Wants to retire in Goa"
                  //      "Risk-averse, prefers FDs over equities"
                  //      "Has a home loan ending in 2029"
}
// Returns:
{ saved: true }
```
DB: upsert into `user_memory`. Items array capped at 10 entries — oldest trimmed when full.
The advisor calls this tool when the user states a lasting preference, decision, or constraint.
Does not surface the save to the user (silent side-effect).

---

## Conversation Persistence

Each message saved to `ai_conversations`:
```typescript
INSERT INTO ai_conversations (user_id, role, content, tool_calls, created_at)
VALUES (userId, role, content, toolCallsJson, now())
```

`conversationHistory` passed in request = last 20 messages (client manages this).
DB is append-only — full history preserved even if client truncates.

---

## User Memory

`user_memory` table (migration `020_user_memory.sql`) stores facts the advisor has learned
about the user across sessions. Replaces the `stated_preferences` field in `user_ai_context`.

```typescript
{
  user_id: uuid,          // PK
  items: string[],        // JSONB array, max 10 items, oldest trimmed when full
  updated_at: timestamptz
}
```

**Write path:** advisor calls `update_user_memory` tool → Edge Function upserts the row.  
**Read path:** fetched in parallel with `profiles` at session start, injected into Block 2 of
the system prompt as a bullet list. If `items` is empty the block is omitted entirely.  
**Lifecycle:** items accumulate across sessions until the user clears them (future feature)
or they are pushed out by the 10-item cap.

---

## UI Specification (`app/(tabs)/advisor.tsx`)

**Layout:**
- Full-screen chat interface
- ScrollView of ChatBubble components (user: right-aligned orange, assistant: left-aligned dark)
- Text input at bottom with send button
- Streaming: latest assistant message shows cursor `▊` while streaming
- Tool use: show brief "Checking your data..." placeholder while tool is running

**ChatBubble component** (local function in `advisor.tsx`, not a separate file):
```typescript
// Defined at the top of app/(tabs)/advisor.tsx
function ChatBubble({ message, isStreaming }: { message: AdvisorMessage; isStreaming?: boolean })
```

**Empty state (first visit):**
- Welcome message pre-populated as assistant message
- 3 suggestion chips: "Am I on track for FIRE?", "What's my biggest spending leak?",
  "How much earlier if I save ₹5k more?"

---

## Acceptance Criteria

- [ ] Tool `get_fire_progress` returns data matching fire_calculations row
- [ ] Tool `get_spending_breakdown` returns data from latest spend_analyses
- [ ] `calculate_scenario` with `+10000` monthly savings returns earlier retire age
- [ ] Streaming: text appears progressively (not all at once)
- [ ] Each message saved to ai_conversations table
- [ ] System prompt Block 1 is static (same string for every user); Block 2 contains the user's name
- [ ] If no fire_calculations exists: advisor gracefully says "You haven't calculated your FIRE number yet — tap the Calculator tab to get started"
- [ ] ai_request_log row written with token counts and latency
- [ ] `update_user_memory` call appends item to user_memory.items, capped at 10
- [ ] If user_memory has items, they appear in system Block 2 as a bullet list
- [ ] Memory persists across sessions (fetched fresh on every request)
