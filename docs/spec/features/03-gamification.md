# Feature Spec: Gamification System

**Purpose:** Transform FIRE planning from a one-time calculation into a daily habit through
XP, levels, badges, streaks, and quests. Model: Duolingo for financial independence.

**Implementation files:**
- `lib/gamification.ts` — pure engine: all definitions + pure functions
- `stores/gamification.store.ts` — Zustand: DB reads/writes + reward queue
- `supabase/migrations/009_gamification.sql` — tables
- UI components: `XPBar`, `FreedomDaysCard`, `BadgeCard`, `QuestCard`, `LevelUpModal`,
  `BadgeUnlockModal`, `XPCelebrationModal`, `StreakMilestoneModal`, `RewardToast`

---

## XP System

### XP Awards Table

| Action | XP | Function |
|--------|----|----------|
| First FIRE calculation | 150 | `awardXP('first_fire_calc')` |
| Update FIRE calculation | 100 | `awardXP('update_fire_calc')` |
| First spend analysis | 75 | `awardXP('first_spend_analysis')` |
| Subsequent spend analysis | 50 | `awardXP('track_expenses')` |
| Complete a task | task-defined (50–150) | `awardTaskXP(userId, xpAmount)` |
| Daily login | 5 | `awardXP('login')` |
| Complete a quest | quest-defined | awarded inside `progressQuest()` |

### Level-Up Detection
```
Before award: oldLevel = getLevelFromXP(currentXP).level
After award:  newLevel = getLevelFromXP(currentXP + xpEarned).level
If newLevel > oldLevel: queue LevelUpModal + check badge unlocks
```

---

## 50 Levels

XP formula: `minXP[n] = 10n² + 40n` (quadratic — satisfying early progress, harder later)
Exception: `minXP[1] = 0`

### Level Tiers

| Range | Title | Color | Icon |
|-------|-------|-------|------|
| 1–4 | Budget Beginner | `#A0A3BD` | `wallet-outline` |
| 5–9 | Smart Saver | `#43D9AD` | `cash-outline` |
| 10–19 | Wealth Builder | `#6C63FF` | `stats-chart-outline` |
| 20–34 | FIRE Explorer | `#FFB547` | `compass-outline` |
| 35–49 | Freedom Strategist | `#FF6584` | `shield-checkmark-outline` |
| 50 | Financial Monk | `#FFD700` | `medal-outline` |

### Key Level Thresholds (approximate)
- Level 5: 250 XP — earns FIRE Explorer badge
- Level 10: 1400 XP — enters Wealth Builder tier
- Level 50: ~26,000 XP — earns Financial Monk badge (legendary)

---

## Freedom Days

**What it represents:** The number of days a user would never have to work again, given
their total invested savings and current annual expenses.

### Formula
```
freedomDays = investedAmount / (annualExpenses / 365)
```

**Example:** ₹15,000 monthly SIP + ₹6,00,000 annual expenses:
```
= 15,000 / (6,00,000 / 365)
= 15,000 / 1,643.8
≈ 9.1 Freedom Days earned per SIP
```

### When Awarded
- On FIRE plan save: based on incremental monthly savings increase
- On task completion: if task reduces spending, delta → freedom days
- Accumulates in `user_gamification.total_freedom_days`

### Display
- `FreedomDaysCard`: flame icon + large number + "days of freedom earned"
- Dashboard hero section, Profile tab, Achievements tab

---

## 12 Badges

| ID | Title | Condition | Rarity | Category |
|----|-------|-----------|--------|----------|
| `first_steps` | First Steps | First FIRE calc saved | common | learning |
| `number_cruncher` | Number Cruncher | XP ≥ 100 | common | learning |
| `spend_detective` | Spend Detective | First spend analysis done | common | learning |
| `sip_warrior` | SIP Warrior | total_freedom_days ≥ 5 | common | investing |
| `fire_explorer` | FIRE Explorer | level ≥ 5 | rare | investing |
| `compounding_champion` | Compounding Champion | total_freedom_days ≥ 100 | rare | investing |
| `savings_ace` | Savings Ace | savings_rate ≥ 50% | rare | savings |
| `streak_starter` | Streak Starter | any streak_count ≥ 3 | common | consistency |
| `streak_master` | Streak Master | any streak_count ≥ 8 | rare | consistency |
| `freedom_seeker` | Freedom Seeker | total_freedom_days ≥ 365 | epic | investing |
| `quest_completionist` | Completionist | quests_completed ≥ 10 | rare | consistency |
| `financial_monk` | Financial Monk | level ≥ 50 | legendary | savings |

### Badge Unlock Logic
```typescript
function checkNewBadgeUnlocks(snapshot: BadgeCheckSnapshot): BadgeDefinition[] {
  return BADGE_DEFINITIONS.filter(badge =>
    !snapshot.unlockedBadgeIds.includes(badge.id) &&
    badge.condition(snapshot)
  );
}
```
`snapshot` is populated before and after any XP-earning action. New badges = delta.
Once unlocked, a badge is **never re-unlocked** (idempotent `user_badges` upsert).

### Rarity Colors
```
common:    #A0A3BD   (Slate)
rare:      #6C63FF   (Purple)
epic:      #FF9F43   (Orange)
legendary: #FFD700   (Gold)
```

---

## Streaks

### 3 Streak Types
```
investment  — incremented when user updates FIRE calculation
tracking    — incremented when user uploads a spend statement
review      — incremented on daily login / general check-in
```

### State Machine
Given `last_activity` (ISO date, no time), evaluated daily:

```
today = today's UTC date (YYYY-MM-DD)
yesterday = today - 1 day

if last_activity == today:     → 'same_day'    — no change to count
if last_activity == yesterday: → 'increment'   — current_count += 1
else:                          → 'reset'       — current_count = 1

if current_count > longest_count: longest_count = current_count
```

### Streak Milestones
Trigger `StreakMilestoneModal` when `current_count` reaches: **3, 7, 14, 30, 50, 100**

### DB Storage
Table: `user_streaks`
One row per `(user_id, streak_type)`. `last_activity` is a `date` column (no time component).
All date math uses UTC to avoid timezone edge cases.

---

## 5 Quests

### Quest Definitions

| ID | Title | Description | Frequency | Target | XP |
|----|-------|-------------|-----------|--------|-----|
| `daily_login` | Morning Check-in | Open the app today | daily | 1 | 5 |
| `daily_dashboard` | Dashboard Review | Review your FIRE progress | daily | 1 | 10 |
| `weekly_fire_update` | FIRE Update | Update your FIRE calculation this week | weekly | 1 | 25 |
| `weekly_spend_review` | Spend Review | Upload or review a statement this week | weekly | 1 | 20 |
| `weekly_task_complete` | Task Achiever | Complete a task this week | weekly | 1 | 30 |

### Quest Progress Logic
```typescript
progressQuest(userId, questId):
  quest = fetch user_quests WHERE quest_id = questId AND user_id = userId
  if quest.completed: return  // completed quests do not progress
  if quest.expires_at < now: re-seed quest (reset progress, new expiry)
  
  quest.progress += 1
  if quest.progress >= quest.target:
    quest.completed = true
    awardXP(quest.xpReward)
    queue XPCelebrationModal
```

### Quest Seeding
`seedQuests(userId)` called on first app load and after quest expiry.
Creates `user_quests` rows (one per quest ID) if not present.
Daily quests expire at midnight UTC. Weekly quests expire 7 days from creation.

---

## Reward Queue

All celebrations (XP, level-up, badges) go through a FIFO queue to avoid modal stacking.

```
pendingRewards: RewardEvent[]

After any XP action:
  rewards.push({ xpEarned, freedomDaysEarned, newBadges, leveledUp, ... })

UI polls pendingRewards[0]:
  if leveledUp: show LevelUpModal → on dismiss: consumeReward()
  else if newBadges.length > 0: show BadgeUnlockModal → on dismiss: consumeReward()
  else: show XPCelebrationModal (brief toast) → auto-dismiss after 2s
```

---

## Acceptance Criteria

- [ ] XP formula: `getLevelFromXP(0)` → level 1, `getLevelFromXP(200)` → level 5 or above
- [ ] `minXP[n] = 10n² + 40n` for n ≥ 2; `minXP[1] = 0`
- [ ] Freedom Days formula: `1500 / (60000/365) ≈ 9.125`
- [ ] Streak 'same_day' does not increment count
- [ ] Streak gap > 1 day resets to 1 (not 0)
- [ ] Badge unlock: condition met + not already in unlockedBadgeIds → new badge returned
- [ ] Badge idempotency: calling checkNewBadgeUnlocks twice doesn't double-unlock
- [ ] Quest progress stops at target (no over-progress)
- [ ] Completed quest does not accept further progress
- [ ] Milestone triggers at exactly 3, 7, 14, 30, 50, 100 streak days
