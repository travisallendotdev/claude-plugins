# Known Issues

Tracking issues observed in v0.1.0. Each entry includes severity, reproduction
notes, and a sketch of the intended fix. PRs welcome.

---

## Rendering quality

### system-reminder injections render as user-message text

**Severity:** Minor (cosmetic noise)
**Where:** User-message rendering in `src/format.ts` and the upstream filter in
`src/filter.ts`.

When the Claude Code harness injects `<system-reminder>...</system-reminder>`
blocks (the periodic "task tools haven't been used recently" reminders, etc.),
those blocks are stored in user-message `text` content in the JSONL, not as a
separate type. The current renderer treats them as ordinary user prose, so they
appear inline in the markdown — visually noisy because they're harness mechanics,
not the user's actual input.

**Fix sketch:** in `userBody()` (`src/format.ts:6-26`), strip
`<system-reminder>...</system-reminder>` blocks (multiline regex) before
returning. If the resulting string is empty AND no other parts contributed,
either skip the message entirely or render `_[empty message]_`. Add a fixture
that includes a system-reminder-only user message and an interleaved
user-text + system-reminder message; assert the noise is removed.

---

### Empty assistant turns render as bare headings

**Severity:** Minor (cosmetic noise)
**Where:** `src/format.ts` `formatAssistantTurn`, plus possibly the renderer's
turn iteration in `src/render.ts`.

Some assistant messages in the JSONL have zero renderable content blocks (no
`text`, no `thinking`, no `tool_use`) — likely a streaming / chunking artifact
where one logical turn produces multiple assistant records and only some carry
content. The renderer currently emits the heading anyway, producing output
like:

```
## 🤖 Assistant — 17:39:25



## 🤖 Assistant — 17:39:37

(actual content)
```

**Fix sketch:** in `formatAssistantTurn` (`src/format.ts:39-71`), if the
`segments` array is empty after filtering, return `''` instead of a
heading-only string. Then `buildBody` in `render.ts` should `.filter(Boolean)`
the chunks before joining. Add a unit test in `tests/format.test.ts` for the
empty-content-blocks case and an end-to-end test in `tests/render.test.ts`
with a fixture that includes a content-empty assistant message.

---

### Pasted-text marker (`_[pasted N lines]_`) not implemented

**Severity:** Minor (originally listed in spec; deliberately deferred)
**Where:** `src/format.ts` user-body builder.

The spec called out `_[pasted N lines]_` as a counterpart to `_[image attached]_`,
but Claude Code currently surfaces pastes as inline text content rather than a
distinct content block type, so there's no signal to detect them on. The spec
was updated in v0.1.0 to acknowledge this; revisit if the JSONL ever gains a
`paste` or `document` content-block type, or if `~/.claude/paste-cache/`
references appear in user messages.

---

### MCP tool names keep internal underscores

**Severity:** Minor (cosmetic)
**Where:** `formatMcp` in `src/tools.ts:17-24`.

`mcp__claude_ai_Gmail__authenticate` renders as `_[claude_ai_Gmail:
authenticate]_`. Server names typically encode a human label as
underscore-separated tokens (`claude_ai_Gmail` → "claude.ai Gmail"). Could
optionally replace single underscores with spaces in the server segment for a
nicer display.

**Fix sketch:** in `formatMcp`, after the split, replace single underscores in
the server segment with spaces: `server.replace(/_/g, ' ')`. Add a test
asserting `_[claude.ai Gmail: authenticate]_` (or similar — pick a convention).
Note the choice will lose information if the original server name contained
real underscores; keep the raw server value somewhere if downstream tools
might need it.

---

### Project slug is too generic for collision-prone basenames

**Severity:** Minor
**Where:** `projectSlug()` in `src/slug.ts`.

For a cwd like `/Users/travis/dev/ai-agents/plugins`, the slug is simply
`plugins`, which collides with the marketplace's own directory name and
provides little visual context in the filename. Could include the parent dir
when the basename is short or generic.

**Fix sketch:** if the basename is in a small set of "common" names (`src`,
`plugins`, `app`, `code`, `repo`, `web`, `api`, `client`, `server`, etc.) OR
shorter than 4 chars, fall back to `<parent>-<basename>`. Add tests for the
collision case and the normal case.

---

### Slug does not collapse consecutive dashes or strip leading/trailing dashes

**Severity:** Minor (cosmetic)
**Where:** `projectSlug()` in `src/slug.ts:1-6`.

Input like `'My Project (v2)'` produces `'my-project--v2-'` — double dash and
trailing dash. The current regex `[^a-z0-9-]` correctly replaces unsafe
characters but does not normalize runs.

**Fix sketch:** after the existing `replace`, add `.replace(/-+/g, '-').replace(/^-|-$/g, '')`.
Update the existing `tests/slug.test.ts` test that asserts `'my-project--v2-'`
to assert `'my-project-v2'` instead.

---

## Tool breadcrumb coverage gaps

The breadcrumb dictionary in `src/tools.ts` covers the most common Claude Code
tools, but several real tools currently fall through to the bare `_[Name]_`
fallback when a more useful target arg exists. The fallback is correct but
loses information.

| Tool | Current rendering | Better rendering | Source arg |
|---|---|---|---|
| `MultiEdit` | `_[MultiEdit]_` | `_[MultiEdit <file_path>]_` | `input.file_path` (joins the existing Read/Write/Edit case) |
| `SlashCommand` | `_[SlashCommand]_` | `_[SlashCommand: <command>]_` | `input.command` |
| `Skill` | `_[Skill]_` | `_[Skill: <skill>]_` | `input.skill` |
| `LS` | `_[LS]_` | `_[LS <path>]_` | `input.path` |

**Severity:** Minor.
**Fix sketch:** add cases to the switch in `renderToolBreadcrumb`
(`src/tools.ts:35-78`) and add corresponding tests in `tests/tools.test.ts`.
`MultiEdit` is the highest-value of these because it shares semantics with
`Edit` and is in regular use.

---

## Test coverage gaps

Carried over from the v0.1.0 final review and not yet addressed.

### Mid-of-chain (3+ day) chain markers

The cross-midnight and resumed-with-gap fixtures both produce exactly two
files, so the case where a "middle" file in a multi-day chain receives BOTH
`continued_from` and `continues_into` is currently inferred from the loop
logic rather than asserted by a test.

**Fix sketch:** add a `tests/fixtures/three-day.jsonl` with messages on three
distinct local dates. Assert the middle file has both markers pointing at the
correct neighbors and the body has both top and bottom continuation links.

### Stop-after-SessionEnd preservation behavior beyond the simple case

`tests/render.test.ts` covers the basic "Stop after SessionEnd preserves
session_ended_at" sequence (added in the v0.1.0 fix commit), but does not
cover: SessionEnd → Stop → SessionEnd (the second SessionEnd should overwrite
with its new payload value), or SessionEnd → Stop on a multi-day chain (the
preserved value should still be on the LAST file in the chain).

### `firstWithCwd` and `firstAssistantModel` direct unit tests

Both helpers in `src/render.ts` are exercised indirectly by the render tests,
but neither has a direct test for the "first message has no cwd" or "first
assistant has no model field" fall-through branches.

### Renderer behavior on malformed JSONL

`parseJsonl` is unit-tested for skipping bad lines, but no `render.test.ts`
case feeds a JSONL containing bad lines and asserts that valid messages still
render correctly.

### Output dir not writable

The `try/catch` around `writeFileSync` (now `renameSync`) in `src/render.ts`
is not exercised by any test. Could mock `fs` or use a read-only temp dir to
force a write failure and assert the renderer continues to the next date
without throwing.

---

## Polish / hardening

### No stdin read timeout

`Bun.stdin.text()` in `src/entry.ts:38` will block indefinitely if Claude Code
ever fails to close stdin. Practically the OS pipe close happens promptly, but
a `Promise.race` with a ~5s deadline would prevent a hypothetical wedged hook
process.

### `bun install` stderr is duplicated on failure

`ensureDeps` in `src/entry.ts:8` runs `bun install --silent` with
`stdio: 'inherit'`. On failure, both `bun install` (because of `inherit`) and
the plugin's own follow-up "dependency install failed; skipping this turn"
error appear in the user's terminal. Switching to
`stdio: ['ignore', 'ignore', 'inherit']` would surface only the install error.

### Crumb detection in `formatAssistantTurn` is string-syntactic

`src/format.ts:54-57` decides whether a segment is a tool breadcrumb by
checking `seg.startsWith('_[') && seg.endsWith(']_')`. This is fragile if
thinking content ever happens to start that way. Tagging segments with their
kind in a small union (`{kind: 'crumb' | 'prose', text: string}`) would
remove the coupling.

### `tz.ts` does not guard against unparseable input

`new Date('garbage').getFullYear()` returns `NaN`, producing filenames like
`NaN-NaN-NaN_…`. Add a `isNaN(d.getTime())` guard in `localDate` /
`localTime` and have the renderer skip messages with bad timestamps.

### `firstWithCwd` reads `gitBranch` only from the first cwd-bearing message

If the first JSONL line carries `cwd` but is missing `gitBranch`, the
front-matter loses the branch even though later messages have it. Loop until
both are populated, or accept the first non-empty value of each field
independently.

---

## Documented limitations (intentional, for context)

These are not bugs — listed here so they're not re-filed.

### Wall-clock `session_ended_at` instead of payload-derived

The Claude Code SessionEnd payload does not carry a timestamp, so the
renderer uses `new Date().toISOString()` at hook invocation. The spec
acknowledges this in its front-matter rules table.

### `bun.lock` is committed; `bun.lockb` is ignored

Deliberate, for reproducible installs across users. The text `bun.lock` is
the modern format and is designed to be committed. The legacy binary
`bun.lockb` is gitignored to prevent accidental commits if a contributor
uses an older Bun.

### Plugin always exits 0

By design — a transcript-archiver bug must never block a Claude Code
session. All failure paths log to stderr and exit 0.

### Subagent (sidechain) traffic is excluded entirely

Deliberate scope decision in the v0.1.0 design. The main-thread `_[Agent:
<type>]_` breadcrumb already signals delegation occurred; the subagent's
own traffic is available in the source JSONL if anyone needs it.
