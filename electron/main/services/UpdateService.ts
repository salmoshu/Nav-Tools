import { app } from 'electron'
// electron-updater 是 CJS 包,ESM 主进程产物下需走默认导入再解构
import updaterPkg from 'electron-updater'
const { autoUpdater } = updaterPkg

export type UpdateStatusType =
  | 'checking'
  | 'update-available'
  | 'update-not-available'
  | 'download-progress'
  | 'update-downloaded'
  | 'error'

/** 主进程经 'update-status-changed' 推送给渲染进程的更新事件 */
export interface UpdateStatusEvent {
  type: UpdateStatusType
  version?: string
  releaseNotes?: string
  percent?: number
  message?: string
}

/** 更新偏好:由渲染端持久化(localStorage),初始化时经 'update-set-prefs' 传入主进程 */
export interface UpdaterPrefs {
  /** 启动时自动检查 */
  autoCheck: boolean
  /** 发现新版本自动后台下载 */
  autoDownload: boolean
  /** 用户忽略的版本号(仅出现更新的版本号时才重新提醒) */
  ignoredVersion?: string
}

export interface UpdateStatusTarget {
  isDestroyed(): boolean
  send(channel: string, payload: unknown): void
}

export const UPDATE_STATUS_CHANNEL = 'update-status-changed'

const DEFAULT_PREFS: UpdaterPrefs = { autoCheck: true, autoDownload: true }

/**
 * 清洗发布说明:electron-updater 在 latest.yml 缺省时回退到 GitHub Atom 源,
 * 此时 releaseNotes 是 HTML 字符串(含 <p>/<h2> 标签),直接当文本渲染会显示标签。
 * 新构建由 release-notes.md 注入 Markdown 原文,此处仅对 HTML 降级为纯文本。
 * 注意:Markdown 正文可能含反引号包裹的 <p> 字样,故含换行的一律按 Markdown 处理,
 * 只有无换行且确实含 HTML 标签的串才走去标签降级路径。
 */
function cleanReleaseNotes(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  if (!raw.includes('\n') && /<\/?[a-z][\s\S]*>/i.test(raw)) {
    return raw
      .replace(/<[^>]+>/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim()
  }
  return raw.trim()
}

/**
 * 从整份更新日志(release-notes.md 注入 latest.yml 的是全文,含所有历史版本)
 * 切出 `## vX.Y.Z` 小节:保留小节标题,到下一个 `## v` 标题为止;
 * 找不到对应版本返回 null(调用方回退全文)。
 */
function extractReleaseNotesSection(markdown: string, version: string): string | null {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const start = markdown.search(new RegExp('^##\\s+v?' + escaped + '\\s*$', 'm'))
  if (start === -1) return null
  const rest = markdown.slice(start)
  const next = rest.slice(1).search(/^##\s+v/m)
  return (next === -1 ? rest : rest.slice(0, next + 1)).trim()
}

export class UpdateService {
  private target: UpdateStatusTarget | null = null
  private prefs: UpdaterPrefs = { ...DEFAULT_PREFS }
  private wired = false
  /** 首次收到渲染端偏好后才做自动检查,确保 autoCheck=false 不生效前不触发 */
  private prefsReceived = false
  private autoCheckDone = false

  /** 绑定状态推送目标(主窗口 webContents);重复调用仅更新目标 */
  public attach(target: UpdateStatusTarget): void {
    this.target = target
    this.wireEvents()
  }

  /** 应用渲染端持久化的偏好;首次收到时在打包环境下按偏好做一次自动检查 */
  public applyPrefs(raw: unknown): void {
    this.prefs = normalizePrefs(raw)
    autoUpdater.autoDownload = this.prefs.autoDownload
    // 「退出应用时自动安装已下载的更新」固定开启
    autoUpdater.autoInstallOnAppQuit = true

    this.prefsReceived = true
    this.maybeAutoCheck()
  }

  /** 手动检查更新;结果经事件通道推送(不直接返回) */
  public async checkForUpdates(): Promise<void> {
    if (!app.isPackaged) {
      throw new Error('当前为开发环境，检查更新需在打包版本中运行')
    }
    await autoUpdater.checkForUpdates()
  }

  /** 手动触发下载(autoDownload 关闭时由更新弹框「立即下载」使用);进度经事件推送 */
  public async downloadUpdate(): Promise<void> {
    if (!app.isPackaged) {
      throw new Error('当前为开发环境，更新需在打包版本中运行')
    }
    await autoUpdater.downloadUpdate()
  }

  /**
   * 重启并安装已下载的更新。
   * isSilent=true:以 /S 调起 NSIS 安装器,更新过程不弹安装向导;
   * 安装引导页只在用户自行双击 exe 时出现(assisted installer 非 /S 运行)。
   * isForceRunAfter=true:静默安装完成后自动重启应用。
   */
  public quitAndInstall(): void {
    autoUpdater.quitAndInstall(true, true)
  }

  private wireEvents(): void {
    if (this.wired) return
    this.wired = true

    autoUpdater.on('checking-for-update', () => this.send({ type: 'checking' }))
    autoUpdater.on('update-available', (info) => {
      const notes = cleanReleaseNotes(info.releaseNotes)
      this.send({
        type: 'update-available',
        version: info.version,
        // latest.yml 注入的是整份更新日志:只展示新版本小节,切不到回退全文
        releaseNotes: notes
          ? (extractReleaseNotesSection(notes, info.version) ?? notes)
          : undefined,
      })
    })
    autoUpdater.on('update-not-available', () => this.send({ type: 'update-not-available' }))
    autoUpdater.on('download-progress', (progress) =>
      this.send({ type: 'download-progress', percent: Math.floor(progress.percent) }),
    )
    autoUpdater.on('update-downloaded', (info) =>
      this.send({ type: 'update-downloaded', version: info.version }),
    )
    autoUpdater.on('error', (err) =>
      this.send({ type: 'error', message: err?.message ?? String(err) }),
    )

    // 缺省全开:渲染端偏好到达前的兜底配置
    autoUpdater.autoDownload = this.prefs.autoDownload
    autoUpdater.autoInstallOnAppQuit = true
    this.maybeAutoCheck()
  }

  /** 开发环境跳过:electron-updater 依赖打包产物旁的 latest.yml,dev 下必报错 */
  private maybeAutoCheck(): void {
    if (this.autoCheckDone || !this.prefsReceived) return
    this.autoCheckDone = true
    if (app.isPackaged && this.prefs.autoCheck) {
      autoUpdater.checkForUpdates().catch(() => {})
    }
  }

  private send(payload: UpdateStatusEvent): void {
    if (this.target && !this.target.isDestroyed()) {
      this.target.send(UPDATE_STATUS_CHANNEL, payload)
    }
  }
}

function normalizePrefs(raw: unknown): UpdaterPrefs {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const ignored = value.ignoredVersion
  return {
    autoCheck: value.autoCheck !== false,
    autoDownload: value.autoDownload !== false,
    ignoredVersion: typeof ignored === 'string' && ignored ? ignored : undefined,
  }
}
