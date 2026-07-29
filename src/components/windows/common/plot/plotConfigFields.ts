export type PlotConfigField = 'source' | 'color' | 'useArea'

export function plotConfigFieldKey(prefix: string, field: PlotConfigField, index: number): string {
  const fieldName = prefix ? `${field.charAt(0).toUpperCase()}${field.slice(1)}` : field
  return `${prefix}${fieldName}${index}`
}
