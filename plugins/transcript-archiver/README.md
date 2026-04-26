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
