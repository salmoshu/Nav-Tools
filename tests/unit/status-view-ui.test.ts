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
    expect(source).toContain("'status-has-data': hasStatusData(status)")
    expect(source).toContain("'status-no-data': !hasStatusData(status)")
    expect(source).toContain('.status-has-data .status-state-dot')
    expect(source).not.toContain('.status-has-data .status-indicator')
    expect(source).not.toContain('.status-no-data .status-indicator')
    expect(source).not.toContain('status-positive')
    expect(source).not.toContain('status-negative')
  })

  it('shows a field-specific icon beside each metric value', () => {
    const source = readFileSync('src/components/StatusBar.vue', 'utf8')

    expect(source).toContain('status-field-icon')
    expect(source).toContain('getStatusFieldIcon(String(element[0]))')
    expect(source).toContain(':style="{ color: getStatusColor(String(element[0])) }"')
    expect(source).toContain('<component :is=')
    expect(source).toContain('align-items: center')
  })

  it('colors only the fix mode field with the solution status color', () => {
    const source = readFileSync('src/components/StatusBar.vue', 'utf8')

    // 解状态着色仅作用于 fix mode 字段（图标+数值），其余字段走默认配色
    expect(source).toContain("if (fieldName !== 'fixmode') return undefined")
    expect(source).not.toContain('GNSS_STATUS_FIELDS')
    // 有数据/无数据的图标默认色仍由 CSS 承担
    expect(source).toContain('.status-has-data .status-field-icon')
  })

  it('keeps space between the property dialog actions', () => {
    const source = readFileSync('src/components/StatusBar.vue', 'utf8')

    expect(source).toMatch(/\.dialog-footer\s*\{[\s\S]*?display:\s*inline-flex/)
    expect(source).toMatch(/\.dialog-footer\s*\{[\s\S]*?gap:\s*8px/)
  })
})
