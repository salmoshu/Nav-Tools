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
})
