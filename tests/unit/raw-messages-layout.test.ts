import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('RawMessages bottom composer layout', () => {
  const source = readFileSync('src/components/windows/common/RawMessages.vue', 'utf8')

  it('gives the message entry the flexible space and keeps related actions grouped', () => {
    expect(source).toContain('class="message-entry"')
    expect(source).toContain('class="composer-actions"')
    expect(source).toContain('class="message-actions"')
    expect(source).toContain('class="iap-actions"')
    expect(source).toContain('flex: 1 1 360px')
    expect(source).toContain('flex: 0 1 auto')
    expect(source).toContain('flex-wrap: wrap')
  })

  it('uses one compact spacing rule without Element Plus button margins', () => {
    expect(source).toContain('gap: 6px')
    expect(source).toContain(':deep(.el-button + .el-button)')
    expect(source).toContain('margin-left: 0')
    expect(source).not.toContain('style="flex: 1; margin-right: 8px;"')
    expect(source).not.toContain('style="width: 90px; margin-right: 8px;"')
  })

  it('replaces generic file sending with the IAP dialog entry', () => {
    expect(source).toContain('@click="iapDialogVisible = true"')
    expect(source).toContain(':title="t(\'common.rawMessages.iapUpgrade\')"')
    expect(source).toContain('<IapUpgradeDialog v-model="iapDialogVisible" />')
    expect(source).toContain(':aria-label="t(\'common.rawMessages.format\')"')
  })

  it('does not retain the removed generic file-send handlers', () => {
    expect(source).not.toContain('useFileSend')
    expect(source).not.toContain('handleSelectFile')
    expect(source).not.toContain('handleStartSend')
    expect(source).not.toContain('file-picker-button')
  })
})
