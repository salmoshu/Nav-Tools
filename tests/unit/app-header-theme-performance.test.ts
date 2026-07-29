import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('AppHeader settings menu performance', () => {
  const source = readFileSync('src/components/AppHeader.vue', 'utf8')

  it('keeps the settings menu pre-rendered without Popper layout work', () => {
    expect(source).not.toContain('<el-dropdown')
    expect(source).toContain('class="settings-menu"')
    expect(source).toContain(':class="{ open: settingsOpen }"')
    expect(source).toMatch(/\.settings-menu\s*\{[\s\S]*display: none/)
    expect(source).toMatch(/\.settings-menu\.open\s*\{[\s\S]*display: block/)
  })

  it('closes immediately and defers the global theme repaint', () => {
    expect(source).toContain('document.addEventListener(\'pointerdown\', handleDocumentPointerDown)')
    expect(source).toContain('closeSettingsMenu()')
    expect(source.match(/themeApplyFrame = requestAnimationFrame/g)).toHaveLength(2)
  })
})
