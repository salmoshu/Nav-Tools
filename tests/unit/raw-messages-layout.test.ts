import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('RawMessages bottom composer layout', () => {
  const source = readFileSync('src/components/windows/common/RawMessages.vue', 'utf8')

  it('gives the message entry the flexible space and keeps related actions grouped', () => {
    expect(source).toContain('class="message-entry"')
    expect(source).toContain('class="composer-actions"')
    expect(source).toContain('class="message-actions"')
    expect(source).toContain('class="file-actions"')
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

  it('keeps the file picker compact and accessible', () => {
    expect(source).toContain('class="file-picker-button"')
    expect(source).toMatch(/class="file-picker-button"[\s\S]*?size="default"[\s\S]*?text/)
    expect(source).toContain(':aria-label="t(\'common.rawMessages.loadFile\')"')
    expect(source).toContain(':aria-label="t(\'common.rawMessages.format\')"')
    expect(source).toContain('width: 28px')
    expect(source).toContain('min-height: 28px')
    expect(source).toContain('border-color: transparent')
  })

  it('keeps the file picker on the right of the conditional send button', () => {
    const fileActions = source.match(
      /<div class="file-actions">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/,
    )?.[1]

    expect(fileActions).toBeDefined()
    expect(fileActions!.indexOf('@click="handleStartSend"')).toBeLessThan(
      fileActions!.indexOf('@click="handleSelectFile"'),
    )
  })
})
