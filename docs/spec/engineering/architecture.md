# Engineering Architecture

## Stack

| Layer | Technology | Version | Why |
|-------|-----------|---------|-----|
| Framework | Expo | SDK 54 | Managed workflow, OTA updates via EAS, no Xcode/Android Studio needed for most work |
| Navigation | Expo Router | v6 | File-based routing, type-safe links, nested layouts match app structure exactly |
| Language | TypeScript | ~5.9 | Full type safety across lib, stores, and components |
| State | Zustand | v5 | Minimal boilerplate vs Redux, no Context re-render issues, composable selectors |
| UI | React Native | 0.81.5 | Cross-platform (Android + iOS) from one codebase |
| Charts | react-native-gifted-charts | ^1.4.76 | No Skia required (Victory Native requires Skia, adds 30MB+ to bundle) |
| Animations | react-native-reanimated | ~4.1.1 | Runs on UI thread (worklets), smooth 60fps celebrations |
| Forms | react-hook-form + zod | v7 + v4 | Minimal re-renders, schema validation without writing manual validators |
| Backend | Supabase | — | Postgres + Auth + Storage + Edge Functions in one service; no custom server |
| Auth | Supabase Auth | — | Google OAuth + email/password; session management with auto-refresh |
| PDF Parsing | unpdf (Edge Function) | 0.11.0 | Deno-compatible (no Node.js globals that crash Deno runtime) |
| Error tracking | Sentry | ~7.2.0 | Automatic crash reporting, mobile replay, session replay |
| Analytics | Custom (Supabase table) | — | No third-party SDK; full control; queryable via Grafana |
| Build/OTA | Expo EAS | — | Cloud builds for Android/iOS; OTA updates via expo-updates |

---

## Architecture Decision Records (ADRs)

### ADR-001: Expo Router over React Navigation
**Decision:** Use Expo Router v6 (file-based routing).
**Reason:** Navigation structure maps 1:1 to file system (`app/(tabs)/fire-calculator.tsx` →
`/fire-calculator` route). Deep linking, type-safe `href`, and nested layout groups come for
free. No separate navigator configuration to maintain.

### ADR-002: Zustand over Redux / Jotai / Context
**Decision:** Zustand v5 for all global state.
**Reason:** Stores are plain TypeScript modules — no provider trees, no boilerplate. Selectors
only re-render components that subscribe to changed slices. Jotai was considered but the
store-per-feature model of Zustand is clearer for 5 distinct domains (auth, fire, spend,
gamification, tasks).

### ADR-003: gifted-charts over Victory Native
**Decision:** `react-native-gifted-charts` for all charts.
**Reason:** Victory Native v5 requires `@shopify/react-native-skia` which adds ~30MB to
the bundle and requires C++ compilation. gifted-charts is pure React Native SVG, compiles
without native code, and covers our use cases (line charts, bar charts, pie charts).

### ADR-004: unpdf in Edge Functions (not pdf-parse)
**Decision:** `unpdf` for PDF text extraction.
**Reason:** `pdf-parse` uses Node.js globals (`Buffer`, `fs`) that crash the Deno runtime
silently with an unhandled process exit (no error to catch). `unpdf` is written for Web/Deno
environments. Additionally, `pdf-parse` crashes on encrypted PDFs rather than throwing —
`unpdf` throws a catchable error.

### ADR-005: `--legacy-peer-deps` for npm installs
**Reason:** `react-dom` has a peer dependency conflict with React 19. This is a known issue
in the React Native + Expo ecosystem. All installs must use `npm install --legacy-peer-deps`.

### ADR-006: Service Role Key in Edge Functions
**Decision:** Edge Functions use `SUPABASE_SERVICE_ROLE_KEY`, not the anon key.
**Reason:** Edge Functions perform server-side operations on behalf of users (reading their
data, writing results). Service role bypasses RLS, which is correct since the function itself
enforces ownership (it reads `userId` from the request and scopes all queries to that user).

### ADR-007: Custom Analytics over Mixpanel/Segment
**Decision:** Custom `analytics_events` Supabase table.
**Reason:** No SDK dependency, no data leaving our infrastructure, queryable via Grafana with
the same Supabase credentials. The 6 event types we track are stable and don't require a
third-party event schema.

### ADR-008: Dark Theme Only
**Decision:** `userInterfaceStyle: "dark"` in `app.json`. No light mode.
**Reason:** Financial data is displayed with dense number-heavy UIs. Dark theme reduces eye
strain for extended use. Orange + gold on dark brown is a distinctive brand identity that
would be lost on a white background. Not planning to add light mode in v1.

### ADR-009: Android Primary, iOS Secondary
**Decision:** Build and test Android first.
**Reason:** Target users are Indian salaried professionals — ~70% Android market share in
India. iOS is supported but receives secondary testing priority.

### ADR-011: Claude Haiku for All AI Calls (with exception for Sentry agent)
**Decision:** Default to `claude-haiku-4-5-20251001` in every Edge Function.
**Reason:** FreedomFire is a consumer app with server-side AI calls on every user action
(task generation, chat messages, weekly agent runs, sentry analysis). At scale, model cost
compounds per-user per-week. Haiku is the cheapest Claude model in the Claude 4.x family —
roughly 25× cheaper per token than Sonnet. The tasks FreedomFire requires (structured JSON
output via tool use, financial Q&A grounded in provided context, anomaly narration, crash
summarisation) do not require the advanced reasoning of Sonnet or Opus; Haiku is capable
enough for all of them.

**Default applies to:** `generate-tasks`, `financial-advisor-chat`, `weekly-health-agent`,
`metrics-agent`, and Stage 1 of `sentry-agent`.

**Exception — sentry-agent Stages 2 & 3:** Uses `claude-sonnet-4-6`. Root cause analysis
requires reading multiple source files and reasoning across a call stack, then generating
a valid unified diff. Haiku's output quality was insufficient for reliable multi-file
reasoning in the Sentry flow. Stage 1 (one-sentence crash summary) still uses Haiku.
The sentry-agent fires only on production crashes — not on every user action — so the
higher cost per call is acceptable.

**Rule:** Never upgrade other functions to a higher-cost model without a specific, measurable
quality deficiency that Haiku cannot address. The upgrade decision must be documented here as a
revision to this ADR.

### ADR-012: Playwright for E2E Tests (Web Export, not Detox/Maestro)
**Decision:** Use Playwright against the Expo web export (`npx expo export --platform web`)
for E2E testing. Native app E2E (Detox, Maestro) is not used.
**Reason:** The Expo web export exercises the same React component and routing logic as the
native app, without requiring Android/iOS simulators or additional CI build agents. Auth
screens, form validation, and navigation flows are the highest-value E2E targets — and all
of these work identically in the web export. Playwright runs in a standard Chromium container,
integrates cleanly with GitHub Actions, and produces detailed HTML reports without native
toolchain setup.

**Trade-off:** Web-only E2E misses native-specific issues (haptics, hardware keyboard,
OS-level permission dialogs). These are covered by manual QA on device before store releases.

**Gate:** Playwright tests run in the `deploy.yml` workflow after building the web export and
**before** EAS deploy. A failing E2E test blocks the release.

### ADR-010: Convergence Loop for FIRE Calculation
**Decision:** Iterative solver (max 10 iterations) instead of closed-form formula.
**Reason:** FIRE number and retirement age are mutually dependent (corpus depends on years to
retire → years depend on corpus). A closed-form solution exists for constant contributions
but breaks when loan payoff timing is involved. The simulation-based approach handles all
edge cases (variable savings, EMI payoff) naturally.

---

## Build & Deployment

### EAS Build Channels
```
development  → Local Expo Go / Dev Client. APK format.
preview      → Internal testing. APK format. Channel: 'preview'.
production   → Google Play / App Store. AAB format. Channel: 'production'.
```

### OTA Updates
`expo-updates` with EAS Update. Production channel supports OTA for JS/assets (no binary
change). Native changes require a new build + store submission.

### GitHub Actions — Deploy Workflow (`deploy.yml`)
Triggered by **version tags** only (`v*`):
```
v1.2.3              → production
v1.2.3-rc.1         → preview (staging)
v1.2.3-preview.1    → preview (staging)
```

Pipeline per tag:
```
1. Resolve env (production vs preview) from tag name
2. npm ci --legacy-peer-deps
3. npx expo export --platform web   (builds static web bundle into dist/)
4. npx playwright install --with-deps chromium
5. npx playwright test               ← E2E gate: fails here blocks deploy
6. Upload Playwright HTML report as artifact (always, even on failure)
7. eas deploy --channel <env>        ← only reached if E2E passes
```

Playwright report is uploaded as artifact `playwright-report` (retention: 14 days).

### Environment Variables
All env vars are prefixed `EXPO_PUBLIC_` for client-side access (exposed in bundle).
Server-only values (Supabase service role, Anthropic API key) are stored in Supabase
Edge Function secrets — never in the app bundle.

| Variable | Where Used |
|----------|-----------|
| `EXPO_PUBLIC_SUPABASE_URL` | Client — Supabase client init |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Client — Supabase client init |
| `EXPO_PUBLIC_SENTRY_DSN` | Client — Sentry init |
| `SUPABASE_URL` | Edge Functions (auto-injected by Supabase) |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions (auto-injected by Supabase) |
| `ANTHROPIC_API_KEY` | Edge Functions — Claude API calls |
| `SLACK_WEBHOOK_URL` | Edge Functions — DevOps agents |
| `SENTRY_WEBHOOK_SECRET` | Edge Functions — Sentry agent validation |
| `GITHUB_TOKEN` | Edge Functions — Sentry agent PR creation |
| `GITHUB_REPO` | Edge Functions — Sentry agent (format: `owner/repo`) |

### Pre-push Hook (`scripts/install-hooks.sh`)
Install once after cloning: `bash scripts/install-hooks.sh`. Runs 6 checks on every `git push`:
1. `tsc --noEmit` — TypeScript type check
2. `jest --coverage --coverageThreshold '{"global":{"lines":90,...}}'` — tests + 90% coverage
3. `expo-doctor` — Expo SDK compatibility check
4. `node scripts/validate-grafana-dashboard.js` — Grafana dashboard JSON schema validation
5. Scan `git ls-files` for tracked `.env*` files — blocks push if any are committed
6. `gitleaks detect` + `gitleaks git` — secret scan of working tree and git history

`gitleaks` must be installed (`brew install gitleaks`) — the hook fails if it is absent.
