# Feature Spec: Tasks System

**Purpose:** Convert AI-generated spending insights into committed, date-bound financial
actions. Each task shows a concrete FIRE impact ("completing this retires you N months earlier")
to make the motivation tangible.

**Implementation files:**
- `lib/tasks.ts` — task type definitions, seeding logic, FIRE impact calculations
- `stores/tasks.store.ts` — DB reads/writes, seeding orchestration
- `supabase/migrations/010_tasks.sql` — `user_tasks` table
- `app/(tabs)/tasks.tsx` — UI (Recommended / Accepted sub-tabs)
- `components/ui/TaskCard.tsx` — task card component
- `components/ui/TaskCompleteModal.tsx` — completion celebration

---

## Task Types (v1 — hardcoded; v2 replaces with Claude generation)

| `task_type` | Title | XP | Trigger Condition |
|-------------|-------|----|-------------------|
| `reduce_fast_commerce` | Reduce Food Delivery | 75 | food category > 10% of avg_monthly_spend |
| `cancel_subscriptions` | Cancel Subscriptions | 50 | entertainment category > ₹5,000/month |
| `prepay_loan` | Prepay Your Loan | 150 | monthly_emi > 0 |
| `reduce_loan_tenure` | Reduce Loan Tenure | 100 | loan_tenure_years > 0 |

---

## Task Seeding

`seedInsightTasks(userId, analysis?, calculation?)` is called:
- After spend analysis completes (passes `analysis`, `calculation` if available)
- After FIRE calc saves (passes `calculation`, no `analysis`)

### Seeding Algorithm
```
newSeeds = buildTaskSeeds(analysis, calculation)
// buildTaskSeeds returns tasks whose trigger conditions are met

existingTasks = fetch all user_tasks WHERE user_id = userId

for each seed in newSeeds:
  existing = existingTasks.find(t => t.task_type == seed.task_type)
  
  if existing.status in ['recommended', 'accepted', 'done']:
    skip  // respect user's choice
  
  if existing.status == 'canceled':
    upsert seed with status='recommended'  // give second chance
    // IMPORTANT: do NOT use ignoreDuplicates here
    // onConflict: 'user_id,task_type' → overwrites the canceled row
  
  if existing == null:
    insert seed with status='recommended'

// ALWAYS: fresh SELECT after upsert to ensure store reflects DB truth
// (ignoreDuplicates bug: if used, select() returns no data for skipped rows)
tasks = fetch all user_tasks WHERE user_id = userId ORDER BY created_at DESC
store.setTasks(tasks)
```

**Critical invariant:** The final `SELECT` runs unconditionally, not only when rows were
inserted. This was a past bug: using `ignoreDuplicates: true` caused the chained `.select()`
to return empty data for unchanged rows, leaving the store stale.

---

## Task Lifecycle

```
recommended ──[Accept + set date]──▶ accepted ──[Mark Done]──▶ done
     │                                   │
     └──[Cancel]──▶ canceled          [Cancel/Revert]──▶ recommended
     (permanent)                      (soft — returns to recommended)
```

### State Transitions

**recommended → accepted:**
- User taps "Accept" on TaskCard
- Bottom sheet: select target date (preset chips or custom)
- Presets: Next week (+7d), Next month (+30d), Next 3 months (+90d), Next 6 months (+180d)
- Saves: `status = 'accepted'`, `target_completion_date = selectedDate`

**accepted → done:**
- User taps "Mark as Done"
- `completeTask(userId, taskId)`:
  - Sets `status = 'done'`
  - Returns `xp_reward` to caller
  - Caller calls `awardTaskXP(userId, xpReward)` in gamification store
  - Freedom Days awarded if task reduces spending (from metadata)
- `TaskCompleteModal` shown with confetti

**recommended → canceled:**
- User taps "Cancel" from Recommended tab
- Sets `status = 'canceled'` — **permanent** (user is saying "not relevant to me")
- Task removed from Recommended tab immediately
- Can be re-seeded in a future analysis run (overwritten back to 'recommended')

**accepted → recommended (revert):**
- User taps "Move Back" from Accepted tab
- Sets `status = 'recommended'`, clears `target_completion_date`
- Task moves back to Recommended tab

---

## FIRE Impact Calculation

`freedomDaysForTask(task, calculation, currentAge)`:
1. Get expense/EMI delta from task metadata (e.g., reduce_fast_commerce → saves ₹3k/month)
2. `withoutTask`: run FIRE sim with current inputs → `yearsToFire_A`
3. `withTask`: run FIRE sim with modified inputs (expenses - delta) → `yearsToFire_B`
4. `freedomDaysImpact = (yearsToFire_A - yearsToFire_B) × 365`

Displayed on TaskCard as: "🔥 Completes this → retire X months/years earlier"

---

## UI Specification

### Tasks Tab (`app/(tabs)/tasks.tsx`)

**Recommended sub-tab:**
- Section hint (gray text): "Accept tasks to commit to them. Cancel to permanently dismiss."
- Task list — TaskCard for each recommended task
- Empty state: bulb icon + "No recommendations yet. Upload a statement to get started."
- Badge on tab: count of recommended tasks not yet seen

**Accepted sub-tab:**
- Section hint: "Mark tasks as done to earn XP. Or move them back to Recommended."
- Task list — TaskCard for each accepted task (with target date shown)
- Empty state: flag icon + "No accepted tasks yet."

### TaskCard Component

Displays:
- Task title (bold)
- Description (from `getConcreteTaskDescription()` — personalised with real ₹ amounts)
- Category icon + estimated freedom days impact
- Target date (if accepted)

**Recommended state buttons:**
- "Accept" (primary, gradient) → opens date picker bottom sheet
- "Cancel" (text, muted) → permanent dismiss

**Accepted state buttons:**
- "Mark as Done" (primary, gradient) → complete + XP
- "Move Back" (text, muted) → revert to recommended

---

## Acceptance Criteria

- [ ] Tasks not seeded when `status` is `accepted` or `done` (user choice respected)
- [ ] Canceled task re-seeded on next analysis (overwritten to `recommended`)
- [ ] Fresh `SELECT` always runs after upsert (store never stale)
- [ ] `UNIQUE(user_id, task_type)` constraint prevents duplicate rows
- [ ] Canceling from Recommended → permanent (`canceled`)
- [ ] Canceling from Accepted → soft revert (`recommended`), date cleared
- [ ] XP awarded after completing a task matches `xp_reward` column value
- [ ] `freedomDaysForTask` returns positive number when task reduces spend
- [ ] Empty state shows in each sub-tab when no tasks in that status
