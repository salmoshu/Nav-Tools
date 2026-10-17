import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const tokens = readFileSync('src/styles/kimi-tokens.css', 'utf8')
const style = readFileSync('src/style.css', 'utf8')
const main = readFileSync('src/main.ts', 'utf8')
const chartThemeSource = readFileSync('src/core/theme/theme.ts', 'utf8')
const terminalThemeSource = readFileSync('src/core/terminal/TerminalTheme.ts', 'utf8')

describe('Kimi brand design tokens', () => {
  it('ships a dual-scheme token file with the official light and dark palettes', () => {
    expect(tokens).toContain(':root {')
    expect(tokens).toContain(':root.dark {')
    expect(tokens).toContain('--Colors-KMBlue: #1783ff')
    expect(tokens).toContain('--Colors-KMBlue: #1a88ff')
    expect(tokens).toContain('--Others-TextSelected: #1783ff33')
    expect(tokens).toContain('--system-fonts:')
    expect(tokens).toContain('--font-mono:')
    expect(tokens).toContain('--radius-3xl: 24px')
    expect(tokens).toContain('--radius-full: 9999px')
    expect(tokens).toContain('--shadow-pop: 0 12px 40px 0 #00000029')
    expect(tokens).toContain('--duration-fast: 75ms')
    expect(tokens).toContain('--duration-default: 150ms')
    expect(tokens).toContain('--duration-panel: 300ms')
    expect(tokens).toContain('--ease-out: cubic-bezier(0, 0, 0.2, 1)')
    expect(tokens).toContain('--backdrop-header: blur(6px)')
  })

  it('re-sources every legacy --app-* token onto the Kimi palette', () => {
    for (const mapping of [
      '--app-bg: var(--Bg-GroundPC)',
      '--app-surface: var(--Bg-Primary)',
      '--app-surface-muted: var(--Bg-Secondary)',
      '--app-hover: var(--Fills-F2-hover)',
      '--app-border: var(--Separators-S1)',
      '--app-border-strong: var(--Separators-S1-active)',
      '--app-text: var(--Labels-Primary)',
      '--app-text-secondary: var(--Labels-Secondary)',
      '--app-text-muted: var(--Labels-Tertiary)',
      '--app-toolbar: var(--Bg-Primary)',
      '--app-toolbar-control: var(--Fills-F2)',
      '--app-surface-raised: var(--Bg-Tertiary)',
      '--app-toolbar: var(--Bg-Secondary)',
    ]) {
      expect(tokens).toContain(mapping)
    }

    for (const alias of [
      '--app-radius-sm',
      '--app-radius-md',
      '--app-radius-lg',
      '--app-radius-xl',
      '--app-radius-2xl',
      '--app-duration-fast',
      '--app-duration-default',
      '--app-duration-panel',
      '--app-ease-out',
      '--app-shadow-xs',
      '--app-shadow-card',
      '--app-shadow-pop',
    ]) {
      expect(tokens).toContain(alias)
    }

    // style.css 不再硬编码旧调色板（单一来源在 kimi-tokens.css）
    for (const legacy of [
      '--app-bg: #',
      '--app-surface: #',
      '--app-text: #',
      '--app-toolbar: #',
      '#2c3e50',
      '#34495e',
      '#f3f5f7',
      '#14161b',
      '#1d2027',
      '#d2d6dc',
      '#282c34',
    ]) {
      expect(style).not.toContain(legacy)
    }
  })

  it('rebrands Element Plus with KMBlue and brand geometry', () => {
    expect(tokens).toContain('--el-color-primary: var(--Colors-KMBlue)')
    for (const shade of ['light-3', 'light-5', 'light-7', 'light-8', 'light-9', 'dark-2']) {
      expect(tokens).toContain(`--el-color-primary-${shade}:`)
    }
    // EP dark css-vars 用 html.dark，同优先级的暗色重写必须存在
    const darkSection = tokens.slice(tokens.indexOf(':root.dark {'))
    expect(darkSection).toContain('--el-color-primary: var(--Colors-KMBlue)')
    expect(darkSection).toContain('--el-bg-color: var(--Bg-Primary)')

    expect(tokens).toContain('::selection {')
    expect(tokens).toContain('.el-button {')
    expect(tokens).toContain('border-radius: var(--radius-3xl)')
    expect(tokens).toContain('box-shadow: var(--shadow-pop)')
    expect(tokens).toContain('.el-input__wrapper,')
    expect(tokens).toContain('.el-popper.is-dark,')
    expect(tokens).toContain('backdrop-filter: var(--backdrop-header)')
    expect(tokens).toContain('.el-tabs__item {')
  })

  it('loads after Element Plus so equal-specificity overrides win', () => {
    const epIndex = main.indexOf('element-plus/dist/index.css')
    const epDark = main.indexOf('element-plus/theme-chalk/dark/css-vars.css')
    const kimi = main.indexOf('./styles/kimi-tokens.css')
    expect(epIndex).toBeGreaterThan(-1)
    expect(epDark).toBeGreaterThan(epIndex)
    expect(kimi).toBeGreaterThan(epDark)
  })

  it('aligns the ECharts palette with the CSS tokens', () => {
    for (const value of [
      "background: '#121212'",
      "surface: 'rgba(18, 18, 18, 0.9)'",
      "surfaceMuted: '#1f1f1f'",
      "text: '#ffffffd6'",
      "textMuted: '#ffffff6b'",
      "grid: '#ffffff1a'",
      "border: '#ffffff1f'",
      "background: '#ffffff'",
      "surface: 'rgba(255, 255, 255, 0.9)'",
      "surfaceMuted: '#f5f5f5'",
      "text: '#000000e6'",
      "textMuted: '#00000073'",
      "grid: '#00000014'",
      "border: '#00000021'",
    ]) {
      expect(chartThemeSource).toContain(value)
    }
  })

  it('moves the terminal surface to the brand deep navy', () => {
    expect(style).toContain('--terminal-bg: #0d1b2e')
    expect(style).toContain('--terminal-fg: #ffffff')
    expect(terminalThemeSource).toContain("background: '#0d1b2e'")
    expect(terminalThemeSource).toContain("foreground: '#ffffff'")
  })

  it('uses the Kimi font stack and tokenized dialog shells in style.css', () => {
    expect(style).toContain('font-family: var(--system-fonts)')
    expect(style).toContain('font-family: var(--font-mono)')
    expect(style).toContain('border-radius: var(--radius-3xl)')
    expect(style).toContain('box-shadow: var(--shadow-pop)')
  })
})
