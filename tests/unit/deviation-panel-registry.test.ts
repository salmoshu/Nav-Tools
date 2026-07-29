import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('deviation panel implementations', () => {
  const registry = readFileSync('src/core/panels/registry.ts', 'utf8')

  it('keeps only the primary Flow and GNSS deviation panels registered', () => {
    expect(registry).toContain("id: 'flow-deviation'")
    expect(registry).toContain("id: 'gnss-deviation'")
    expect(registry).not.toContain("id: 'flow-deviation-canvas'")
    expect(registry).not.toContain("id: 'gnss-deviation-canvas'")
  })

  it('removes the obsolete Canvas deviation components and shared helper', () => {
    expect(existsSync('src/components/windows/common/FlowDeviationCanvas.vue')).toBe(false)
    expect(existsSync('src/components/windows/gnss/GnssDeviationCanvas.vue')).toBe(false)
    expect(existsSync('src/components/windows/common/deviation/useDeviationChart.ts')).toBe(false)
  })
})
