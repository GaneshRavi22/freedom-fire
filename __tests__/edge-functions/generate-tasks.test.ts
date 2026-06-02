// Tests for pure logic extracted from supabase/functions/generate-tasks/index.ts
// The edge function runs in Deno and can't be imported directly; we inline and
// test the deterministic pure functions here.

// ── getVariant ─────────────────────────────────────────────────────────────────
// Stable 50/50 A/B split: same userId always maps to the same variant.
// Algorithm: sum charCodes of first 8 hex chars (dashes removed), variant = sum%2==0 ? 'A' : 'B'
function getVariant(userId: string): 'A' | 'B' {
  const sum = Array.from(userId.replace(/-/g, '').slice(0, 8))
    .reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return sum % 2 === 0 ? 'A' : 'B';
}

describe('getVariant — deterministic assignment', () => {
  it('returns the same variant for the same userId every time', () => {
    const userId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    expect(getVariant(userId)).toBe(getVariant(userId));
  });

  it('returns either "A" or "B" for any userId', () => {
    const ids = [
      '00000000-0000-0000-0000-000000000000',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      '11111111-1111-1111-1111-111111111111',
    ];
    for (const id of ids) {
      expect(['A', 'B']).toContain(getVariant(id));
    }
  });

  it('produces both variants across a diverse set of userIds', () => {
    const variants = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const hex = i.toString(16).padStart(2, '0');
      const userId = `${hex}000000-0000-0000-0000-000000000000`;
      variants.add(getVariant(userId));
    }
    expect(variants.has('A')).toBe(true);
    expect(variants.has('B')).toBe(true);
  });

  it('all-zeros userId maps to "A" (charCode sum of "00000000" = 8×48 = 384, even)', () => {
    expect(getVariant('00000000-0000-0000-0000-000000000000')).toBe('A');
  });

  it('userId starting with odd-sum chars maps to "B"', () => {
    // "10000000" → charCodes: 49,48,48,48,48,48,48,48 → sum=385, odd → 'B'
    expect(getVariant('10000000-0000-0000-0000-000000000000')).toBe('B');
  });

  it('only uses the first 8 hex chars (dashes stripped), ignoring the rest', () => {
    // Same first 8 chars, different suffixes → same variant
    const base = 'abcdef12';
    const variantA = getVariant(`${base}-3456-7890-abcd-ef1234567890`);
    const variantB = getVariant(`${base}-9999-aaaa-bbbb-ccccddddeeee`);
    expect(variantA).toBe(variantB);
  });

  it('different first 8 chars produce potentially different variants', () => {
    // "00000000" → 384 (A), "10000000" → 385 (B)
    expect(getVariant('00000000-0000-0000-0000-000000000000')).not.toBe(
      getVariant('10000000-0000-0000-0000-000000000000')
    );
  });

  it('strips hyphens before slicing — a UUID with hyphens behaves the same as stripped', () => {
    // "abcdef12-..." → strips to "abcdef123456..." → takes first 8 = "abcdef12"
    const withDash = getVariant('abcdef12-3456-0000-0000-000000000000');
    // Same first 8 hex chars without the dash prefix
    const withoutDash = getVariant('abcdef12-0000-0000-0000-000000000000');
    expect(withDash).toBe(withoutDash);
  });
});

// ── Prompt version constants ───────────────────────────────────────────────────
describe('prompt version constants', () => {
  const PROMPT_VERSION_A = 'tasks-v1.0';
  const PROMPT_VERSION_B = 'tasks-v1.1';

  it('variant A maps to tasks-v1.0', () => {
    expect(PROMPT_VERSION_A).toBe('tasks-v1.0');
  });

  it('variant B maps to tasks-v1.1', () => {
    expect(PROMPT_VERSION_B).toBe('tasks-v1.1');
  });

  it('versions are distinct strings', () => {
    expect(PROMPT_VERSION_A).not.toBe(PROMPT_VERSION_B);
  });

  it('version selection matches variant', () => {
    const variant = getVariant('00000000-0000-0000-0000-000000000000'); // A
    const version = variant === 'A' ? PROMPT_VERSION_A : PROMPT_VERSION_B;
    expect(version).toBe('tasks-v1.0');
  });

  it('score_detail includes promptVariant and promptVersion', () => {
    const variant = 'A';
    const promptVersion = PROMPT_VERSION_A;
    const evalDetail = { uniqueTaskTypes: true, hasAmounts: true };
    const scoreDetail = { ...evalDetail, promptVariant: variant, promptVersion };
    expect(scoreDetail).toMatchObject({ promptVariant: 'A', promptVersion: 'tasks-v1.0' });
    expect(scoreDetail).toMatchObject(evalDetail);
  });
});

// ── Eval score detail merging ──────────────────────────────────────────────────
describe('eval score detail — variant metadata merging', () => {
  it('merges variant info into existing eval detail without overwriting original keys', () => {
    const evalDetail = { uniqueTaskTypes: true, hasAmounts: false, hasFireImpact: true };
    const variant = 'B';
    const promptVersion = 'tasks-v1.1';
    const result = { ...evalDetail, promptVariant: variant, promptVersion };

    expect(result.uniqueTaskTypes).toBe(true);
    expect(result.hasAmounts).toBe(false);
    expect(result.hasFireImpact).toBe(true);
    expect(result.promptVariant).toBe('B');
    expect(result.promptVersion).toBe('tasks-v1.1');
  });

  it('does not mutate the original evalDetail object', () => {
    const evalDetail = { score: 0.8 };
    const result = { ...evalDetail, promptVariant: 'A', promptVersion: 'tasks-v1.0' };

    expect(evalDetail).not.toHaveProperty('promptVariant');
    expect(result).toHaveProperty('promptVariant');
  });
});
