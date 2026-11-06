import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('application selector header actions', () => {
  it('keeps the three header actions icon-only with accessible names', () => {
    const source = readFileSync('src/components/ApplicationSelector.vue', 'utf8')
    expect(source).toContain(':icon="Setting"')
    expect(source).toContain(':icon="Plus"')
    expect(source).toContain(':icon="Refresh"')
    expect(source).toContain(':title="t(\'app.settingsDefaultApplications\')"')
    expect(source).toContain(':aria-label="t(\'app.settingsDefaultApplications\')"')
    expect(source).toContain(':title="t(\'app.selector.newApp\')"')
    expect(source).toContain(':aria-label="t(\'app.selector.newApp\')"')
    expect(source).toContain(':title="t(\'app.selector.resetApp\')"')
    expect(source).toContain(':aria-label="t(\'app.selector.resetApp\')"')
    expect(source).toMatch(/<el-button[\s\S]*?text[\s\S]*?circle[\s\S]*?:icon="Setting"/)
    expect(source).toContain('<el-button type="primary" :icon="Plus" @click="openEditor()">')
  })
})
