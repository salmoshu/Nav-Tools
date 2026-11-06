import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('component action responsive labels', () => {
  it('uses card and detached-window containers instead of viewport media queries', () => {
    const dashboard = readFileSync('src/components/Dashboard.vue', 'utf8')
    const cardWindow = readFileSync('src/components/CardWindow.vue', 'utf8')
    const styles = readFileSync('src/style.css', 'utf8')
    expect(dashboard).toContain('component-surface')
    expect(cardWindow).toContain('component-surface')
    expect(styles).toContain('container-name: component-surface')
    expect(styles).toContain('container-type: inline-size')
    expect(styles).toContain('@container component-surface (max-width: 620px)')
    expect(styles).toContain(':has(.el-icon, > svg, > span > svg, > span > .el-icon)')
  })

  it('does not collapse buttons that have no icon', () => {
    const styles = readFileSync('src/style.css', 'utf8')
    expect(styles).toContain('.component-surface .el-button:has(')
    expect(styles).not.toContain('.component-surface .el-button {\n    font-size: 0')
  })
})
