import { describe, expect, it } from 'vitest'
import { ApplicationStorage } from '@/core/application/ApplicationStorage'
import { normalizePanelIds, panelRegistry } from '@/core/panels/registry'
import { JsonStorage, type StorageLike } from '@/core/storage/JsonStorage'

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>()
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

describe('GNSS-Lib registration', () => {
  it('registers one solver and normalizes both legacy engines to that entry', () => {
    expect(panelRegistry.find((panel) => panel.id === 'gnsslib-solver')).toMatchObject({
      catalogGroup: 'gnsslib',
      componentName: 'GnssSolver',
      componentPath: '@/components/windows/gnsslib/GnssSolver.vue',
    })
    expect(panelRegistry.filter((panel) => panel.moduleId === 'gnsslib')).toHaveLength(1)
    expect(normalizePanelIds(['gnsslib-rtkpost', 'gnsslib-rtknavi', 'gnssraw-rtkpost'])).toEqual([
      'gnsslib-solver',
    ])
    expect(panelRegistry.some((panel) => panel.id === 'gnssraw-rtkpost')).toBe(false)
  })

  it('moves RTKPOST out of GNSS-Raw and creates GNSS-Lib once', () => {
    const memory = new MemoryStorage()
    for (const key of [
      'camera-default-v1',
      'camera-parameters-v1',
      'camera-terminal-v1',
      'serial-default-v1',
      'gnss-messages-v1',
      'flow-default-v1',
      'lidar-default-v1',
      'gnssraw-default-v1',
      'gnssraw-rtkpost-v1',
      'application-order-v1',
    ]) {
      memory.setItem(`nav-tools:migration:${key}`, '1')
    }
    memory.setItem(
      'nav-tools:custom-applications',
      JSON.stringify([
        {
          id: 'gnssraw',
          name: 'GNSS-Raw',
          description: '',
          icon: 'satellite',
          accent: '#6366f1',
          windowIds: ['gnssraw-frames', 'gnssraw-rtkpost'],
        },
      ]),
    )

    const storage = new ApplicationStorage(new JsonStorage(memory))
    const applications = storage.loadApplications()
    expect(applications).toHaveLength(2)
    expect(applications[0].windowIds).toEqual(['gnssraw-frames'])
    expect(applications[1]).toMatchObject({
      id: 'gnsslib',
      name: 'GNSS-Lib',
      description: 'Open-GNSS post-processing and real-time positioning workspace',
      windowIds: ['gnsslib-solver', 'raw-messages', 'gnss-deviation'],
    })
    expect(storage.loadApplications()).toEqual(applications)
  })

  it.each([
    [
      'Robo-GNSS post-processing and real-time positioning workspace',
      'Open-GNSS post-processing and real-time positioning workspace',
    ],
    ['My receiver workflow', 'My receiver workflow'],
  ])('migrates the saved engine description once: %s', (description, expected) => {
    const memory = new MemoryStorage()
    const storage = new ApplicationStorage(new JsonStorage(memory))
    const applications = storage.loadApplications()
    const application = applications.find(({ id }) => id === 'gnsslib')!
    Object.assign(application, {
      name: 'My positioning tools',
      description,
      accent: '#123456',
      windowIds: ['gnsslib-rtknavi'],
    })
    storage.saveApplications(applications)
    memory.removeItem('nav-tools:migration:gnsslib-engine-name-v1')

    const migrated = storage.loadApplications()
    expect(migrated.find(({ id }) => id === 'gnsslib')).toEqual({
      ...application,
      windowIds: ['gnsslib-solver'],
      description: expected,
    })
    expect(JSON.parse(memory.getItem('nav-tools:custom-applications')!)).toEqual(migrated)

    const saved = migrated.find(({ id }) => id === 'gnsslib')!
    saved.description = 'My updated workflow'
    storage.saveApplications(migrated)
    expect(storage.loadApplications().find(({ id }) => id === 'gnsslib')).toEqual(saved)
  })

  it('migrates the old workspace once without changing engine settings or user metadata', () => {
    const memory = new MemoryStorage()
    const storage = new ApplicationStorage(new JsonStorage(memory))
    storage.loadApplications()
    const application = {
      id: 'gnsslib',
      name: 'My GNSS workspace',
      description: 'custom',
      icon: 'satellite',
      accent: '#123456',
      windowIds: ['gnsslib-rtknavi', 'gnsslib-rtkpost', 'plot'],
    }
    memory.setItem('nav-tools:custom-applications', JSON.stringify([application]))
    memory.setItem(
      'nav-tools:gnssraw-rtkpost-v1',
      JSON.stringify({ executablePath: 'post.exe', roverObsPath: 'rover.obs' }),
    )
    memory.setItem('nav-tools:gnsslib-rtknavi-v1', JSON.stringify({ executablePath: 'live.exe' }))
    memory.removeItem('nav-tools:migration:gnsslib-solver-v1')
    const migrated = storage.loadApplications()
    expect(migrated[0]).toEqual({
      ...application,
      windowIds: ['gnsslib-solver', 'plot', 'raw-messages', 'gnss-deviation'],
    })
    expect(memory.getItem('nav-tools:gnssraw-rtkpost-v1')).toContain('rover.obs')
    expect(memory.getItem('nav-tools:gnsslib-rtknavi-v1')).toContain('live.exe')
    migrated[0].windowIds = ['gnsslib-solver']
    storage.saveApplications(migrated)
    expect(storage.loadApplications()[0].windowIds).toEqual(['gnsslib-solver'])
  })
})
