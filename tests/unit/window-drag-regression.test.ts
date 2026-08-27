import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) => readFileSync(path, 'utf8')

describe('frameless window dragging regression', () => {
  it('keeps dragging native and does not reintroduce JS window movement', () => {
    const header = readProjectFile('src/components/AppHeader.vue')
    const main = readProjectFile('electron/main/index.ts')
    const preload = readProjectFile('electron/preload/index.ts')

    expect(header).toContain('-webkit-app-region: drag')
    expect(header).toContain('-webkit-app-region: no-drag')
    expect(main).not.toContain('setPosition(')
    expect(main).not.toContain('window-drag-')
    expect(preload).not.toContain('window-drag-')
  })

  it('keeps global messages below the custom application header', () => {
    const app = readProjectFile('src/App.vue')
    const rendererMain = readProjectFile('src/main.ts')
    const globalStyle = readProjectFile('src/style.css')

    expect(app).toContain('--app-header-height: 38px')
    expect(rendererMain).toContain('const APP_HEADER_HEIGHT = 38')
    expect(rendererMain).toContain('const MESSAGE_HEADER_GAP = 12')
    expect(rendererMain).toContain(
      'const MESSAGE_TOP_OFFSET = APP_HEADER_HEIGHT + MESSAGE_HEADER_GAP',
    )
    expect(rendererMain).toContain('messageConfig.offset = MESSAGE_TOP_OFFSET')
    expect(rendererMain).toContain('messageConfig.showClose = true')
    expect(rendererMain).toMatch(/message:\s*\{\s*offset:\s*MESSAGE_TOP_OFFSET/)
    expect(rendererMain).toMatch(
      /message:\s*\{\s*offset:\s*MESSAGE_TOP_OFFSET,\s*showClose:\s*true/,
    )
    expect(globalStyle).toMatch(/\.el-message\s*\{\s*z-index:\s*9100 !important/)
  })

  it('allows multiple Nav-Tools application instances', () => {
    const main = readProjectFile('electron/main/index.ts')

    expect(main).not.toContain('requestSingleInstanceLock')
    expect(main).not.toContain("'second-instance'")
  })
})
