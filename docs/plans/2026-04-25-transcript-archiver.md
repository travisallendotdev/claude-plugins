# Transcript Archiver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code plugin marketplace with a single `transcript-archiver` plugin that mirrors session transcripts to readable Markdown files via Stop and SessionEnd hooks.

**Architecture:** Bun + TypeScript hook script reads the JSONL transcript path supplied by Claude Code on stdin, filters out tool calls/results/sidechain/system/summary entries, groups remaining user/assistant messages by local-time date, and writes one Markdown file per `(date, session)` pair into `$CLAUDE_TRANSCRIPTS_DIR` (default `~/claude-transcripts`). Cross-day sessions get split into multiple linked files via `continues_into`/`continued_from` front-matter markers. The plugin lazy-installs its sole npm dependency (`claude-hooks`, used for typed payload schemas) on first run; the hook always exits 0 so a renderer bug can never block a Claude session.

**Tech Stack:** Bun ≥ 1.0, TypeScript, `claude-hooks` (npm) for type definitions, `bun:test` for tests. Standard Node APIs (`node:fs`, `node:path`, `node:child_process`).

**Spec:** See `docs/superpowers/specs/2026-04-25-transcript-archiver-design.md` for the full design.

**Repo location:** All implementation work happens in the current working directory (`/Users/travis/dev/ai-agents/plugins/`), which becomes the marketplace git repo. The `docs/superpowers/` folder is not added to any commit (per user preference).

---

## File Structure

```
/Users/travis/dev/ai-agents/plugins/                 # marketplace git repo root (cwd)
├── .claude-plugin/
│   └── marketplace.json
├── .gitignore
├── README.md                                        # marketplace README
├── docs/superpowers/                                # NOT committed
└── plugins/
    └── transcript-archiver/
        ├── .claude-plugin/
        │   └── plugin.json
        ├── hooks/
        │   └── hooks.json
        ├── src/
        │   ├── entry.ts            # stdin dispatcher + bootstrap (Stop/SessionEnd)
        │   ├── render.ts           # orchestrator: parse JSONL → group → write files
        │   ├── tools.ts            # per-tool breadcrumb rendering
        │   ├── format.ts           # user/assistant turn formatting
        │   ├── frontmatter.ts      # YAML front-matter builder
        │   ├── slug.ts             # project slug from cwd
        │   ├── tz.ts               # local-date / local-time helpers
        │   └── filter.ts           # JSONL message filtering predicates
        ├── tests/
        │   ├── fixtures/           # JSONL fixture files
        │   ├── slug.test.ts
        │   ├── tz.test.ts
        │   ├── tools.test.ts
        │   ├── frontmatter.test.ts
        │   ├── format.test.ts
        │   ├── filter.test.ts
        │   └── render.test.ts
        ├── package.json
        ├── tsconfig.json
        └── README.md
```

Each `src/*.ts` file has one responsibility and a small surface area, matching the spec's "design for isolation" goal. Tests sit beside their target module.

---

## Task 1: Marketplace repo scaffold

**Files:**
- Create: `/Users/travis/dev/ai-agents/plugins/.gitignore`
- Create: `/Users/travis/dev/ai-agents/plugins/.claude-plugin/marketplace.json`
- Create: `/Users/travis/dev/ai-agents/plugins/README.md`

- [ ] **Step 1.1: Initialize git repo**

Run from `/Users/travis/dev/ai-agents/plugins/`:
```bash
git init -b main
```
Expected: `Initialized empty Git repository in /Users/travis/dev/ai-agents/plugins/.git/`

- [ ] **Step 1.2: Create `.gitignore`**

```
node_modules/
.DS_Store
*.log
bun.lockb
```

Note: this ignores the legacy binary lockfile (`bun.lockb`) but NOT the modern text `bun.lock`. The text lockfile is committed for reproducible installs (see Task 3 — every plugin user runs `bun install` against this lockfile on first hook invocation).

- [ ] **Step 1.3: Create marketplace manifest**

`.claude-plugin/marketplace.json`:
```json
{
  "name": "travisallendotdev",
  "owner": { "name": "Travis Allen" },
  "plugins": [
    {
      "name": "transcript-archiver",
      "source": "./plugins/transcript-archiver",
      "description": "Persist Claude Code session transcripts as readable markdown.",
      "version": "0.1.0"
    }
  ]
}
```

- [ ] **Step 1.4: Create marketplace README stub**

`README.md`:
````markdown
# travisallendotdev — Claude Code Plugin Marketplace

Personal Claude Code plugin marketplace.

## Install

```
/plugin marketplace add travisallendotdev/claude-plugins
```

## Plugins

- **[transcript-archiver](./plugins/transcript-archiver)** — Persist session transcripts as readable markdown.
````

- [ ] **Step 1.5: Commit**

```bash
git add .gitignore .claude-plugin/marketplace.json README.md
git commit -m "chore: scaffold marketplace repo"
```

---

## Task 2: Plugin manifest & directory skeleton

**Files:**
- Create: `plugins/transcript-archiver/.claude-plugin/plugin.json`
- Create: `plugins/transcript-archiver/README.md`

- [ ] **Step 2.1: Create plugin manifest**

`plugins/transcript-archiver/.claude-plugin/plugin.json`:
```json
{
  "name": "transcript-archiver",
  "description": "Persist Claude Code session transcripts as readable markdown. Configurable output via $CLAUDE_TRANSCRIPTS_DIR.",
  "version": "0.1.0",
  "author": { "name": "Travis Allen" }
}
```

- [ ] **Step 2.2: Create plugin README stub**

`plugins/transcript-archiver/README.md`:
````markdown
# transcript-archiver

Persist Claude Code session transcripts as human-readable Markdown.

(Documentation expanded in Task 14.)
````

- [ ] **Step 2.3: Commit**

```bash
git add plugins/transcript-archiver/
git commit -m "feat: add transcript-archiver plugin manifest"
```

---

## Task 3: Bun project setup (`package.json`, `tsconfig.json`)

**Files:**
- Create: `plugins/transcript-archiver/package.json`
- Create: `plugins/transcript-archiver/tsconfig.json`

- [ ] **Step 3.1: Create `package.json`**

Pin dependency versions (use exact ranges shown — floating `*` and `latest` cause version drift across installs and break the determinism the committed lockfile provides):

```json
{
  "name": "transcript-archiver",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "bun test"
  },
  "dependencies": {
    "claude-hooks": "^2.4.0"
  },
  "devDependencies": {
    "@types/bun": "^1.3.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 3.2: Create `tsconfig.json`**

Do NOT add a `types` array — `@types/bun` is auto-discovered from `node_modules/@types`. (The legacy `bun-types` package is not installed; explicitly listing it would break typecheck.)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowImportingTsExtensions": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 3.3: Install dependencies once locally to verify**

Run from `plugins/transcript-archiver/`:
```bash
bun install
```
Expected: `bun install` completes; a `node_modules/` directory appears (already in `.gitignore`).

- [ ] **Step 3.4: Verify Bun test runner works**

Run from `plugins/transcript-archiver/`:
```bash
bun test
```
Expected: `0 pass, 0 fail` (or similar — the runner finds no tests yet but does not error).

- [ ] **Step 3.5: Commit**

The commit MUST include the lockfile (`bun.lock`) along with the two configs. The lockfile is what makes the lazy `bun install` in Task 12 deterministic.

```bash
git add plugins/transcript-archiver/package.json plugins/transcript-archiver/tsconfig.json plugins/transcript-archiver/bun.lock
git commit -m "feat: bun + typescript project setup for transcript-archiver"
```

---

## Task 4: Hook registration & no-op entry script

This task wires Stop and SessionEnd to a script that does nothing yet but exits 0, so the plugin can be installed and verified end-to-end before any rendering exists.

**Files:**
- Create: `plugins/transcript-archiver/hooks/hooks.json`
- Create: `plugins/transcript-archiver/src/entry.ts`

- [ ] **Step 4.1: Create `hooks/hooks.json`**

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [{ "type": "command", "command": "bun ${CLAUDE_PLUGIN_ROOT}/src/entry.ts" }] }
    ],
    "SessionEnd": [
      { "hooks": [{ "type": "command", "command": "bun ${CLAUDE_PLUGIN_ROOT}/src/entry.ts" }] }
    ]
  }
}
```

- [ ] **Step 4.2: Create no-op `src/entry.ts`**

```ts
#!/usr/bin/env bun
process.exit(0)
```

- [ ] **Step 4.3: Verify the script runs**

Run from `plugins/transcript-archiver/`:
```bash
echo '{}' | bun src/entry.ts; echo "exit=$?"
```
Expected: `exit=0`

- [ ] **Step 4.4: Commit**

```bash
git add plugins/transcript-archiver/hooks/hooks.json plugins/transcript-archiver/src/entry.ts
git commit -m "feat: register Stop and SessionEnd hooks"
```

---

## Task 5: `slug.ts` — project slug from `cwd` (TDD)

**Files:**
- Test: `plugins/transcript-archiver/tests/slug.test.ts`
- Create: `plugins/transcript-archiver/src/slug.ts`

- [ ] **Step 5.1: Write the failing test**

`tests/slug.test.ts`:
```ts
import { test, expect } from 'bun:test'
import { projectSlug } from '../src/slug'

test('basename of typical posix path', () => {
  expect(projectSlug('/Users/travis/dev/ai-agents/sandbox')).toBe('sandbox')
})

test('lowercases the result', () => {
  expect(projectSlug('/Users/travis/dev/My-Project')).toBe('my-project')
})

test('replaces non-[a-z0-9-] characters with -', () => {
  expect(projectSlug('/Users/travis/My Project (v2)')).toBe('my-project--v2-')
})

test('trailing slash is ignored', () => {
  expect(projectSlug('/Users/travis/dev/sandbox/')).toBe('sandbox')
})

test('falls back to "unknown" for root', () => {
  expect(projectSlug('/')).toBe('unknown')
})

test('falls back to "unknown" for empty string', () => {
  expect(projectSlug('')).toBe('unknown')
})
```

- [ ] **Step 5.2: Run tests to verify they fail**

Run from `plugins/transcript-archiver/`:
```bash
bun test tests/slug.test.ts
```
Expected: failures, `Cannot find module '../src/slug'` or similar.

- [ ] **Step 5.3: Implement `src/slug.ts`**

```ts
export function projectSlug(cwd: string): string {
  const trimmed = cwd.replace(/\/+$/, '')
  const base = trimmed.split('/').filter(Boolean).pop()
  if (!base) return 'unknown'
  return base.toLowerCase().replace(/[^a-z0-9-]/g, '-')
}
```

- [ ] **Step 5.4: Run tests to verify they pass**

```bash
bun test tests/slug.test.ts
```
Expected: `6 pass, 0 fail`.

- [ ] **Step 5.5: Commit**

```bash
git add plugins/transcript-archiver/src/slug.ts plugins/transcript-archiver/tests/slug.test.ts
git commit -m "feat(slug): derive project slug from cwd"
```

---

## Task 6: `tz.ts` — local date and time helpers (TDD)

**Files:**
- Test: `plugins/transcript-archiver/tests/tz.test.ts`
- Create: `plugins/transcript-archiver/src/tz.ts`

- [ ] **Step 6.1: Write the failing test**

`tests/tz.test.ts`:
```ts
import { test, expect } from 'bun:test'
import { localDate, localTime } from '../src/tz'

// These tests use the system local timezone; values below assume process.env.TZ is set
// in the test runner. We force TZ via Bun.env in beforeAll.
import { beforeAll } from 'bun:test'
beforeAll(() => { process.env.TZ = 'America/New_York' })

test('localDate formats ISO timestamp as YYYY-MM-DD in local TZ', () => {
  // 2026-04-26T03:30:00Z is 2026-04-25T23:30 EDT
  expect(localDate('2026-04-26T03:30:00Z')).toBe('2026-04-25')
})

test('localTime formats ISO timestamp as HH:MM:SS in local TZ', () => {
  expect(localTime('2026-04-26T03:30:15Z')).toBe('23:30:15')
})

test('localDate handles a timestamp already in local-day range', () => {
  // 2026-04-25T15:00:00Z is 2026-04-25T11:00 EDT
  expect(localDate('2026-04-25T15:00:00Z')).toBe('2026-04-25')
})

test('localTime pads single-digit components', () => {
  // 2026-04-25T13:05:09Z is 2026-04-25T09:05:09 EDT
  expect(localTime('2026-04-25T13:05:09Z')).toBe('09:05:09')
})
```

- [ ] **Step 6.2: Run tests to verify they fail**

```bash
bun test tests/tz.test.ts
```
Expected: import failures.

- [ ] **Step 6.3: Implement `src/tz.ts`**

```ts
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function localDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function localTime(iso: string): string {
  const d = new Date(iso)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}
```

- [ ] **Step 6.4: Run tests to verify they pass**

```bash
bun test tests/tz.test.ts
```
Expected: `4 pass, 0 fail`.

- [ ] **Step 6.5: Commit**

```bash
git add plugins/transcript-archiver/src/tz.ts plugins/transcript-archiver/tests/tz.test.ts
git commit -m "feat(tz): local date and time formatters"
```

---

## Task 7: `tools.ts` — per-tool breadcrumb rendering (TDD)

**Files:**
- Test: `plugins/transcript-archiver/tests/tools.test.ts`
- Create: `plugins/transcript-archiver/src/tools.ts`

- [ ] **Step 7.1: Write the failing test**

`tests/tools.test.ts`:
```ts
import { test, expect, describe } from 'bun:test'
import { renderToolBreadcrumb } from '../src/tools'

describe('file-target tools', () => {
  test('Read shows file_path', () => {
    expect(renderToolBreadcrumb('Read', { file_path: '/a/b.ts' }))
      .toBe('_[Read /a/b.ts]_')
  })
  test('Write shows file_path', () => {
    expect(renderToolBreadcrumb('Write', { file_path: 'README.md' }))
      .toBe('_[Write README.md]_')
  })
  test('Edit shows file_path', () => {
    expect(renderToolBreadcrumb('Edit', { file_path: 'src/x.ts' }))
      .toBe('_[Edit src/x.ts]_')
  })
  test('NotebookEdit shows notebook_path', () => {
    expect(renderToolBreadcrumb('NotebookEdit', { notebook_path: 'nb.ipynb' }))
      .toBe('_[NotebookEdit nb.ipynb]_')
  })
})

describe('Bash truncation', () => {
  test('short command rendered in full', () => {
    expect(renderToolBreadcrumb('Bash', { command: 'ls -la' }))
      .toBe('_[Bash: ls -la]_')
  })
  test('command exactly 80 chars rendered in full', () => {
    const cmd = 'a'.repeat(80)
    expect(renderToolBreadcrumb('Bash', { command: cmd }))
      .toBe(`_[Bash: ${cmd}]_`)
  })
  test('command longer than 80 chars truncated to 79 + …', () => {
    const cmd = 'a'.repeat(120)
    const expected = '_[Bash: ' + 'a'.repeat(79) + '…]_'
    expect(renderToolBreadcrumb('Bash', { command: cmd })).toBe(expected)
  })
})

describe('search tools', () => {
  test('Grep quotes the pattern', () => {
    expect(renderToolBreadcrumb('Grep', { pattern: 'TODO' }))
      .toBe('_[Grep "TODO"]_')
  })
  test('Glob shows the pattern unquoted', () => {
    expect(renderToolBreadcrumb('Glob', { pattern: '**/*.ts' }))
      .toBe('_[Glob **/*.ts]_')
  })
})

describe('web tools', () => {
  test('WebFetch shows the url', () => {
    expect(renderToolBreadcrumb('WebFetch', { url: 'https://example.com' }))
      .toBe('_[WebFetch https://example.com]_')
  })
  test('WebSearch quotes the query', () => {
    expect(renderToolBreadcrumb('WebSearch', { query: 'bun stdin' }))
      .toBe('_[WebSearch "bun stdin"]_')
  })
})

describe('agent delegation', () => {
  test('Task shows subagent_type', () => {
    expect(renderToolBreadcrumb('Task', { subagent_type: 'Explore' }))
      .toBe('_[Agent: Explore]_')
  })
  test('Agent shows subagent_type', () => {
    expect(renderToolBreadcrumb('Agent', { subagent_type: 'general-purpose' }))
      .toBe('_[Agent: general-purpose]_')
  })
})

describe('noisy/no-arg tools', () => {
  test('TodoWrite has no arg', () => {
    expect(renderToolBreadcrumb('TodoWrite', { todos: [{ id: 1 }] }))
      .toBe('_[TodoWrite]_')
  })
  test('TaskCreate has no arg', () => {
    expect(renderToolBreadcrumb('TaskCreate', { subject: 'x' }))
      .toBe('_[TaskCreate]_')
  })
})

describe('MCP tools', () => {
  test('strips mcp__ prefix and splits server: tool on first __', () => {
    expect(renderToolBreadcrumb('mcp__claude_ai_Gmail__authenticate', {}))
      .toBe('_[claude_ai_Gmail: authenticate]_')
  })
  test('multi-segment tool name keeps everything after first __', () => {
    expect(renderToolBreadcrumb('mcp__server__multi__word__tool', {}))
      .toBe('_[server: multi__word__tool]_')
  })
  test('malformed mcp name (no second __) renders as-is after strip', () => {
    expect(renderToolBreadcrumb('mcp__lonely', {}))
      .toBe('_[lonely]_')
  })
})

describe('unknown tools', () => {
  test('falls back to bare name', () => {
    expect(renderToolBreadcrumb('SomethingNew', { x: 1 }))
      .toBe('_[SomethingNew]_')
  })
})

describe('missing target arg', () => {
  test('Read with no file_path falls back to bare name', () => {
    expect(renderToolBreadcrumb('Read', {})).toBe('_[Read]_')
  })
  test('Bash with no command falls back to bare name', () => {
    expect(renderToolBreadcrumb('Bash', {})).toBe('_[Bash]_')
  })
})
```

- [ ] **Step 7.2: Run tests to verify they fail**

```bash
bun test tests/tools.test.ts
```
Expected: import failures.

- [ ] **Step 7.3: Implement `src/tools.ts`**

```ts
type Input = Record<string, unknown>

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}

function asString(input: Input, key: string): string | undefined {
  const v = input[key]
  return typeof v === 'string' ? v : undefined
}

function bare(name: string): string {
  return `_[${name}]_`
}

function formatMcp(name: string): string {
  const stripped = name.replace(/^mcp__/, '')
  const idx = stripped.indexOf('__')
  if (idx === -1) return `_[${stripped}]_`
  const server = stripped.slice(0, idx)
  const tool = stripped.slice(idx + 2)
  return `_[${server}: ${tool}]_`
}

const NOISY = new Set([
  'TodoWrite',
  'TaskCreate',
  'TaskUpdate',
  'TaskList',
  'TaskGet',
  'TaskOutput',
  'TaskStop',
])

export function renderToolBreadcrumb(name: string, input: Input): string {
  if (name.startsWith('mcp__')) return formatMcp(name)
  if (NOISY.has(name)) return bare(name)

  switch (name) {
    case 'Read':
    case 'Write':
    case 'Edit': {
      const fp = asString(input, 'file_path')
      return fp ? `_[${name} ${fp}]_` : bare(name)
    }
    case 'NotebookEdit': {
      const np = asString(input, 'notebook_path')
      return np ? `_[NotebookEdit ${np}]_` : bare(name)
    }
    case 'Bash': {
      const cmd = asString(input, 'command')
      return cmd ? `_[Bash: ${truncate(cmd, 80)}]_` : bare(name)
    }
    case 'Grep': {
      const p = asString(input, 'pattern')
      return p ? `_[Grep "${p}"]_` : bare(name)
    }
    case 'Glob': {
      const p = asString(input, 'pattern')
      return p ? `_[Glob ${p}]_` : bare(name)
    }
    case 'WebFetch': {
      const u = asString(input, 'url')
      return u ? `_[WebFetch ${u}]_` : bare(name)
    }
    case 'WebSearch': {
      const q = asString(input, 'query')
      return q ? `_[WebSearch "${q}"]_` : bare(name)
    }
    case 'Task':
    case 'Agent': {
      const t = asString(input, 'subagent_type')
      return t ? `_[Agent: ${t}]_` : bare(name)
    }
    default:
      return bare(name)
  }
}
```

- [ ] **Step 7.4: Run tests to verify they pass**

```bash
bun test tests/tools.test.ts
```
Expected: all tests pass.

- [ ] **Step 7.5: Commit**

```bash
git add plugins/transcript-archiver/src/tools.ts plugins/transcript-archiver/tests/tools.test.ts
git commit -m "feat(tools): per-tool breadcrumb rendering"
```

---

## Task 8: `frontmatter.ts` — YAML front-matter builder (TDD)

**Files:**
- Test: `plugins/transcript-archiver/tests/frontmatter.test.ts`
- Create: `plugins/transcript-archiver/src/frontmatter.ts`

- [ ] **Step 8.1: Write the failing test**

`tests/frontmatter.test.ts`:
```ts
import { test, expect, describe } from 'bun:test'
import { buildFrontmatter, type FrontmatterFields } from '../src/frontmatter'

describe('buildFrontmatter', () => {
  test('emits all required fields in order', () => {
    const fields: FrontmatterFields = {
      session_id: 'abc-123',
      project: 'sandbox',
      cwd: '/Users/travis/dev/sandbox',
      started_at: '2026-04-25T23:07:54Z',
      last_updated_at: '2026-04-25T23:42:11Z',
    }
    const out = buildFrontmatter(fields)
    expect(out).toBe(
      '---\n' +
      'session_id: abc-123\n' +
      'project: sandbox\n' +
      "cwd: '/Users/travis/dev/sandbox'\n" +
      'started_at: 2026-04-25T23:07:54Z\n' +
      'last_updated_at: 2026-04-25T23:42:11Z\n' +
      '---\n'
    )
  })

  test('omits optional fields when not provided', () => {
    const fields: FrontmatterFields = {
      session_id: 'a',
      project: 'p',
      cwd: '/p',
      started_at: 't1',
      last_updated_at: 't2',
    }
    const out = buildFrontmatter(fields)
    expect(out).not.toContain('git_branch')
    expect(out).not.toContain('model')
    expect(out).not.toContain('session_ended_at')
    expect(out).not.toContain('continues_into')
    expect(out).not.toContain('continued_from')
    expect(out).not.toContain('original_started_at')
  })

  test('includes git_branch and model when provided', () => {
    const out = buildFrontmatter({
      session_id: 'a',
      project: 'p',
      cwd: '/p',
      git_branch: 'main',
      model: 'claude-opus-4-7',
      started_at: 't1',
      last_updated_at: 't2',
    })
    expect(out).toContain('git_branch: main\n')
    expect(out).toContain('model: claude-opus-4-7\n')
  })

  test('continues_into and session_ended_at are mutually exclusive (caller responsibility but both renderable individually)', () => {
    const a = buildFrontmatter({
      session_id: 'a', project: 'p', cwd: '/p',
      started_at: 't1', last_updated_at: 't2',
      session_ended_at: 't3',
    })
    expect(a).toContain('session_ended_at: t3\n')
    expect(a).not.toContain('continues_into')

    const b = buildFrontmatter({
      session_id: 'a', project: 'p', cwd: '/p',
      started_at: 't1', last_updated_at: 't2',
      continues_into: '2026-04-26',
    })
    expect(b).toContain('continues_into: 2026-04-26\n')
    expect(b).not.toContain('session_ended_at')
  })

  test('original_started_at and continued_from on continuation files', () => {
    const out = buildFrontmatter({
      session_id: 'a', project: 'p', cwd: '/p',
      started_at: 't1', last_updated_at: 't2',
      original_started_at: 't0',
      continued_from: '2026-04-25',
    })
    expect(out).toContain('original_started_at: t0\n')
    expect(out).toContain('continued_from: 2026-04-25\n')
  })

  test('quotes string values containing spaces or special chars', () => {
    const out = buildFrontmatter({
      session_id: 'a', project: 'p',
      cwd: '/Users/travis/My Project',
      started_at: 't1', last_updated_at: 't2',
    })
    expect(out).toContain("cwd: '/Users/travis/My Project'\n")
  })

  test('escapes single quotes inside quoted values', () => {
    const out = buildFrontmatter({
      session_id: 'a', project: 'p',
      cwd: "/path/with'apostrophe",
      started_at: 't1', last_updated_at: 't2',
    })
    expect(out).toContain("cwd: '/path/with''apostrophe'\n")
  })
})
```

- [ ] **Step 8.2: Run tests to verify they fail**

```bash
bun test tests/frontmatter.test.ts
```
Expected: import failures.

- [ ] **Step 8.3: Implement `src/frontmatter.ts`**

```ts
export interface FrontmatterFields {
  session_id: string
  project: string
  cwd: string
  git_branch?: string
  model?: string
  started_at: string
  original_started_at?: string
  last_updated_at: string
  session_ended_at?: string
  continues_into?: string
  continued_from?: string
}

const SAFE = /^[A-Za-z0-9_.:\-]+$/

function yamlValue(s: string): string {
  if (SAFE.test(s)) return s
  return `'${s.replace(/'/g, "''")}'`
}

const ORDER: Array<keyof FrontmatterFields> = [
  'session_id',
  'project',
  'cwd',
  'git_branch',
  'model',
  'original_started_at',
  'started_at',
  'last_updated_at',
  'session_ended_at',
  'continues_into',
  'continued_from',
]

export function buildFrontmatter(fields: FrontmatterFields): string {
  const lines: string[] = ['---']
  for (const key of ORDER) {
    const v = fields[key]
    if (v === undefined) continue
    lines.push(`${key}: ${yamlValue(v)}`)
  }
  lines.push('---', '')
  return lines.join('\n')
}
```

- [ ] **Step 8.4: Run tests to verify they pass**

```bash
bun test tests/frontmatter.test.ts
```
Expected: all tests pass.

- [ ] **Step 8.5: Commit**

```bash
git add plugins/transcript-archiver/src/frontmatter.ts plugins/transcript-archiver/tests/frontmatter.test.ts
git commit -m "feat(frontmatter): build YAML front matter with optional fields"
```

---

## Task 9: `filter.ts` — JSONL message filter predicates (TDD)

**Files:**
- Test: `plugins/transcript-archiver/tests/filter.test.ts`
- Create: `plugins/transcript-archiver/src/filter.ts`

- [ ] **Step 9.1: Write the failing test**

`tests/filter.test.ts`:
```ts
import { test, expect, describe } from 'bun:test'
import { isRenderableUser, isRenderableAssistant, parseJsonl } from '../src/filter'

describe('parseJsonl', () => {
  test('parses one message per line, skipping blanks and parse errors', () => {
    const text = [
      '{"type":"user","isSidechain":false,"message":{"role":"user","content":"hi"}}',
      '',
      'not-json',
      '{"type":"assistant","isSidechain":false,"message":{"role":"assistant","content":[]}}',
    ].join('\n')
    const out = parseJsonl(text)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ type: 'user' })
    expect(out[1]).toMatchObject({ type: 'assistant' })
  })
})

describe('isRenderableUser', () => {
  test('keeps a real user prompt with string content', () => {
    expect(isRenderableUser({
      type: 'user', isSidechain: false,
      message: { role: 'user', content: 'hello' },
    })).toBe(true)
  })

  test('rejects sidechain user messages', () => {
    expect(isRenderableUser({
      type: 'user', isSidechain: true,
      message: { role: 'user', content: 'sub' },
    })).toBe(false)
  })

  test('rejects synthetic tool_result user messages', () => {
    expect(isRenderableUser({
      type: 'user', isSidechain: false,
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] },
    })).toBe(false)
  })

  test('keeps a user message whose array content has only text', () => {
    expect(isRenderableUser({
      type: 'user', isSidechain: false,
      message: { role: 'user', content: [{ type: 'text', content: 'hi' }] },
    })).toBe(true)
  })

  test('rejects non-user types', () => {
    expect(isRenderableUser({ type: 'system', subtype: 'x' })).toBe(false)
    expect(isRenderableUser({ type: 'summary', summary: 'x', leafUuid: 'y' })).toBe(false)
  })
})

describe('isRenderableAssistant', () => {
  test('keeps a normal assistant message', () => {
    expect(isRenderableAssistant({
      type: 'assistant', isSidechain: false,
      message: { role: 'assistant', content: [] },
    })).toBe(true)
  })
  test('rejects sidechain assistant messages', () => {
    expect(isRenderableAssistant({
      type: 'assistant', isSidechain: true,
      message: { role: 'assistant', content: [] },
    })).toBe(false)
  })
  test('rejects non-assistant types', () => {
    expect(isRenderableAssistant({ type: 'user', isSidechain: false } as any)).toBe(false)
  })
})
```

- [ ] **Step 9.2: Run tests to verify they fail**

```bash
bun test tests/filter.test.ts
```
Expected: import failures.

- [ ] **Step 9.3: Implement `src/filter.ts`**

```ts
// Minimal structural types — we don't depend on claude-hooks' types for the
// predicates because predicates need to accept arbitrary JSON-shaped values
// and narrow them, not just reject the wrong type.

export interface UserMessage {
  type: 'user'
  isSidechain: boolean
  message: {
    role: 'user'
    content: string | Array<{
      type: string
      content?: string
      text?: string
      tool_use_id?: string
    }>
  }
  cwd?: string
  gitBranch?: string
  timestamp?: string
  uuid?: string
}

export interface AssistantMessage {
  type: 'assistant'
  isSidechain: boolean
  message: {
    role: 'assistant'
    model?: string
    content: Array<{
      type: 'text' | 'thinking' | 'tool_use'
      text?: string
      thinking?: string
      name?: string
      input?: Record<string, unknown>
      id?: string
    }>
  }
  cwd?: string
  gitBranch?: string
  timestamp?: string
  uuid?: string
}

export type AnyMessage = UserMessage | AssistantMessage | { type: string; [k: string]: unknown }

export function parseJsonl(text: string): AnyMessage[] {
  const out: AnyMessage[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line) as AnyMessage)
    } catch {
      // skip malformed lines
    }
  }
  return out
}

export function isRenderableUser(m: AnyMessage): m is UserMessage {
  if (m.type !== 'user') return false
  const u = m as UserMessage
  if (u.isSidechain) return false
  const content = u.message?.content
  if (Array.isArray(content)) {
    if (content.some((c) => c?.type === 'tool_result')) return false
  }
  return true
}

export function isRenderableAssistant(m: AnyMessage): m is AssistantMessage {
  if (m.type !== 'assistant') return false
  const a = m as AssistantMessage
  if (a.isSidechain) return false
  return true
}
```

- [ ] **Step 9.4: Run tests to verify they pass**

```bash
bun test tests/filter.test.ts
```
Expected: all tests pass.

- [ ] **Step 9.5: Commit**

```bash
git add plugins/transcript-archiver/src/filter.ts plugins/transcript-archiver/tests/filter.test.ts
git commit -m "feat(filter): JSONL parsing and renderable-message predicates"
```

---

## Task 10: `format.ts` — turn formatting (TDD)

**Files:**
- Test: `plugins/transcript-archiver/tests/format.test.ts`
- Create: `plugins/transcript-archiver/src/format.ts`

- [ ] **Step 10.1: Write the failing test**

`tests/format.test.ts`:
```ts
import { test, expect, describe, beforeAll } from 'bun:test'
import { formatUserTurn, formatAssistantTurn } from '../src/format'
import type { UserMessage, AssistantMessage } from '../src/filter'

beforeAll(() => { process.env.TZ = 'America/New_York' })

describe('formatUserTurn', () => {
  test('string content becomes the body', () => {
    const m: UserMessage = {
      type: 'user', isSidechain: false,
      timestamp: '2026-04-25T15:00:00Z',
      message: { role: 'user', content: 'hello there' },
    }
    expect(formatUserTurn(m)).toBe('## 👤 User — 11:00:00\n\nhello there\n')
  })

  test('array content with text-only joins text segments', () => {
    const m: UserMessage = {
      type: 'user', isSidechain: false,
      timestamp: '2026-04-25T15:00:00Z',
      message: { role: 'user', content: [
        { type: 'text', text: 'first' },
        { type: 'text', text: 'second' },
      ]},
    }
    expect(formatUserTurn(m)).toBe('## 👤 User — 11:00:00\n\nfirst\n\nsecond\n')
  })

  test('image attachment shows marker', () => {
    const m: UserMessage = {
      type: 'user', isSidechain: false,
      timestamp: '2026-04-25T15:00:00Z',
      message: { role: 'user', content: [{ type: 'image' } as any] },
    }
    expect(formatUserTurn(m)).toContain('_[image attached]_')
  })

  test('empty content shows attachment-only marker placeholder', () => {
    const m: UserMessage = {
      type: 'user', isSidechain: false,
      timestamp: '2026-04-25T15:00:00Z',
      message: { role: 'user', content: '' },
    }
    expect(formatUserTurn(m)).toBe('## 👤 User — 11:00:00\n\n_[empty message]_\n')
  })
})

describe('formatAssistantTurn', () => {
  test('text-only assistant turn', () => {
    const m: AssistantMessage = {
      type: 'assistant', isSidechain: false,
      timestamp: '2026-04-25T15:00:05Z',
      message: { role: 'assistant', content: [
        { type: 'text', text: 'I will do X.' },
      ]},
    }
    expect(formatAssistantTurn(m)).toBe('## 🤖 Assistant — 11:00:05\n\nI will do X.\n')
  })

  test('thinking renders as blockquote before text', () => {
    const m: AssistantMessage = {
      type: 'assistant', isSidechain: false,
      timestamp: '2026-04-25T15:00:05Z',
      message: { role: 'assistant', content: [
        { type: 'thinking', thinking: 'Let me think.\nMore thoughts.' },
        { type: 'text', text: 'Here is my answer.' },
      ]},
    }
    expect(formatAssistantTurn(m)).toBe(
      '## 🤖 Assistant — 11:00:05\n\n' +
      '> Let me think.\n> More thoughts.\n\n' +
      'Here is my answer.\n'
    )
  })

  test('tool calls render as italic breadcrumb lines', () => {
    const m: AssistantMessage = {
      type: 'assistant', isSidechain: false,
      timestamp: '2026-04-25T15:00:05Z',
      message: { role: 'assistant', content: [
        { type: 'text', text: 'Reading files.' },
        { type: 'tool_use', name: 'Read', input: { file_path: 'a.ts' } },
        { type: 'tool_use', name: 'Read', input: { file_path: 'b.ts' } },
      ]},
    }
    expect(formatAssistantTurn(m)).toBe(
      '## 🤖 Assistant — 11:00:05\n\n' +
      'Reading files.\n\n' +
      '_[Read a.ts]_\n' +
      '_[Read b.ts]_\n'
    )
  })

  test('tool-call-only turn still gets a heading', () => {
    const m: AssistantMessage = {
      type: 'assistant', isSidechain: false,
      timestamp: '2026-04-25T15:00:05Z',
      message: { role: 'assistant', content: [
        { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
      ]},
    }
    expect(formatAssistantTurn(m)).toBe(
      '## 🤖 Assistant — 11:00:05\n\n' +
      '_[Bash: ls]_\n'
    )
  })
})
```

- [ ] **Step 10.2: Run tests to verify they fail**

```bash
bun test tests/format.test.ts
```
Expected: import failures.

- [ ] **Step 10.3: Implement `src/format.ts`**

```ts
import type { UserMessage, AssistantMessage } from './filter'
import { localTime } from './tz'
import { renderToolBreadcrumb } from './tools'

function userBody(m: UserMessage): string {
  const c = m.message.content
  if (typeof c === 'string') {
    return c.length === 0 ? '_[empty message]_' : c
  }
  const segments: string[] = []
  for (const part of c) {
    if (part.type === 'text') {
      const s = part.text ?? part.content ?? ''
      if (s) segments.push(s)
    } else if (part.type === 'image') {
      segments.push('_[image attached]_')
    } else if (part.type === 'tool_result') {
      // filtered upstream, but keep defensive
      continue
    }
  }
  return segments.length === 0 ? '_[empty message]_' : segments.join('\n\n')
}

export function formatUserTurn(m: UserMessage): string {
  const time = localTime(m.timestamp ?? '')
  return `## 👤 User — ${time}\n\n${userBody(m)}\n`
}

function blockquote(text: string): string {
  return text.split('\n').map((l) => `> ${l}`).join('\n')
}

export function formatAssistantTurn(m: AssistantMessage): string {
  const time = localTime(m.timestamp ?? '')
  const parts = m.message.content
  // Build segments preserving order; group consecutive tool_use into one line each.
  const segments: string[] = []
  for (const p of parts) {
    if (p.type === 'thinking') {
      const t = p.thinking ?? ''
      if (t) segments.push(blockquote(t))
    } else if (p.type === 'text') {
      const t = p.text ?? ''
      if (t) segments.push(t)
    } else if (p.type === 'tool_use') {
      segments.push(renderToolBreadcrumb(p.name ?? 'Tool', p.input ?? {}))
    }
  }
  // Join: tool_use lines should be tight (no blank line between consecutive
  // breadcrumbs), but separate from prose by a blank line.
  const out: string[] = []
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!
    const isCrumb = seg.startsWith('_[') && seg.endsWith(']_')
    const prev = i > 0 ? segments[i - 1] : undefined
    const prevIsCrumb = prev !== undefined && prev.startsWith('_[') && prev.endsWith(']_')
    if (i === 0) {
      out.push(seg)
    } else if (isCrumb && prevIsCrumb) {
      out.push('\n', seg)
    } else {
      out.push('\n\n', seg)
    }
  }
  const body = out.join('')
  return `## 🤖 Assistant — ${time}\n\n${body}\n`
}
```

- [ ] **Step 10.4: Run tests to verify they pass**

```bash
bun test tests/format.test.ts
```
Expected: all tests pass.

- [ ] **Step 10.5: Commit**

```bash
git add plugins/transcript-archiver/src/format.ts plugins/transcript-archiver/tests/format.test.ts
git commit -m "feat(format): user and assistant turn formatting"
```

---

## Task 11: `render.ts` — group + write files (TDD)

**Files:**
- Create: `plugins/transcript-archiver/tests/fixtures/single-day.jsonl`
- Create: `plugins/transcript-archiver/tests/fixtures/cross-midnight.jsonl`
- Create: `plugins/transcript-archiver/tests/fixtures/resumed-with-gap.jsonl`
- Test: `plugins/transcript-archiver/tests/render.test.ts`
- Create: `plugins/transcript-archiver/src/render.ts`

- [ ] **Step 11.1: Create fixture `single-day.jsonl`**

`tests/fixtures/single-day.jsonl` (each line is one JSON object):
```jsonl
{"type":"user","isSidechain":false,"timestamp":"2026-04-25T15:00:00Z","cwd":"/Users/travis/dev/sandbox","gitBranch":"main","message":{"role":"user","content":"hi"}}
{"type":"assistant","isSidechain":false,"timestamp":"2026-04-25T15:00:05Z","cwd":"/Users/travis/dev/sandbox","message":{"role":"assistant","model":"claude-opus-4-7","content":[{"type":"text","text":"hello"}]}}
```

- [ ] **Step 11.2: Create fixture `cross-midnight.jsonl`**

`tests/fixtures/cross-midnight.jsonl` (timestamps chosen so messages span local midnight in `America/New_York`: 2026-04-26T03:50Z = 23:50 EDT on 2026-04-25; 2026-04-26T04:30Z = 00:30 EDT on 2026-04-26):
```jsonl
{"type":"user","isSidechain":false,"timestamp":"2026-04-26T03:50:00Z","cwd":"/Users/travis/dev/sandbox","gitBranch":"main","message":{"role":"user","content":"late night q"}}
{"type":"assistant","isSidechain":false,"timestamp":"2026-04-26T03:50:30Z","cwd":"/Users/travis/dev/sandbox","message":{"role":"assistant","model":"claude-opus-4-7","content":[{"type":"text","text":"late night a"}]}}
{"type":"user","isSidechain":false,"timestamp":"2026-04-26T04:30:00Z","cwd":"/Users/travis/dev/sandbox","message":{"role":"user","content":"after midnight q"}}
{"type":"assistant","isSidechain":false,"timestamp":"2026-04-26T04:30:30Z","cwd":"/Users/travis/dev/sandbox","message":{"role":"assistant","content":[{"type":"text","text":"after midnight a"}]}}
```

- [ ] **Step 11.3: Create fixture `resumed-with-gap.jsonl`**

`tests/fixtures/resumed-with-gap.jsonl` (messages on 2026-04-25 and 2026-04-30 only, both in EDT):
```jsonl
{"type":"user","isSidechain":false,"timestamp":"2026-04-25T15:00:00Z","cwd":"/Users/travis/dev/sandbox","gitBranch":"main","message":{"role":"user","content":"day 1"}}
{"type":"assistant","isSidechain":false,"timestamp":"2026-04-25T15:00:05Z","cwd":"/Users/travis/dev/sandbox","message":{"role":"assistant","model":"claude-opus-4-7","content":[{"type":"text","text":"day 1 reply"}]}}
{"type":"user","isSidechain":false,"timestamp":"2026-04-30T15:00:00Z","cwd":"/Users/travis/dev/sandbox","message":{"role":"user","content":"resumed"}}
{"type":"assistant","isSidechain":false,"timestamp":"2026-04-30T15:00:05Z","cwd":"/Users/travis/dev/sandbox","message":{"role":"assistant","content":[{"type":"text","text":"resumed reply"}]}}
```

- [ ] **Step 11.4: Write the failing test**

`tests/render.test.ts`:
```ts
import { test, expect, describe, beforeAll, beforeEach } from 'bun:test'
import { renderSession } from '../src/render'
import { existsSync, readFileSync, rmSync, mkdtempSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

beforeAll(() => { process.env.TZ = 'America/New_York' })

function setup() {
  const out = mkdtempSync(join(tmpdir(), 'archiver-test-'))
  return {
    outDir: out,
    cleanup: () => rmSync(out, { recursive: true, force: true }),
  }
}

const SESSION_ID = '7a880cf0-8849-4b4f-bd7f-75f8bbfae80d'

describe('single-day session', () => {
  let s: ReturnType<typeof setup>
  beforeEach(() => { s = setup() })

  test('writes one file with expected name and headings', () => {
    renderSession({
      transcriptPath: 'tests/fixtures/single-day.jsonl',
      sessionId: SESSION_ID,
      outDir: s.outDir,
      sessionEndedAt: undefined,
    })
    const files = readdirSync(s.outDir)
    expect(files).toEqual([`2026-04-25_sandbox_${SESSION_ID}.md`])
    const body = readFileSync(join(s.outDir, files[0]!), 'utf8')
    expect(body).toContain('## 👤 User — 11:00:00')
    expect(body).toContain('hi')
    expect(body).toContain('## 🤖 Assistant — 11:00:05')
    expect(body).toContain('hello')
    expect(body).not.toContain('session_ended_at')
    expect(body).not.toContain('continues_into')
    expect(body).not.toContain('continued_from')

    s.cleanup()
  })

  test('SessionEnd adds session_ended_at on the (only) file', () => {
    renderSession({
      transcriptPath: 'tests/fixtures/single-day.jsonl',
      sessionId: SESSION_ID,
      outDir: s.outDir,
      sessionEndedAt: '2026-04-25T15:30:00Z',
    })
    const f = join(s.outDir, `2026-04-25_sandbox_${SESSION_ID}.md`)
    expect(readFileSync(f, 'utf8')).toContain('session_ended_at: 2026-04-25T15:30:00Z')
    s.cleanup()
  })
})

describe('cross-midnight session', () => {
  let s: ReturnType<typeof setup>
  beforeEach(() => { s = setup() })

  test('produces two files with chain markers; no session_ended_at on day 1; no session_ended_at on day 2 unless SessionEnd', () => {
    renderSession({
      transcriptPath: 'tests/fixtures/cross-midnight.jsonl',
      sessionId: SESSION_ID,
      outDir: s.outDir,
      sessionEndedAt: undefined,
    })
    const files = readdirSync(s.outDir).sort()
    expect(files).toEqual([
      `2026-04-25_sandbox_${SESSION_ID}.md`,
      `2026-04-26_sandbox_${SESSION_ID}.md`,
    ])
    const day1 = readFileSync(join(s.outDir, files[0]!), 'utf8')
    const day2 = readFileSync(join(s.outDir, files[1]!), 'utf8')

    expect(day1).toContain('continues_into: 2026-04-26')
    expect(day1).not.toContain('session_ended_at')
    expect(day1).not.toContain('continued_from')
    expect(day1).toContain('_Session continues in [2026-04-26_sandbox_')

    expect(day2).toContain('continued_from: 2026-04-25')
    expect(day2).toContain('original_started_at: 2026-04-26T03:50:00Z')
    expect(day2).not.toContain('session_ended_at')
    expect(day2).not.toContain('continues_into')
    expect(day2).toContain('_Continued from [2026-04-25_sandbox_')
    s.cleanup()
  })

  test('SessionEnd sets session_ended_at on day 2 only', () => {
    renderSession({
      transcriptPath: 'tests/fixtures/cross-midnight.jsonl',
      sessionId: SESSION_ID,
      outDir: s.outDir,
      sessionEndedAt: '2026-04-26T05:00:00Z',
    })
    const day1 = readFileSync(join(s.outDir, `2026-04-25_sandbox_${SESSION_ID}.md`), 'utf8')
    const day2 = readFileSync(join(s.outDir, `2026-04-26_sandbox_${SESSION_ID}.md`), 'utf8')
    expect(day1).not.toContain('session_ended_at')
    expect(day2).toContain('session_ended_at: 2026-04-26T05:00:00Z')
    s.cleanup()
  })
})

describe('resumed session with gap', () => {
  let s: ReturnType<typeof setup>
  beforeEach(() => { s = setup() })

  test('chain markers point across the gap to the next/previous existing file', () => {
    renderSession({
      transcriptPath: 'tests/fixtures/resumed-with-gap.jsonl',
      sessionId: SESSION_ID,
      outDir: s.outDir,
      sessionEndedAt: undefined,
    })
    const files = readdirSync(s.outDir).sort()
    expect(files).toEqual([
      `2026-04-25_sandbox_${SESSION_ID}.md`,
      `2026-04-30_sandbox_${SESSION_ID}.md`,
    ])
    const day1 = readFileSync(join(s.outDir, files[0]!), 'utf8')
    const day5 = readFileSync(join(s.outDir, files[1]!), 'utf8')
    expect(day1).toContain('continues_into: 2026-04-30')
    expect(day5).toContain('continued_from: 2026-04-25')
    s.cleanup()
  })
})

describe('no-renderable-messages safety', () => {
  let s: ReturnType<typeof setup>
  beforeEach(() => { s = setup() })

  test('writes nothing when transcript has only system entries', () => {
    const tmp = join(s.outDir, 'sys-only.jsonl')
    require('node:fs').writeFileSync(tmp, '{"type":"system","subtype":"x"}\n')
    renderSession({
      transcriptPath: tmp,
      sessionId: SESSION_ID,
      outDir: s.outDir,
      sessionEndedAt: undefined,
    })
    // Only the input file remains; no markdown was written.
    expect(readdirSync(s.outDir)).toEqual(['sys-only.jsonl'])
    s.cleanup()
  })
})

describe('idempotency', () => {
  let s: ReturnType<typeof setup>
  beforeEach(() => { s = setup() })

  test('rendering twice produces identical output', () => {
    const args = {
      transcriptPath: 'tests/fixtures/cross-midnight.jsonl',
      sessionId: SESSION_ID,
      outDir: s.outDir,
      sessionEndedAt: undefined,
    }
    renderSession(args)
    const first = readdirSync(s.outDir).sort().map((f) =>
      readFileSync(join(s.outDir, f), 'utf8'))
    renderSession(args)
    const second = readdirSync(s.outDir).sort().map((f) =>
      readFileSync(join(s.outDir, f), 'utf8'))
    expect(second).toEqual(first)
    s.cleanup()
  })
})
```

- [ ] **Step 11.5: Run tests to verify they fail**

```bash
bun test tests/render.test.ts
```
Expected: import failures.

- [ ] **Step 11.6: Implement `src/render.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseJsonl, isRenderableUser, isRenderableAssistant, type AnyMessage, type UserMessage, type AssistantMessage } from './filter'
import { localDate } from './tz'
import { projectSlug } from './slug'
import { buildFrontmatter, type FrontmatterFields } from './frontmatter'
import { formatUserTurn, formatAssistantTurn } from './format'

export interface RenderOptions {
  transcriptPath: string
  sessionId: string
  outDir: string
  sessionEndedAt: string | undefined  // when SessionEnd fired; undefined for Stop
}

type Renderable = UserMessage | AssistantMessage

function firstWithCwd(messages: AnyMessage[]): { cwd: string; gitBranch?: string } | undefined {
  for (const m of messages) {
    const c = (m as any).cwd
    if (typeof c === 'string' && c) {
      return { cwd: c, gitBranch: (m as any).gitBranch }
    }
  }
  return undefined
}

function firstAssistantModel(messages: AnyMessage[]): string | undefined {
  for (const m of messages) {
    if (m.type === 'assistant') {
      const model = (m as AssistantMessage).message?.model
      if (typeof model === 'string') return model
    }
  }
  return undefined
}

function filterRenderable(messages: AnyMessage[]): Renderable[] {
  const out: Renderable[] = []
  for (const m of messages) {
    if (isRenderableUser(m)) out.push(m)
    else if (isRenderableAssistant(m)) out.push(m)
  }
  return out
}

function groupByLocalDate(messages: Renderable[]): Map<string, Renderable[]> {
  const groups = new Map<string, Renderable[]>()
  for (const m of messages) {
    const ts = m.timestamp ?? ''
    if (!ts) continue
    const date = localDate(ts)
    const arr = groups.get(date) ?? []
    arr.push(m)
    groups.set(date, arr)
  }
  return groups
}

function buildBody(messages: Renderable[]): string {
  const chunks: string[] = []
  for (const m of messages) {
    if (m.type === 'user') chunks.push(formatUserTurn(m as UserMessage))
    else chunks.push(formatAssistantTurn(m as AssistantMessage))
  }
  return chunks.join('\n')
}

export function renderSession(opts: RenderOptions): void {
  if (!existsSync(opts.transcriptPath)) {
    console.error(`transcript-archiver: transcript not found at ${opts.transcriptPath}`)
    return
  }

  const text = readFileSync(opts.transcriptPath, 'utf8')
  const all = parseJsonl(text)
  const renderable = filterRenderable(all)
  if (renderable.length === 0) return

  const meta = firstWithCwd(all)
  const cwd = meta?.cwd ?? ''
  const gitBranch = meta?.gitBranch
  const project = projectSlug(cwd)
  const model = firstAssistantModel(all)
  const originalStartedAt = renderable[0]?.timestamp

  const groups = groupByLocalDate(renderable)
  const dates = [...groups.keys()].sort()

  if (!existsSync(opts.outDir)) mkdirSync(opts.outDir, { recursive: true })

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i]!
    const msgs = groups.get(date)!
    const isFirst = i === 0
    const isLast = i === dates.length - 1
    const prevDate = isFirst ? undefined : dates[i - 1]
    const nextDate = isLast ? undefined : dates[i + 1]

    const filename = `${date}_${project}_${opts.sessionId}.md`
    const path = join(opts.outDir, filename)

    const fields: FrontmatterFields = {
      session_id: opts.sessionId,
      project,
      cwd,
      git_branch: gitBranch,
      model,
      started_at: msgs[0]!.timestamp!,
      original_started_at: isFirst ? undefined : originalStartedAt,
      last_updated_at: msgs[msgs.length - 1]!.timestamp!,
      session_ended_at: isLast && opts.sessionEndedAt ? opts.sessionEndedAt : undefined,
      continues_into: nextDate,
      continued_from: prevDate,
    }

    const frontmatter = buildFrontmatter(fields)
    const heading = `# Session — ${date} — ${project}\n\n`
    const continuationTop = prevDate
      ? `_Continued from [${prevDate}_${project}_${opts.sessionId}.md](./${prevDate}_${project}_${opts.sessionId}.md)._\n\n`
      : ''
    const body = buildBody(msgs)
    const continuationBottom = nextDate
      ? `\n---\n\n_Session continues in [${nextDate}_${project}_${opts.sessionId}.md](./${nextDate}_${project}_${opts.sessionId}.md)._\n`
      : ''

    const contents = frontmatter + heading + continuationTop + body + continuationBottom

    try {
      writeFileSync(path, contents, 'utf8')
    } catch (e) {
      console.error(`transcript-archiver: failed to write ${path}: ${(e as Error).message}`)
      // continue to next date
    }
  }
}
```

- [ ] **Step 11.7: Run tests to verify they pass**

```bash
bun test tests/render.test.ts
```
Expected: all tests pass.

- [ ] **Step 11.8: Run the full test suite**

```bash
bun test
```
Expected: all tests across all files pass.

- [ ] **Step 11.9: Commit**

```bash
git add plugins/transcript-archiver/src/render.ts plugins/transcript-archiver/tests/render.test.ts plugins/transcript-archiver/tests/fixtures/
git commit -m "feat(render): group by local date and write per-day session files"
```

---

## Task 12: `entry.ts` — bootstrap and stdin dispatcher

**Files:**
- Replace: `plugins/transcript-archiver/src/entry.ts`
- Test: `plugins/transcript-archiver/tests/entry-bootstrap.test.ts`

- [ ] **Step 12.1: Write a test for the bootstrap helper**

`tests/entry-bootstrap.test.ts`:
```ts
import { test, expect, describe } from 'bun:test'
import { ensureDeps } from '../src/entry'
import { existsSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('ensureDeps', () => {
  test('returns true (no install needed) when node_modules exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ensure-deps-'))
    mkdirSync(join(dir, 'node_modules'))
    expect(ensureDeps(dir)).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  test('returns false when CLAUDE_PLUGIN_ROOT-style path is empty', () => {
    expect(ensureDeps('')).toBe(false)
  })

  test('returns false when path does not exist', () => {
    expect(ensureDeps('/nonexistent/path/that/should/not/exist/zzz')).toBe(false)
  })
})
```

- [ ] **Step 12.2: Run test to verify it fails**

```bash
bun test tests/entry-bootstrap.test.ts
```
Expected: import failures.

- [ ] **Step 12.3: Implement `src/entry.ts`**

Replace the existing no-op contents:

```ts
#!/usr/bin/env bun

import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { homedir } from 'node:os'

export function ensureDeps(pluginRoot: string): boolean {
  if (!pluginRoot) return false
  if (!existsSync(pluginRoot)) return false
  if (existsSync(join(pluginRoot, 'node_modules'))) return true
  const r = spawnSync('bun', ['install', '--silent'], {
    cwd: pluginRoot,
    stdio: 'inherit',
  })
  return r.status === 0
}

interface HookPayload {
  session_id?: string
  transcript_path?: string
  cwd?: string
  hook_event_name?: 'Stop' | 'SessionEnd' | string
}

async function readStdinJson(): Promise<HookPayload | null> {
  try {
    const text = await Bun.stdin.text()
    if (!text.trim()) return null
    return JSON.parse(text) as HookPayload
  } catch (e) {
    console.error(`transcript-archiver: failed to read/parse stdin: ${(e as Error).message}`)
    return null
  }
}

function outputDir(): string {
  return process.env.CLAUDE_TRANSCRIPTS_DIR || join(homedir(), 'claude-transcripts')
}

async function main(): Promise<void> {
  const root = process.env.CLAUDE_PLUGIN_ROOT
  if (!root) {
    console.error('transcript-archiver: CLAUDE_PLUGIN_ROOT is not set; skipping.')
    return
  }
  if (!ensureDeps(root)) {
    console.error('transcript-archiver: dependency install failed; skipping this turn.')
    return
  }

  const payload = await readStdinJson()
  if (!payload) return

  const event = payload.hook_event_name
  if (event !== 'Stop' && event !== 'SessionEnd') {
    // Ignore unexpected events.
    return
  }
  if (!payload.session_id || !payload.transcript_path) {
    console.error('transcript-archiver: missing session_id or transcript_path; skipping.')
    return
  }

  const sessionEndedAt = event === 'SessionEnd' ? new Date().toISOString() : undefined

  // Lazy-import render so the bootstrap can run before claude-hooks is installed.
  const { renderSession } = await import('./render')

  try {
    renderSession({
      transcriptPath: payload.transcript_path,
      sessionId: payload.session_id,
      outDir: outputDir(),
      sessionEndedAt,
    })
  } catch (e) {
    console.error(`transcript-archiver: render failed: ${(e as Error).message}`)
  }
}

// Entrypoint guard — only run main() when invoked directly, not when imported by tests.
if (import.meta.main) {
  main()
    .catch((e) => {
      console.error(`transcript-archiver: unexpected error: ${(e as Error).message}`)
    })
    .finally(() => process.exit(0))
}
```

- [ ] **Step 12.4: Run bootstrap test to verify it passes**

```bash
bun test tests/entry-bootstrap.test.ts
```
Expected: 3 pass.

- [ ] **Step 12.5: Run the full test suite**

```bash
bun test
```
Expected: all tests pass.

- [ ] **Step 12.6: Smoke test the entry script end-to-end**

Create `/tmp/archiver-smoke/`:
```bash
mkdir -p /tmp/archiver-smoke/out
cp plugins/transcript-archiver/tests/fixtures/single-day.jsonl /tmp/archiver-smoke/transcript.jsonl
```

Invoke entry.ts as Claude Code would (stdin = hook payload, env carries plugin root + transcripts dir):
```bash
CLAUDE_PLUGIN_ROOT="$PWD/plugins/transcript-archiver" \
CLAUDE_TRANSCRIPTS_DIR=/tmp/archiver-smoke/out \
TZ=America/New_York \
echo '{"session_id":"smoke-1","transcript_path":"/tmp/archiver-smoke/transcript.jsonl","cwd":"/Users/travis/dev/sandbox","hook_event_name":"Stop"}' \
  | bun plugins/transcript-archiver/src/entry.ts
echo "exit=$?"
ls /tmp/archiver-smoke/out
```

Expected: `exit=0` and one file `2026-04-25_sandbox_smoke-1.md` in the output directory. Inspect with `cat`:
```bash
cat /tmp/archiver-smoke/out/2026-04-25_sandbox_smoke-1.md
```
The file should have the front matter and a User/Assistant heading pair. Clean up:
```bash
rm -rf /tmp/archiver-smoke
```

- [ ] **Step 12.7: Commit**

```bash
git add plugins/transcript-archiver/src/entry.ts plugins/transcript-archiver/tests/entry-bootstrap.test.ts
git commit -m "feat(entry): stdin dispatcher with bootstrap and Stop/SessionEnd handling"
```

---

## Task 13: Edge-case fixtures and tests (TDD additions)

This task adds fixtures for edge cases the spec calls out: thinking blocks, attachments, sidechain (subagent) traffic, summary entries, and a session whose first user message is a slash command.

**Files:**
- Create: `plugins/transcript-archiver/tests/fixtures/thinking.jsonl`
- Create: `plugins/transcript-archiver/tests/fixtures/sidechain.jsonl`
- Create: `plugins/transcript-archiver/tests/fixtures/with-summary.jsonl`
- Create: `plugins/transcript-archiver/tests/fixtures/slash-command.jsonl`
- Create: `plugins/transcript-archiver/tests/fixtures/all-tools.jsonl`
- Modify: `plugins/transcript-archiver/tests/render.test.ts` (append new describe blocks)

- [ ] **Step 13.1: Create `thinking.jsonl` fixture**

`tests/fixtures/thinking.jsonl`:
```jsonl
{"type":"user","isSidechain":false,"timestamp":"2026-04-25T15:00:00Z","cwd":"/Users/travis/dev/sandbox","message":{"role":"user","content":"explain"}}
{"type":"assistant","isSidechain":false,"timestamp":"2026-04-25T15:00:05Z","cwd":"/Users/travis/dev/sandbox","message":{"role":"assistant","content":[{"type":"thinking","thinking":"line one\nline two"},{"type":"text","text":"my answer"}]}}
```

- [ ] **Step 13.2: Create `sidechain.jsonl` fixture**

`tests/fixtures/sidechain.jsonl`:
```jsonl
{"type":"user","isSidechain":false,"timestamp":"2026-04-25T15:00:00Z","cwd":"/Users/travis/dev/sandbox","message":{"role":"user","content":"main"}}
{"type":"assistant","isSidechain":false,"timestamp":"2026-04-25T15:00:05Z","cwd":"/Users/travis/dev/sandbox","message":{"role":"assistant","content":[{"type":"text","text":"main reply"},{"type":"tool_use","name":"Task","input":{"subagent_type":"Explore","prompt":"x"}}]}}
{"type":"user","isSidechain":true,"timestamp":"2026-04-25T15:00:06Z","cwd":"/Users/travis/dev/sandbox","message":{"role":"user","content":"sub prompt"}}
{"type":"assistant","isSidechain":true,"timestamp":"2026-04-25T15:00:07Z","cwd":"/Users/travis/dev/sandbox","message":{"role":"assistant","content":[{"type":"text","text":"sub reply"}]}}
{"type":"user","isSidechain":false,"timestamp":"2026-04-25T15:00:08Z","cwd":"/Users/travis/dev/sandbox","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"sub result"}]}}
{"type":"assistant","isSidechain":false,"timestamp":"2026-04-25T15:00:09Z","cwd":"/Users/travis/dev/sandbox","message":{"role":"assistant","content":[{"type":"text","text":"final"}]}}
```

- [ ] **Step 13.3: Create `with-summary.jsonl` fixture**

`tests/fixtures/with-summary.jsonl`:
```jsonl
{"type":"summary","summary":"compaction artifact","leafUuid":"x"}
{"type":"user","isSidechain":false,"timestamp":"2026-04-25T15:00:00Z","cwd":"/Users/travis/dev/sandbox","message":{"role":"user","content":"hi"}}
{"type":"assistant","isSidechain":false,"timestamp":"2026-04-25T15:00:05Z","cwd":"/Users/travis/dev/sandbox","message":{"role":"assistant","content":[{"type":"text","text":"hello"}]}}
```

- [ ] **Step 13.4: Create `slash-command.jsonl` fixture**

`tests/fixtures/slash-command.jsonl`:
```jsonl
{"type":"user","isSidechain":false,"timestamp":"2026-04-25T15:00:00Z","cwd":"/Users/travis/dev/sandbox","message":{"role":"user","content":"/superpowers:brainstorming I want to build X"}}
{"type":"assistant","isSidechain":false,"timestamp":"2026-04-25T15:00:05Z","cwd":"/Users/travis/dev/sandbox","message":{"role":"assistant","content":[{"type":"text","text":"sure"}]}}
```

- [ ] **Step 13.5: Create `all-tools.jsonl` fixture**

`tests/fixtures/all-tools.jsonl`:
```jsonl
{"type":"user","isSidechain":false,"timestamp":"2026-04-25T15:00:00Z","cwd":"/Users/travis/dev/sandbox","message":{"role":"user","content":"do everything"}}
{"type":"assistant","isSidechain":false,"timestamp":"2026-04-25T15:00:05Z","cwd":"/Users/travis/dev/sandbox","message":{"role":"assistant","content":[{"type":"tool_use","name":"Read","input":{"file_path":"a.ts"}},{"type":"tool_use","name":"Bash","input":{"command":"echo hi"}},{"type":"tool_use","name":"Grep","input":{"pattern":"TODO"}},{"type":"tool_use","name":"WebFetch","input":{"url":"https://x.com"}},{"type":"tool_use","name":"Task","input":{"subagent_type":"Explore"}},{"type":"tool_use","name":"TodoWrite","input":{"todos":[]}},{"type":"tool_use","name":"mcp__claude_ai_Gmail__authenticate","input":{}}]}}
```

- [ ] **Step 13.6: Append new describe blocks to `tests/render.test.ts`**

Append at the bottom of the file:
```ts
describe('thinking blocks render as blockquote', () => {
  let s: ReturnType<typeof setup>
  beforeEach(() => { s = setup() })
  test('blockquote precedes the text', () => {
    renderSession({
      transcriptPath: 'tests/fixtures/thinking.jsonl',
      sessionId: SESSION_ID,
      outDir: s.outDir,
      sessionEndedAt: undefined,
    })
    const f = readdirSync(s.outDir)[0]!
    const body = readFileSync(join(s.outDir, f), 'utf8')
    expect(body).toContain('> line one\n> line two')
    expect(body).toContain('my answer')
    s.cleanup()
  })
})

describe('sidechain traffic excluded', () => {
  let s: ReturnType<typeof setup>
  beforeEach(() => { s = setup() })
  test('subagent prompts and replies are not rendered', () => {
    renderSession({
      transcriptPath: 'tests/fixtures/sidechain.jsonl',
      sessionId: SESSION_ID,
      outDir: s.outDir,
      sessionEndedAt: undefined,
    })
    const f = readdirSync(s.outDir)[0]!
    const body = readFileSync(join(s.outDir, f), 'utf8')
    expect(body).not.toContain('sub prompt')
    expect(body).not.toContain('sub reply')
    expect(body).not.toContain('sub result')
    expect(body).toContain('main reply')
    expect(body).toContain('_[Agent: Explore]_')
    expect(body).toContain('final')
    s.cleanup()
  })
})

describe('summary entries excluded', () => {
  let s: ReturnType<typeof setup>
  beforeEach(() => { s = setup() })
  test('summary lines are silently dropped', () => {
    renderSession({
      transcriptPath: 'tests/fixtures/with-summary.jsonl',
      sessionId: SESSION_ID,
      outDir: s.outDir,
      sessionEndedAt: undefined,
    })
    const f = readdirSync(s.outDir)[0]!
    const body = readFileSync(join(s.outDir, f), 'utf8')
    expect(body).not.toContain('compaction artifact')
    expect(body).toContain('hi')
    expect(body).toContain('hello')
    s.cleanup()
  })
})

describe('slash command preserved literally', () => {
  let s: ReturnType<typeof setup>
  beforeEach(() => { s = setup() })
  test('user prompt rendered as typed', () => {
    renderSession({
      transcriptPath: 'tests/fixtures/slash-command.jsonl',
      sessionId: SESSION_ID,
      outDir: s.outDir,
      sessionEndedAt: undefined,
    })
    const f = readdirSync(s.outDir)[0]!
    const body = readFileSync(join(s.outDir, f), 'utf8')
    expect(body).toContain('/superpowers:brainstorming I want to build X')
    s.cleanup()
  })
})

describe('all tool kinds render with correct breadcrumbs', () => {
  let s: ReturnType<typeof setup>
  beforeEach(() => { s = setup() })
  test('one breadcrumb per tool, in order', () => {
    renderSession({
      transcriptPath: 'tests/fixtures/all-tools.jsonl',
      sessionId: SESSION_ID,
      outDir: s.outDir,
      sessionEndedAt: undefined,
    })
    const f = readdirSync(s.outDir)[0]!
    const body = readFileSync(join(s.outDir, f), 'utf8')
    expect(body).toContain('_[Read a.ts]_')
    expect(body).toContain('_[Bash: echo hi]_')
    expect(body).toContain('_[Grep "TODO"]_')
    expect(body).toContain('_[WebFetch https://x.com]_')
    expect(body).toContain('_[Agent: Explore]_')
    expect(body).toContain('_[TodoWrite]_')
    expect(body).toContain('_[claude_ai_Gmail: authenticate]_')
    s.cleanup()
  })
})
```

- [ ] **Step 13.7: Run the full suite**

```bash
bun test
```
Expected: all tests pass (existing + 5 new describe blocks).

- [ ] **Step 13.8: Commit**

```bash
git add plugins/transcript-archiver/tests/fixtures/ plugins/transcript-archiver/tests/render.test.ts
git commit -m "test: edge-case fixtures and rendering coverage"
```

---

## Task 14: Plugin README

**Files:**
- Modify: `plugins/transcript-archiver/README.md`

- [ ] **Step 14.1: Replace the README stub with full docs**

Overwrite `plugins/transcript-archiver/README.md`:

````markdown
# transcript-archiver

A Claude Code plugin that mirrors each session's conversation as a
human-readable Markdown file.

- Records your prompts and the assistant's replies (including thinking,
  rendered as a blockquote).
- Leaves a one-line breadcrumb wherever a tool was used (e.g.,
  `_[Read package.json]_`, `_[Bash: npm test]_`) — never the full args
  or results.
- Excludes subagent traffic and system entries.
- Splits cross-midnight sessions into one file per local-time date,
  linked via `continues_into` / `continued_from` front-matter markers.
- Always exits 0 — a transcript bug never blocks your session.

## Requirements

- [Bun](https://bun.sh) installed and on `PATH`.

## Install

```
/plugin marketplace add travisallendotdev/claude-plugins
/plugin install transcript-archiver@travisallendotdev
```

On the first hook invocation after install, the plugin will run
`bun install` once in its own directory to fetch its sole dependency
(`claude-hooks`, used for typed payload schemas). This adds a few hundred
milliseconds to the first turn only.

## Configuration

Set the output directory via the `CLAUDE_TRANSCRIPTS_DIR` environment variable
(in your shell rc):

```sh
export CLAUDE_TRANSCRIPTS_DIR="$HOME/Documents/claude-transcripts"
```

Default: `$HOME/claude-transcripts`. The directory is created if it does not
exist.

## Output

One file per `(local-date, session)` pair, flat in the configured directory:

```
$CLAUDE_TRANSCRIPTS_DIR/
  2026-04-25_sandbox_7a880cf0-8849-4b4f-bd7f-75f8bbfae80d.md
  2026-04-26_sandbox_7a880cf0-8849-4b4f-bd7f-75f8bbfae80d.md  # session crossed midnight
```

Each file has YAML front matter with `session_id`, `project`, `cwd`,
`git_branch`, `model`, `started_at`, `last_updated_at`, and (when
applicable) `session_ended_at`, `continues_into`, `continued_from`,
`original_started_at`.

## Hooks used

- `Stop` — fires after every assistant turn; rebuilds the markdown for the
  whole session (idempotent).
- `SessionEnd` — fires when the session terminates; same as Stop, plus
  writes `session_ended_at` on the final file.

## Failure policy

The hook always exits 0. If anything goes wrong (no Bun, bun install fails,
output dir not writable, transcript file missing, etc.) the error is logged
to stderr and the session continues normally.

## Uninstall

```
/plugin uninstall transcript-archiver@travisallendotdev
```

Existing markdown files are left in place.
````

- [ ] **Step 14.2: Commit**

```bash
git add plugins/transcript-archiver/README.md
git commit -m "docs: full README for transcript-archiver plugin"
```

---

## Task 15: Final verification

This task validates the whole plugin in a realistic end-to-end scenario.

- [ ] **Step 15.1: Run the full test suite one more time**

Run from `plugins/transcript-archiver/`:
```bash
bun test
```
Expected: all tests pass.

- [ ] **Step 15.2: Type-check the source**

Run from `plugins/transcript-archiver/`:
```bash
bunx tsc --noEmit
```
Expected: no TypeScript errors.

- [ ] **Step 15.3: Run the plugin against a real Claude Code transcript**

Pick a recent transcript from `~/.claude/projects/` and dry-run the entry
script directly:

```bash
TRANSCRIPT=$(ls -t ~/.claude/projects/-Users-travis-dev/*.jsonl 2>/dev/null | head -1)
[ -n "$TRANSCRIPT" ] || { echo "no transcript found; pick one manually"; }

mkdir -p /tmp/archiver-real-test
PAYLOAD=$(cat <<EOF
{"session_id":"realtest-$(uuidgen)","transcript_path":"${TRANSCRIPT}","cwd":"/Users/travis/dev","hook_event_name":"Stop"}
EOF
)
echo "$PAYLOAD" | \
  CLAUDE_PLUGIN_ROOT="$PWD/plugins/transcript-archiver" \
  CLAUDE_TRANSCRIPTS_DIR=/tmp/archiver-real-test \
  bun plugins/transcript-archiver/src/entry.ts
echo "exit=$?"
ls -la /tmp/archiver-real-test/
```

Expected: `exit=0` and at least one `.md` file in `/tmp/archiver-real-test/`.
Open the file and verify it reads naturally — prompts, replies, thinking
blockquotes (if any), tool breadcrumbs.

```bash
ls /tmp/archiver-real-test/*.md | head -1 | xargs head -80
```

Clean up:
```bash
rm -rf /tmp/archiver-real-test
```

- [ ] **Step 15.4: Test install in a sandbox Claude Code session**

If you have a non-critical project handy, install the plugin locally with
the `--plugin-dir` flag and run a one-prompt session:

```bash
cd /tmp && mkdir test-archiver-install && cd test-archiver-install
claude --plugin-dir /Users/travis/dev/ai-agents/plugins/plugins/transcript-archiver
```

Inside the session, send a short prompt ("hi"). Exit. Verify a file appeared
in `~/claude-transcripts/`:
```bash
ls -la ~/claude-transcripts/ | head
```

- [ ] **Step 15.5: Tag the release**

```bash
git tag v0.1.0
```

- [ ] **Step 15.6: Final commit if anything changed during verification**

If verification surfaced any small fixes, commit them with a focused
message. Otherwise no commit needed.

- [ ] **Step 15.7: Push to GitHub when ready**

The plan does not push automatically — Travis will push manually when ready
to publish:
```bash
git remote add origin git@github.com:travisallendotdev/claude-plugins.git
git push -u origin main --tags
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Implementing task(s) |
|---|---|
| Marketplace + plugin scaffold | 1, 2 |
| Bun + TypeScript setup, dependencies | 3 |
| Hook registration (Stop, SessionEnd) | 4 |
| Bootstrap (lazy `bun install`) | 12 |
| Output filename (`<date>_<project>_<session>.md`) | 11 |
| `CLAUDE_TRANSCRIPTS_DIR` env var with default | 12 |
| Local-time date/time | 6, 11 |
| Project slug | 5 |
| Front matter fields and mutual-exclusion rules | 8, 11 |
| Cross-day file split | 11, 13 |
| Resume-with-gap chain markers | 11, 13 |
| Continuation body markers (`_Continued from..._`, `_Session continues in..._`) | 11 |
| Filtering (sidechain, system, summary, tool_result) | 9, 13 |
| User turn rendering (string + array content, slash commands literal) | 10, 13 |
| Assistant turn rendering (text, thinking blockquote, tool breadcrumbs) | 10, 13 |
| Per-tool target-arg rules (file_path, command/80-char, pattern, url, etc.) | 7 |
| MCP tool rendering | 7, 13 |
| Bash truncation to 80 chars with `…` | 7 |
| Image / paste attachments | 10 |
| Empty assistant turn (only tool calls) | 10 |
| Compaction (summary skipped) | 13 |
| Idempotent rebuild | 11 |
| Always exit 0 (failure policy) | 12 |
| `transcript_path` missing or not on disk | 11, 12 |
| Zero renderable messages | 11 |
| README documentation | 14 |
| End-to-end verification | 15 |

No gaps.

**Placeholder scan:** none of the "TBD/TODO/implement later/handle edge cases" patterns appear. Every code step contains complete code; every command step has expected output.

**Type consistency:**
- `RenderOptions` (entry.ts → render.ts): `{ transcriptPath, sessionId, outDir, sessionEndedAt }` — same fields used in both Task 11 (definition + tests) and Task 12 (caller).
- `FrontmatterFields` (Task 8 definition) is consumed verbatim in Task 11.
- `UserMessage`/`AssistantMessage`/`AnyMessage` (Task 9) are the types used in Task 10 (`format.ts`) and Task 11 (`render.ts`).
- Function names: `renderSession`, `renderToolBreadcrumb`, `buildFrontmatter`, `formatUserTurn`, `formatAssistantTurn`, `localDate`, `localTime`, `projectSlug`, `parseJsonl`, `isRenderableUser`, `isRenderableAssistant`, `ensureDeps` — each defined exactly once and referenced by that exact name in subsequent tasks.

No inconsistencies found.
