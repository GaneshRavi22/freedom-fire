# Zustand Store Contracts

All stores use Zustand v5. Import pattern: `import { useXxxStore } from '@/stores/xxx.store'`.
Stores persist nothing to AsyncStorage directly (Supabase is the source of truth) except
`useOnboardingStore` which caches pending onboarding data.

---

## useAuthStore
File: `stores/auth.store.ts`

### State
| Field | Type | Description |
|-------|------|-------------|
| `session` | `Session \| null` | Supabase auth session |
| `user` | `User \| null` | From session.user |
| `profile` | `Profile \| null` | Row from `profiles` table |
| `loading` | `boolean` | During profile fetch |

### Actions
| Action | Signature | Side Effects |
|--------|-----------|-------------|
| `setSession` | `(session: Session \| null) → void` | Sets session + user |
| `setProfile` | `(profile: Profile \| null) → void` | Updates local state only |
| `fetchProfile` | `() → Promise<void>` | SELECT from profiles WHERE id = user.id |
| `signOut` | `() → Promise<void>` | supabase.auth.signOut(), clears all state |

---

## useFireStore
File: `stores/fire.store.ts`

### State
| Field | Type | Description |
|-------|------|-------------|
| `calculation` | `FireRecord \| null` | Latest row from `fire_calculations` |
| `loading` | `boolean` | During fetch/save |

`FireRecord` extends `Partial<FireInputs>` with: `id?`, `user_id?`, `created_at?`, `updated_at?`

### Actions
| Action | Signature | Side Effects |
|--------|-----------|-------------|
| `setCalculation` | `(calc: FireRecord \| null) → void` | Local state only |
| `fetchCalculation` | `(userId: string) → Promise<void>` | SELECT fire_calculations WHERE user_id |
| `saveCalculation` | `(userId: string, inputs: FireInputs, result: FireResult) → Promise<void>` | UPSERT fire_calculations (onConflict: user_id) |

---

## useSpendStore
File: `stores/spend.store.ts`

### State
| Field | Type | Description |
|-------|------|-------------|
| `analysis` | `SpendAnalysis \| null` | Latest row from `spend_analyses` |
| `uploading` | `boolean` | During PDF upload + processing |
| `loading` | `boolean` | During fetch |
| `pendingFile` | `{ uri: string, name: string } \| null` | Encrypted PDF awaiting password |

### Actions
| Action | Signature | Side Effects |
|--------|-----------|-------------|
| `setAnalysis` | `(analysis: SpendAnalysis \| null) → void` | Local state only |
| `fetchAnalysis` | `(userId: string) → Promise<void>` | SELECT spend_analyses WHERE user_id, latest row |
| `uploadAndAnalyze` | `(userId: string, file: DocumentPickerAsset) → Promise<void>` | Upload to Storage → invoke Edge Function → INSERT spend_analyses |
| `analyzeWithPassword` | `(userId: string, password: string) → Promise<void>` | Uses stored pendingFile, calls Edge Function with password |
| `toggleIgnore` | `(transactionId: string) → Promise<void>` | Toggles ID in ignored_transaction_ids, recomputes effective_avg, UPDATE spend_analyses |

---

## useGamificationStore
File: `stores/gamification.store.ts`

### State
| Field | Type | Description |
|-------|------|-------------|
| `xp` | `number` | |
| `level` | `number` | |
| `totalFreedomDays` | `number` | |
| `unlockedBadges` | `UserBadge[]` | All unlocked badges |
| `streaks` | `StreakRecord[]` | All 3 streak types |
| `quests` | `UserQuest[]` | All 5 quests |
| `lastLoginDate` | `string \| null` | UTC date string of last login XP award (mirrors `user_gamification.last_login_date`) |
| `pendingRewards` | `RewardEvent[]` | FIFO queue for celebration modals |

### Actions
| Action | Signature | Side Effects |
|--------|-----------|-------------|
| `fetchAll` | `(userId: string) → Promise<void>` | Fetches gamification + badges + streaks + quests |
| `checkAndAwardLoginXP` | `(userId: string) → Promise<void>` | Awards 5 XP if `lastLoginDate ≠ today`; updates `last_login_date` in DB; idempotent (safe to call on every app open) |
| `awardXP` | `(userId: string, action: GamificationAction) → Promise<RewardEvent>` | UPDATE user_gamification, INSERT user_badges if new, pushes to pendingRewards |
| `awardTaskXP` | `(userId: string, xpAmount: number) → Promise<RewardEvent>` | Same as awardXP but with custom XP amount (for tasks) |
| `consumeReward` | `() → void` | Shifts pendingRewards[0] — called after modal dismissed |
| `updateStreak` | `(userId: string, type: StreakType) → Promise<number>` | Runs streak state machine, UPSERT user_streaks, returns new count |
| `progressQuest` | `(userId: string, questId: string) → Promise<void>` | Increments progress, completes if target reached, awards XP |
| `seedQuests` | `(userId: string) → Promise<void>` | INSERT user_quests for any missing quest IDs |

---

## useTasksStore
File: `stores/tasks.store.ts`

### State
| Field | Type | Description |
|-------|------|-------------|
| `tasks` | `UserTask[]` | All tasks for current user |
| `loading` | `boolean` | |

### Actions
| Action | Signature | Side Effects |
|--------|-----------|-------------|
| `fetchTasks` | `(userId: string) → Promise<void>` | SELECT user_tasks WHERE user_id ORDER BY created_at DESC |
| `markRecommendedSeen` | `(ids: string[]) → void` | Records which recommended task IDs the user has seen (local only — clears the tab badge dot for those tasks) |
| `seedInsightTasks` | `(userId: string, analysis?: SpendAnalysis, calc?: FireRecord) → Promise<void>` | Builds seeds, upserts missing/canceled tasks, then **always** fresh SELECT |
| `acceptTask` | `(userId: string, taskId: string, targetDate: Date) → Promise<void>` | UPDATE status='accepted', target_completion_date |
| `cancelTask` | `(userId: string, taskId: string, fromAccepted: boolean) → Promise<void>` | fromAccepted=true → status='recommended'; false → status='canceled' |
| `completeTask` | `(userId: string, taskId: string) → Promise<number>` | UPDATE status='done', returns xp_reward |

---

## useOnboardingStore
File: `stores/onboarding.store.ts`

Persists to AsyncStorage (key: `'freedomfire_onboarding'`) for cross-session resumability.

### State
| Field | Type | Description |
|-------|------|-------------|
| `pending` | `OnboardingPayload \| null` | Cached form data from onboarding flow |

### Actions
| Action | Signature | Side Effects |
|--------|-----------|-------------|
| `setPending` | `(data: OnboardingPayload) → Promise<void>` | Writes to AsyncStorage |
| `loadPending` | `() → Promise<void>` | Reads from AsyncStorage into state |
| `clearPending` | `() → Promise<void>` | Removes from AsyncStorage |

---

## useFeaturesStore
File: `stores/features.store.ts`

Fetches global feature flags from the `app_config` table once at app startup (before auth resolves).
Flags default to `false` if the row is missing or a flag key is absent.

### State
| Field | Type | Description |
|-------|------|-------------|
| `features` | `Record<string, boolean>` | Raw flag map from `app_config.features` |
| `loading` | `boolean` | During fetch |

### Actions
| Action | Signature | Side Effects |
|--------|-----------|-------------|
| `fetchFeatures` | `() → Promise<void>` | SELECT features FROM app_config WHERE id = 'global' |
| `isEnabled` | `(flag: FeatureFlag) → boolean` | Returns `features[flag] === true`; safe-defaults to `false` |

### FeatureFlag type
```ts
type FeatureFlag = 'gamification' | 'ai_advisor' | 'spend_tracking' | 'fire_calculator' | 'tasks';
```

### Usage
```ts
const isEnabled = useFeaturesStore(s => s.isEnabled);
if (isEnabled('ai_advisor')) { ... }
```

To enable or disable a feature: update the `features` jsonb column in the `app_config` row in Supabase. No app deploy required.

---

## useAdvisorStore (v2)
File: `stores/advisor.store.ts`

### State
| Field | Type | Description |
|-------|------|-------------|
| `messages` | `AdvisorMessage[]` | Conversation history |
| `streaming` | `boolean` | While SSE stream is active |
| `streamingContent` | `string` | Accumulates streaming tokens |

### Actions
| Action | Signature | Side Effects |
|--------|-----------|-------------|
| `sendMessage` | `(userId: string, content: string) → Promise<void>` | POST to financial-advisor-chat, stream response into state |
| `clearConversation` | `() → void` | Clears local message state (DB history preserved) |
