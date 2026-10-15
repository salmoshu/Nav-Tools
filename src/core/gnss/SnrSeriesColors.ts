/**
 * Per-satellite SNR series colors: each satellite keeps its constellation base
 * color; when several selected series share the same base color their lightness
 * is staggered so the lines stay distinguishable (same idiom as the GNSS-Raw
 * per-satellite SNR view).
 */

/** Shift the lightness of a #rrggbb color by `step` steps of 0.16, clamped to [0.2, 0.85]. */
export function shiftHexLightness(hex: string, step: number): string {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex)
  if (!m || step === 0) return hex
  const [r8, g8, b8] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16))
  const r = r8 / 255
  const g = g8 / 255
  const b = b8 / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  let l = (max + min) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6)
    else if (max === g) h = 60 * ((b - r) / d + 2)
    else h = 60 * ((r - g) / d + 4)
  }
  if (h < 0) h += 360
  l = Math.min(0.85, Math.max(0.2, l + step * 0.16))
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m0 = l - c / 2
  let rr = 0
  let gg = 0
  let bb = 0
  if (h < 60) [rr, gg, bb] = [c, x, 0]
  else if (h < 120) [rr, gg, bb] = [x, c, 0]
  else if (h < 180) [rr, gg, bb] = [0, c, x]
  else if (h < 240) [rr, gg, bb] = [0, x, c]
  else if (h < 300) [rr, gg, bb] = [x, 0, c]
  else [rr, gg, bb] = [c, 0, x]
  const to = (v: number) =>
    Math.round((v + m0) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to(rr)}${to(gg)}${to(bb)}${m[2] ?? ''}`
}

/**
 * Assign the final line color for each selected series: the constellation base
 * color when unique within the selection, otherwise lightness-staggered around
 * the base color.
 */
export function assignSnrSeriesColors<K>(
  keys: readonly K[],
  baseColorOf: (key: K) => string,
): Map<K, string> {
  const byBase = new Map<string, K[]>()
  for (const key of keys) {
    const base = baseColorOf(key)
    const list = byBase.get(base) ?? []
    list.push(key)
    byBase.set(base, list)
  }
  const out = new Map<K, string>()
  for (const [base, list] of byBase) {
    list.forEach((key, index) => {
      out.set(key, shiftHexLightness(base, index - (list.length - 1) / 2))
    })
  }
  return out
}
