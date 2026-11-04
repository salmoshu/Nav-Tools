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

describe('RTKPOST registration', () => {
  it('registers the panel in the GNSS-Raw component family', () => {
    expect(panelRegistry.find((panel) => panel.id === 'gnssraw-rtkpost')).toMatchObject({
      catalogGroup: 'gnssraw',
      componentName: 'RtkPost',
      componentPath: '@/components/windows/gnssraw/RtkPost.vue',
    })
  })

  it('adds RTKPOST once to an existing GNSS-Raw application', () => {
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
          windowIds: ['gnssraw-frames'],
        },
      ]),
    )

    const storage = new ApplicationStorage(new JsonStorage(memory))
    expect(storage.loadApplications()[0].windowIds).toEqual(['gnssraw-frames', 'gnssraw-rtkpost'])
    expect(storage.loadApplications()[0].windowIds).toEqual(['gnssraw-frames', 'gnssraw-rtkpost'])
  })
})
