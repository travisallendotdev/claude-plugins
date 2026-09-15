---
title: Transcript Archiver Plugin — Design
date: 2026-04-25
status: approved
---

# Transcript Archiver Plugin — Design

## Goal

A Claude Code plugin, distributed via a personal plugin marketplace, that
persists each session's conversation as a readable Markdown file. Records the
user's prompts and the assistant's natural-language replies (including
thinking, as a blockquote) and leaves a one-line breadcrumb wherever a tool
was used. Output directory is configurable via an environment variable.

## Motivation

The native session JSONL at
`~/.claude/projects/<encoded-cwd>/<session-id>.jsonl` contains everything but
is not human-friendly: it interleaves user prompts, assistant text, thinking
blocks, tool calls, tool results, hook outputs, system reminders, and
sidechain (subagent) traffic. Reading a past session means scrolling through
hundreds of KB of mixed content. A Markdown mirror filtered to "what I said
and what the assistant said" is far more useful for review and reference.

## Non-Goals

- Replacing or modifying the native JSONL transcripts (read-only consumer).
- Capturing tool arguments, results, or subagent transcripts in detail.
- Cross-machine sync, web UI, search index, or any post-processing UI.
- Supporting platforms other than macOS/Linux with Bun installed.

## User-Facing Behavior

### Installation

```text
/plugin marketplace add travisallendotdev/claude-plugins
/plugin install transcript-archiver@travisallendotdev
```

(Optional) override the output directory:

```sh
export CLAUDE_TRANSCRIPTS_DIR="$HOME/Documents/claude-transcripts"
```

Default: `$HOME/claude-transcripts`.

### Hard Requirements

- **Bun** installed and on `PATH`. The plugin invokes `bun` directly. If Bun
  is missing, hooks fail with "command not found" surfaced in Claude Code's
  hook stderr; the conversation is not blocked.

### Output Layout

One file per `(local-date, session)` pair, flat in the configured output
directory:

```
$CLAUDE_TRANSCRIPTS_DIR/
  2026-04-25_sandbox_7a880cf0-8849-4b4f-bd7f-75f8bbfae80d.md
  2026-04-26_sandbox_7a880cf0-8849-4b4f-bd7f-75f8bbfae80d.md  # session crossed midnight
  2026-04-25_my-other-project_3c1a....md
```

- **Date** is the **local-time** date of the messages in that file, where
  "local" means the system timezone of the machine running the hook (the
  `TZ` env var if set, otherwise the OS default). A session that crosses
  local midnight is split into one file per active date.
- **Project slug** is `basename(cwd)` lowercased, with characters outside
  `[a-z0-9-]` replaced by `-`.
- **Session ID** is the full UUID; ensures uniqueness across same-day sessions
  in the same project.

### File Structure

YAML front matter followed by chronologically-ordered turn headings.

```markdown
---
session_id: 7a880cf0-8849-4b4f-bd7f-75f8bbfae80d
project: sandbox
cwd: /Users/travis/dev/ai-agents/sandbox
git_branch: main
model: claude-opus-4-7
started_at: 2026-04-25T23:07:54Z
last_updated_at: 2026-04-25T23:42:11Z
session_ended_at: 2026-04-25T23:55:02Z   # only present when session has truly ended
---

# Session — 2026-04-25 — sandbox

## 👤 User — 23:07:54

How do I add a new endpoint to the API?

## 🤖 Assistant — 23:07:58

> Let me check the existing routing setup first to match the project's conventions.

I'll add the endpoint at `src/routes/users.ts`. Here's what I'm doing.

_[Read src/routes/index.ts]_
_[Read src/routes/users.ts]_
_[Edit src/routes/users.ts]_

The new `GET /users/:id` route is wired up. Tests pass.
```

### Front-Matter Field Rules

| Field | Always present | Notes |
|---|---|---|
| `session_id` | yes | Full UUID |
| `project` | yes | Slugified `basename(cwd)` |
| `cwd` | yes | From the first JSONL entry in the session that carries a `cwd` field |
| `git_branch` | when present | From JSONL message metadata |
| `model` | when present | From the first assistant message |
| `started_at` | yes | UTC ISO of the **first message in this file** |
| `original_started_at` | only on continuation files | UTC ISO of the **first message of the entire session** (so day-2+ files preserve the absolute origin) |
| `last_updated_at` | yes | UTC ISO of the most recent message in this file |
| `session_ended_at` | **mutually exclusive with `continues_into`** | Only set on the final file in the chain, and only after `SessionEnd` actually fires. The Claude Code SessionEnd payload does not carry a timestamp; the renderer uses the wall-clock time at hook invocation (`new Date().toISOString()`) — within seconds of when the session actually ended. Never a synthetic day-boundary value. |
| `continues_into` | only when next-date file exists | The local date (YYYY-MM-DD) of the next file in the chain. Mutually exclusive with `session_ended_at`. |
| `continued_from` | only when previous-date file exists | The local date (YYYY-MM-DD) of the previous file in the chain. Independent of the above. |

### Mutual-Exclusion Rules for Session State

Per file, exactly one of the following situations holds:

| Situation | `session_ended_at` | `continues_into` |
|---|---|---|
| Last file in chain, `SessionEnd` has fired | real timestamp | absent |
| Last file in chain, only `Stop` has fired (still active) | absent | absent |
| File continues into another date | absent | next date |

`continued_from` is independent and present on every file except the first.

### Cross-Day & Resume Behavior

- The renderer always rebuilds the **entire chain** of files for a session on
  every hook invocation. So a `Stop` on day 2 also rewrites day 1's file to
  add `continues_into` and the trailing continuation note.
- `continues_into` / `continued_from` link to the **next/previous file that
  actually exists**, not the next calendar day. A session resumed five days
  later produces two files (day 1, day 6) with the chain pointing across the
  gap. No empty placeholder files for inactive days.
- Each continuation file gets a body marker:
  - Top of day-2+ files: `_Continued from [<prev>.md](./<prev>.md)._`
  - Bottom of day-1/N (when not the last) files: `_Session continues in [<next>.md](./<next>.md)._`

## Architecture

### Marketplace Repo Layout

```
claude-plugins/                                # GitHub repo
├── .claude-plugin/
│   └── marketplace.json                       # marketplace manifest
├── README.md                                  # marketplace install instructions
└── plugins/
    └── transcript-archiver/                   # the plugin
        ├── .claude-plugin/
        │   └── plugin.json                    # plugin manifest
        ├── hooks/
        │   └── hooks.json                     # registers Stop + SessionEnd
        ├── src/
        │   ├── entry.ts                       # stdin dispatcher; lazy bootstrap
        │   ├── render.ts                      # JSONL → markdown
        │   └── tools.ts                       # per-tool target-arg rules
        ├── package.json                       # bun dependencies
        ├── tsconfig.json
        └── README.md                          # plugin-specific docs
```

### `.claude-plugin/marketplace.json`

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

### `plugins/transcript-archiver/.claude-plugin/plugin.json`

```json
{
  "name": "transcript-archiver",
  "description": "Persist Claude Code session transcripts as readable markdown. Configurable output via $CLAUDE_TRANSCRIPTS_DIR.",
  "version": "0.1.0",
  "author": { "name": "Travis Allen" }
}
```

### `hooks/hooks.json`

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

Both events route to the same script; `entry.ts` branches on
`hook_event_name` from the stdin JSON payload.

### Bootstrap (top of `entry.ts`)

```ts
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const root = process.env.CLAUDE_PLUGIN_ROOT
if (!root) {
  console.error('transcript-archiver: CLAUDE_PLUGIN_ROOT is not set; skipping.')
  process.exit(0)
}
if (!existsSync(`${root}/node_modules`)) {
  const r = spawnSync('bun', ['install', '--silent'], { cwd: root, stdio: 'inherit' })
  if (r.status !== 0) {
    console.error('transcript-archiver: bun install failed; skipping this turn.')
    process.exit(0)
  }
}
```

Runs once on the first hook invocation after install (a few hundred ms),
then never again. No README "first-run setup" step required.

### Dependencies

`package.json` declares one runtime dependency: **`claude-hooks`**
(<https://github.com/johnlindquist/claude-hooks>). The plugin uses it
primarily for typed payload and transcript message types
(`StopPayload`, `TranscriptMessage`, `TranscriptUserMessage`,
`TranscriptAssistantMessage`). The library does **not** export a
`SessionEnd` handler, so `entry.ts` does its own stdin parsing rather than
calling `runHook` — the library is used as a typed schema, not a runtime
dispatcher.

## Renderer Specification

### Filtering

Walk the JSONL in order; **include** only:

- `type: 'user'` with `isSidechain: false` — user prompts
- `type: 'assistant'` with `isSidechain: false` — assistant turns

**Exclude:**

- `type: 'system'` (informational, hook-success, etc.)
- `type: 'summary'` (compaction artifacts)
- Any message with `isSidechain: true` (subagent traffic)
- `attachment` entries (but their existence is noted on the parent message;
  see "Attachments" below)
- `permission-mode` entries

### User Turn Rendering

```markdown
## 👤 User — HH:MM:SS

<message text>
```

- Time is `HH:MM:SS` in **local time**.
- Slash commands are rendered **literally as typed**:
  `/superpowers:brainstorming I want to create a plugin marketplace...`
- Tool-result user messages (the synthetic user messages that wrap tool
  output) are filtered out — they are not real user prompts.
- A user message with no text (paste-only or image-only) renders just the
  attachment marker (see below).

### Assistant Turn Rendering

```markdown
## 🤖 Assistant — HH:MM:SS

> <thinking, if any, as a blockquote>

<text content>

_[ToolName: <target>]_
_[ToolName: <target>]_

<more text content>
```

Per-message ordering preserves the JSONL order of content blocks within the
assistant message:

- `thinking` blocks → blockquote (`> `, with `\n> ` between lines) at the
  natural position they occur. In practice models emit thinking before any
  text; if multiple thinking blocks appear interleaved with text, each is
  rendered in place.
- `text` blocks → rendered as-is (no escaping; the source is already
  Markdown-friendly).
- `tool_use` blocks → one italic line per call. Consecutive tool calls each
  get their own line.

An assistant turn that contains only tool calls (no text or thinking) still
gets a heading and the breadcrumbs.

### Per-Tool Target-Arg Rules (`tools.ts`)

| Tool | Rendered as | Target source |
|---|---|---|
| `Read` | `_[Read <file_path>]_` | `input.file_path` |
| `Write` | `_[Write <file_path>]_` | `input.file_path` |
| `Edit` | `_[Edit <file_path>]_` | `input.file_path` |
| `NotebookEdit` | `_[NotebookEdit <notebook_path>]_` | `input.notebook_path` |
| `Bash` | `_[Bash: <command>]_` | `input.command`, truncated to 80 characters **total** with a trailing `…` if longer (so the rendered string is at most `_[Bash: ` + 80 chars + `]_`) |
| `Grep` | `_[Grep "<pattern>"]_` | `input.pattern` |
| `Glob` | `_[Glob <pattern>]_` | `input.pattern` |
| `WebFetch` | `_[WebFetch <url>]_` | `input.url` |
| `WebSearch` | `_[WebSearch "<query>"]_` | `input.query` |
| `Task` / `Agent` | `_[Agent: <subagent_type>]_` | `input.subagent_type` |
| `TodoWrite`, `TaskCreate`, `TaskUpdate`, `TaskList`, `TaskGet`, `TaskOutput`, `TaskStop` | `_[<ToolName>]_` | none — too noisy |
| `mcp__<server>__<tool>` | `_[<server>: <tool>]_` — strip the leading `mcp__`, split on the next `__` (server name vs tool name); preserve any underscores inside the server-name segment as-is. Example: `mcp__claude_ai_Gmail__authenticate` → `_[claude_ai_Gmail: authenticate]_`. | none |
| any other tool | `_[<ToolName>]_` | none |

Targets are HTML-safe and underscore characters are not escaped (Markdown
italic does not need escaping for underscores inside `_[ ]_`).

### Attachments

Where the JSONL records an image attachment on a user message
(`type: 'image'` content part), the renderer emits `_[image attached]_` in
place of the missing text or appended after the text.

Pasted text blocks are handled by Claude Code as inline text content (the
paste is included verbatim in the user message), so no separate marker is
needed — the paste appears as normal user prose. (A future version may
detect `~/.claude/paste-cache/` references and emit `_[pasted N lines]_`
if Claude Code begins surfacing pastes as a distinct content block type.)

### Compaction

Pre- and post-compact messages render normally; the `summary` JSONL entry is
filtered out, so compactions are invisible in the output. (This is fine: the
compaction does not change what the user said or what the assistant
replied.)

### Date Divider

Not needed under the per-day file split — every file contains exactly one
local date, so headings stay `HH:MM:SS` and never become ambiguous.

## Hook Event Handling

### `Stop` (after every assistant turn)

1. Parse stdin → `{ session_id, transcript_path, cwd, ... }`.
2. Read `transcript_path` (full file).
3. Group filtered messages by local-date.
4. For each date, write `<date>_<project>_<session-id>.md` per the rules
   above. Set `continues_into` / `continued_from` markers on non-terminal
   files. **Do not** set `session_ended_at` on any file (Stop ≠ end).
5. Exit 0.

### `SessionEnd`

1. Parse stdin → `{ session_id, transcript_path, cwd, ... }`.
2. Same rebuild as Stop, with one addition: the **final** file in the chain
   gets `session_ended_at: <SessionEnd payload timestamp>`.
3. Exit 0.

### Idempotency

Both events produce identical output for completed turns, given identical
input. There is no incremental state to manage. The Stop hook is "good
enough" alone; SessionEnd just adds the final-end marker.

## Failure Policy

**Always exit 0.** A transcript-archiver bug must never block a Claude Code
session. Concretely:

| Case | Behavior |
|---|---|
| `bun install` fails | Log to stderr, exit 0. Next session retries. |
| `bun` not on PATH | Hook fails with "command not found" (before our code runs). README states Bun as a hard requirement. |
| `$CLAUDE_TRANSCRIPTS_DIR` does not exist | Created with `mkdir -p` on first write. |
| Output dir not writable | Log to stderr, exit 0. |
| Transcript JSONL malformed line | Per-line try/parse; skip unparseable lines, render the rest. |
| Transcript JSONL not yet flushed when Stop fires | Last message may be missing this turn; idempotent rebuild self-heals on next Stop. |
| First message has no text (paste/image only) | Filename and rendering still work; user body shows attachment marker. |
| Empty assistant turn (only tool calls) | Heading rendered, breadcrumbs only. |
| Compact happens mid-session | `type: 'summary'` filtered; pre/post-compact messages render normally. |
| Concurrent hook invocations | Last-writer-wins; both invocations produce identical output for completed turns. |
| `claude --resume`'d session | JSONL appends; renderer treats it identically; cross-day-with-gap rules handle it. |
| Project moved on disk | Rendering uses the cwd from each message; filename uses the cwd from the first message → file location stays consistent. |
| No `transcript_path` in payload | Log to stderr, exit 0. |
| `transcript_path` does not exist on disk | Log to stderr, exit 0. |
| Zero renderable messages after filtering (e.g., session with only system/sidechain entries) | Write nothing; do not produce an empty file. Exit 0. |
| Sub-second timestamps | Truncated to `HH:MM:SS` in headings; full ISO preserved in front matter. |
| Session crashes before SessionEnd fires | Last Stop's output already on disk. `session_ended_at` simply absent from front matter. |

## Open Questions

None at design time. Implementation may surface follow-ups; capture them in
the implementation plan.

## Implementation Outline

For the implementation plan (next document), the work breaks roughly into:

1. Marketplace + plugin scaffolding (`.claude-plugin/`, `package.json`,
   `tsconfig.json`, READMEs).
2. `entry.ts`: stdin parse, bootstrap, dispatch.
3. `render.ts`: filter, group-by-date, build front matter, build body.
4. `tools.ts`: per-tool target-arg rules.
5. Tests with fixture JSONL files covering: single-day session, cross-midnight
   session, resumed session with gap, session with thinking blocks, session
   with attachments, session with subagent delegation, session with all the
   different tool types.
6. README documenting install, configuration, output format.
