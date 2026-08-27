const NON_DATA_FIELD_NAMES = new Set([
  'plotTime',
  'timestamp',
  'startTime',
  'isBatchData',
  'rawString',
  'rawDataKeys',
])

export function isConvertibleFiniteNumber(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'string' || value.trim() === '') return false
  return Number.isFinite(Number(value))
}

export function isNumericDataSeries(values: unknown[]): boolean {
  let hasNumericValue = false

  for (const value of values) {
    if (value === null || value === undefined) continue
    if (!isConvertibleFiniteNumber(value)) return false
    hasNumericValue = true
  }

  return hasNumericValue
}

export function getNumericDataFieldNames(data: unknown): string[] {
  if (!data || typeof data !== 'object') return []

  return Object.entries(data).flatMap(([key, value]) => {
    if (NON_DATA_FIELD_NAMES.has(key) || !Array.isArray(value) || !isNumericDataSeries(value)) {
      return []
    }
    return [key]
  })
}
