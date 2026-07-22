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
  it('seeds editable GNSS and Motor applications on first launch', () => {
    const memory = new MemoryStorage()
    const applications = new ApplicationStorage(new JsonStorage(memory)).loadApplications()

    expect(applications.map((application) => application.name)).toEqual(['GNSS', 'Motor'])
    expect(applications[0]).toMatchObject({
      id: 'gnss',
      icon: 'position',
      windowIds: ['raw-messages', 'gnss-deviation', 'gnss-signals', 'sky-plot'],
    })
    expect(applications[1]).toMatchObject({
      id: 'motor',
      icon: 'motor',
      windowIds: ['plot', 'raw-messages', 'motor-parameters'],
    })
    expect(memory.getItem('nav-tools:custom-applications')).not.toBeNull()
  })

  it('does not recreate default applications after the user saves an empty list', () => {
    const memory = new MemoryStorage()
    memory.setItem('nav-tools:custom-applications', JSON.stringify([]))

    expect(new ApplicationStorage(new JsonStorage(memory)).loadApplications()).toEqual([])
  })

  it('resets saved applications back to only GNSS and Motor defaults', () => {
    const memory = new MemoryStorage()
    const storage = new ApplicationStorage(new JsonStorage(memory))
    storage.saveApplications([
      {
        id: 'custom',
        name: 'Custom',
        description: '',
        icon: 'grid',
        accent: '#1677ff',
        windowIds: ['plot'],
      },
    ])

    const applications = storage.resetApplicationsToDefaults()

    expect(applications.map((application) => application.id)).toEqual(['gnss', 'motor'])
    expect(storage.loadApplications().map((application) => application.id)).toEqual(['gnss', 'motor'])
  })

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
