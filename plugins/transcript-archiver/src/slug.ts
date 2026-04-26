export function projectSlug(cwd: string): string {
  const trimmed = cwd.replace(/\/+$/, '')
  const base = trimmed.split('/').filter(Boolean).pop()
  if (!base) return 'unknown'
  return base.toLowerCase().replace(/[^a-z0-9-]/g, '-')
}
