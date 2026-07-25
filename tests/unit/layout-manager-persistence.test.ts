import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('useLayoutManager silent visibility persistence', () => {
  const source = readFileSync('src/composables/useLayoutManager.ts', 'utf8')

  it('persists toolbar/statusbar visibility silently instead of emitting layout-changed', () => {
    // 切换 toolbar/statusbar 时调用静默持久化，不触发保存提示
    expect(source).toContain('persistVisibilitySilently')
    // watch(showStatusBar) 和 watch(showToolBar) 调用静默持久化
    const statusBarWatch = source.slice(
      source.indexOf('watch(showStatusBar'),
      source.indexOf('let showToolBarInitialized'),
    )
    expect(statusBarWatch).toContain('persistVisibilitySilently()')
    expect(statusBarWatch).not.toContain("emit('layout-changed')")

    const toolBarWatch = source.slice(
      source.indexOf('watch(showToolBar'),
      source.indexOf('function backupCurrentLayout'),
    )
    expect(toolBarWatch).toContain('persistVisibilitySilently()')
    expect(toolBarWatch).not.toContain("emit('layout-changed')")
  })

  it('calls layoutStorage.updateVisibility to persist flags without touching layout items', () => {
    expect(source).toContain('layoutStorage.updateVisibility')
    expect(source).toContain('showStatusBar.value !== false')
    expect(source).toContain('showToolBar.value !== false')
  })
})
