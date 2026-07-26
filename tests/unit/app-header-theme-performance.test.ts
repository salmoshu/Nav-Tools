import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('AppHeader theme menu performance', () => {
  const source = readFileSync('src/components/AppHeader.vue', 'utf8')

  it('keeps the theme menu pre-rendered without Popper layout work', () => {
    expect(source).not.toContain('<el-dropdown')
    expect(source).toContain('class="theme-mode-menu"')
    expect(source).toContain(':class="{ open: themeMenuOpen }"')
    expect(source).toMatch(/\.theme-mode-menu\s*\{[\s\S]*visibility: hidden/)
    expect(source).toMatch(/\.theme-mode-menu\.open\s*\{[\s\S]*visibility: visible/)
  })

  it('closes immediately and defers the global theme repaint', () => {
    expect(source).toContain('document.addEventListener(\'pointerdown\', handleDocumentPointerDown)')
    expect(source).toContain('closeThemeMenu()')
    expect(source.match(/themeApplyFrame = requestAnimationFrame/g)).toHaveLength(2)
  })
})
