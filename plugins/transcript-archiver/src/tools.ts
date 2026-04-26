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
