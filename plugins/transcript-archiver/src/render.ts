import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { parseJsonl, isRenderableUser, isRenderableAssistant, type AnyMessage, type UserMessage, type AssistantMessage } from './filter'
import { localDate } from './tz'
import { projectSlug } from './slug'
import { buildFrontmatter, type FrontmatterFields } from './frontmatter'
import { formatUserTurn, formatAssistantTurn } from './format'

function readExistingSessionEnd(path: string): string | undefined {
  if (!existsSync(path)) return undefined
  try {
    const content = readFileSync(path, 'utf8')
    // Look for `session_ended_at:` line within the front matter (between the first two `---` lines)
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/)
    if (!fmMatch) return undefined
    const lineMatch = fmMatch[1]!.match(/^session_ended_at:\s*(.+)$/m)
    return lineMatch?.[1]?.trim()
  } catch {
    return undefined
  }
}

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

    // On the final file in the chain, prefer the new SessionEnd payload's timestamp;
    // otherwise preserve any session_ended_at that was already on disk (e.g., from a
    // prior SessionEnd that we shouldn't clobber on a subsequent Stop).
    const effectiveSessionEnd = isLast
      ? (opts.sessionEndedAt ?? readExistingSessionEnd(path))
      : undefined

    const fields: FrontmatterFields = {
      session_id: opts.sessionId,
      project,
      cwd,
      git_branch: gitBranch,
      model,
      started_at: msgs[0]!.timestamp!,
      original_started_at: isFirst ? undefined : originalStartedAt,
      last_updated_at: msgs[msgs.length - 1]!.timestamp!,
      session_ended_at: effectiveSessionEnd,
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
      // Write to a temp file then atomically rename, so concurrent or crashing
      // hook invocations cannot leave a torn file.
      const tmpPath = `${path}.tmp`
      writeFileSync(tmpPath, contents, 'utf8')
      renameSync(tmpPath, path)
    } catch (e) {
      console.error(`transcript-archiver: failed to write ${path}: ${(e as Error).message}`)
      // continue to next date
    }
  }
}
