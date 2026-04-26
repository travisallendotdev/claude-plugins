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
