import { describe, expect, it } from 'vitest'
import { ApplicationStorage } from '@/core/application/ApplicationStorage'
import { LayoutStorage } from '@/core/layout/LayoutStorage'
import { normalizePanelIds } from '@/core/panels/registry'
import { JsonStorage, type StorageLike } from '@/core/storage/JsonStorage'
import { DATA_SOURCE_SETTINGS_KEY, DataSourceStorage } from '@/core/data/DataSourceStorage'
import {
  CAMERA_PARAMETERS_SETTINGS_KEY,
  CameraParametersStorage,
} from '@/core/camera/CameraParametersStorage'
import { CAMERA_VIDEO_SETTINGS_KEY } from '@/core/camera/CameraVideoStorage'

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
  it('seeds editable Serial, GNSS, Flow, and Camera applications on first launch', () => {
    const memory = new MemoryStorage()
    const applications = new ApplicationStorage(new JsonStorage(memory)).loadApplications()

    expect(applications.map((application) => application.name)).toEqual([
      'Serial',
      'GNSS',
      'Flow',
      'Camera',
    ])
    expect(applications[0]).toMatchObject({
      id: 'serial',
      icon: 'connection',
      windowIds: ['plot', 'raw-messages', 'motor-parameters'],
    })
    expect(applications[1]).toMatchObject({
      id: 'gnss',
      icon: 'position',
      windowIds: ['gnss-map', 'gnss-deviation', 'gnss-signals', 'sky-plot', 'raw-messages'],
    })
    expect(applications[2]).toMatchObject({
      id: 'motor',
      icon: 'motor',
      windowIds: ['plot', 'raw-messages', 'flow-deviation', 'motor-parameters'],
    })
    expect(applications[3]).toMatchObject({
      id: 'camera',
      icon: 'camera',
      windowIds: ['camera-video', 'camera-parameters', 'terminal'],
    })
    expect(memory.getItem('nav-tools:custom-applications')).not.toBeNull()
  })

  it('does not recreate default applications after the user saves an empty list', () => {
    const memory = new MemoryStorage()
    memory.setItem('nav-tools:custom-applications', JSON.stringify([]))

    expect(new ApplicationStorage(new JsonStorage(memory)).loadApplications()).toEqual([])
  })

  it('adds Camera and Serial once when upgrading an existing application list', () => {
    const memory = new MemoryStorage()
    memory.setItem(
      'nav-tools:custom-applications',
      JSON.stringify([
        {
          id: 'custom',
          name: 'Custom',
          description: '',
          icon: 'grid',
          accent: '#1677ff',
          windowIds: ['plot'],
        },
      ]),
    )
    const storage = new ApplicationStorage(new JsonStorage(memory))

    expect(storage.loadApplications().map(({ id }) => id)).toEqual(['custom', 'camera', 'serial'])
    storage.saveApplications(
      storage.loadApplications().filter(({ id }) => id !== 'camera' && id !== 'serial'),
    )
    expect(storage.loadApplications().map(({ id }) => id)).toEqual(['custom'])
  })

  it('adds Camera Parameters once to an existing Camera application', () => {
    const memory = new MemoryStorage()
    memory.setItem('nav-tools:migration:camera-default-v1', '1')
    memory.setItem(
      'nav-tools:custom-applications',
      JSON.stringify([
        {
          id: 'camera',
          name: 'Camera',
          description: '',
          icon: 'camera',
          accent: '#14b8a6',
          windowIds: ['camera-video'],
        },
      ]),
    )
    const storage = new ApplicationStorage(new JsonStorage(memory))

    expect(storage.loadApplications()[0].windowIds).toEqual([
      'camera-video',
      'camera-parameters',
      'terminal',
    ])
    storage.saveApplications([{ ...storage.loadApplications()[0], windowIds: ['camera-video'] }])
    expect(storage.loadApplications()[0].windowIds).toEqual(['camera-video'])
  })

  it('adds Terminal once to an existing Camera application', () => {
    const memory = new MemoryStorage()
    memory.setItem('nav-tools:migration:camera-default-v1', '1')
    memory.setItem('nav-tools:migration:camera-parameters-v1', '1')
    memory.setItem(
      'nav-tools:custom-applications',
      JSON.stringify([
        {
          id: 'camera',
          name: 'Camera',
          description: '',
          icon: 'camera',
          accent: '#14b8a6',
          windowIds: ['camera-video', 'camera-parameters'],
        },
      ]),
    )
    const storage = new ApplicationStorage(new JsonStorage(memory))

    expect(storage.loadApplications()[0].windowIds).toEqual([
      'camera-video',
      'camera-parameters',
      'terminal',
    ])
    storage.saveApplications([
      { ...storage.loadApplications()[0], windowIds: ['camera-video', 'camera-parameters'] },
    ])
    expect(storage.loadApplications()[0].windowIds).toEqual(['camera-video', 'camera-parameters'])
  })

  it('adds Serial once when upgrading an existing application list without Serial', () => {
    const memory = new MemoryStorage()
    memory.setItem('nav-tools:migration:camera-default-v1', '1')
    memory.setItem('nav-tools:migration:camera-parameters-v1', '1')
    memory.setItem(
      'nav-tools:custom-applications',
      JSON.stringify([
        {
          id: 'gnss',
          name: 'GNSS',
          description: '',
          icon: 'position',
          accent: '#0ea5e9',
          windowIds: ['raw-messages', 'gnss-deviation', 'gnss-signals', 'sky-plot'],
        },
      ]),
    )
    const storage = new ApplicationStorage(new JsonStorage(memory))

    expect(storage.loadApplications().map(({ id }) => id)).toEqual(['gnss', 'serial'])
    storage.saveApplications(storage.loadApplications().filter(({ id }) => id !== 'serial'))
    expect(storage.loadApplications().map(({ id }) => id)).toEqual(['gnss'])
  })

  it('renames Motor to Flow and adds deviation and parameters panels once when upgrading', () => {
    const memory = new MemoryStorage()
    memory.setItem(
      'nav-tools:custom-applications',
      JSON.stringify([
        {
          id: 'serial',
          name: 'Serial',
          description: '',
          icon: 'connection',
          accent: '#8b5cf6',
          windowIds: ['plot', 'raw-messages'],
        },
        {
          id: 'motor',
          name: 'Motor',
          description: 'Motor telemetry, command, and parameter workspace',
          icon: 'motor',
          accent: '#f97316',
          windowIds: ['plot', 'raw-messages', 'motor-parameters'],
        },
      ]),
    )
    const storage = new ApplicationStorage(new JsonStorage(memory))

    const [serialApplication, motorApplication] = storage.loadApplications()
    expect(serialApplication.windowIds).toEqual(['plot', 'raw-messages', 'motor-parameters'])
    expect(motorApplication.name).toBe('Flow')
    expect(motorApplication.description).toBe('Flow deviation, telemetry, and parameter workspace')
    expect(motorApplication.windowIds).toEqual([
      'plot',
      'raw-messages',
      'motor-parameters',
      'flow-deviation',
    ])
    storage.saveApplications([
      { ...serialApplication, windowIds: ['plot', 'raw-messages'] },
      { ...motorApplication, name: 'Custom Flow', windowIds: ['plot'] },
    ])
    const [serialAgain, motorAgain] = storage.loadApplications()
    expect(serialAgain.windowIds).toEqual(['plot', 'raw-messages'])
    expect(motorAgain.name).toBe('Custom Flow')
    expect(motorAgain.windowIds).toEqual(['plot'])
  })

  it('resets saved applications back to Serial, GNSS, Flow, and Camera defaults', () => {
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

    expect(applications.map((application) => application.id)).toEqual([
      'serial',
      'gnss',
      'motor',
      'camera',
    ])
    expect(storage.loadApplications().map((application) => application.id)).toEqual([
      'serial',
      'gnss',
      'motor',
      'camera',
    ])
  })

  it('persists an application reorder and keeps omitted applications in place', () => {
    const memory = new MemoryStorage()
    const storage = new ApplicationStorage(new JsonStorage(memory))
    const initial = storage.loadApplications()

    const reordered = storage.reorderApplications(initial, 3, 0)

    expect(reordered.map(({ id }) => id)).toEqual(['camera', 'serial', 'gnss', 'motor'])
    expect(
      new ApplicationStorage(new JsonStorage(memory)).loadApplications().map(({ id }) => id),
    ).toEqual(['camera', 'serial', 'gnss', 'motor'])

    const partial = storage.reorderApplications(reordered, 0, 2)
    expect(partial.map(({ id }) => id)).toEqual(['serial', 'gnss', 'camera', 'motor'])
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

  it('persists removed window ids so deleted panels are not restored', () => {
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

    const storage = new LayoutStorage(new JsonStorage(memory))
    storage.save('demo', [item], true, ['sky-plot'])

    expect(storage.load('demo')).toEqual({
      version: 1,
      items: [item],
      showStatusBar: true,
      removedWindowIds: ['sky-plot'],
    })
  })

  it('silently updates toolbar/statusbar visibility without touching layout items', () => {
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

    const storage = new LayoutStorage(new JsonStorage(memory))
    storage.save('demo', [item], true, [], true)

    // 静默更新可见性：toolbar 关、statusbar 开
    storage.updateVisibility('demo', true, false)

    const restored = storage.load('demo')
    expect(restored?.showStatusBar).toBe(true)
    expect(restored?.showToolBar).toBe(false)
    // 布局项保持不变
    expect(restored?.items).toEqual([item])
  })

  it('creates a visibility-only document when no layout exists yet', () => {
    const memory = new MemoryStorage()
    const storage = new LayoutStorage(new JsonStorage(memory))

    storage.updateVisibility('demo', false, true)

    const restored = storage.load('demo')
    expect(restored?.showStatusBar).toBe(false)
    expect(restored?.showToolBar).toBe(true)
    expect(restored?.items).toEqual([])
  })
})

describe('DataSourceStorage', () => {
  it('stores only the shared file, serial, and network data sources', () => {
    const memory = new MemoryStorage()

    const settings = new DataSourceStorage(new JsonStorage(memory)).load()

    expect(settings.serial.parser).toBe('raw')
    expect(settings).not.toHaveProperty('camera')
    expect(memory.getItem(DATA_SOURCE_SETTINGS_KEY)).not.toBeNull()
  })

  it('persists connection parameters and normalizes unsupported parsers', () => {
    const memory = new MemoryStorage()
    memory.setItem(
      DATA_SOURCE_SETTINGS_KEY,
      JSON.stringify({
        version: 1,
        serial: { port: 'COM7', baudRate: '921600', parser: 'nmea' },
        file: {
          path: 'sample.log',
          parser: 'json',
          timeTag: true,
          replaySpeed: 2,
          startOffset: 3,
          filePositionBytes: 8,
        },
        network: { protocol: 'udp', host: '0.0.0.0', port: 9000, parser: 'unknown' },
        camera: { url: 'rtsp://10.0.0.8:8554/camera' },
      }),
    )

    const settings = new DataSourceStorage(new JsonStorage(memory)).load()

    expect(settings.serial).toMatchObject({ port: 'COM7', baudRate: '921600', parser: 'nmea' })
    expect(settings.file).toMatchObject({
      path: 'sample.log',
      parser: 'json',
      timeTag: true,
      replaySpeed: 2,
      startOffset: 3,
      filePositionBytes: 8,
    })
    expect(settings.network).toMatchObject({
      protocol: 'udp',
      host: '0.0.0.0',
      port: 9000,
      parser: 'raw',
    })
    expect(settings).not.toHaveProperty('camera')
    expect(JSON.parse(memory.getItem(DATA_SOURCE_SETTINGS_KEY) ?? '{}')).not.toHaveProperty(
      'camera',
    )
    expect(JSON.parse(memory.getItem(CAMERA_VIDEO_SETTINGS_KEY) ?? '{}')).toMatchObject({
      protocol: 'rtsp',
      port: 8554,
      suffix: 'camera',
    })
  })

  it('defaults the active source to file when nothing is stored', () => {
    const memory = new MemoryStorage()

    const settings = new DataSourceStorage(new JsonStorage(memory)).load()

    expect(settings.activeSource).toBe('file')
  })

  it('persists and restores the active source across restarts', () => {
    const memory = new MemoryStorage()
    new DataSourceStorage(new JsonStorage(memory)).save({
      ...new DataSourceStorage(new JsonStorage(memory)).load(),
      activeSource: 'network',
    })

    const restored = new DataSourceStorage(new JsonStorage(memory)).load()

    expect(restored.activeSource).toBe('network')
  })

  it('normalizes an invalid active source back to file', () => {
    const memory = new MemoryStorage()
    memory.setItem(
      DATA_SOURCE_SETTINGS_KEY,
      JSON.stringify({
        version: 1,
        activeSource: 'camera',
        serial: {},
        file: {},
        network: {},
        camera: {},
      }),
    )

    const settings = new DataSourceStorage(new JsonStorage(memory)).load()

    expect(settings.activeSource).toBe('file')
  })

  it('persists a regex parser definition for each text source', () => {
    const memory = new MemoryStorage()
    const storage = new DataSourceStorage(new JsonStorage(memory))
    const settings = storage.load()
    const pattern = String.raw`(?<key>\w+)=(?<value>\S+)`

    settings.serial.parser = 'regex'
    settings.serial.regexPattern = pattern
    settings.file.parser = 'regex'
    settings.file.regexPattern = pattern
    settings.network.parser = 'regex'
    settings.network.regexPattern = pattern
    storage.save(settings)

    const restored = storage.load()
    expect(restored.serial).toMatchObject({ parser: 'regex', regexPattern: pattern })
    expect(restored.file).toMatchObject({ parser: 'regex', regexPattern: pattern })
    expect(restored.network).toMatchObject({ parser: 'regex', regexPattern: pattern })
  })
})

describe('CameraParametersStorage', () => {
  it('persists camera command inputs across application restarts', () => {
    const memory = new MemoryStorage()
    const storage = new CameraParametersStorage(new JsonStorage(memory))

    storage.save({
      version: 1,
      subCommand: 'bbox_draw',
      content: '06',
      contentIsHex: true,
    })

    expect(memory.getItem(CAMERA_PARAMETERS_SETTINGS_KEY)).not.toBeNull()
    expect(new CameraParametersStorage(new JsonStorage(memory)).load()).toEqual({
      version: 1,
      subCommand: 'bbox_draw',
      content: '06',
      contentIsHex: true,
    })
  })

  it('falls back safely when saved camera command inputs are invalid', () => {
    const memory = new MemoryStorage()
    memory.setItem(
      CAMERA_PARAMETERS_SETTINGS_KEY,
      JSON.stringify({ host: 1, port: 70000, subCommand: 'unknown', content: null }),
    )

    expect(new CameraParametersStorage(new JsonStorage(memory)).load()).toMatchObject({
      subCommand: '',
      content: '',
      contentIsHex: false,
    })
    expect(new CameraParametersStorage(new JsonStorage(memory)).load()).not.toHaveProperty('host')
    expect(new CameraParametersStorage(new JsonStorage(memory)).load()).not.toHaveProperty('port')
  })
})
