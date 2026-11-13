// 应用连接总览：按当前应用包含的组件（catalogGroup）派生数据通道清单，
// 为数据接入弹框提供状态卡片。各通道状态复用已有 store：
// 主数据源 → useDevice；RTSP/标定 SSH → 相机主进程服务快照；MCAP → useMcapPlayer；
// RTCM/RINEX → useGnssRaw。终端组件自管连接（多实例多配置），不参与总览。
import { computed, ref, watch, type ComputedRef } from 'vue'
import { ElMessage } from 'element-plus'
import { t } from '@/i18n'
import { useApplicationSelector } from '@/composables/useApplicationSelector'
import { useDevice } from '@/hooks/useDevice'
import { useMcapPlayer } from '@/composables/useMcapPlayer'
import { useGnssRaw } from '@/composables/useGnssRaw'
import { isCameraTcpDataConnected } from '@/core/camera/CameraConnectionStatus'
import { buildCameraStreamUrl, CameraVideoStorage } from '@/core/camera/CameraVideoStorage'
import { JsonStorage } from '@/core/storage/JsonStorage'

export type AppConnectionStatus = 'connected' | 'connecting' | 'disconnected'

export interface AppConnectionItem {
  id: string
  label: string
  proto: string
  endpoint: string
  status: AppConnectionStatus
  note?: string
  error?: string
  busy?: boolean
  action?: () => void
  actionLabel?: string
  configAction?: () => void
  configActionLabel?: string
}

export interface AppConnectionsContext {
  /** 跳转到数据接入弹框的指定配置页（由弹框宿主注入，切换其本地 activeTab） */
  gotoTab: (tab: 'serial' | 'network' | 'file') => void
}

// —— 相机专属通道状态（RTSP 会话 / 标定 SSH）：主进程快照 + 事件推送 ——
interface CameraStreamSessionInfo {
  url: string
  ownerWindowId: number
  status?: 'connecting' | 'playing'
}
const cameraStreamSessions = ref<CameraStreamSessionInfo[]>([])
const cameraStreamStarting = ref(false)
const cameraStreamError = ref('')
const retryingConnections = ref<string[]>([])
const cameraVideoStorage = new CameraVideoStorage(new JsonStorage(localStorage))
interface MeasurementSnapshot {
  ssh?: { state: string; host: string; port: number; detail?: string } | null
}
const calibrationSsh = ref<MeasurementSnapshot['ssh']>(null)
const cameraAccess = ref({
  host: '',
  port: 22,
  username: 'root',
  password: '',
  hasPassword: false,
})
let cameraAccessLoaded = false
let cameraAccessLoading: Promise<void> | undefined
const cameraSshConfigVisible = ref(false)
const cameraSshConnecting = ref(false)
const cameraSshPasswordLoading = ref(false)
const cameraSshError = ref('')
let calibrationRevision = 0

function applyMeasurementSnapshot(snapshot: MeasurementSnapshot | null): void {
  calibrationRevision++
  calibrationSsh.value = snapshot?.ssh ?? null
  if (snapshot?.ssh?.state === 'error') {
    cameraSshError.value = snapshot.ssh.detail || t('app.toolbar.appConnSshFailed')
  } else if (snapshot?.ssh?.state === 'streaming') {
    cameraSshError.value = ''
  }
}

let calSnapshotListening = false
function ensureCalibrationStateListener(): void {
  if (calSnapshotListening) return
  calSnapshotListening = true
  window.ipcRenderer?.on('camera-calibration-state', (_event, state) => {
    applyMeasurementSnapshot(state)
  })
}

let cameraStreamListening = false
function ensureCameraStreamListener(): void {
  if (cameraStreamListening) return
  cameraStreamListening = true
  window.ipcRenderer?.on('camera-stream-status', (_event, payload) => {
    if (payload?.status === 'error') {
      cameraStreamError.value = payload.message || t('common.video.errStartStream')
    } else if (payload?.status === 'playing') {
      cameraStreamError.value = ''
    }
    void refresh()
  })
}

async function refresh(): Promise<void> {
  ensureCalibrationStateListener()
  ensureCameraStreamListener()
  try {
    const revision = calibrationRevision
    const snap = (await window.ipcRenderer.invoke(
      'camera-calibration-snapshot',
    )) as MeasurementSnapshot | null
    if (revision === calibrationRevision) applyMeasurementSnapshot(snap)
  } catch {
    /* 快照不可用时忽略 */
  }
  try {
    cameraStreamSessions.value = (await window.ipcRenderer.invoke(
      'camera-stream-sessions',
    )) as CameraStreamSessionInfo[]
  } catch {
    cameraStreamSessions.value = []
  }
  try {
    await loadCameraAccess()
  } catch {
    /* 配置读取失败由打开配置框或连接操作反馈 */
  }
}

async function loadCameraAccess(): Promise<void> {
  if (cameraAccessLoaded) return
  if (!cameraAccessLoading) {
    cameraAccessLoading = (async () => {
      const access = (await window.ipcRenderer.invoke('camera-calibration-access')) as {
        host?: string
        port?: number
        username?: string
        hasPassword?: boolean
      } | null
      cameraAccess.value = {
        host: access?.host ?? '',
        port: access?.port ?? 22,
        username: access?.username ?? 'root',
        password: '',
        hasPassword: access?.hasPassword ?? false,
      }
      cameraAccessLoaded = true
    })().finally(() => {
      cameraAccessLoading = undefined
    })
  }
  await cameraAccessLoading
}

async function configureCameraSsh(): Promise<void> {
  cameraSshConfigVisible.value = true
  cameraSshPasswordLoading.value = true
  try {
    await loadCameraAccess()
    if (cameraAccess.value.password || !cameraAccess.value.hasPassword) return
    const password = await window.ipcRenderer.invoke('camera-calibration-password')
    if (cameraSshConfigVisible.value) cameraAccess.value.password = password
  } catch (error) {
    cameraSshError.value = error instanceof Error ? error.message : String(error)
  } finally {
    cameraSshPasswordLoading.value = false
  }
}

async function startCalibrationObservation(fallbackHost: string): Promise<boolean> {
  if (cameraSshConnecting.value) return false
  cameraSshConnecting.value = true
  cameraSshError.value = ''
  calibrationRevision++
  try {
    await loadCameraAccess()
    const access = { ...cameraAccess.value }
    const host = access.host.trim() || fallbackHost
    if (
      !host ||
      !access.username.trim() ||
      !Number.isInteger(access.port) ||
      access.port < 1 ||
      access.port > 65535 ||
      (!access.password && !access.hasPassword)
    ) {
      cameraSshError.value = t('app.toolbar.appConnSshMissingConfig')
      if (host) cameraAccess.value.host = host
      void configureCameraSsh()
      return false
    }
    const snapshot = (await window.ipcRenderer.invoke('camera-calibration-observe', {
      host,
      port: access.port,
      username: access.username.trim(),
      password: access.password,
    })) as MeasurementSnapshot | undefined
    if (snapshot?.ssh?.state !== 'streaming') {
      throw new Error(snapshot?.ssh?.detail || t('app.toolbar.appConnSshFailed'))
    }
    applyMeasurementSnapshot(snapshot)
    cameraAccess.value = { ...access, host, password: '', hasPassword: true }
    return true
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    applyMeasurementSnapshot({
      ssh: {
        state: 'error',
        host: cameraAccess.value.host || fallbackHost,
        port: cameraAccess.value.port,
        detail,
      },
    })
    ElMessage.error(cameraSshError.value)
    return false
  } finally {
    cameraSshConnecting.value = false
  }
}

async function stopCalibrationObservation(): Promise<void> {
  try {
    await window.ipcRenderer.invoke('camera-calibration-close')
    cameraSshError.value = ''
  } catch (error) {
    ElMessage.warning(error instanceof Error ? error.message : String(error))
  } finally {
    await refresh()
  }
}

async function startCameraConnection(host: string): Promise<void> {
  if (cameraStreamStarting.value) return
  const url = buildCameraStreamUrl(cameraVideoStorage.load(), host)
  if (!url || !window.electronAPI?.startCameraStream) {
    ElMessage.warning(t('common.video.errInvalidRtsp'))
    return
  }
  cameraStreamStarting.value = true
  cameraStreamError.value = ''
  try {
    const result = await window.electronAPI.startCameraStream(url)
    if (!result.ok) throw new Error(result.message || t('common.video.errStartStream'))
  } catch (error) {
    cameraStreamError.value = error instanceof Error ? error.message : String(error)
    ElMessage.error(cameraStreamError.value)
  } finally {
    cameraStreamStarting.value = false
    await refresh()
  }
}

async function stopCameraConnection(): Promise<void> {
  cameraStreamError.value = ''
  try {
    const sessions = [...cameraStreamSessions.value]
    const stopSession = window.electronAPI?.stopCameraStreamSession
    if (stopSession) {
      await Promise.all(sessions.map(({ ownerWindowId }) => stopSession(ownerWindowId)))
    } else {
      await window.electronAPI?.stopCameraStream?.()
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  } finally {
    await refresh()
  }
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export function useAppConnections(ctx: AppConnectionsContext): {
  items: ComputedRef<AppConnectionItem[]>
  cameraAccess: typeof cameraAccess
  cameraSshConfigVisible: typeof cameraSshConfigVisible
  cameraSshConnecting: typeof cameraSshConnecting
  cameraSshPasswordLoading: typeof cameraSshPasswordLoading
  cameraSshError: typeof cameraSshError
  connect: (fallbackHost: string) => Promise<boolean>
  refresh: () => Promise<void>
} {
  const { currentWindows } = useApplicationSelector()
  const device = useDevice()
  const mcap = useMcapPlayer()
  const gnssRaw = useGnssRaw()

  async function toggleMainSource(source: 'serial' | 'network' | 'file'): Promise<void> {
    if (device.deviceConnected.value) {
      device.closeCurrDevice()
      return
    }
    if (device.activeSource.value === source && device.globalDevice.value.connected === false) {
      device.openCurrDevice()
      return
    }
    device.activeTab.value = source
    await device.handleInputSubmit()
  }

  async function connectFileSource(): Promise<void> {
    device.activeTab.value = 'file'
    await device.handleInputSubmit()
  }

  function actionLabel(status: AppConnectionStatus): string {
    return status === 'connecting'
      ? t('app.toolbar.appConnConnecting')
      : status === 'connected'
        ? t('app.toolbar.appConnDisconnect')
        : t('app.toolbar.appConnConnect')
  }

  async function retryCameraConnection(id: string): Promise<void> {
    if (retryingConnections.value.includes(id)) return
    retryingConnections.value.push(id)
    try {
      if (id === 'main-source' || id === 'camera-control-tcp') {
        if (device.deviceConnecting.value) device.cancelNetworkConnect()
        await toggleMainSource('network')
      } else if (id === 'camera-rtsp') {
        await stopCameraConnection()
        await startCameraConnection(device.networkIp.value)
      } else if (id === 'camera-ssh-measure') {
        cameraSshConnecting.value = true
        try {
          await loadCameraAccess()
          await window.ipcRenderer.invoke('camera-calibration-reconnect', {
            host: cameraAccess.value.host.trim() || device.networkIp.value,
            port: cameraAccess.value.port,
            username: cameraAccess.value.username.trim(),
            password: cameraAccess.value.password,
          })
          cameraSshError.value = ''
        } catch (error) {
          cameraSshError.value = error instanceof Error ? error.message : String(error)
        } finally {
          cameraSshConnecting.value = false
          await refresh()
        }
      }
    } finally {
      retryingConnections.value = retryingConnections.value.filter((item) => item !== id)
    }
  }

  const items = computed<AppConnectionItem[]>(() => {
    const windows = currentWindows.value
    const groups = new Set(windows.map((w) => w.catalogGroup))
    const list: AppConnectionItem[] = []

    const mainStatus: AppConnectionStatus = device.deviceConnected.value
      ? 'connected'
      : device.deviceConnecting.value
        ? 'connecting'
        : 'disconnected'
    const source = device.activeSource.value

    // 主数据源（串口/网络/文件）：general/gnss 组件共用；终端组件自管连接，不参与
    const needMainSource = windows.some(
      (w) => (w.catalogGroup === 'general' || w.catalogGroup === 'gnss') && w.id !== 'terminal',
    )
    const sharesCameraControl = groups.has('camera') && needMainSource && source === 'network'
    if (needMainSource) {
      let proto = '—'
      let endpoint = '—'
      if (source === 'serial') {
        proto = 'Serial'
        endpoint = device.serialPort.value
          ? `${device.serialPort.value} @ ${device.serialBaudRate.value}`
          : '—'
      } else if (source === 'network') {
        proto = String(device.networkProtocol.value ?? 'TCP').toUpperCase()
        endpoint = device.networkIp.value
          ? `${device.networkIp.value}:${device.networkPort.value}`
          : '—'
      } else if (source === 'file') {
        proto = 'File'
        endpoint = device.filePath.value ? baseName(device.filePath.value) : '—'
      }
      list.push({
        id: 'main-source',
        label: sharesCameraControl
          ? t('app.toolbar.appConnControl')
          : t('app.toolbar.appConnMainSource'),
        proto,
        endpoint,
        status: mainStatus,
        busy: mainStatus === 'connecting',
        action: () => void toggleMainSource(source),
        actionLabel: actionLabel(mainStatus),
        configAction: () => ctx.gotoTab(source),
        configActionLabel: t('app.toolbar.appConnGotoConfig'),
      })
    }

    if (groups.has('camera')) {
      if (!sharesCameraControl) {
        const connected = isCameraTcpDataConnected(device.globalDevice.value, {
          host: device.networkIp.value,
          port: device.networkPort.value ?? 0,
        })
        const status: AppConnectionStatus = connected
          ? 'connected'
          : source === 'network' && mainStatus === 'connecting'
            ? 'connecting'
            : 'disconnected'
        list.push({
          id: 'camera-control-tcp',
          label: t('app.toolbar.appConnControl'),
          proto: 'TCP',
          endpoint: `${device.networkIp.value || '—'}:${device.networkPort.value || '—'}`,
          status,
          busy: status === 'connecting',
          action: () => void toggleMainSource('network'),
          actionLabel: actionLabel(status),
          configAction: () => ctx.gotoTab('network'),
          configActionLabel: t('app.toolbar.appConnGotoConfig'),
        })
      }

      const rtspActive = cameraStreamSessions.value.length > 0
      const rtspPlaying = cameraStreamSessions.value.some(
        (session) => session.status !== 'connecting',
      )
      const rtspConnecting =
        cameraStreamStarting.value ||
        cameraStreamSessions.value.some((session) => session.status === 'connecting')
      const rtspStatus: AppConnectionStatus = rtspPlaying
        ? 'connected'
        : rtspConnecting
          ? 'connecting'
          : 'disconnected'
      list.push({
        id: 'camera-rtsp',
        label: t('app.toolbar.appConnRtsp'),
        proto: 'RTSP',
        endpoint: buildCameraStreamUrl(cameraVideoStorage.load(), device.networkIp.value) ?? '—',
        status: rtspStatus,
        error: cameraStreamError.value || undefined,
        busy: cameraStreamStarting.value || retryingConnections.value.includes('camera-rtsp'),
        action: rtspActive
          ? () => void stopCameraConnection()
          : () => void startCameraConnection(device.networkIp.value),
        actionLabel: actionLabel(rtspStatus),
      })

      const ssh = calibrationSsh.value
      const sshConnected = ssh?.state === 'streaming'
      const sshConnecting = cameraSshConnecting.value || ssh?.state === 'connecting'
      const sshStatus: AppConnectionStatus = sshConnecting
        ? 'connecting'
        : sshConnected
          ? 'connected'
          : 'disconnected'
      list.push({
        id: 'camera-ssh-measure',
        label: t('app.toolbar.appConnSsh'),
        proto: 'SSH',
        endpoint: `${cameraAccess.value.host || ssh?.host || device.networkIp.value || '—'}:${cameraAccess.value.port}`,
        status: sshStatus,
        error: cameraSshError.value,
        busy: sshConnecting,
        action: sshConnected
          ? () => void stopCalibrationObservation()
          : () => void startCalibrationObservation(device.networkIp.value),
        actionLabel: actionLabel(sshStatus),
        configAction: () => void configureCameraSsh(),
        configActionLabel: t('app.toolbar.appConnGotoConfig'),
      })
    }

    if (groups.has('lidar')) {
      const ready = mcap.status.value === 'ready'
      const status: AppConnectionStatus = ready
        ? 'connected'
        : mcap.status.value === 'loading'
          ? 'connecting'
          : 'disconnected'
      list.push({
        id: 'lidar-mcap',
        label: t('app.toolbar.appConnMcap'),
        proto: 'MCAP',
        endpoint:
          mcap.fileInfo.value?.name ??
          (device.filePath.value ? baseName(device.filePath.value) : '—'),
        status,
        error: mcap.errorText.value || undefined,
        busy: status === 'connecting',
        action: ready
          ? () => {
              mcap.reset()
              device.closeCurrDevice()
            }
          : () => void connectFileSource(),
        actionLabel: actionLabel(status),
        configAction: () => ctx.gotoTab('file'),
        configActionLabel: t('app.toolbar.appConnGotoConfig'),
      })
    }

    if (groups.has('gnssraw')) {
      const ready = gnssRaw.status.value === 'ready'
      const status: AppConnectionStatus = ready
        ? 'connected'
        : gnssRaw.status.value === 'loading'
          ? 'connecting'
          : 'disconnected'
      list.push({
        id: 'gnssraw-file',
        label: t('app.toolbar.appConnGnssRaw'),
        proto: gnssRaw.kind.value ? gnssRaw.kind.value.toUpperCase() : 'File',
        endpoint:
          gnssRaw.fileInfo.value?.name ??
          (device.filePath.value ? baseName(device.filePath.value) : '—'),
        status,
        error: gnssRaw.errorText.value || undefined,
        busy: status === 'connecting',
        action: ready
          ? () => {
              gnssRaw.reset()
              device.closeCurrDevice()
            }
          : () => void connectFileSource(),
        actionLabel: actionLabel(status),
        configAction: () => ctx.gotoTab('file'),
        configActionLabel: t('app.toolbar.appConnGotoConfig'),
      })
    }

    return list
  })

  const previousCameraStatus = new Map<string, AppConnectionStatus>()
  let retryWasEnabled = false
  watch(
    () => [
      device.networkLoop.value,
      ...items.value.flatMap((item) => [item.status, item.error ?? '']),
    ],
    () => {
      const retryEnabled = device.networkLoop.value
      const activated = retryEnabled && !retryWasEnabled
      retryWasEnabled = retryEnabled
      const cameraItems = items.value.filter((item) =>
        ['main-source', 'camera-control-tcp', 'camera-rtsp', 'camera-ssh-measure'].includes(
          item.id,
        ),
      )
      const successful = cameraItems
        .filter(
          (item) =>
            item.status === 'connected' &&
            (activated || previousCameraStatus.get(item.id) !== 'connected'),
        )
        .map((item) => item.id)
      for (const item of cameraItems) previousCameraStatus.set(item.id, item.status)
      if (!retryEnabled || successful.length === 0) return
      for (const item of cameraItems) {
        if (successful.includes(item.id)) continue
        if (item.status === 'connecting' || item.error) void retryCameraConnection(item.id)
      }
    },
    { immediate: true, flush: 'post' },
  )

  return {
    items,
    cameraAccess,
    cameraSshConfigVisible,
    cameraSshConnecting,
    cameraSshPasswordLoading,
    cameraSshError,
    connect: startCalibrationObservation,
    refresh,
  }
}
