import type { RtkPostOptions } from './RtkPost'

export type EditablePostKey = Exclude<keyof RtkPostOptions, 'startTime' | 'endTime'>
export type PostManualBaselines = Partial<Record<EditablePostKey, RtkPostOptions[EditablePostKey]>>

export function copyPostOptions(options: RtkPostOptions): RtkPostOptions {
  return { ...options, constellations: [...options.constellations] }
}

export function equalPostOption(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    return [...left].sort().join(',') === [...right].sort().join(',')
  }
  return left === right
}

/** Remember the value before the first manual edit, including values imported from a file. */
export function updatePostOptionDraft(
  options: RtkPostOptions,
  baselines: PostManualBaselines,
  key: EditablePostKey,
  value: RtkPostOptions[EditablePostKey],
): void {
  if (!Object.prototype.hasOwnProperty.call(options, key)) return
  if (!Object.prototype.hasOwnProperty.call(baselines, key)) {
    const original = options[key]
    Object.assign(baselines, { [key]: Array.isArray(original) ? [...original] : original })
  }
  Object.assign(options, { [key]: Array.isArray(value) ? [...value] : value })
  if (equalPostOption(options[key], baselines[key])) delete baselines[key]
}

/** Ignore corrupt or obsolete marker data from older application versions. */
export function restorePostManualBaselines(
  value: unknown,
  options: RtkPostOptions,
): PostManualBaselines {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: PostManualBaselines = {}
  for (const [name, baseline] of Object.entries(value)) {
    if (
      name === 'startTime' ||
      name === 'endTime' ||
      !Object.prototype.hasOwnProperty.call(options, name)
    )
      continue
    const key = name as EditablePostKey
    const current = options[key]
    if (Array.isArray(current)) {
      if (!Array.isArray(baseline) || !baseline.every((item) => typeof item === 'string')) continue
    } else if (current === null) {
      if (baseline !== null && (typeof baseline !== 'number' || !Number.isFinite(baseline)))
        continue
    } else if (baseline === null) {
      if (key !== 'intervalS') continue
    } else if (
      typeof baseline !== typeof current ||
      (typeof baseline === 'number' && !Number.isFinite(baseline))
    ) {
      continue
    }
    if (!equalPostOption(current, baseline))
      Object.assign(result, { [key]: Array.isArray(baseline) ? [...baseline] : baseline })
  }
  return result
}
