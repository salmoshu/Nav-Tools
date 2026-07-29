import { describe, expect, it } from 'vitest'
import {
  buildConfigurationExport,
  createConfigurationExportFilename,
} from '@/core/config/ConfigurationExport'
import type { StorageLike } from '@/core/storage/JsonStorage'
import type { UserApplication } from '@/settings/config'

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

const applications: UserApplication[] = [
  {
    id: 'gnss',
    name: 'GNSS',
    description: 'GNSS workspace',
    icon: 'position',
    accent: '#0ea5e9',
    windowIds: ['gnss-map', 'gnss-deviation'],
  },
  {
    id: 'custom',
    name: 'Custom',
    description: '',
    icon: 'grid',
    accent: '#1677ff',
    windowIds: ['plot'],
  },
]

describe('configuration export', () => {
  it('exports applications, every saved layout, and supported application settings', () => {
    const storage = new MemoryStorage()
    const gnssLayout = {
      version: 1,
      items: [{ i: 'map', x: 0, y: 0, w: 6, h: 6, windowId: 'gnss-map' }],
      showStatusBar: true,
      showToolBar: true,
      toolbarPosition: 'bottom',
      statusbarPosition: 'right',
      removedWindowIds: [],
    }
    const customLayout = {
      version: 1,
      items: [],
      showStatusBar: false,
      removedWindowIds: ['plot'],
    }
    storage.setItem('nav-tools:layout:gnss', JSON.stringify(gnssLayout))
    storage.setItem('nav-tools:layout:custom', JSON.stringify(customLayout))
    storage.setItem(
      'nav-tools:data-source-settings',
      JSON.stringify({ activeTab: 'network', networkIp: '127.0.0.1', networkPort: 9000 }),
    )
    storage.setItem(
      'nav-tools:camera-video',
      JSON.stringify({ version: 1, streamUrl: 'rtsp://10.0.0.8:8554/camera' }),
    )
    storage.setItem('nav-tools:camera-parameters', JSON.stringify({ exposureTime: 4000 }))
    storage.setItem('motor-config', JSON.stringify({ command: { prefix: 'M' } }))
    storage.setItem('nav-tools:status-order', JSON.stringify(['nsat', 'fix']))
    storage.setItem('nav-tools:theme', 'dark')
    storage.setItem('nav-tools:locale', 'zh-CN')
    storage.setItem('nav-tools:migration:camera-default-v1', '1')

    const exported = buildConfigurationExport(storage, {
      applications,
      selectedApplicationId: 'gnss',
      exportedAt: new Date('2026-07-29T10:20:30.000Z'),
    })

    expect(exported).toEqual({
      format: 'nav-tools-configuration',
      version: 1,
      exportedAt: '2026-07-29T10:20:30.000Z',
      selectedApplicationId: 'gnss',
      applications,
      layouts: {
        gnss: gnssLayout,
        custom: customLayout,
      },
      settings: {
        dataSource: { activeTab: 'network', networkIp: '127.0.0.1', networkPort: 9000 },
        cameraVideo: { version: 1, streamUrl: 'rtsp://10.0.0.8:8554/camera' },
        cameraParameters: { exposureTime: 4000 },
        motor: { command: { prefix: 'M' } },
        statusOrder: ['nsat', 'fix'],
        theme: 'dark',
        locale: 'zh-CN',
      },
    })
    expect(JSON.stringify(exported)).not.toContain('migration')
  })

  it('omits missing or malformed values instead of exporting invalid configuration', () => {
    const storage = new MemoryStorage()
    storage.setItem('nav-tools:layout:gnss', '{invalid')
    storage.setItem('nav-tools:data-source-settings', '{invalid')
    storage.setItem('nav-tools:theme', 'system')

    const exported = buildConfigurationExport(storage, {
      applications,
      selectedApplicationId: undefined,
      exportedAt: new Date('2026-07-29T00:00:00.000Z'),
    })

    expect(exported.layouts).toEqual({})
    expect(exported.settings).toEqual({ theme: 'system' })
    expect(exported).not.toHaveProperty('selectedApplicationId')
  })

  it('creates a filesystem-safe timestamped filename', () => {
    expect(createConfigurationExportFilename(new Date('2026-07-29T10:20:30.000Z'))).toBe(
      'nav-tools-configuration-2026-07-29T10-20-30Z.json',
    )
  })
})
