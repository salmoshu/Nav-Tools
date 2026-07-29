export type StatusEntry = [string, unknown]

export function filterDisplayableStatusEntries(entries: StatusEntry[]): StatusEntry[] {
  return entries.filter(([, value]) => typeof value !== 'boolean')
}

export function hasStatusData(value: unknown): boolean {
  if (value === '' || value === null || value === undefined) return false
  if (typeof value === 'number') return Number.isFinite(value)
  return true
}
