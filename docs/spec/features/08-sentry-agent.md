# Feature Spec: Sentry Autonomous Agent

**Purpose:** When a production crash lands in Sentry, an autonomous agent enriches it,
traces root cause through the codebase, opens a draft GitHub PR with a suggested fix, and
notifies Slack at each stage.

**Implementation files:**
- `supabase/functions/sentry-agent/index.ts`

---

## Pipeline

```
Sentry webhook (production, error/fatal only)
  │
  ├─ Stage 1 (≤30s): Enrich + Slack alert
  │    Parse stack trace, count affected users, assess severity
  │    Claude: 1-sentence summary of what went wrong
  │    → POST Slack: "🔴 Crash detected"
  │
  ├─ Stage 2 (≤90s): Root cause analysis
  │    Claude tool use: read relevant source files, search for symbol
  │    → POST Slack: "🔍 Root cause hypothesis + relevant files"
  │
  └─ Stage 3 (≤3min): Draft PR
       Claude: generate file diff + PR description
       GitHub API: create branch, commit, open DRAFT pull request
       → POST Slack: "📋 Draft PR ready for review"
```

**Failure handling:** Each stage catches its own errors. If Stage 2 fails, Stage 1 Slack
message is still sent. If Stage 3 fails, post error to Slack and skip PR creation.
Never crash silently.

---

## Webhook Validation

```typescript
const signature = req.headers.get('sentry-hook-signature');
const body = await req.text();
const expected = hmacSha256(body, SENTRY_WEBHOOK_SECRET);
if (signature !== expected) return new Response('Unauthorized', { status: 401 });
```

Filter: only process when:
- `data.event.level` in `['error', 'fatal']`
- `data.event.environment` === `'production'`
- All others: respond `200` immediately (no-op)

---

## Sentry Webhook Payload (Subset)

```typescript
{
  action: 'triggered';
  data: {
    event: {
      title: string;           // e.g. "TypeError: Cannot read property 'xp' of undefined"
      culprit: string;         // e.g. "app/(tabs)/index.tsx in renderDashboard"
      level: 'error' | 'fatal';
      environment: string;
      exception: {
        values: Array<{
          type: string;
          value: string;
          stacktrace: {
            frames: Array<{
              filename: string;   // source file path
              lineno: number;
              colno: number;
              function: string;
              context_line: string;
              pre_context: string[];
              post_context: string[];
            }>;
          };
        }>;
      };
    };
    issue: {
      id: string;
      permalink: string;   // Sentry issue URL
    };
  };
}
```

---

## Stage 1: Enrich + Slack Alert

**Input:** Raw Sentry event
**Claude call:** `claude-haiku-4-5-20251001`, 1-sentence summary, no tools needed

Prompt:
```
Given this React Native crash, write one sentence summarizing what went wrong for a developer.
Be specific: mention the component, the null/undefined value, and what was being rendered.

Error: {exception.values[0].type}: {exception.values[0].value}
Culprit: {culprit}
Top stack frame: {topFrame.filename}:{topFrame.lineno} in {topFrame.function}
```

**Slack message:**
```
🔴 *{event.title}*
Environment: production  |  Culprit: {culprit}
> {AI summary}
<{issue.permalink}|View in Sentry>
_Root cause analysis in progress..._
```

---

## Stage 2: Root Cause Analysis

**Model:** `claude-sonnet-4-6` (needs reasoning capability for multi-file analysis)
**Max output tokens:** 2048

**Claude tools:**

```typescript
// Tool: read_file
{
  name: 'read_file',
  description: 'Read the contents of a source file from the GitHub repository',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to repo root' },
      ref: { type: 'string', description: 'Branch or commit SHA (optional, defaults to main)' }
    },
    required: ['path']
  }
}
// Implementation: GET https://api.github.com/repos/{GITHUB_REPO}/contents/{path}
// Headers: Authorization: Bearer {GITHUB_TOKEN}
// Decode: atob(response.content)

// Tool: search_code
{
  name: 'search_code',
  description: 'Search the repository for a symbol, function name, or string',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' }
    },
    required: ['query']
  }
}
// Implementation: GET https://api.github.com/search/code?q={query}+repo:{GITHUB_REPO}
// Returns top 3 results: { path, url }
```

**Prompt:**
```
You are debugging a React Native crash in the FreedomFire app (Expo SDK 54, Zustand stores,
Supabase backend).

Crash:
- Error: {type}: {value}
- Culprit: {culprit}
- Stack (top 5 frames):
{top5Frames.map(f => `  ${f.filename}:${f.lineno} in ${f.function}`).join('\n')}

Use read_file and search_code to understand the relevant code, then provide:
1. Root cause hypothesis (2–3 sentences)
2. The specific file(s) and line(s) most likely causing this
3. Confidence: low | medium | high

Be specific. Reference actual code you read.
```

**Slack message (after Stage 2):**
```
🔍 *Root Cause Analysis*
Issue: {event.title}
Hypothesis: {claudeHypothesis}
Relevant files: {files.map(f => `\`${f}\``).join(' · ')}
Confidence: {confidence}
```

---

## Stage 3: Draft PR

**Model:** `claude-sonnet-4-6`
**Max output tokens:** 4096

Prompt:
```
Based on your root cause analysis, generate a minimal, safe fix.

Root cause: {hypothesis}
Relevant files: {files}
File contents: {readFilesContent}

Generate:
1. A unified diff for the fix (minimal change — defensive null check, guard, or type fix)
2. A PR title (max 70 chars)
3. A PR description (markdown, 3–5 bullet points)

Format:
DIFF:
```diff
--- a/path/to/file.ts
+++ b/path/to/file.ts
@@ ...
```
TITLE: ...
DESCRIPTION:
...
```

**GitHub PR creation:**
```typescript
// 1. Create branch
POST /repos/{GITHUB_REPO}/git/refs
{ ref: 'refs/heads/fix/sentry-{issue.id}', sha: mainBranchSHA }

// 2. Get current file content (for blob SHA)
GET /repos/{GITHUB_REPO}/contents/{filePath}

// 3. Commit the change
PUT /repos/{GITHUB_REPO}/contents/{filePath}
{
  message: `fix: ${prTitle}\n\nAuto-generated from Sentry issue ${issue.id}`,
  content: btoa(newFileContent),
  sha: existingFileSHA,
  branch: `fix/sentry-${issue.id}`
}

// 4. Open draft PR
POST /repos/{GITHUB_REPO}/pulls
{
  title: prTitle,
  body: prDescription + '\n\n> ⚠️ AI-generated fix. Review carefully before merging.',
  head: `fix/sentry-${issue.id}`,
  base: 'main',
  draft: true   // ALWAYS draft — never auto-merge
}
```

**Slack message (after Stage 3):**
```
📋 *Draft PR Ready for Review*
{prTitle}
<{prUrl}|View PR on GitHub>
⚠️ AI-generated. Review carefully before merging.
```

---

## Environment Variables Required

| Variable | Purpose |
|----------|---------|
| `SENTRY_WEBHOOK_SECRET` | HMAC signature validation |
| `SLACK_WEBHOOK_URL` | Incoming webhook URL |
| `GITHUB_TOKEN` | PAT with `repo` scope (read + write + PR) |
| `GITHUB_REPO` | Format: `owner/repo` (e.g., `ganesh/freedomfire`) |
| `ANTHROPIC_API_KEY` | Claude API |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | ai_request_log writes |

---

## Acceptance Criteria

- [ ] Webhook signature validated before processing
- [ ] Non-production events → 200 no-op (no Slack message)
- [ ] Warning-level events → 200 no-op (error/fatal only)
- [ ] Stage 1 Slack message always sent (even if later stages fail)
- [ ] read_file tool decodes GitHub base64 content correctly
- [ ] PR created with `draft: true` (never auto-merges)
- [ ] PR branch named `fix/sentry-{issue.id}`
- [ ] Stage 2 failure → posts error to Slack, skips Stage 3
- [ ] ai_request_log row written for each Claude call (3 total per event)
- [ ] Idempotent: same Sentry issue ID doesn't create duplicate branches/PRs
  (GitHub returns 422 on duplicate branch → catch + post "PR already exists" to Slack)
