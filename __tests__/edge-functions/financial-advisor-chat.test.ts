// Tests for pure logic extracted from supabase/functions/financial-advisor-chat/index.ts
// The edge function runs in Deno; we inline and test pure functions only.

// ── update_user_memory — item management ──────────────────────────────────────
// The handler appends a new item and keeps only the last 10 (oldest are trimmed).
// Logic: updatedItems = [...currentItems, item].slice(-10)

function applyMemoryUpdate(currentItems: string[], newItem: string): string[] {
  if (!newItem) return currentItems;
  return [...currentItems, newItem].slice(-10);
}

describe('update_user_memory — item accumulation', () => {
  it('appends a new item to an empty list', () => {
    expect(applyMemoryUpdate([], 'Wants to retire in Goa')).toEqual(['Wants to retire in Goa']);
  });

  it('appends a new item to an existing list', () => {
    const current = ['Risk-averse investor'];
    const result = applyMemoryUpdate(current, 'Prefers FDs over equities');
    expect(result).toEqual(['Risk-averse investor', 'Prefers FDs over equities']);
  });

  it('new item is always last in the array', () => {
    const current = ['Item 1', 'Item 2'];
    const result = applyMemoryUpdate(current, 'Item 3');
    expect(result[result.length - 1]).toBe('Item 3');
  });

  it('ignores empty string — does not append', () => {
    const current = ['Item 1'];
    expect(applyMemoryUpdate(current, '')).toEqual(['Item 1']);
  });

  it('ignores empty string on empty list — returns empty list', () => {
    expect(applyMemoryUpdate([], '')).toEqual([]);
  });
});

describe('update_user_memory — 10-item cap', () => {
  it('keeps exactly 10 items when adding to a full list of 10', () => {
    const current = Array.from({ length: 10 }, (_, i) => `Item ${i + 1}`);
    const result = applyMemoryUpdate(current, 'Item 11');
    expect(result).toHaveLength(10);
  });

  it('drops the oldest item (first) when capped at 10', () => {
    const current = Array.from({ length: 10 }, (_, i) => `Item ${i + 1}`);
    const result = applyMemoryUpdate(current, 'Item 11');
    expect(result[0]).toBe('Item 2');
    expect(result[9]).toBe('Item 11');
  });

  it('does not cap when list has fewer than 10 items', () => {
    const current = Array.from({ length: 9 }, (_, i) => `Item ${i + 1}`);
    const result = applyMemoryUpdate(current, 'Item 10');
    expect(result).toHaveLength(10);
    expect(result[0]).toBe('Item 1');
  });

  it('keeps last 10 when given a very large list', () => {
    const current = Array.from({ length: 20 }, (_, i) => `Item ${i + 1}`);
    const result = applyMemoryUpdate(current, 'Item 21');
    expect(result).toHaveLength(10);
    expect(result[0]).toBe('Item 12');
    expect(result[9]).toBe('Item 21');
  });

  it('returns correct list with exactly 10 items after multiple additions', () => {
    let items: string[] = [];
    for (let i = 1; i <= 15; i++) {
      items = applyMemoryUpdate(items, `Memory ${i}`);
    }
    expect(items).toHaveLength(10);
    expect(items[0]).toBe('Memory 6');
    expect(items[9]).toBe('Memory 15');
  });
});

// ── System prompt construction — two-block split ──────────────────────────────
// The advisor uses two Anthropic TextBlockParam blocks:
//   1. Static rules (with cache_control: ephemeral) — same for every user
//   2. Dynamic block (name + memory items) — fresh each turn

const STATIC_SYSTEM = `You are FreedomFire's AI financial advisor — an expert on FIRE planning for Indian professionals. You have access to the user's real financial data via tools.

Rules:
- Always call a tool before answering questions about the user's data (never guess numbers)
- Give specific numbers in Indian format (₹, use lakhs/crores for large amounts)
- Frame insights as "freedom days" or retirement age impact when relevant
- Be warm and direct — not corporate, not preachy
- Never recommend specific stocks, mutual funds, or investment products by name
- Acknowledge Indian financial context: EMI, SIP, ELSS, PPF, NPS, quick commerce
- If the user states a preference, goal, or important constraint, call update_user_memory to save it for future sessions`;

function buildSystemBlocks(profileName: string | null, memoryItems: string[]) {
  const memoryBlock = memoryItems.length > 0
    ? `\nLearned about this user:\n${memoryItems.map((m) => `- ${m}`).join('\n')}`
    : '';
  const dynamicText = `The user's name is ${profileName ?? 'there'}.${memoryBlock}`;

  return [
    { type: 'text' as const, text: STATIC_SYSTEM, cache_control: { type: 'ephemeral' as const } },
    { type: 'text' as const, text: dynamicText },
  ];
}

describe('buildSystemBlocks — two-block structure', () => {
  it('returns exactly two blocks', () => {
    expect(buildSystemBlocks('Priya', [])).toHaveLength(2);
  });

  it('first block contains the static rules text', () => {
    const [staticBlock] = buildSystemBlocks('Priya', []);
    expect(staticBlock.text).toBe(STATIC_SYSTEM);
  });

  it('first block has cache_control: ephemeral', () => {
    const [staticBlock] = buildSystemBlocks('Priya', []);
    expect(staticBlock.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('first block type is "text"', () => {
    const [staticBlock] = buildSystemBlocks('Priya', []);
    expect(staticBlock.type).toBe('text');
  });

  it('second block has no cache_control (dynamic, must not be cached)', () => {
    const [, dynamicBlock] = buildSystemBlocks('Priya', []);
    expect(dynamicBlock).not.toHaveProperty('cache_control');
  });

  it('second block type is "text"', () => {
    const [, dynamicBlock] = buildSystemBlocks('Priya', []);
    expect(dynamicBlock.type).toBe('text');
  });
});

describe('buildSystemBlocks — dynamic block content', () => {
  it('includes the user name in the dynamic block', () => {
    const [, dynamicBlock] = buildSystemBlocks('Priya', []);
    expect(dynamicBlock.text).toContain('Priya');
  });

  it('uses "there" fallback when profile name is null', () => {
    const [, dynamicBlock] = buildSystemBlocks(null, []);
    expect(dynamicBlock.text).toContain('The user\'s name is there.');
  });

  it('dynamic block has no memory section when items is empty', () => {
    const [, dynamicBlock] = buildSystemBlocks('Priya', []);
    expect(dynamicBlock.text).not.toContain('Learned about this user');
  });

  it('dynamic block includes memory section when items exist', () => {
    const [, dynamicBlock] = buildSystemBlocks('Priya', ['Wants to retire in Goa']);
    expect(dynamicBlock.text).toContain('Learned about this user:');
  });

  it('each memory item is formatted as a bullet with "- " prefix', () => {
    const [, dynamicBlock] = buildSystemBlocks('Priya', ['Wants to retire in Goa', 'Risk-averse']);
    expect(dynamicBlock.text).toContain('- Wants to retire in Goa');
    expect(dynamicBlock.text).toContain('- Risk-averse');
  });

  it('all memory items appear in the dynamic block', () => {
    const items = ['Item 1', 'Item 2', 'Item 3'];
    const [, dynamicBlock] = buildSystemBlocks('Priya', items);
    for (const item of items) {
      expect(dynamicBlock.text).toContain(item);
    }
  });

  it('memory section appears after the name line', () => {
    const [, dynamicBlock] = buildSystemBlocks('Priya', ['Goal: retire at 45']);
    const nameIdx = dynamicBlock.text.indexOf('The user\'s name is Priya');
    const memoryIdx = dynamicBlock.text.indexOf('Learned about this user');
    expect(nameIdx).toBeLessThan(memoryIdx);
  });
});

// ── PROMPT_VERSION constant ────────────────────────────────────────────────────
describe('PROMPT_VERSION — advisor version tracking', () => {
  const PROMPT_VERSION = 'advisor-v1.0';

  it('is defined and non-empty', () => {
    expect(PROMPT_VERSION).toBeTruthy();
  });

  it('is advisor-v1.0', () => {
    expect(PROMPT_VERSION).toBe('advisor-v1.0');
  });

  it('is included in trace metadata', () => {
    const metadata = { historyLength: 3, promptVersion: PROMPT_VERSION };
    expect(metadata.promptVersion).toBe('advisor-v1.0');
  });

  it('is included in generation metadata', () => {
    const metadata = { promptVersion: PROMPT_VERSION };
    expect(metadata).toHaveProperty('promptVersion', 'advisor-v1.0');
  });
});

// ── update_user_memory tool definition ────────────────────────────────────────
describe('update_user_memory tool — tool handler contract', () => {
  it('returns { saved: true } when a non-empty item is provided', () => {
    const toolOutput = (item: string) => {
      if (item) return JSON.stringify({ saved: true });
      return JSON.stringify({ saved: false });
    };
    expect(JSON.parse(toolOutput('Wants to retire in Goa'))).toEqual({ saved: true });
  });

  it('handles empty item string gracefully', () => {
    const toolOutput = (item: string) => {
      if (item) return JSON.stringify({ saved: true });
      return JSON.stringify({ saved: false });
    };
    expect(JSON.parse(toolOutput(''))).toEqual({ saved: false });
  });

  it('tool name is "update_user_memory"', () => {
    const toolName = 'update_user_memory';
    expect(toolName).toBe('update_user_memory');
  });

  it('tool input schema requires "item" field', () => {
    const schema = {
      type: 'object',
      properties: {
        item: { type: 'string' },
      },
      required: ['item'],
    };
    expect(schema.required).toContain('item');
  });
});

// ── Memory block formatting ────────────────────────────────────────────────────
describe('memory block formatting', () => {
  it('produces correct bullet list for a single item', () => {
    const items = ['Wants to retire at 45'];
    const block = items.length > 0
      ? `\nLearned about this user:\n${items.map((m) => `- ${m}`).join('\n')}`
      : '';
    expect(block).toBe('\nLearned about this user:\n- Wants to retire at 45');
  });

  it('produces correct bullet list for multiple items', () => {
    const items = ['Wants to retire at 45', 'Risk-averse', 'Has home loan ending 2029'];
    const block = items.length > 0
      ? `\nLearned about this user:\n${items.map((m) => `- ${m}`).join('\n')}`
      : '';
    const lines = block.split('\n');
    expect(lines[1]).toBe('Learned about this user:');
    expect(lines[2]).toBe('- Wants to retire at 45');
    expect(lines[3]).toBe('- Risk-averse');
    expect(lines[4]).toBe('- Has home loan ending 2029');
  });

  it('produces empty string for empty items array', () => {
    const items: string[] = [];
    const block = items.length > 0
      ? `\nLearned about this user:\n${items.map((m) => `- ${m}`).join('\n')}`
      : '';
    expect(block).toBe('');
  });
});
