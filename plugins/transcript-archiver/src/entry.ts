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
