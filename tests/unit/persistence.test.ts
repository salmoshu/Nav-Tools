import { describe, expect, it } from 'vitest'
import { ApplicationStorage } from '@/core/application/ApplicationStorage'
import { LayoutStorage } from '@/core/layout/LayoutStorage'
import { normalizePanelIds } from '@/core/panels/registry'
import { JsonStorage, type StorageLike } from '@/core/storage/JsonStorage'
import {
  DATA_SOURCE_SETTINGS_KEY,
  DataSourceStorage,
  LEGACY_CAMERA_STREAM_URL_KEY,
} from '@/core/data/DataSourceStorage'
import {
  CAMERA_PARAMETERS_SETTINGS_KEY,
  CameraParametersStorage,
} from '@/core/camera/CameraParametersStorage'

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
  it('seeds editable GNSS, Motor, and Camera applications on first launch', () => {
    const memory = new MemoryStorage()
    const applications = new ApplicationStorage(new JsonStorage(memory)).loadApplications()

    expect(applications.map((application) => application.name)).toEqual(['GNSS', 'Motor', 'Camera'])
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
    expect(applications[2]).toMatchObject({
      id: 'camera',
      icon: 'camera',
      windowIds: ['camera-video', 'camera-parameters'],
    })
    expect(memory.getItem('nav-tools:custom-applications')).not.toBeNull()
  })

  it('does not recreate default applications after the user saves an empty list', () => {
    const memory = new MemoryStorage()
    memory.setItem('nav-tools:custom-applications', JSON.stringify([]))

    expect(new ApplicationStorage(new JsonStorage(memory)).loadApplications()).toEqual([])
  })

  it('adds Camera once when upgrading an existing application list', () => {
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

    expect(storage.loadApplications().map(({ id }) => id)).toEqual(['custom', 'camera'])
    storage.saveApplications(storage.loadApplications().filter(({ id }) => id !== 'camera'))
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

    expect(storage.loadApplications()[0].windowIds).toEqual(['camera-video', 'camera-parameters'])
    storage.saveApplications([{ ...storage.loadApplications()[0], windowIds: ['camera-video'] }])
    expect(storage.loadApplications()[0].windowIds).toEqual(['camera-video'])
  })

  it('resets saved applications back to GNSS, Motor, and Camera defaults', () => {
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

    expect(applications.map((application) => application.id)).toEqual(['gnss', 'motor', 'camera'])
    expect(storage.loadApplications().map((application) => application.id)).toEqual([
      'gnss',
      'motor',
      'camera',
    ])
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
})

describe('DataSourceStorage', () => {
  it('migrates the legacy Camera URL into unified data-source settings', () => {
    const memory = new MemoryStorage()
    memory.setItem(LEGACY_CAMERA_STREAM_URL_KEY, 'rtsp://10.0.0.8:8554/camera')

    const settings = new DataSourceStorage(new JsonStorage(memory)).load()

    expect(settings.camera.url).toBe('rtsp://10.0.0.8:8554/camera')
    expect(settings.serial.parser).toBe('raw')
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
        camera: { url: 'invalid' },
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
    expect(settings.camera.url).toBe('rtsp://192.168.3.14:8554/rgbstream')
  })
})

describe('CameraParametersStorage', () => {
  it('persists camera command inputs across application restarts', () => {
    const memory = new MemoryStorage()
    const storage = new CameraParametersStorage(new JsonStorage(memory))

    storage.save({
      version: 1,
      host: '10.0.0.8',
      port: 9000,
      subCommand: 'bbox_draw',
      content: '06',
      contentIsHex: true,
    })

    expect(memory.getItem(CAMERA_PARAMETERS_SETTINGS_KEY)).not.toBeNull()
    expect(new CameraParametersStorage(new JsonStorage(memory)).load()).toEqual({
      version: 1,
      host: '10.0.0.8',
      port: 9000,
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
      host: '192.168.3.14',
      port: 8080,
      subCommand: '',
      content: '',
      contentIsHex: false,
    })
  })
})
