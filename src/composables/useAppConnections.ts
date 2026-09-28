// 应用连接总览：按当前应用包含的组件（catalogGroup）派生数据通道清单，
// 为数据接入弹框提供状态卡片。各通道状态复用已有 store：
// 主数据源 → useDevice；RTSP/标定 SSH → 相机主进程服务快照；MCAP → useMcapPlayer；
// RTCM/RINEX → useGnssRaw。终端组件自管连接（多实例多配置），不参与总览。
import { computed, ref, type ComputedRef } from 'vue'
import { ElMessage } from 'element-plus'
import { t } from '@/i18n'
import { useApplicationSelector } from '@/composables/useApplicationSelector'
import { useDevice } from '@/hooks/useDevice'
import { useMcapPlayer } from '@/composables/useMcapPlayer'
import { useGnssRaw } from '@/composables/useGnssRaw'

export type AppConnectionStatus = 'connected' | 'connecting' | 'disconnected'

export interface AppConnectionItem {
  id: string
  label: string
  proto: string
  endpoint: string
  status: AppConnectionStatus
  note?: string
  action?: () => void
  actionLabel?: string
}

export interface AppConnectionsContext {
  /** 跳转到数据接入弹框的指定配置页（由弹框宿主注入，切换其本地 activeTab） */
  gotoTab: (tab: 'serial' | 'network' | 'file') => void
}

// —— 相机专属通道状态（RTSP 会话 / 标定 SSH）：主进程快照 + 事件推送 ——
const cameraStreamSessions = ref<Array<{ url: string; ownerWindowId: number }>>([])
const calibrationSsh = ref<{ state: string; host: string; port: number } | null>(null)

let calSnapshotListening = false
function ensureCalibrationStateListener(): void {
  if (calSnapshotListening) return
  calSnapshotListening = true
  window.ipcRenderer?.on('camera-calibration-state', (_event, state) => {
    calibrationSsh.value =
      state?.ssh && state.observing
        ? { state: state.ssh.state, host: state.ssh.host, port: state.ssh.port }
        : null
  })
}

async function refresh(): Promise<void> {
  ensureCalibrationStateListener()
  try {
    const snap = (await window.ipcRenderer.invoke('camera-calibration-snapshot')) as {
      observing?: boolean
      ssh?: { state: string; host: string; port: number } | null
    } | null
    if (snap?.ssh && snap.observing) {
      calibrationSsh.value = { state: snap.ssh.state, host: snap.ssh.host, port: snap.ssh.port }
    }
  } catch {
    /* 快照不可用时忽略 */
  }
  try {
    cameraStreamSessions.value = (await window.ipcRenderer.invoke('camera-stream-sessions')) as Array<{
      url: string
      ownerWindowId: number
    }>
  } catch {
    cameraStreamSessions.value = []
  }
  try {
    const access = (await window.ipcRenderer.invoke('camera-calibration-access')) as {
      host?: string
      port?: number
    } | null
    if (access?.host) {
      calibrationSsh.value = {
        host: access.host,
        port: access.port ?? 22,
        state: calibrationSsh.value?.state ?? 'disconnected',
      }
    }
  } catch {
    calibrationSsh.value = null
  }
}

async function startCalibrationObservation(fallbackHost: string): Promise<void> {
  try {
    const access = (await window.ipcRenderer.invoke('camera-calibration-access')) as {
      host?: string
      port?: number
      username?: string
      hasPassword?: boolean
    } | null
    const host = access?.host || fallbackHost
    if (!host) return
    await window.ipcRenderer.invoke('camera-calibration-observe', {
      host,
      port: access?.port ?? 22,
      username: access?.username ?? 'root',
    })
  } catch (error) {
    ElMessage.warning(error instanceof Error ? error.message : String(error))
  }
}

async function stopCalibrationObservation(): Promise<void> {
  try {
    await window.ipcRenderer.invoke('camera-calibration-close')
  } catch (error) {
    ElMessage.warning(error instanceof Error ? error.message : String(error))
  }
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export function useAppConnections(ctx: AppConnectionsContext): {
  items: ComputedRef<AppConnectionItem[]>
  refresh: () => Promise<void>
} {
  const { currentWindows } = useApplicationSelector()
  const device = useDevice()
  const mcap = useMcapPlayer()
  const gnssRaw = useGnssRaw()

  const items = computed<AppConnectionItem[]>(() => {
    const windows = currentWindows.value
    const groups = new Set(windows.map((w) => w.catalogGroup))
    const list: AppConnectionItem[] = []

    const mainStatus: AppConnectionStatus = device.deviceConnected.value
      ? 'connected'
      : device.deviceConnecting.value
        ? 'connecting'
        : 'disconnected'

    // 主数据源（串口/网络/文件）：general/gnss 组件共用；终端组件自管连接，不参与
    const needMainSource = windows.some(
      (w) => (w.catalogGroup === 'general' || w.catalogGroup === 'gnss') && w.id !== 'terminal',
    )
    if (needMainSource) {
      const source = device.activeSource.value
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
        label: t('app.toolbar.appConnMainSource'),
        proto,
        endpoint,
        status: mainStatus,
        action: () => ctx.gotoTab(source),
        actionLabel: t('app.toolbar.appConnGotoConfig'),
      })
    }

    if (groups.has('camera')) {
      // 控制通道(TCP)：即主数据源的网络连接，在此呈现为相机控制
      list.push({
        id: 'camera-control-tcp',
        label: t('app.toolbar.appConnControl'),
        proto: 'TCP',
        endpoint: `${device.networkIp.value || '—'}:${device.networkPort.value || '—'}`,
        status: mainStatus,
        action: () => ctx.gotoTab('network'),
        actionLabel: t('app.toolbar.appConnGotoConfig'),
      })

      // 视频通道(RTSP)：由相机视频组件自动管理（播放时自动连接）
      const rtspActive = cameraStreamSessions.value.length > 0
      list.push({
        id: 'camera-rtsp',
        label: t('app.toolbar.appConnRtsp'),
        proto: 'RTSP',
        endpoint: `${device.networkIp.value || '—'}:8554`,
        status: rtspActive ? 'connected' : 'disconnected',
        note: t('app.toolbar.appConnRtspAuto'),
      })

      // 测量通道(SSH)：自动标定观测，可在此连接/断开
      const ssh = calibrationSsh.value
      const sshConnected = ssh?.state === 'streaming'
      const sshConnecting = ssh?.state === 'connecting'
      list.push({
        id: 'camera-ssh-measure',
        label: t('app.toolbar.appConnSsh'),
        proto: 'SSH',
        endpoint: `${ssh?.host ?? (device.networkIp.value || '—')}:${ssh?.port ?? 22}`,
        status: sshConnected ? 'connected' : sshConnecting ? 'connecting' : 'disconnected',
        action: sshConnected
          ? () => void stopCalibrationObservation()
          : () => void startCalibrationObservation(device.networkIp.value),
        actionLabel: sshConnected
          ? t('app.toolbar.appConnDisconnect')
          : t('app.toolbar.appConnConnect'),
      })
    }

    if (groups.has('lidar')) {
      list.push({
        id: 'lidar-mcap',
        label: t('app.toolbar.appConnMcap'),
        proto: 'MCAP',
        endpoint: mcap.fileInfo.value?.name ?? '—',
        status:
          mcap.status.value === 'ready'
            ? 'connected'
            : mcap.status.value === 'loading'
              ? 'connecting'
              : 'disconnected',
        action: () => ctx.gotoTab('file'),
        actionLabel: t('app.toolbar.appConnGotoConfig'),
      })
    }

    if (groups.has('gnssraw')) {
      list.push({
        id: 'gnssraw-file',
        label: t('app.toolbar.appConnGnssRaw'),
        proto: gnssRaw.kind.value ? gnssRaw.kind.value.toUpperCase() : 'File',
        endpoint: gnssRaw.fileInfo.value?.name ?? '—',
        status:
          gnssRaw.status.value === 'ready'
            ? 'connected'
            : gnssRaw.status.value === 'loading'
              ? 'connecting'
              : 'disconnected',
        action: () => ctx.gotoTab('file'),
        actionLabel: t('app.toolbar.appConnGotoConfig'),
      })
    }

    return list
  })

  return { items, refresh }
}
