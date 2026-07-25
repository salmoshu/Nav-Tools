import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Status View presentation', () => {
  it('uses metric cards, live state and numeric typography', () => {
    const source = readFileSync('src/components/StatusBar.vue', 'utf8')

    expect(source).toContain('statusbar-heading')
    expect(source).toContain('status-state-dot')
    expect(source).toContain('status-value-row')
    expect(source).toContain('font-variant-numeric: tabular-nums')
    expect(source).toContain(
      'color: color-mix(in srgb, var(--el-color-primary) 82%, var(--app-text))',
    )
    expect(source).toContain('overflow-wrap: anywhere')
    expect(source).toMatch(/\.status-item\s*\{[\s\S]*?flex:\s*0 0 auto/)
    expect(source).toMatch(/\.status-item\s*\{[\s\S]*?min-height:\s*58px/)
    expect(source).toContain('formatStatusName')
  })
})
