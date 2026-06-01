# Testing Strategy

## Philosophy

**Test behaviour, not implementation.** Tests should survive refactors that don't change
what the code does.

**Four tiers:**
1. **Unit tests** — pure lib/ functions (no Supabase, no React)
2. **Store tests** — Zustand stores with mocked Supabase client
3. **Component tests** — UI components with `@testing-library/react-native`
4. **E2E tests** — Playwright against the Expo web export; gates every deployment

---

## Test Coverage Target
**90% across all four metrics (lines, statements, branches, functions)** — enforced in three places:

| Enforcement point | How |
|---|---|
| `jest.config.js` | `coverageThreshold: { global: { branches: 90, functions: 90, lines: 90, statements: 90 } }` |
| Pre-push git hook (`scripts/install-hooks.sh`) | `--coverageThreshold='{"global":{"lines":90,...}}'` — 6 checks run before every push; blocks on failure |
| GitHub Actions CI | Inherits from `jest.config.js` via `npm test -- --coverage --ci` — fails the build if threshold is not met |

The pre-push hook is installed by `scripts/install-hooks.sh` (run once after cloning). All three enforcement points must stay in sync.

---

## E2E Tests (Playwright)

**Framework:** Playwright (chromium only — web export).
**Location:** `e2e/` directory. Config: `playwright.config.ts`.
**What's covered:** Auth screens rendered from the Expo web export — no backend session required.

### Test file

```
e2e/
  auth.spec.ts    — Onboarding splash, login form validation, signup form, screen navigation
```

### What auth.spec.ts covers
| Test | What it asserts |
|------|----------------|
| Onboarding splash renders | Tagline + "Get Started" + "Log In" CTAs visible |
| Login: fields render | Email/password inputs + Google OAuth button visible |
| Login: validation errors | Bad email + short password → Zod error messages |
| Login: navigates to signup | "Sign Up" tap → signup subtitle + name field visible |
| Signup: fields render | Name, password, confirm password placeholders visible |
| Signup: short-name error | Terms checkbox required before submit; name < 2 chars → error |

### Running E2E tests

```bash
# 1. Export the Expo web bundle (required before running Playwright)
npx expo export --platform web

# 2. Run Playwright tests (serves dist/ automatically via playwright.config.ts)
npx playwright test

# 3. Watch mode (re-runs on file change)
npx playwright test --ui
```

The Playwright config serves `dist/` on port 3000 via `npx serve`. Tests run against this
static bundle — no Supabase backend required (session is null, so auth screens are shown).

### Deployment gate

The CI deploy workflow (`deploy.yml`) runs Playwright after building the web bundle and
**before** deploying to EAS Hosting. A failed Playwright test blocks the deploy.

---

## Test Setup (`__tests__/setup.ts`)

```typescript
import 'react-native-gesture-handler/jestSetup';

// Always mock analytics (fire-and-forget, not under test)
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));

// Suppress React Native "act()" warnings in console.error
jest.spyOn(console, 'error').mockImplementation((msg, ...args) => {
  if (typeof msg === 'string' && msg.includes('act(')) return;
  console.warn(msg, ...args);
});
```

---

## What to Mock

| Dependency | Mock Approach | Why |
|-----------|---------------|-----|
| `@/lib/analytics` | `{ track: jest.fn() }` | Fire-and-forget; irrelevant to business logic tests |
| Supabase client | `jest.mock('@/lib/supabase', ...)` with chainable builder | Store tests need controlled DB responses |
| `expo-document-picker` | `jest.mock('expo-document-picker')` | Can't open native UI in tests |
| `expo-file-system` | `jest.mock('expo-file-system')` | No real filesystem in Jest |
| `react-native-reanimated` | Auto-mocked via `jest-expo` preset | Animation callbacks are no-ops |

## What NOT to Mock

| Dependency | Why |
|-----------|-----|
| `lib/fire.ts`, `lib/calculations.ts`, `lib/gamification.ts`, `lib/tasks.ts` | These ARE under test — never mock the subject under test |
| Arithmetic / Math | Test the real formulas |
| Date operations | Use `jest.setSystemTime()` for deterministic date tests instead of mocking Date |

---

## Test File Structure

```
e2e/
  auth.spec.ts             — Playwright: onboarding splash, login, signup (web export)

__tests__/
  lib/
    calculations.test.ts   — FIRE number, wealth accumulation, convergence
    fire.test.ts           — calculateFire() integration of all calculation steps
    gamification.test.ts   — XP formula, level lookup, freedom days, badge conditions
    tasks.test.ts          — buildTaskSeeds(), freedomDaysForTask(), task descriptions
    analytics.test.ts      — track() event logging
    parsers.test.ts        — PDF transaction extraction helpers
  stores/
    auth.store.test.ts     — session management, fetchProfile
    fire.store.test.ts     — fetchCalculation, saveCalculation
    spend.store.test.ts    — uploadAndAnalyze, toggleIgnore
    gamification.store.test.ts — awardXP, checkAndAwardLoginXP, updateStreak, progressQuest
    tasks.store.test.ts    — seedInsightTasks (including fresh-SELECT invariant), markRecommendedSeen
    onboarding.store.test.ts — AsyncStorage persistence
    advisor.store.test.ts  — conversation state, sendMessage
  components/
    AdvisorScreen.test.tsx
    BadgeCard.test.tsx
    BadgeUnlockModal.test.tsx
    Card.test.tsx
    ConfettiBurst.test.tsx
    FireCalculator.test.tsx
    FreedomDaysCard.test.tsx
    GradientBackground.test.tsx
    GradientButton.test.tsx
    HomeScreen.test.tsx
    InputField.test.tsx
    LevelUpModal.test.tsx
    MilestoneBar.test.tsx
    ProgressRing.test.tsx
    QuestCard.test.tsx
    RewardToast.test.tsx
    SliderInput.test.tsx
    StreakMilestoneModal.test.tsx
    TaskCard.test.tsx
    TaskCompleteModal.test.tsx
    TasksScreen.test.tsx
    TopBar.test.tsx
    XPBar.test.tsx
    XPCelebrationModal.test.tsx
    FunanceLogo.test.tsx
```

---

## Running Tests

```bash
# Unit / store / component tests (Jest)
npm test                    # Run all tests
npm run test:coverage       # Run with coverage report
npx jest --watch            # Watch mode during development
npx jest __tests__/lib/     # Run only lib unit tests
npx jest --testNamePattern "freedom days"  # Run tests matching pattern

# E2E tests (Playwright — requires web export first)
npx expo export --platform web && npx playwright test
npx playwright test --ui    # Interactive Playwright UI
```

---

## Key Test Patterns

### Testing Pure Math Functions
```typescript
describe('calculateFireNumber', () => {
  it('computes corpus correctly at 12% return, 6% inflation', () => {
    const result = calculateFireNumber({
      monthlyExpenses: 60000,
      retirementAge: 45,
      currentAge: 30,
      expectedReturnPct: 12,
      inflationRatePct: 6,
      lifestyle: 'comfortable',
    });
    expect(result).toBeCloseTo(4_815_400, -4); // within ±10,000
  });
});
```

### Testing Streak State Machine with Deterministic Dates
```typescript
it('resets streak when gap > 1 day', () => {
  jest.setSystemTime(new Date('2026-06-01'));
  const result = evaluateStreak('2026-05-29'); // 3 days ago
  expect(result).toBe('reset');
});
```

### Testing Store Actions (Supabase Mocked)
```typescript
const mockFrom = jest.fn().mockReturnValue({
  select: jest.fn().mockReturnValue({
    eq: jest.fn().mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({ data: mockFireRecord, error: null }),
    }),
  }),
});
jest.mock('@/lib/supabase', () => ({ supabase: { from: mockFrom } }));
```

### Testing Task Seeding Invariant
```typescript
it('always performs fresh SELECT after upsert', async () => {
  // Verify that store reflects DB state even when ignoreDuplicates would
  // cause the upsert to return no data
  await useTasksStore.getState().seedInsightTasks(userId, mockAnalysis, null);
  expect(mockSelectAfterUpsert).toHaveBeenCalled();
  expect(useTasksStore.getState().tasks).toHaveLength(expectedCount);
});
```

---

## Acceptance Criteria Format

Feature spec files use checkbox lists that map directly to test cases:

```markdown
## Acceptance Criteria
- [ ] FIRE number formula: inflated_expenses / SWR (test: calculations.test.ts)
- [ ] Expenses ≥ income → possible = false (test: fire.test.ts)
```

The `- [ ]` format is intentional — it becomes `- [x]` when the test exists and passes.
This is the link between spec and test suite.
