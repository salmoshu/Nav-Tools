import { describe, expect, it } from 'vitest'
import { ApplicationStorage } from '@/core/application/ApplicationStorage'
import { panelRegistry } from '@/core/panels/registry'
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
  it('registers RTKPOST and RTKNAVI in the GNSS-Lib component family', () => {
    expect(panelRegistry.find((panel) => panel.id === 'gnsslib-rtkpost')).toMatchObject({
      catalogGroup: 'gnsslib',
      componentName: 'RtkPost',
      componentPath: '@/components/windows/gnsslib/RtkPost.vue',
    })
    expect(panelRegistry.find((panel) => panel.id === 'gnsslib-rtknavi')).toMatchObject({
      catalogGroup: 'gnsslib',
      componentName: 'RtkNavi',
      componentPath: '@/components/windows/gnsslib/RtkNavi.vue',
    })
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
      windowIds: ['gnsslib-rtkpost', 'gnsslib-rtknavi'],
    })
    expect(storage.loadApplications()).toEqual(applications)
  })
})
