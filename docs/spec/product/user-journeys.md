# User Journeys

## Navigation Structure

```
Root Stack
├── (auth) group  ──  shown when session = null
│   ├── /           Splash / onboarding entry
│   ├── /onboarding 3-step FIRE form + result
│   ├── /login      Email + Google OAuth
│   ├── /signup     Registration
│   └── /verify-email  Email confirmation hold screen
│
└── (tabs) group  ──  shown when session ≠ null
    ├── /           Home dashboard
    ├── /fire-calculator
    ├── /spend-analyzer   (also called Insights tab)
    ├── /tasks
    ├── /achievements
    └── /advisor          (AI chat — new in v2)
```

Session check happens in `app/_layout.tsx` on mount. Redirect is instant (no flash).

---

## Journey 1: New User Onboarding

**Entry:** App first launch, no session.

```
1. Splash screen
   - Animated logo (scale + opacity in)
   - Floating icons: wallet, trending-up, cash, bar-chart (loop upward, infinite)
   - Tagline: "Retire Early. Live Free."
   - CTA: "Get Started →" → /onboarding
   - Link: "Already have an account? Log In" → /login

2. Onboarding form — Step 0: Timeline
   - Current age slider (18–69)
   - Target retirement age slider (current_age+1 – 80)
   - Both show large value display
   - Progress bar: 0/3

3. Onboarding form — Step 1: Money
   - Monthly income input (rupee format)
   - Monthly expenses input
   - Derived display: net savings or ⚠️ "Expenses exceed income"
   - Progress bar: 1/3

4. Onboarding form — Step 2: Loans (skippable)
   - Monthly EMI input
   - Loan tenure slider (appears only if EMI > 0)
   - "Skip" button available
   - Progress bar: 2/3

5. Result screen (computed after step 3)
   Branch A — expenses ≥ income:
     - Warning card: "Your expenses exceed income by ₹X"
     - Still shows CTA to create account
   Branch B — already at FIRE:
     - Celebration: "You can retire TODAY"
   Branch C — normal path (most users):
     - "YOUR FIRE DATE" hero card: retire age, corpus, lifestyle tag
     - Stats: monthly savings, savings rate, years to FIRE
     - Loan section (if EMI > 0): payoff age, years accelerated
     - CTA: "Save My Plan — Create Account" → /signup
     - Alt: "Have an account? Log In" → /login

   NOTE: onboarding data cached in useOnboardingStore (AsyncStorage) so if user
   navigates away mid-flow, pressing "Get Started" again restores their answers.

6. /signup
   - Name, email, password, confirm password
   - Checkbox: "I agree to Terms & Privacy Policy"
   - On success: navigate to /verify-email

7. /verify-email
   - Shows email address
   - "I've Verified My Email" button — tries to sign in, redirects to (tabs) if session found
   - "Resend" button with 60-second countdown timer

8. First load of (tabs)/home
   - Profile auto-created via Supabase trigger handle_new_user()
   - Gamification row auto-created via handle_new_user_gamification()
   - Onboarding pending data applied: fire_calculations row upserted
   - Awards: 150 XP (first_fire_calc), First Steps badge unlocked
   - Reward queue: XP celebration modal → level-up modal (if occurred) → badge modal
```

---

## Journey 2: Returning User — Daily Engagement

```
1. App open → session restored from AsyncStorage
2. Redirect to (tabs)/home
3. Login XP: 5 XP awarded if last_login_date ≠ today (checked in gamification store)
4. Investment streak incremented (if not same day)
5. Daily quest "Morning Check-in" progressed
6. Home screen loads: FIRE progress rings, freedom days, active quests, spend summary
```

---

## Journey 3: FIRE Calculator Update

```
1. Navigate to /fire-calculator tab
2. Form pre-filled from stored fire_calculations row
3. User adjusts any field (income, expenses, return %, etc.)
4. "Preview my FIRE" → computes locally, shows result card (no DB write)
   OR
   "Update my FIRE" → saves to DB
   - Gate: button disabled if last update was today (updated_at date = today)
   - On save:
     a. Upsert fire_calculations (user_id unique constraint)
     b. Gamification: awardXP('update_fire_calc') → 100 XP
     c. updateStreak(userId, 'investment')
     d. progressQuest(userId, 'weekly_fire_update')
     e. Reward queue populated; modals shown on home on next visit
     f. "Saved" banner appears at top: "✓ FIRE updated across all screens" (auto-hides 2.8s)
5. Wealth chart updates to show new projection
6. Lifestyle scenario cards update (Lean / Comfortable / Luxury)
```

---

## Journey 4: Credit Card Statement Analysis

```
1. Navigate to /spend-analyzer → Spend Insights sub-tab
2. Upload zone: tap → DocumentPicker opens, select PDF
3. Client-side check: read first bytes for /Encrypt marker
   Branch A — encrypted, no password:
     - Store file as pendingFile in spend store
     - Show password input modal
     - User enters password → retry with password
   Branch B — not encrypted (or password provided):
     - Upload PDF to Supabase Storage: statements/{userId}/{timestamp}_{filename}
     - Show loading spinner: "Analyzing your statement..."
     - Invoke parse-credit-card-pdf Edge Function
4. Edge function returns analysis
5. Outlier card appears (if any transactions ≥ 40% of avg_monthly_spend):
   - List of one-time charges with "Ignore" toggle
   - "Generate Insights" button (primary)
   - User can toggle which outliers to exclude
6. "Generate Insights" tap:
   - effective_avg_monthly_spend recalculated (excludes ignored outliers)
   - Saved to spend_analyses
   - Tasks auto-seeded via seedInsightTasks()
   - Charts and recommendations appear
7. Gamification: 75 XP (first upload) or 50 XP (subsequent)
8. Streak: 'tracking' incremented
9. Quest progress: 'weekly_spend_review' advanced
```

---

## Journey 5: EMI Analysis

```
1. /spend-analyzer → EMI Insights sub-tab
   (Requires fire_calculations row to exist; if not, shows CTA to calculate first)
2. EMI Delay card:
   - Shows: "With EMI: retire at X | Without EMI: retire at Y"
   - Delta displayed: "EMI is costing you N years"
3. Loan Tenure Impact card:
   - Shows corpus target at actual vs ideal retire age
   - Extra corpus needed due to longer accumulation (highlighted red)
4. Tip box: prepayment strategy suggestions
```

---

## Journey 6: Task Workflow

```
1. /tasks → Recommended sub-tab
   - Tasks seeded from spend analysis / FIRE calc (see features/04-tasks.md)
   - Hint: "Accept tasks to commit. Cancel to permanently dismiss."

2. User taps "Accept" on a task
   - Bottom sheet appears: "Set Target Date"
   - Task name shown
   - Preset chips: Next week / Next month / Next 3 months / Next 6 months
   - Selected date shown: "Target: DD MMMM YYYY"
   - Tap preset → task status → 'accepted', target_completion_date stored

3. Task moves to Accepted sub-tab
   - Hint: "Mark tasks as done to earn XP."

4. User taps "Mark as Done"
   - Task status → 'done'
   - XP awarded (task-defined: 50–150)
   - Freedom Days awarded (if task reduces spending)
   - TaskCompleteModal shown with confetti

5. Cancel from Recommended → status 'canceled' (permanent, cannot recover)
6. Cancel from Accepted → status reverts to 'recommended'
```

---

## Journey 7: AI Advisor Chat (v2)

```
1. Navigate to /advisor tab
2. Welcome message: "Hi [name], I know your numbers. Ask me anything."
3. User types: "Am I on track for FIRE?"
4. Advisor calls get_fire_progress tool → reads DB → responds with exact figures
5. Streaming response appears word by word
6. Conversation saved to ai_conversations table
7. User can ask follow-ups: "What if I save ₹5k more per month?"
8. Advisor calls calculate_scenario tool → returns new retire date
```

---

## Journey 8: Achievements & Profile

```
Profile tab:
1. View avatar (initials), name, email
2. Edit profile: name, age → saved to profiles table
3. View XP bar with level title and progress
4. View Freedom Days total
5. View 3 streak cards (Investment, Tracking, Review) with current + longest counts
6. View badges grid: unlocked first, locked grayed out, tap any → detail modal
7. View active quests with progress bars
8. Sign out → confirmation alert → session cleared → redirect to (auth)

Achievements tab (read-only mirror of profile gamification section):
- XP bar, Freedom Days, Streaks, Badges grid, Quests
```

---

## Error States

| Scenario | Handling |
|----------|----------|
| No internet on launch | Zustand loads from last cached DB state; shows stale data |
| PDF upload fails | Red error banner with message; retry button |
| Wrong PDF password | Error: "Incorrect password. Please try again." |
| PDF has no transactions | Error: "No transactions found. Please ensure it is a valid credit card statement." |
| FIRE calc: expenses ≥ income | Warning state shown; no corpus computed; user can still create account |
| Supabase error on save | Generic toast: "Failed to save. Please try again." |
