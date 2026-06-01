# FreedomFire — Product Specification

This directory is the single source of truth for everything FreedomFire is, does, and should do.
It was reverse-engineered from the v1 codebase and is maintained as a living document.

## What Spec-Driven Development Means Here

1. **Spec before code** — before implementing a feature, write or update its spec file first.
2. **One spec file per feature** — a developer or AI agent handed a single feature file should be
   able to implement it correctly with no other context.
3. **Acceptance criteria map to tests** — every `- [ ]` checkbox in a feature spec corresponds
   to a test in `__tests__/`.
4. **Update spec when behavior changes** — a merged PR that changes behavior without updating the
   spec is incomplete.

## Directory Index

### Product
| File | Contents |
|------|----------|
| [product/vision.md](product/vision.md) | What, why, who, non-goals, success metrics |
| [product/user-journeys.md](product/user-journeys.md) | Every end-to-end user flow with steps and branches |
| [product/design-system.md](product/design-system.md) | Color tokens, typography, spacing, component inventory |

### Features
| File | Contents |
|------|----------|
| [features/01-fire-calculator.md](features/01-fire-calculator.md) | FIRE number formula, inputs/outputs, edge cases, UI |
| [features/02-spend-analyzer.md](features/02-spend-analyzer.md) | PDF parsing, categorization, EMI tab, recommendations |
| [features/03-gamification.md](features/03-gamification.md) | XP, 50 levels, 12 badges, streaks, 5 quests |
| [features/04-tasks.md](features/04-tasks.md) | Task types, seeding rules, lifecycle, re-seed logic |
| [features/05-ai-tasks.md](features/05-ai-tasks.md) | Claude-powered task generation (replaces hardcoded seeds) |
| [features/06-ai-advisor.md](features/06-ai-advisor.md) | Conversational financial advisor tab |
| [features/07-autonomous-agent.md](features/07-autonomous-agent.md) | Weekly health agent — autonomous AI analysis |
| [features/08-sentry-agent.md](features/08-sentry-agent.md) | Crash detection → root cause → draft PR → Slack |
| [features/09-metrics-agent.md](features/09-metrics-agent.md) | Metric anomaly detection → Slack |

### Data
| File | Contents |
|------|----------|
| [data/schema.md](data/schema.md) | All Supabase tables, columns, RLS, migration refs |
| [data/stores.md](data/stores.md) | Zustand store interfaces and action contracts |

### API
| File | Contents |
|------|----------|
| [api/edge-functions.md](api/edge-functions.md) | Request/response contracts for every Edge Function |

### Engineering
| File | Contents |
|------|----------|
| [engineering/architecture.md](engineering/architecture.md) | Stack choices, ADRs |
| [engineering/testing.md](engineering/testing.md) | Test philosophy, coverage targets, what to mock |

## Quick Reference

- **Primary color:** `#FF6B00` (orange)
- **Stack:** Expo SDK 54 · React Native 0.81 · Expo Router v6 · Zustand v5 · Supabase
- **Target users:** Indian salaried professionals, 25–40, seeking FIRE
- **App package:** `com.freedomfire.app`
- **Supabase project:** `eegsywqbbgbilyjytbmf.supabase.co`
