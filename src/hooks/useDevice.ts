import { computed, ref, toRef, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useApplicationSelector } from '@/composables/useApplicationSelector'
import { useNmea } from '@/composables/gnss/useNmea'
import { useFileTimeline, type FileTimelineMode } from '@/composables/useFileTimeline'
import { useFlow } from '@/composables/flow/useFlow'
import { useConsole } from '@/composables/flow/useConsole'
import { useMotorCmd } from '@/composables/motor/useMotorCmd'
import { IncomingDataRouter } from '@/core/data/IncomingDataRouter'
import { activeDataTransport } from '@/core/device/ActiveDataTransport'
import { getWindowsByIds } from '@/settings/config'
import {
  NetworkService,
  validateNetworkOptions,
  type NetworkConnectionOptions,
  type NetworkProtocol,
} from '@/core/network/NetworkService'
import { createBrowserIpcTransport } from '@/core/platform/IpcTransport'
import {
  SerialService,
  extractSerialPortPath,
  type SerialDataBits,
  type SerialParity,
  type SerialPortOptions,
  type SerialStopBits,
} from '@/core/serial/SerialService'
import emitter from '@/hooks/useMitt'
import { useDataSourceManager } from '@/composables/useDataSourceManager'
import type { TextDataParser } from '@/core/data/DataSourceStorage'
import { createRecordRegex } from '@/core/data/TextRecordParser'
import { FilePlaybackService } from '@/core/file/FilePlaybackService'
import { TextFileStreamService } from '@/core/file/TextFileStreamService'
import { LogRecordingService } from '@/core/file/LogRecordingService'
import { t } from '@/i18n'

const {
  processRawData: addGnssData,
  clearData: clearGnssData,
  clearBuffer: clearGnssBuffer,
  beginBulkImport: beginGnssBulkImport,
  endBulkImport: endGnssBulkImport,
  rebuildMapTrackFromPositionHistory,
  rebuildDeviationFromPositionHistory,
  statusEpochHistory,
  applyTimelineEpoch,
  prepareTimelineProjection,
} = useNmea()
const {
  addRawData: addFlowData,
  initRawData: initFlowData,
  clearRawData: clearFlowData,
} = useFlow()
const {
  addMessages: initFlowConsole,
  addMessage: addFlowConsole,
  beginFileReplayMessages,
  addFileReplayData,
  endFileReplayMessages,
  clearMessages: clearFlowConsole,
  dataFormat: flowDataFormat,
  regexPattern: flowRegexPattern,
  displayFormat: flowDisplayFormat,
} = useConsole(true) // 使用全局实例
const { convertByteArrayToJson } = useMotorCmd()
const { activeDataModes, currentWindows } = useApplicationSelector()
const ipc = createBrowserIpcTransport()
const serialService = new SerialService(ipc)
const networkService = new NetworkService(ipc)
const filePlaybackService = new FilePlaybackService(ipc)
const textFileStreamService = new TextFileStreamService(ipc)
const fileTimeline = useFileTimeline()
const logRecordingService = new LogRecordingService(ipc)
const dataRouter = new IncomingDataRouter({
  appendGnss: addGnssData,
  appendRaw: addFlowConsole,
  appendPlot: (data) => addFlowData(data, activeDataParser.value, activeRegexPattern.value),
  decodeMotorHex: convertByteArrayToJson,
})
const { settings: dataSourceSettings, saveSettings: saveDataSourceSettings } =
  useDataSourceManager()

const isWindowActive = (windowId: string) =>
  currentWindows.value.some((windowDefinition) => windowDefinition.id === windowId)

const loadTextIntoActiveWindows = (content: string) => {
  let handled = false
  if (
    isWindowActive('plot') ||
    activeDataModes.value.includes('flow') ||
    activeDataModes.value.includes('motor')
  ) {
    initFlowData(content, activeDataParser.value, activeRegexPattern.value)
    handled = true
  }
  if (isWindowActive('raw-messages')) {
    initFlowConsole(content)
    handled = true
  }
  // GNSS 应用激活时，加载的文本文件（如 NMEA）也要进入 GNSS 解析管线，
  // 否则轨迹图会空白、只有 raw-messages 面板能看到导入内容。
  // 与重播路径保持一致：先清空旧轨迹再解析，保证导入数据干净可见。
  if (activeDataModes.value.includes('gnss')) {
    clearGnssData()
    addGnssData(content)
    handled = true
  }
  return handled
}

// 串口配置
const serialPort = toRef(dataSourceSettings.serial, 'port')
const serialBaudRate = toRef(dataSourceSettings.serial, 'baudRate')
const serialDataBits = toRef(dataSourceSettings.serial, 'dataBits')
const serialStopBits = toRef(dataSourceSettings.serial, 'stopBits')
const serialParity = toRef(dataSourceSettings.serial, 'parity')
const serialAdvanced = toRef(dataSourceSettings.serial, 'advanced')

// 网络配置
const networkProtocol = toRef(dataSourceSettings.network, 'protocol')
const networkIp = toRef(dataSourceSettings.network, 'host')
const networkPort = toRef(dataSourceSettings.network, 'port')
const networkLoop = toRef(dataSourceSettings.network, 'loop')

// 文件配置
const filePath = toRef(dataSourceSettings.file, 'path')
const fileTimeTag = toRef(dataSourceSettings.file, 'timeTag')
const fileReplaySpeed = toRef(dataSourceSettings.file, 'replaySpeed')
const fileStartOffset = toRef(dataSourceSettings.file, 'startOffset')
const filePositionBytes = toRef(dataSourceSettings.file, 'filePositionBytes')
const selectedFile = ref<File | null>(null)
const selectedFilePath = ref('')
const serialPorts = ref<string[]>([])
const logRecordingActive = ref(false)
const logRecordingPath = ref('')
// const fileContent = ref("");

// 创建全局设备变量，connected值：null(无设备)、true(有设备已连接)、false(有设备未连接)
const globalDevice = ref<{
  type?: 'serial' | 'network' | 'file'
  path?: string
  baudRate?: number
  dataBits?: number
  stopBits?: number
  parity?: string
  protocol?: NetworkProtocol
  host?: string
  port?: number
  connecting?: boolean
  connected: null | boolean
}>({ connected: null })

watch(fileReplaySpeed, (speed) => fileTimeline.setPlaybackSpeed(speed))
watch(fileTimeline.playing, (playing) => {
  if (globalDevice.value.type === 'file' && fileTimeline.active.value) {
    globalDevice.value.connected = playing
  }
})

const deviceConnected = computed(() => {
  return globalDevice.value.connected === true
})

// 连接尝试进行中（点击开关到成功/失败之间），用于工具栏即时 pending 反馈
const deviceConnecting = computed(() => {
  return globalDevice.value.connecting === true
})

const activeDataParser = computed<TextDataParser>(() => {
  if (globalDevice.value.type === 'serial') return dataSourceSettings.serial.parser
  if (globalDevice.value.type === 'network') return dataSourceSettings.network.parser
  if (globalDevice.value.type === 'file') return dataSourceSettings.file.parser
  return 'raw'
})

const activeRegexPattern = computed(() => {
  if (globalDevice.value.type === 'serial') return dataSourceSettings.serial.regexPattern
  if (globalDevice.value.type === 'network') return dataSourceSettings.network.regexPattern
  if (globalDevice.value.type === 'file') return dataSourceSettings.file.regexPattern
  return dataSourceSettings.file.regexPattern
})

watch(
  [activeDataParser, activeRegexPattern],
  ([parser, regexPattern]) => {
    flowDataFormat.value = parser === 'raw' ? 'none' : parser
    flowRegexPattern.value = regexPattern
  },
  { immediate: true },
)

function currentSerialOptions(): SerialPortOptions | undefined {
  const device = globalDevice.value
  if (
    device.type !== 'serial' ||
    !device.path ||
    !device.baudRate ||
    !device.dataBits ||
    !device.stopBits ||
    !device.parity
  )
    return undefined

  return {
    path: device.path,
    baudRate: device.baudRate,
    dataBits: device.dataBits as SerialDataBits,
    stopBits: device.stopBits as SerialStopBits,
    parity: device.parity as SerialParity,
  }
}

function currentNetworkOptions(): NetworkConnectionOptions | undefined {
  const device = globalDevice.value
  if (device.type !== 'network' || !device.protocol || !device.host || !device.port)
    return undefined
  return {
    protocol: device.protocol,
    host: device.host,
    port: device.port,
  }
}

// NETWORK 自动重连（loop 开关）：失败或断线后按固定间隔重试，
// 手动关闭/移除设备或关闭 loop 时取消调度
const NETWORK_RECONNECT_DELAY_MS = 3000
let networkReconnectTimer: ReturnType<typeof setTimeout> | null = null

function cancelNetworkReconnect(): void {
  if (networkReconnectTimer) {
    clearTimeout(networkReconnectTimer)
    networkReconnectTimer = null
  }
}

function scheduleNetworkReconnect(): void {
  cancelNetworkReconnect()
  if (!networkLoop.value) return
  if (globalDevice.value.type !== 'network' || globalDevice.value.connected !== false) return
  networkReconnectTimer = setTimeout(() => {
    networkReconnectTimer = null
    if (
      networkLoop.value &&
      globalDevice.value.type === 'network' &&
      globalDevice.value.connected === false &&
      !globalDevice.value.connecting
    ) {
      openNetworkDevice()
    }
  }, NETWORK_RECONNECT_DELAY_MS)
}

function openNetworkDevice(): void {
  const options = currentNetworkOptions()
  if (!options) return
  // 点击后立即置为 connecting，工具栏马上给出 pending 反馈，
  // 避免失败时长时间无反应让用户误以为没点上
  globalDevice.value.connecting = true
  networkService
    .open(options)
    .then(() => {
      globalDevice.value.connecting = false
      globalDevice.value.connected = true
      activeDataTransport.activate('network')
      const action =
        options.protocol === 'tcp' ? t('data.netConnectSuccess') : t('data.netListenSuccess')
      ElMessage({
        message: `${options.protocol.toUpperCase()} ${options.host}:${options.port} ${action}`,
        type: 'success',
        placement: 'bottom-right',
        offset: 50,
      })
    })
    .catch((error) => {
      globalDevice.value.connecting = false
      globalDevice.value.connected = false
      ElMessage({
        message: error instanceof Error ? error.message : String(error),
        type: 'error',
        placement: 'bottom-right',
        offset: 50,
      })
      scheduleNetworkReconnect()
    })
}

function routeIncomingData(data: string): void {
  if (globalDevice.value.connected !== true) return
  logRecordingService.write(data)
  dataRouter.route(data, {
    activeDataModes: activeDataModes.value,
    activeWindowIds: currentWindows.value.map((windowDefinition) => windowDefinition.id),
    displayFormat: flowDisplayFormat.value === 'hex' ? 'hex' : 'ascii',
  })
  // 只有持有已配置设备的渲染进程（即主窗口）才把原始数据广播给独立窗口
  if (globalDevice.value.connected !== null) {
    ipc.send('broadcast-incoming-data', data)
  }
}

/**
 * 将数据路由到指定独立窗口（用于 detached card window）
 */
export function routeDataToWindow(data: string, windowId: string): void {
  const windowDefinition = getWindowsByIds([windowId])[0]
  dataRouter.route(data, {
    activeDataModes: [windowDefinition?.funcMode ?? 'general'],
    activeWindowIds: [windowId],
    displayFormat: 'ascii',
  })
}

serialService.onData(routeIncomingData)
networkService.onData(routeIncomingData)
filePlaybackService.onData(routeIncomingData)

serialService.onDisconnected((data) => {
  if (globalDevice.value.path !== data.path) return
  globalDevice.value.connected = false
  activeDataTransport.clear('serial')
  void serialService.listPorts().then((ports) => {
    serialPorts.value = ports
  })
  ElMessage({
    message: t('data.serialDisconnected', { path: data.path }),
    type: 'warning',
    placement: 'bottom-right',
    offset: 50,
  })
})

networkService.onDisconnected((connection) => {
  const options = currentNetworkOptions()
  if (
    !options ||
    options.protocol !== connection.protocol ||
    options.host !== connection.host ||
    options.port !== connection.port
  )
    return

  globalDevice.value.connected = false
  activeDataTransport.clear('network')
  ElMessage({
    message:
      connection.reason ||
      t('data.netDisconnected', { protocol: connection.protocol.toUpperCase() }),
    type: 'warning',
    placement: 'bottom-right',
    offset: 50,
  })
  scheduleNetworkReconnect()
})

filePlaybackService.onStatus((status) => {
  if (globalDevice.value.type !== 'file' || globalDevice.value.path !== status.path) return

  if (status.state === 'playing') {
    globalDevice.value.connected = true
    // 每次（重新）开始播放都清空上一次的绘图数据，避免新旧轨迹叠加
    clearGnssBuffer()
    clearGnssData()
    clearFlowData()
    clearFlowConsole()
    ElMessage({
      message: t('data.tsPlayStarted'),
      type: 'success',
      placement: 'bottom-right',
      offset: 50,
    })
    return
  }

  globalDevice.value.connected = false
  if (status.state === 'completed') {
    ElMessage({
      message: t('data.tsPlayCompleted'),
      type: 'success',
      placement: 'bottom-right',
      offset: 50,
    })
  } else if (status.state === 'error') {
    ElMessage({
      message: t('data.tsPlayFailed', { message: status.message ?? t('data.unknownError') }),
      type: 'error',
      placement: 'bottom-right',
      offset: 50,
    })
  }
})

logRecordingService.onStatus((status) => {
  logRecordingActive.value = status.state === 'recording'
  logRecordingPath.value = status.state === 'recording' ? status.path : ''

  if (status.state === 'recording') {
    ElMessage({
      message: t('data.logRecordStart', { path: status.path }),
      type: 'success',
      placement: 'bottom-right',
      offset: 50,
    })
  } else if (status.state === 'stopped') {
    ElMessage({
      message: t('data.logSaved', { path: status.path }),
      type: 'success',
      placement: 'bottom-right',
      offset: 50,
    })
  } else {
    ElMessage({
      message: t('data.logRecordFailed', { message: status.message ?? t('data.unknownError') }),
      type: 'error',
      placement: 'bottom-right',
      offset: 50,
    })
  }
})

async function toggleLogRecording(): Promise<void> {
  try {
    if (logRecordingActive.value) {
      await logRecordingService.stop()
      return
    }
    await logRecordingService.start()
  } catch (error) {
    ElMessage({
      message: t('data.logRecordOpFailed', {
        error: error instanceof Error ? error.message : String(error),
      }),
      type: 'error',
      placement: 'bottom-right',
      offset: 50,
    })
  }
}

function yieldFileImport(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0))
}

type GnssTimelineReader = (
  onChunk: (chunk: string) => void,
  onProgress: (progress: number) => void,
) => Promise<void>

async function loadGnssTimelineSource(
  timelineMode: FileTimelineMode,
  readSource: GnssTimelineReader,
): Promise<void> {
  const streamPlot = isWindowActive('plot')
  const routeAuxiliaryText = (text: string) => {
    if (streamPlot) addFlowData(text)
    addFileReplayData(text)
  }
  const appendChunk = (chunk: string) => {
    if (!chunk) return
    addGnssData(chunk)
    routeAuxiliaryText(chunk)
  }

  fileTimeline.beginIndexing()
  globalDevice.value.connected = false
  clearGnssBuffer()
  clearGnssData()
  clearFlowData()
  clearFlowConsole()
  beginFileReplayMessages()
  beginGnssBulkImport()

  try {
    await readSource(appendChunk, fileTimeline.updateIndexingProgress)
    addGnssData('\n')
    routeAuxiliaryText('\n')
    if (timelineMode === 'loaded') {
      rebuildMapTrackFromPositionHistory()
      rebuildDeviationFromPositionHistory()
    }
    prepareTimelineProjection(timelineMode)
  } finally {
    endFileReplayMessages()
    endGnssBulkImport()
  }

  const attached = fileTimeline.attachTimeline(statusEpochHistory.value, {
    mode: timelineMode,
    speed: fileReplaySpeed.value,
    startElapsedMilliseconds: timelineMode === 'replay' ? fileStartOffset.value * 1000 : 0,
    applyEpoch: applyTimelineEpoch,
  })
  if (!attached) throw new Error(t('data.noGnssEpochs'))

  ElMessage({
    message: timelineMode === 'replay' ? t('data.tsPlayStarted') : t('data.dataLoadSuccess'),
    type: 'success',
    placement: 'bottom-right',
    offset: 50,
  })
}

async function loadGnssTimelineFile(file: File, timelineMode: FileTimelineMode): Promise<void> {
  await loadGnssTimelineSource(timelineMode, async (onChunk, onProgress) => {
    const decoder = new TextDecoder()
    let processedBytes = 0
    let bytesSinceYield = 0

    if (typeof file.stream === 'function') {
      const reader = file.stream().getReader()
      for (;;) {
        const result = await reader.read()
        if (result.done) break
        onChunk(decoder.decode(result.value, { stream: true }))
        processedBytes += result.value.byteLength
        bytesSinceYield += result.value.byteLength
        onProgress(file.size <= 0 ? 0 : (processedBytes / file.size) * 100)
        if (bytesSinceYield >= 2 * 1024 * 1024) {
          bytesSinceYield = 0
          await yieldFileImport()
        }
      }
      onChunk(decoder.decode())
      return
    }

    const content = await file.text()
    const chunkSize = 32 * 1024
    for (let offset = 0; offset < content.length; offset += chunkSize) {
      const chunk = content.slice(offset, offset + chunkSize)
      onChunk(chunk)
      onProgress(content.length === 0 ? 0 : ((offset + chunk.length) / content.length) * 100)
      bytesSinceYield += chunk.length
      if (bytesSinceYield >= 2 * 1024 * 1024) {
        bytesSinceYield = 0
        await yieldFileImport()
      }
    }
  })
}

async function loadGnssTimelinePath(path: string, timelineMode: FileTimelineMode): Promise<void> {
  await loadGnssTimelineSource(timelineMode, (onChunk, onProgress) =>
    textFileStreamService.read(path, { onChunk, onProgress }),
  )
}

function startTimestampPlayback(path: string): void {
  if (activeDataModes.value.includes('gnss')) {
    const loadTimeline =
      selectedFile.value && selectedFilePath.value === path
        ? loadGnssTimelineFile(selectedFile.value, 'replay')
        : window.ipcRenderer
          ? loadGnssTimelinePath(path, 'replay')
          : null

    if (!loadTimeline) {
      ElMessage({
        message: t('data.reselectFile'),
        type: 'warning',
        placement: 'bottom-right',
        offset: 50,
      })
      return
    }

    void filePlaybackService.stop()
    void loadTimeline.catch((error) => {
      fileTimeline.clearTimeline()
      clearGnssData()
      globalDevice.value.connected = false
      ElMessage({
        message: t('data.tsPlayFailed', {
          message: error instanceof Error ? error.message : String(error),
        }),
        type: 'error',
        placement: 'bottom-right',
        offset: 50,
      })
    })
    return
  }

  fileTimeline.clearTimeline()
  clearGnssBuffer()
  clearGnssData()
  clearFlowData()
  clearFlowConsole()
  void filePlaybackService
    .start({
      path,
      replaySpeed: fileReplaySpeed.value,
      startOffset: fileStartOffset.value,
      filePositionBytes: filePositionBytes.value,
    })
    .catch((error) => {
      if (globalDevice.value.type === 'file' && globalDevice.value.path === path) {
        globalDevice.value.connected = false
      }
      ElMessage({
        message: t('data.tsPlayFailed', {
          message: error instanceof Error ? error.message : String(error),
        }),
        type: 'error',
        placement: 'bottom-right',
        offset: 50,
      })
    })
}

/**
 * 设备管理组合式函数
 * 提供串口、网络和文件输入相关的状态和方法
 */
export function useDevice() {
  const isDragOver = ref(false)

  // 对话框状态
  const showInputDialog = ref(false)
  const activeTab = ref<'serial' | 'file' | 'network'>(dataSourceSettings.activeSource)
  let dataSourceSnapshot: typeof dataSourceSettings | undefined
  let dataSourceChangesCommitted = false

  const snapshotDataSourceSettings = (): typeof dataSourceSettings => ({
    version: 1,
    activeSource: dataSourceSettings.activeSource,
    serial: { ...dataSourceSettings.serial },
    file: { ...dataSourceSettings.file },
    network: { ...dataSourceSettings.network },
  })

  const restoreDataSourceSnapshot = () => {
    if (!dataSourceSnapshot) return
    dataSourceSettings.activeSource = dataSourceSnapshot.activeSource
    Object.assign(dataSourceSettings.serial, dataSourceSnapshot.serial)
    Object.assign(dataSourceSettings.file, dataSourceSnapshot.file)
    Object.assign(dataSourceSettings.network, dataSourceSnapshot.network)
  }

  const beginDataSourceEdit = () => {
    dataSourceSnapshot = snapshotDataSourceSettings()
    dataSourceChangesCommitted = false
  }

  watch(showInputDialog, (open) => {
    if (open) {
      if (!dataSourceSnapshot) beginDataSourceEdit()
      return
    }

    if (!dataSourceChangesCommitted) restoreDataSourceSnapshot()
    dataSourceSnapshot = undefined
  })

  const sourceParser = computed<TextDataParser>({
    get: () => {
      if (activeTab.value === 'serial') return dataSourceSettings.serial.parser
      if (activeTab.value === 'file') return dataSourceSettings.file.parser
      if (activeTab.value === 'network') return dataSourceSettings.network.parser
      return 'raw'
    },
    set: (parser) => {
      if (activeTab.value === 'serial') dataSourceSettings.serial.parser = parser
      if (activeTab.value === 'file') dataSourceSettings.file.parser = parser
      if (activeTab.value === 'network') dataSourceSettings.network.parser = parser
    },
  })

  const sourceRegexPattern = computed({
    get: () => {
      if (activeTab.value === 'serial') return dataSourceSettings.serial.regexPattern
      if (activeTab.value === 'file') return dataSourceSettings.file.regexPattern
      if (activeTab.value === 'network') return dataSourceSettings.network.regexPattern
      return dataSourceSettings.file.regexPattern
    },
    set: (pattern: string) => {
      if (activeTab.value === 'serial') dataSourceSettings.serial.regexPattern = pattern
      if (activeTab.value === 'file') dataSourceSettings.file.regexPattern = pattern
      if (activeTab.value === 'network') dataSourceSettings.network.regexPattern = pattern
    },
  })

  // 下拉框选项数据
  const baudRates = ['9600', '19200', '38400', '57600', '115200', '230400', '460800', '921600']
  const dataBits = ['5', '6', '7', '8']
  const stopBits = ['1', '1.5', '2']
  const parities = [
    { label: t('data.parityNone'), value: 'none' },
    { label: t('data.parityOdd'), value: 'odd' },
    { label: t('data.parityEven'), value: 'even' },
  ]

  // 仅响应操作系统文件拖入；vuedraggable 等内部拖拽的 types 不含 Files，
  // 直接放行，避免误触发文件拖入遮罩并干扰内部拖拽排序
  const isFileDrag = (event: DragEvent): boolean =>
    event.dataTransfer?.types.includes('Files') ?? false

  // 拖拽事件处理函数
  const handleDragOver = (event: DragEvent) => {
    if (!isFileDrag(event)) return
    event.preventDefault() // 允许放置
    event.stopPropagation()
  }

  const handleDragEnter = (event: DragEvent) => {
    if (!isFileDrag(event)) return
    event.preventDefault()
    event.stopPropagation()
    isDragOver.value = true
  }

  const handleDragLeave = (event: DragEvent) => {
    if (!isFileDrag(event)) return
    event.preventDefault()
    event.stopPropagation()
    // 检查是否完全离开容器
    const relatedTarget = event.relatedTarget as HTMLElement
    if (
      !relatedTarget ||
      !event.currentTarget ||
      !(event.currentTarget as HTMLElement).contains(relatedTarget)
    ) {
      isDragOver.value = false
    }
  }

  const handleDrop = async (event: DragEvent) => {
    if (!isFileDrag(event)) return
    event.preventDefault()
    event.stopPropagation()
    isDragOver.value = false

    if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      const files = Array.from(event.dataTransfer.files)

      for (const file of files) {
        try {
          // 根据文件类型进行不同处理
          // 不区分大小写的文件类型检查
          if (
            file.type.toLowerCase().includes('log') ||
            file.name.toLowerCase().endsWith('.log') ||
            file.type.toLowerCase().includes('text') ||
            file.name.toLowerCase().endsWith('.txt') ||
            file.type.toLowerCase().includes('dat') ||
            file.name.toLowerCase().endsWith('.dat')
          ) {
            // 处理文本文件
            const droppedPath = window.electronAPI?.getPathForFile(file) || file.name
            selectedFile.value = file
            selectedFilePath.value = droppedPath
            filePath.value = droppedPath
            globalDevice.value = {
              type: 'file',
              path: droppedPath,
              connected: false,
            }
            saveDataSourceSettings()

            if (activeDataModes.value.includes('gnss')) {
              await filePlaybackService.stop()
              await loadGnssTimelineFile(file, 'loaded')
              break
            }

            await handleTextFile(file)
          } else {
            // 其他文件类型
            ElMessage({
              message: t('data.fileTypeUnsupported', { name: file.name }),
              type: 'warning',
              placement: 'bottom-right',
              offset: 50,
            })
          }
        } catch (error) {
          if (activeDataModes.value.includes('gnss')) {
            fileTimeline.clearTimeline()
            clearGnssData()
          }
          ElMessage({
            message: t('data.fileProcessFailed', { name: file.name, error }),
            type: 'error',
            placement: 'bottom-right',
            offset: 50,
          })
        }
      }
    }
  }

  // 处理文本文件
  const handleTextFile = (file: File): Promise<void> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = (e) => {
        try {
          const content = e.target?.result as string

          if (loadTextIntoActiveWindows(content)) {
            ElMessage({
              message: t('data.fileImportSuccess', { name: file.name }),
              type: 'success',
              placement: 'bottom-right',
              offset: 50,
            })
          } else {
            emitter.emit('file-imported', { type: 'text', data: content, filename: file.name })
          }
          resolve()
        } catch (error) {
          ElMessage({
            message: t('data.textFileReadFailed', { name: file.name, error }),
            type: 'error',
            placement: 'bottom-right',
            offset: 50,
          })
          reject(error)
        }
      }

      reader.onerror = () => reject(new Error(t('data.fileReadFailed')))
      reader.readAsText(file)
    })
  }

  /**
   * 打开输入对话框
   */
  const inputDialog = (request?: unknown) => {
    if (!showInputDialog.value) beginDataSourceEdit()
    const requestedTab =
      typeof request === 'string'
        ? request
        : request && typeof request === 'object' && 'tab' in request
          ? (request as { tab?: unknown }).tab
          : undefined
    const requestedProtocol =
      request && typeof request === 'object' && 'protocol' in request
        ? (request as { protocol?: unknown }).protocol
        : undefined
    if (requestedTab === 'serial' || requestedTab === 'file' || requestedTab === 'network') {
      activeTab.value = requestedTab
    } else {
      // 未指定 tab 时回到上次确认的数据源：未确认（取消/关闭）的 tab 切换不留存
      activeTab.value = dataSourceSettings.activeSource
    }
    if (requestedTab === 'network' && requestedProtocol === 'tcp') networkProtocol.value = 'tcp'
    showInputDialog.value = true
    searchSerialPorts(true)
  }

  /**
   * 自动检索当前存在的串口设备
   */
  const searchSerialPorts = async (silent: boolean | Event = false): Promise<void> => {
    try {
      serialPorts.value = await serialService.listPorts()
    } catch (error) {
      console.error('自动检索串口设备失败:', error)
      if (silent !== true) {
        ElMessage({
          message: t('data.serialAutodetectFailed'),
          type: 'error',
          placement: 'bottom-right',
          offset: 50,
        })
      }
    }
  }

  /**
   * 处理串口配置提交
   * @returns 串口命令字符串
   */
  const handleSerialSubmit = (): string => {
    const friendlyName = serialPort.value
    const baudRate = serialBaudRate.value
    const dataBits = serialDataBits.value
    const stopBits = serialStopBits.value
    const parity = serialParity.value

    if (!friendlyName || !baudRate || !dataBits || !stopBits || !parity) return ''

    const port = extractSerialPortPath(friendlyName)

    if (globalDevice.value.connected === true) {
      if (globalDevice.value.path === port) {
        return port
      } else {
        closeCurrDevice()
      }
    }

    // 设置全局设备信息
    fileTimeline.clearTimeline()
    globalDevice.value = {
      type: 'serial',
      path: port,
      baudRate: Number(baudRate),
      dataBits: Number(dataBits),
      stopBits: Number(stopBits),
      parity: parity,
      connected: false,
    }

    saveDataSourceSettings()

    // 调用 openCurrDevice 函数打开设备
    openCurrDevice()

    return port
  }

  /**
   * 处理网络配置提交
   * @returns 网络命令字符串
   */
  const handleNetworkSubmit = (): string => {
    const options: NetworkConnectionOptions = {
      protocol: networkProtocol.value,
      host: networkIp.value.trim(),
      port: Number(networkPort.value),
    }
    const validationError = validateNetworkOptions(options)
    if (validationError) {
      ElMessage({
        message: validationError,
        type: 'warning',
        placement: 'bottom-right',
        offset: 50,
      })
      return ''
    }

    fileTimeline.clearTimeline()
    globalDevice.value = {
      type: 'network',
      path: `${options.protocol}://${options.host}:${options.port}`,
      protocol: options.protocol,
      host: options.host,
      port: options.port,
      connected: false,
    }
    saveDataSourceSettings()
    openCurrDevice()
    return globalDevice.value.path ?? ''
  }

  // 重构selectTargetFile函数，只负责选择文件并设置filePath
  const selectTargetFile = () => {
    // 创建一个隐藏的文件输入元素
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = '.txt,.csv,.dat,.log'
    fileInput.style.display = 'none'

    // 添加到文档中
    document.body.appendChild(fileInput)

    // 设置文件选择后的回调
    fileInput.onchange = (event) => {
      const target = event.target as HTMLInputElement
      const file = target.files?.[0]
      if (file) {
        // Electron 32+ 通过 preload 的 webUtils 获取文件系统路径。
        filePath.value = window.electronAPI?.getPathForFile(file) || file.name
        selectedFilePath.value = filePath.value

        // 在Electron环境中，可以考虑存储文件对象引用，以便后续读取
        if (file instanceof File) {
          // 存储文件对象引用
          selectedFile.value = file
        }
      }

      // 移除临时元素
      document.body.removeChild(fileInput)
    }

    // 触发文件选择对话框
    fileInput.click()
  }

  // 添加一个响应式变量来存储选择的文件对象
  // 重构handleFileSubmit函数，负责读取文件内容并初始化数据
  const handleFileSubmit = (): string => {
    const fileCmd = filePath.value.trim()

    if (!fileCmd) {
      ElMessage({
        message: t('data.selectFileFirst'),
        type: 'error',
        placement: 'bottom-right',
        offset: 50,
      })
      return ''
    }

    // 设置全局设备信息
    globalDevice.value = {
      type: 'file',
      path: fileCmd,
      connected: false,
    }
    saveDataSourceSettings()

    if (fileTimeTag.value) {
      startTimestampPlayback(fileCmd)
      return fileCmd
    }

    void filePlaybackService.stop()

    if (activeDataModes.value.includes('gnss')) {
      const loadTimeline =
        selectedFile.value && selectedFilePath.value === fileCmd
          ? loadGnssTimelineFile(selectedFile.value, 'loaded')
          : window.ipcRenderer
            ? loadGnssTimelinePath(fileCmd, 'loaded')
            : null

      if (!loadTimeline) {
        ElMessage({
          message: t('data.reselectFile'),
          type: 'warning',
          placement: 'bottom-right',
          offset: 50,
        })
        return fileCmd
      }

      void loadTimeline.catch((error) => {
        fileTimeline.clearTimeline()
        clearGnssData()
        ElMessage({
          message: t('data.dataLoadFailed', {
            error: error instanceof Error ? error.message : String(error),
          }),
          type: 'error',
          placement: 'bottom-right',
          offset: 50,
        })
      })
      return fileCmd
    }

    // 如果有文件对象引用，直接使用它读取内容
    if (selectedFile.value) {
      fileTimeline.clearTimeline()
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = e.target?.result as string
        try {
          if (loadTextIntoActiveWindows(content)) {
            ElMessage({
              message: t('data.dataLoadSuccess'),
              type: 'success',
              placement: 'bottom-right',
              offset: 50,
            })
          }
        } catch (error) {
          ElMessage({
            message: t('data.dataLoadFailed', { error }),
            type: 'error',
            placement: 'bottom-right',
            offset: 50,
          })
        }
      }

      reader.onerror = () => {
        ElMessage({
          message: t('data.fileReadError'),
          type: 'error',
          placement: 'bottom-right',
          offset: 50,
        })
      }

      reader.readAsText(selectedFile.value)
    } else {
      // 如果没有文件对象，显示提示信息
      ElMessage({
        message: t('data.reselectFile'),
        type: 'warning',
        placement: 'bottom-right',
        offset: 50,
      })
    }

    return fileCmd
  }

  const openCurrDevice = () => {
    if (globalDevice.value.connected === false) {
      if (globalDevice.value.connecting === true) return
      if (globalDevice.value.type === 'serial') {
        const options = currentSerialOptions()
        if (!options) return
        globalDevice.value.connecting = true
        serialService
          .open(options)
          .then(() => {
            globalDevice.value.connecting = false
            globalDevice.value.connected = true
            activeDataTransport.activate('serial')

            ElMessage({
              message: t('data.serialOpenSuccess', { path: globalDevice.value.path }),
              type: 'success',
              placement: 'bottom-right',
              offset: 50,
            })
          })
          .catch((error) => {
            globalDevice.value.connecting = false
            ElMessage({
              message: `${error.message}`,
              type: 'error',
              placement: 'bottom-right',
              offset: 50,
            })
          })
      } else if (globalDevice.value.type === 'network') {
        openNetworkDevice()
      } else if (globalDevice.value.type === 'file' && globalDevice.value.path) {
        if (fileTimeline.active.value) fileTimeline.play()
        else if (fileTimeTag.value) startTimestampPlayback(globalDevice.value.path)
      }
    }
  }

  const removeCurrDevice = () => {
    if (globalDevice.value.connected !== null) {
      if (globalDevice.value.type === 'serial') {
        const options = currentSerialOptions()
        if (!options) return
        serialService.close(options).then(() => {
          activeDataTransport.clear('serial')
          globalDevice.value = { connected: null }
        })
      } else if (globalDevice.value.type === 'network') {
        cancelNetworkReconnect()
        networkService.close().then(() => {
          activeDataTransport.clear('network')
          globalDevice.value = { connected: null }
        })
      } else if (globalDevice.value.type === 'file') {
        fileTimeline.clearTimeline()
        filePlaybackService.stop().then(() => {
          globalDevice.value = { connected: null }
        })
      }
    }
  }

  const closeCurrDevice = () => {
    if (globalDevice.value.connected !== null) {
      if (globalDevice.value.type === 'serial') {
        const options = currentSerialOptions()
        if (!options) return
        serialService.close(options).then(() => {
          activeDataTransport.clear('serial')
          if (globalDevice.value.type) {
            globalDevice.value.connected = false
          }
        })
      } else if (globalDevice.value.type === 'network') {
        cancelNetworkReconnect()
        networkService.close().then(() => {
          activeDataTransport.clear('network')
          if (globalDevice.value.type === 'network') globalDevice.value.connected = false
        })
      } else if (globalDevice.value.type === 'file') {
        globalDevice.value.connected = false
        fileTimeline.pause()
        filePlaybackService.stop().then(() => {
          if (globalDevice.value.type === 'file') globalDevice.value.connected = false
        })
      }
    }
  }

  /**
   * 提交输入表单
   */
  const handleInputSubmit = () => {
    if (sourceParser.value === 'regex') {
      try {
        createRecordRegex(sourceRegexPattern.value)
      } catch (error) {
        ElMessage({
          message: t('data.regexPatternInvalid', {
            message: error instanceof Error ? error.message : String(error),
          }),
          type: 'error',
          placement: 'bottom-right',
          offset: 50,
        })
        return
      }
    }

    let command = ''

    switch (activeTab.value) {
      case 'serial':
        command = handleSerialSubmit()
        break
      case 'network':
        command = handleNetworkSubmit()
        break
      case 'file':
        command = handleFileSubmit()
        break
    }

    if (command) {
      dataSourceChangesCommitted = true
      dataSourceSettings.activeSource = activeTab.value
      saveDataSourceSettings()
      if (activeTab.value !== 'file') {
        console.log('输入的指令:', command)
      }
      showInputDialog.value = false
    } else {
      ElMessage({
        message: t('data.enterCommand'),
        type: 'warning',
        placement: 'bottom-right',
        offset: 50,
      })
    }
  }

  // 暴露需要使用的状态和方法
  return {
    showInputDialog,
    activeTab,
    serialPort,
    serialBaudRate,
    serialDataBits,
    serialStopBits,
    serialParity,
    serialAdvanced,
    filePath,
    fileTimeTag,
    fileReplaySpeed,
    fileStartOffset,
    filePositionBytes,
    networkIp,
    networkPort,
    networkProtocol,
    networkLoop,
    sourceParser,
    sourceRegexPattern,
    activeDataParser,
    serialPorts,
    baudRates,
    dataBits,
    stopBits,
    parities,
    deviceConnected,
    deviceConnecting,
    logRecordingActive,
    logRecordingPath,
    globalDevice,
    isDragOver,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    selectTargetFile,
    handleInputSubmit,
    inputDialog,
    openCurrDevice,
    closeCurrDevice,
    removeCurrDevice,
    toggleLogRecording,
    searchSerialPorts,
  }
}
