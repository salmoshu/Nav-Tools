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

  it('spaces every adjacent pair of composer buttons with a single shared gap', () => {
    // One shared rule must own the gap so 换行↔发送 and 发送↔IAP stay identical.
    const shared = source.match(
      /\.composer-actions,\s*\.message-actions,\s*\.iap-actions\s*\{([^}]*)\}/,
    )?.[1]
    expect(shared).toBeDefined()
    expect(shared).toContain('gap: 6px')

    // The composer-only override may adjust flex/justify, but never the gap.
    const composerOnly = source.match(/\.composer-actions\s*\{([^}]*)\}/)?.[1]
    expect(composerOnly).toBeDefined()
    expect(composerOnly).not.toContain('gap')

    // No stray per-group gap overrides or duplicate group rules: each group
    // selector appears exactly once, inside the shared rule.
    expect(source).not.toContain('gap: 2px')
    expect(source.match(/\.message-actions/g)).toHaveLength(1)
    expect(source.match(/\.iap-actions/g)).toHaveLength(1)
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

  it('collapses composer buttons to icons in narrow containers', () => {
    // 浮动卡片窗口宽度与 viewport 无关：容器查询判定窄窗，
    // 隐藏按钮文字仅留图标（EP 插槽内容包一层 span，文字 span 在第二层）
    expect(source).toContain('container-name: console-input')
    expect(source).toContain('@container console-input (max-width: 520px)')
    expect(source).toContain('.input-container :deep(.el-button > span > span)')
  })
})
