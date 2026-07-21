import { describe, expect, it } from 'vitest'
import { ApplicationStorage } from '@/core/application/ApplicationStorage'
import { LayoutStorage } from '@/core/layout/LayoutStorage'
import { normalizePanelIds } from '@/core/panels/registry'
import { JsonStorage, type StorageLike } from '@/core/storage/JsonStorage'

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>()

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  public removeItem(key: string): void {
    this.values.delete(key)
  }
}

describe('panel and application persistence', () => {
  it('migrates legacy panel ids and filters unknown panels', () => {
    expect(normalizePanelIds(['flow.data', 'plot', 'missing'])).toEqual(['plot', 'missing'])
    const memory = new MemoryStorage()
    memory.setItem(
      'nav-tools:custom-applications',
      JSON.stringify([
        {
          id: 'app-1',
          name: 'Test',
          description: '',
          icon: 'grid',
          accent: '#1677ff',
          windowIds: ['flow.data', 'missing'],
        },
      ]),
    )
    expect(new ApplicationStorage(new JsonStorage(memory)).loadApplications()[0].windowIds).toEqual(
      ['plot'],
    )
  })
})

describe('LayoutStorage', () => {
  it('migrates the legacy per-application layout into a versioned document', () => {
    const memory = new MemoryStorage()
    const item = {
      titleName: 'Plot',
      componentName: 'Plot',
      windowId: 'plot',
      x: 0,
      y: 0,
      w: 6,
      h: 6,
      i: 'plot-1',
    }
    memory.setItem('dashboard-layout-app-demo', JSON.stringify([item]))
    memory.setItem('statusbar-layout-app-demo', 'false')

    const storage = new LayoutStorage(new JsonStorage(memory))
    expect(storage.load('demo')).toEqual({ version: 1, items: [item], showStatusBar: false })
    expect(memory.getItem('nav-tools:layout:demo')).not.toBeNull()
  })
})
