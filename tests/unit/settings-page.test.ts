import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { IpcTransport } from '../../src/core/platform/IpcTransport'
import { JsonStorage } from '../../src/core/storage/JsonStorage'
import {
  UPDATER_PREFS_KEY,
  UpdaterService,
  type UpdateStatusEvent,
  type UpdaterPlatform,
} from '../../src/core/update/UpdaterService'

const readProjectFile = (path: string) => readFileSync(path, 'utf8')

describe('full-page settings', () => {
  const header = readProjectFile('src/components/AppHeader.vue', 'utf8')
  const app = readProjectFile('src/App.vue', 'utf8')
  const page = readProjectFile('src/components/SettingsPage.vue', 'utf8')

  it('opens the settings page through the event bus instead of a dropdown menu', () => {
    expect(header).toContain("emitter.emit('open-settings')")
    expect(header).not.toContain('settingsOpen')
    expect(header).not.toContain('settings-menu')
    expect(header).not.toContain('toggleSettingsMenu')
    expect(app).toContain("emitter.on('open-settings'")
    expect(app).toContain('<SettingsPage')
  })

  it('keeps the dashboard mounted while the settings page is open', () => {
    // v-show 而非 v-if：打开设置页时保留 Dashboard 的布局与连接状态
    expect(app).toContain('v-show="!settingsOpen"')
  })

  it('registers theme, language and version sections in the settings page', () => {
    expect(page).toContain("{ key: 'theme'")
    expect(page).toContain("{ key: 'language'")
    expect(page).toContain("{ key: 'version'")
    expect(page).toContain('setTheme')
    expect(page).toContain('setLocale')
    // 返回入口：关闭设置页回到 Dashboard
    expect(page).toContain("$emit('close')")
  })

  it('mounts the global update dialog once for non-card windows', () => {
    expect(app).toContain('<UpdateDialog v-if="!isCardWindow" />')
  })

  it('drives the version section from the shared UpdaterService state', () => {
    expect(page).toContain('updater.getLastStatus()')
    expect(page).toContain('updater.onStatusChanged')
    // 偏好变更经 setPrefs 持久化并同步主进程
    expect(page).toContain('updater.setPrefs')
    // 不在设置页重复实现事件合并逻辑
    expect(page).not.toContain('releaseNotes: updaterEvent.value?.releaseNotes')
  })
})

interface UpdaterHarness {
  service: UpdaterService
  emit: (event: UpdateStatusEvent) => void
  platform: UpdaterPlatform & { syncedPrefs: unknown[] }
  storageData: Map<string, string>
}

function createUpdater(saved?: string): UpdaterHarness {
  const storageData = new Map<string, string>()
  if (saved !== undefined) storageData.set(UPDATER_PREFS_KEY, saved)
  const storage = new JsonStorage({
    getItem: (key) => storageData.get(key) ?? null,
    setItem: (key, value) => void storageData.set(key, value),
    removeItem: (key) => void storageData.delete(key),
  })
  let listener: ((event: unknown, payload: unknown) => void) | undefined
  const ipc: IpcTransport = {
    invoke: () => Promise.resolve(undefined),
    send: () => undefined,
    on: (_channel, l) => {
      listener = l
      return () => {
        listener = undefined
      }
    },
  }
  const platform: UpdaterPlatform & { syncedPrefs: unknown[] } = {
    syncedPrefs: [],
    checkForUpdates: () => Promise.resolve(),
    downloadUpdate: () => Promise.resolve(),
    quitAndInstall: () => Promise.resolve(),
    setUpdaterPrefs(prefs) {
      this.syncedPrefs.push(prefs)
    },
  }
  const service = new UpdaterService(platform, ipc, storage)
  // 常驻订阅模拟 UpdateDialog 的全局监听：事件记录依赖至少一个活跃订阅
  service.onStatusChanged(() => undefined)
  return {
    service,
    platform,
    storageData,
    emit: (event) => listener?.(undefined, event),
  }
}

describe('UpdaterService status cache', () => {
  it('syncs persisted prefs to the main process on startup', () => {
    const { platform } = createUpdater()
    expect(platform.syncedPrefs).toEqual([{ autoCheck: true, autoDownload: true }])
  })

  it('persists pref changes and re-syncs them to the main process', () => {
    const { service, platform, storageData } = createUpdater()
    service.setPrefs({ autoDownload: false })
    expect(JSON.parse(storageData.get(UPDATER_PREFS_KEY) ?? '')).toMatchObject({
      autoCheck: true,
      autoDownload: false,
    })
    expect(platform.syncedPrefs.at(-1)).toMatchObject({ autoDownload: false })
  })

  it('merges version and releaseNotes into progress/downloaded events', () => {
    const { service, emit } = createUpdater()
    emit({ type: 'update-available', version: '1.3.1', releaseNotes: '# 新增\n- 整页设置' })
    emit({ type: 'download-progress', percent: 42 })
    expect(service.getLastStatus()).toEqual({
      type: 'download-progress',
      percent: 42,
      version: '1.3.1',
      releaseNotes: '# 新增\n- 整页设置',
    })
    emit({ type: 'update-downloaded', version: '1.3.1' })
    expect(service.getLastStatus()?.releaseNotes).toBe('# 新增\n- 整页设置')
  })

  it('exposes the merged last status to late subscribers', () => {
    const { service, emit } = createUpdater()
    emit({ type: 'update-available', version: '1.3.1', releaseNotes: 'notes' })
    emit({ type: 'download-progress', percent: 10 })
    const received: UpdateStatusEvent[] = []
    service.onStatusChanged((e) => received.push(e))
    emit({ type: 'download-progress', percent: 20 })
    expect(received.at(-1)).toMatchObject({ version: '1.3.1', releaseNotes: 'notes', percent: 20 })
  })

  it('ignores malformed payloads', () => {
    const { service, emit } = createUpdater()
    emit({ type: 'bogus' } as unknown as UpdateStatusEvent)
    expect(service.getLastStatus()).toBeNull()
  })
})
