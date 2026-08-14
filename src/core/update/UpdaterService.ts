import { JsonStorage } from '../storage/JsonStorage'
import type { IpcTransport } from '../platform/IpcTransport'

export type UpdateStatusType =
  | 'checking'
  | 'update-available'
  | 'update-not-available'
  | 'download-progress'
  | 'update-downloaded'
  | 'error'

/** 主进程经 'update-status-changed' 推送的更新事件 */
export interface UpdateStatusEvent {
  type: UpdateStatusType
  version?: string
  releaseNotes?: string
  percent?: number
  message?: string
}

/** 更新偏好:渲染端 localStorage 持久化,变更时经 'update-set-prefs' 同步给主进程 */
export interface UpdaterPrefs {
  /** 启动时自动检查 */
  autoCheck: boolean
  /** 发现新版本自动后台下载 */
  autoDownload: boolean
  /** 用户忽略的版本号(仅出现更新的版本号时才重新提醒) */
  ignoredVersion?: string
}

export const UPDATER_PREFS_KEY = 'nav-tools:updater-prefs'

const DEFAULT_PREFS: UpdaterPrefs = { autoCheck: true, autoDownload: true }

export interface UpdaterPlatform {
  checkForUpdates(): Promise<void>
  downloadUpdate(): Promise<void>
  quitAndInstall(): Promise<void>
  setUpdaterPrefs(prefs: UpdaterPrefs): void
}

export class UpdaterService {
  private prefs: UpdaterPrefs
  /** 最近一次更新事件的缓存;progress/downloaded 事件不携带 releaseNotes 时从此合并保留 */
  private lastStatus: UpdateStatusEvent | null = null

  public constructor(
    private readonly platform: UpdaterPlatform,
    private readonly ipc: IpcTransport,
    private readonly storage: JsonStorage,
  ) {
    this.prefs = normalizePrefs(this.storage.read<unknown>(UPDATER_PREFS_KEY, undefined))
    // 初始化即把持久化偏好同步给主进程(主进程收到后才做自动检查)
    this.platform.setUpdaterPrefs(this.prefs)
  }

  public getPrefs(): UpdaterPrefs {
    return { ...this.prefs }
  }

  public setPrefs(patch: Partial<UpdaterPrefs>): UpdaterPrefs {
    this.prefs = { ...this.prefs, ...patch }
    this.storage.write(UPDATER_PREFS_KEY, this.prefs)
    this.platform.setUpdaterPrefs(this.prefs)
    return this.getPrefs()
  }

  /** 手动检查更新;结果经 onStatusChanged 推送 */
  public checkForUpdates(): Promise<void> {
    return this.platform.checkForUpdates()
  }

  /** 手动触发下载(autoDownload 关闭时使用);进度经 onStatusChanged 推送 */
  public downloadUpdate(): Promise<void> {
    return this.platform.downloadUpdate()
  }

  /** 重启并安装已下载的更新 */
  public quitAndInstall(): Promise<void> {
    return this.platform.quitAndInstall()
  }

  /**
   * 最近一次更新事件(已合并 releaseNotes)。
   * 供设置页等后挂载的视图恢复状态,不必等下一次推送。
   */
  public getLastStatus(): UpdateStatusEvent | null {
    return this.lastStatus
  }

  /** 订阅主进程更新事件,返回反注册函数;推送的事件均已合并 releaseNotes */
  public onStatusChanged(listener: (event: UpdateStatusEvent) => void): () => void {
    return this.ipc.on('update-status-changed', (_event, payload) => {
      if (isUpdateStatusEvent(payload)) listener(this.record(payload))
    })
  }

  private record(event: UpdateStatusEvent): UpdateStatusEvent {
    if (event.type === 'download-progress' || event.type === 'update-downloaded') {
      // 进度/下载完成事件不携带版本与更新内容:从 available 事件的缓存合并
      this.lastStatus = {
        ...event,
        version: event.version ?? this.lastStatus?.version,
        releaseNotes: this.lastStatus?.releaseNotes,
      }
    } else {
      this.lastStatus = event
    }
    return this.lastStatus
  }
}

function normalizePrefs(value: unknown): UpdaterPrefs {
  const saved = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const ignored = saved.ignoredVersion
  return {
    autoCheck: saved.autoCheck !== false,
    autoDownload: saved.autoDownload !== false,
    ignoredVersion: typeof ignored === 'string' && ignored ? ignored : undefined,
  }
}

function isUpdateStatusEvent(value: unknown): value is UpdateStatusEvent {
  if (typeof value !== 'object' || value === null) return false
  const type = (value as UpdateStatusEvent).type
  return (
    type === 'checking' ||
    type === 'update-available' ||
    type === 'update-not-available' ||
    type === 'download-progress' ||
    type === 'update-downloaded' ||
    type === 'error'
  )
}
