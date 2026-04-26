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
