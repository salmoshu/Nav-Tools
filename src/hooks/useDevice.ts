import { computed, reactive, ref, toRef, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useApplicationSelector } from '@/composables/useApplicationSelector'
import { useNmea } from '@/composables/gnss/useNmea'
import { createGnssLiveHistory } from '@/composables/gnss/useGnssLiveHistory'
import { useGnssStore } from '@/stores/gnss'
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
import { useMcapPlayer } from '@/composables/useMcapPlayer'
import { useGnssRaw } from '@/composables/useGnssRaw'
import { RecentInputFiles } from '@/core/file/RecentInputFiles'
import { mcapBasename } from '@/core/lidar/McapFileAccess'
import { mcapPartIndex } from '@/core/lidar/McapPartFamily'
import { JsonStorage } from '@/core/storage/JsonStorage'
import { useDataSourceManager } from '@/composables/useDataSourceManager'
import type { TextDataParser } from '@/core/data/DataSourceStorage'
import { createRecordRegex } from '@/core/data/TextRecordParser'
import { detectGnssTextParser } from '@/core/data/GnssTextFormat'
import { detectDataFormat, DETECTABLE_FORMATS, FORMAT_LABELS, isTextFormat, type DataFormat, type DetectableFormat, type FormatDetection } from '@/core/data/DataFormat'
import { useAutoFormatSettings } from '@/composables/useAutoFormatSettings'
import { FilePlaybackService } from '@/core/file/FilePlaybackService'
import { TextFileStreamService } from '@/core/file/TextFileStreamService'
import { buildTextTimeline } from '@/core/file/TextEpochStore'
import { LogRecordingService } from '@/core/file/LogRecordingService'
import { t } from '@/i18n'

const {
  processRawData: addGnssData,
  processRtkLibPosData: addRtkLibPosData,
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
  appendRecord: appendFlowRecord,
  clearRawData: clearFlowData,
  flowData,
} = useFlow()
const {
  addMessages: initFlowConsole,
  addMessage: addFlowConsole,
  beginFileReplayMessages,
  addFileReplayData,
  endFileReplayMessages,
  setFileReplayElapsedResolver,
  clearMessages: clearFlowConsole,
  dataFormat: flowDataFormat,
  regexPattern: flowRegexPattern,
  displayFormat: flowDisplayFormat,
} = useConsole(true) // 使用全局实例
const { convertByteArrayToJson } = useMotorCmd()
const { activeDataModes, currentWindows, currentApplication } = useApplicationSelector()
const autoFormatSettings = useAutoFormatSettings()
const detectedFormats = reactive<Record<'file' | 'serial' | 'network', FormatDetection | undefined>>({
  file: undefined, serial: undefined, network: undefined,
})
const formatAttempted = reactive({ file: false, serial: false, network: false })
function allowedFormats(): DetectableFormat[] {
  return autoFormatSettings.formatsFor(currentApplication.value?.id, currentApplication.value?.windowIds)
}
function inspectFormat(bytes: Uint8Array, name: string, mode: DataFormat): FormatDetection | undefined {
  if (mode !== 'auto') return detectDataFormat(bytes, name, DETECTABLE_FORMATS)
  const allowed = allowedFormats()
  const matched = detectDataFormat(bytes, name, allowed)
  if (matched) return matched
  const disabled = detectDataFormat(bytes, name, DETECTABLE_FORMATS)
  return disabled && !allowed.includes(disabled.format) ? { ...disabled, disabled: true } : undefined
}
function effectiveFormat(source: 'file' | 'serial' | 'network'): DataFormat {
  const mode = dataSourceSettings[source].format
  const result = detectedFormats[source]
  return mode === 'auto' ? (result?.candidate || (result && !allowedFormats().includes(result.format)) ? 'raw' : result?.format ?? 'raw') : mode
}
const ipc = createBrowserIpcTransport()
const serialService = new SerialService(ipc)
const networkService = new NetworkService(ipc)
const filePlaybackService = new FilePlaybackService(ipc)
const textFileStreamService = new TextFileStreamService(ipc)
const fileTimeline = useFileTimeline()
const gnssLiveHistory = createGnssLiveHistory({
  data: useNmea(),
  messages: useConsole(true),
  timeline: fileTimeline,
  generation: () => useGnssStore().trackResetToken,
})
const logRecordingService = new LogRecordingService(ipc)
const dataRouter = new IncomingDataRouter({
  appendGnss: appendGnssDataByParser,
  appendRaw: addFlowConsole,
  appendPlot: (data) =>
    addFlowData(
      data,
      activeDataParser.value === 'rtklib-pos' ? 'raw' : activeDataParser.value,
      activeRegexPattern.value,
    ),
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
    // .csv 文件按 CSV 表头解析（首行表头作为字段 key），与解析器下拉选择解耦
    const parser = activeDataParser.value === 'rtklib-pos' ? 'raw' : activeDataParser.value
    initFlowData(content, parser, activeRegexPattern.value)
    handled = true
  }
  if (isWindowActive('raw-messages')) {
    initFlowConsole(content)
    handled = true
  }
  // GNSS 应用或选择 NMEA 格式的任意应用，都把加载文本送入 GNSS 解析管线，
  // 否则轨迹与 Status View 会空白、只有 raw-messages 面板能看到导入内容。
  // 与重播路径保持一致：先清空旧轨迹再解析，保证导入数据干净可见。
  if (isGnssSolutionParser(activeDataParser.value)) {
    clearGnssData()
    appendGnssDataByParser(content)
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
const fileSampleInterval = toRef(dataSourceSettings.file, 'sampleIntervalMs')
const filePositionBytes = toRef(dataSourceSettings.file, 'filePositionBytes')
// 持久化的当前数据源类型（serial/network/file），供应用连接总览等只读消费
const activeSource = toRef(dataSourceSettings, 'activeSource')
const selectedFiles = ref<File[]>([])
const selectedPaths = ref<string[]>([])
const selectedFile = computed(() => selectedFiles.value[0] ?? null)
const selectedFilePath = ref('')
// 文件输入按扩展名自适应分发：.mcap 走 LiDAR 时间轴，以下文本类型走文本解析器
const fileIsMcap = computed(() => effectiveFormat('file') === 'mcap')
// 输入路径是板上轮转分片(part_N.mcap)时,确认后自动补齐同目录整族分片
const fileIsMcapPartSlice = computed(
  () => mcapPartIndex(mcapBasename(filePath.value)) !== undefined,
)
const selectedFileCount = computed(() =>
  selectedFilePath.value === filePath.value.trim()
    ? selectedFiles.value.length || selectedPaths.value.length
    : 0,
)
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

watch(
  () => globalDevice.value.type,
  (type) => { if (type === 'file') gnssLiveHistory.discard() },
  { flush: 'sync' },
)

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
  const type = globalDevice.value.type
  if (type === 'serial' || type === 'network' || type === 'file') {
    const format = effectiveFormat(type)
    return isTextFormat(format) ? format : 'raw'
  }
  return 'raw'
})

function isGnssSolutionParser(parser: TextDataParser): boolean {
  return parser === 'nmea' || parser === 'rtklib-pos'
}

function appendGnssDataByParser(data: string, parser = activeDataParser.value): void {
  if (parser === 'rtklib-pos') addRtkLibPosData(data)
  else addGnssData(data)
}

function liveGnssContext(): { key: string; parser: 'nmea' | 'rtklib-pos' } | undefined {
  const device = globalDevice.value
  if (device.type !== 'serial' && device.type !== 'network') return undefined
  const configured = activeDataParser.value
  if (!isGnssSolutionParser(configured)) return undefined
  const parser = configured === 'rtklib-pos' ? 'rtklib-pos' : 'nmea'
  const key = JSON.stringify([
    device.type, device.path, device.baudRate, device.dataBits, device.stopBits,
    device.parity, device.protocol, device.host, device.port, parser,
  ])
  return { key, parser }
}

function beginLiveGnssHistory(): void {
  const type = globalDevice.value.type
  if ((type === 'serial' || type === 'network') && dataSourceSettings[type].format === 'auto' && !detectedFormats[type]) return
  const context = liveGnssContext()
  if (context) gnssLiveHistory.start(context.key, context.parser)
  else gnssLiveHistory.discard()
}

function stopLiveGnssHistory(): void {
  void gnssLiveHistory.stop().catch((error) => {
    ElMessage({
      message: t('data.dataLoadFailed', {
        error: error instanceof Error ? error.message : String(error),
      }),
      type: 'error',
      placement: 'bottom-right',
      offset: 50,
    })
  })
}

let streamProbe: Uint8Array[] = []
let streamProbeLength = 0
let streamPendingText: Array<{ display: string; decoded: string }> = []
let streamDecodedQueue: string[] = []
let streamDecoder = new TextDecoder()
let streamRawSeen = false
let streamProbeFinished = false
let streamRtcm = false
let streamProbeTimer: ReturnType<typeof setTimeout> | undefined
function clearStreamProbeTimer(): void {
  if (streamProbeTimer !== undefined) clearTimeout(streamProbeTimer)
  streamProbeTimer = undefined
}
function beginStreamDetection(source: 'serial' | 'network'): void {
  const previous = detectedFormats[source]
  let resumed = false
  clearStreamProbeTimer()
  streamProbe = []
  streamProbeLength = 0
  streamPendingText = []
  streamDecodedQueue = []
  streamDecoder = new TextDecoder()
  streamRawSeen = false
  streamProbeFinished = false
  streamRtcm = false
  if (dataSourceSettings[source].format === 'auto' && previous && (previous.format === 'nmea' || previous.format === 'rtklib-pos')) {
    const context = liveGnssContext()
    if (context && gnssLiveHistory.matches(context.key)) {
      beginLiveGnssHistory()
      resumed = true
    }
  }
  if (!resumed && dataSourceSettings[source].format === 'auto') {
    gnssLiveHistory.discard()
    fileTimeline.clearTimeline()
    clearGnssData()
  }
  detectedFormats[source] = undefined
  formatAttempted[source] = false
  if (dataSourceSettings[source].format === 'rtcm3') {
    useGnssRaw().startStream(globalDevice.value.path ?? source)
    streamRtcm = true
    streamProbeFinished = true
    formatAttempted[source] = true
  }
}
function finishStreamDetection(): void {
  clearStreamProbeTimer()
  if (streamRtcm) useGnssRaw().stopStream()
  else for (const pending of streamPendingText) routeIncomingData(pending.display, pending.decoded)
  streamProbe = []
  streamPendingText = []
  streamRtcm = false
  streamProbeFinished = true
}
function inspectStreamBytes(source: 'serial' | 'network', bytes: Uint8Array): void {
  if (globalDevice.value.type !== source || globalDevice.value.connected !== true) return
  if (streamRtcm) { useGnssRaw().appendStream(bytes); return }
  if (streamProbeFinished || dataSourceSettings[source].format !== 'auto') return
  if (streamProbeTimer === undefined) streamProbeTimer = setTimeout(() => {
    streamProbeTimer = undefined
    if (streamProbeFinished || globalDevice.value.type !== source) return
    streamProbeFinished = true
    formatAttempted[source] = true
    for (const pending of streamPendingText) routeIncomingData(pending.display, pending.decoded)
    streamPendingText = []
    streamProbe = []
  }, 5000)
  streamProbe.push(bytes.slice())
  streamProbeLength += bytes.length
  const sample = new Uint8Array(streamProbeLength)
  let offset = 0
  for (const part of streamProbe) { sample.set(part, offset); offset += part.length }
  const result = inspectFormat(sample, '', 'auto')
  if (result?.disabled && streamProbeLength < 64 * 1024) {
    detectedFormats[source] = result
    formatAttempted[source] = true
    return
  }
  if (!result && streamProbeLength < 64 * 1024) return
  detectedFormats[source] = result
  formatAttempted[source] = true
  streamProbeFinished = true
  clearStreamProbeTimer()
  if (result?.format === 'rtcm3' && !result.disabled) {
    streamRtcm = true
    useGnssRaw().startStream(globalDevice.value.path ?? source)
    for (const part of streamProbe) useGnssRaw().appendStream(part)
    streamPendingText = []
  } else {
    beginLiveGnssHistory()
    for (const pending of streamPendingText) routeIncomingData(pending.display, pending.decoded)
    streamPendingText = []
  }
  streamProbe = []
}
function receiveStreamText(source: 'serial' | 'network', data: string): void {
  if (globalDevice.value.type !== source || globalDevice.value.connected !== true) return
  const decoded = streamDecodedQueue.shift() ?? data
  if (streamRtcm) return
  if (dataSourceSettings[source].format === 'auto' && !streamProbeFinished) {
    streamPendingText.push({ display: data, decoded })
    // Browser/test transports can supply text without the native byte channel.
    if (!streamRawSeen) inspectStreamBytes(source, new TextEncoder().encode(data))
    return
  }
  routeIncomingData(data, decoded)
}
ipc.on('source-data-bytes', (_event, source, data) => {
  if ((source !== 'serial' && source !== 'network') || !(data instanceof Uint8Array)) return
  if (globalDevice.value.type !== source || globalDevice.value.connected !== true) return
  streamRawSeen = true
  streamDecodedQueue.push(streamDecoder.decode(data, { stream: true }))
  inspectStreamBytes(source, data)
})
watch(
  () => `${currentApplication.value?.id ?? ''}:${allowedFormats().join(',')}`,
  () => {
    const source = globalDevice.value.type
    if ((source !== 'serial' && source !== 'network') || globalDevice.value.connected !== true || dataSourceSettings[source].format !== 'auto') return
    const result = detectedFormats[source]
    if (result && !result.candidate && !result.disabled && allowedFormats().includes(result.format)) return
    if (!streamProbeFinished) return
    finishStreamDetection()
    beginStreamDetection(source)
  },
)

const activeRegexPattern = computed(() => {
  if (globalDevice.value.type === 'serial') return dataSourceSettings.serial.regexPattern
  if (globalDevice.value.type === 'network') return dataSourceSettings.network.regexPattern
  if (globalDevice.value.type === 'file') return dataSourceSettings.file.regexPattern
  return dataSourceSettings.file.regexPattern
})

// 切换到文件输入也会使主进程中的注入目标失效，避免继续向上一次的设备发送差分数据。
watch(
  [() => globalDevice.value.type, () => dataSourceSettings.activeSource],
  ([type, source]) => {
    if (type === 'file' || source === 'file')
      void ipc.invoke('data-injection-clear-target').catch(() => undefined)
  },
  { flush: 'sync' },
)

watch(
  [activeDataParser, activeRegexPattern],
  ([parser, regexPattern]) => {
    flowDataFormat.value = parser === 'raw' || parser === 'rtklib-pos' ? 'none' : parser
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
// 「连接中点击开关 = 终止连接」的取消标记: 令 open() 的失败回调静默
let networkConnectCancelled = false

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

// 连接尝试序号: 新尝试开启/用户取消时自增, 旧 promise 迟到的 then/catch 据此失效,
// 避免回写 connecting/connected 干扰当前状态（旧尝试被顶掉时会以「连接已取消」迟到拒绝）
let networkOpenAttempt = 0

function cancelNetworkConnect(): void {
  if (globalDevice.value.connecting !== true) return
  networkConnectCancelled = true
  networkOpenAttempt++
  globalDevice.value.connecting = false
  globalDevice.value.connected = false
  networkService.cancelPending().catch(() => undefined)
}

function openNetworkDevice(): void {
  const options = currentNetworkOptions()
  if (!options) return
  const device = globalDevice.value
  const attempt = ++networkOpenAttempt
  // 上一次取消的静默标记只属于那一次尝试, 新尝试开始即作废
  networkConnectCancelled = false
  // 点击后立即置为 connecting，工具栏马上给出 pending 反馈，
  // 避免失败时长时间无反应让用户误以为没点上
  globalDevice.value.connecting = true
  networkService
    .open(options)
    .then(() => {
      if (attempt !== networkOpenAttempt || globalDevice.value !== device) return
      beginStreamDetection('network')
      beginLiveGnssHistory()
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
      if (attempt !== networkOpenAttempt) return
      globalDevice.value.connecting = false
      globalDevice.value.connected = false
      const message = error instanceof Error ? error.message : String(error)
      // 用户主动终止: 不提示、不进入循环重连调度。
      // close() 在连接建立前销毁 socket 也会以「连接已取消」结束 open(), 同样视为有意中断
      const cancelled =
        networkConnectCancelled || message.includes('已取消连接') || message.includes('连接已取消')
      if (cancelled) {
        networkConnectCancelled = false
        return
      }
      // 循环重连模式下连接失败属预期, 静默重试, 不再反复弹框
      if (!networkLoop.value) {
        ElMessage({
          message,
          type: 'error',
          placement: 'bottom-right',
          offset: 50,
        })
      }
      scheduleNetworkReconnect()
    })
}

function routeIncomingData(data: string, decodedData = data): void {
  if (globalDevice.value.connected !== true) return
  if (globalDevice.value.type === 'serial' || globalDevice.value.type === 'network') {
    const context = liveGnssContext()
    if (context) {
      if (!gnssLiveHistory.receiving || !gnssLiveHistory.matches(context.key))
        gnssLiveHistory.start(context.key, context.parser)
      gnssLiveHistory.append(decodedData)
    } else if (gnssLiveHistory.receiving) gnssLiveHistory.discard()
  }
  logRecordingService.write(data)
  dataRouter.route(data, {
    activeDataModes: gnssLiveHistory.receiving
      ? [...activeDataModes.value, 'gnss']
      : activeDataModes.value.filter((mode) => mode !== 'gnss'),
    activeWindowIds: currentWindows.value.map((windowDefinition) => windowDefinition.id),
    displayFormat: flowDisplayFormat.value === 'hex' ? 'hex' : 'ascii',
    dataParser: activeDataParser.value,
    gnssData: decodedData,
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
    dataParser: activeDataParser.value,
  })
}

serialService.onData((data) => {
  receiveStreamText('serial', data)
})
networkService.onData((data) => {
  receiveStreamText('network', data)
})
filePlaybackService.onData((data) => {
  if (globalDevice.value.type === 'file') routeIncomingData(data)
})

serialService.onDisconnected((data) => {
  if (globalDevice.value.type !== 'serial' || globalDevice.value.path !== data.path) return
  finishStreamDetection()
  globalDevice.value.connected = false
  activeDataTransport.clear('serial')
  stopLiveGnssHistory()
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

  finishStreamDetection()
  globalDevice.value.connected = false
  activeDataTransport.clear('network')
  stopLiveGnssHistory()
  // 循环重连模式下断线属预期, 静默重试
  if (!networkLoop.value) {
    ElMessage({
      message:
        connection.reason ||
        t('data.netDisconnected', { protocol: connection.protocol.toUpperCase() }),
      type: 'warning',
      placement: 'bottom-right',
      offset: 50,
    })
  }
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
  gnssLiveHistory.discard()
  const streamPlot = isWindowActive('plot')
  const configuredParser = activeDataParser.value
  // 每个文件都重新识别，避免上次自动保存的格式锁定后续文件。
  const autoDetectParser = dataSourceSettings.file.format === 'auto'
  const fallbackParser = configuredParser === 'rtklib-pos' ? 'rtklib-pos' : 'nmea'
  let parserOverride: TextDataParser | undefined = autoDetectParser ? undefined : configuredParser
  let pendingDetectionText = ''
  const routeAuxiliaryText = (text: string) => {
    if (streamPlot) addFlowData(text)
    addFileReplayData(text)
  }
  const appendChunk = (chunk: string) => {
    if (!chunk) return
    if (autoDetectParser && !parserOverride) {
      pendingDetectionText += chunk
      const detected = detectGnssTextParser(pendingDetectionText)
      if (!detected && pendingDetectionText.length < 64 * 1024) {
        routeAuxiliaryText(chunk)
        return
      }
      parserOverride = detected ?? fallbackParser
      dataSourceSettings.file.parser = parserOverride
      saveDataSourceSettings()
      appendGnssDataByParser(pendingDetectionText, parserOverride)
      pendingDetectionText = ''
    } else {
      appendGnssDataByParser(chunk, parserOverride)
    }
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
    if (pendingDetectionText) {
      parserOverride = detectGnssTextParser(pendingDetectionText) ?? fallbackParser
      dataSourceSettings.file.parser = parserOverride
      saveDataSourceSettings()
      appendGnssDataByParser(pendingDetectionText, parserOverride)
      pendingDetectionText = ''
    }
    appendGnssDataByParser('\n', parserOverride)
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

async function streamFileContent(
  file: File,
  onChunk: (chunk: string) => void,
  onProgress: (progress: number) => void,
): Promise<void> {
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
}

async function loadGnssTimelineFile(file: File, timelineMode: FileTimelineMode): Promise<void> {
  await loadGnssTimelineSource(timelineMode, (onChunk, onProgress) =>
    streamFileContent(file, onChunk, onProgress),
  )
}

async function loadGnssTimelinePath(path: string, timelineMode: FileTimelineMode): Promise<void> {
  await loadGnssTimelineSource(timelineMode, (onChunk, onProgress) =>
    textFileStreamService.read(path, { onChunk, onProgress }),
  )
}

/**
 * 文本回放（无 RTKLIB time-tag 时的回落）：读入全文，按样本时钟构建虚拟时间轴
 * （记录 time 字段优先，否则按 sampleIntervalMs 递增），控制台逐行投影、
 * 图表按历元增量投影，加载完成后从起始偏移自动播放。
 */
async function loadTextTimelineSource(
  readSource: GnssTimelineReader,
): Promise<void> {
  fileTimeline.beginIndexing()
  globalDevice.value.connected = false
  clearFlowData()
  clearFlowConsole()
  beginFileReplayMessages()

  try {
    const chunks: string[] = []
    await readSource((chunk) => {
      if (chunk) chunks.push(chunk)
    }, fileTimeline.updateIndexingProgress)
    const content = chunks.join('')

    const isCsv = activeDataParser.value === 'csv'
    const { store, records } = buildTextTimeline(content, {
      parser: isCsv ? 'csv' : activeDataParser.value,
      regexPattern: activeRegexPattern.value,
      sampleIntervalMs: fileSampleInterval.value,
      isCsv,
    })
    if (store.length === 0) throw new Error(t('data.noTextRecords'))

    // 控制台行与历元逐行对齐（仅计非空行，与 addFileReplayData 一致）
    setFileReplayElapsedResolver((line, lineIndex) =>
      lineIndex < store.length ? store.getElapsedTime(lineIndex) : null,
    )
    addFileReplayData(content)
    endFileReplayMessages()

    // 图表投影：前向增量追加、回退全量重建；记录注入虚拟时间（秒）作为 time，
    // 使 x 轴与时间轴一致（绕过 addRawData 的墙钟盖戳）。
    const projectFlow =
      isWindowActive('plot') ||
      activeDataModes.value.includes('flow') ||
      activeDataModes.value.includes('motor')
    let recordCursor = 0
    let appliedEpoch = -1
    const applyEpoch = (index: number) => {
      if (!projectFlow) return
      if (index < appliedEpoch) {
        clearFlowData()
        flowData.value.isBatchData = true
        recordCursor = 0
        appliedEpoch = -1
      }
      while (recordCursor < records.length && records[recordCursor].epochIndex <= index) {
        const { epochIndex, record } = records[recordCursor]
        appendFlowRecord({ ...record, time: store.getElapsedTime(epochIndex) / 1000 })
        appliedEpoch = epochIndex
        recordCursor += 1
      }
    }
    if (projectFlow) flowData.value.isBatchData = true

    const attached = fileTimeline.attachTimeline(store, {
      mode: 'replay',
      speed: fileReplaySpeed.value,
      startElapsedMilliseconds: fileStartOffset.value * 1000,
      applyEpoch,
    })
    if (!attached) throw new Error(t('data.noTextRecords'))

    ElMessage({
      message: t('data.tsPlayStarted'),
      type: 'success',
      placement: 'bottom-right',
      offset: 50,
    })
  } catch (error) {
    setFileReplayElapsedResolver(null)
    endFileReplayMessages()
    throw error
  }
}

function loadTextTimeline(path: string): Promise<void> | null {
  const readSource: GnssTimelineReader | null =
    selectedFile.value && selectedFilePath.value === path
      ? (onChunk, onProgress) => streamFileContent(selectedFile.value as File, onChunk, onProgress)
      : window.ipcRenderer
        ? (onChunk, onProgress) => textFileStreamService.read(path, { onChunk, onProgress })
        : null
  if (!readSource) return null
  return loadTextTimelineSource(readSource)
}

/** time-tag 缺失/无效（纯文本文件没有伴生 .tag）时回落到样本时钟回放。 */
function isTimeTagMissingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /ENOENT|TIMETAG|时间戳文件/i.test(message)
}

function startTimestampPlayback(path: string): void {
  if (isGnssSolutionParser(activeDataParser.value)) {
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
      // 纯文本文件没有伴生 .tag：回落为样本时钟回放（虚拟时间轴），
      // 其余 time-tag 错误维持原失败提示。
      if (isTimeTagMissingError(error)) {
        const textTimeline = loadTextTimeline(path)
        if (textTimeline) {
          void textTimeline.catch((fallbackError) => {
            fileTimeline.clearTimeline()
            if (globalDevice.value.type === 'file' && globalDevice.value.path === path) {
              globalDevice.value.connected = false
            }
            ElMessage({
              message: t('data.tsPlayFailed', {
                message:
                  fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
              }),
              type: 'error',
              placement: 'bottom-right',
              offset: 50,
            })
          })
          return
        }
      }
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
  const mcapPlayer = useMcapPlayer()
  const gnssRaw = useGnssRaw()

  // 对话框状态
  const showInputDialog = ref(false)
  const activeTab = ref<'serial' | 'file' | 'network'>(dataSourceSettings.activeSource)
  const fileInputLoading = ref(false)
  const recentInputFilesStore = new RecentInputFiles(new JsonStorage(localStorage))
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

  const sourceFormat = computed<DataFormat>({
    get: () => dataSourceSettings[activeTab.value].format,
    set: (format) => {
      dataSourceSettings[activeTab.value].format = format
      if (isTextFormat(format)) sourceParser.value = format
    },
  })
  const sourceDetectedFormat = computed(() => {
    const result = detectedFormats[activeTab.value]
    return result && sourceFormat.value === 'auto' ? { ...result, disabled: !allowedFormats().includes(result.format) } : result
  })
  const sourceFormatAttempted = computed(() => formatAttempted[activeTab.value])
  let fileDetectionRevision = 0
  let fileProbeBytes = new Uint8Array()
  const detectSelectedFile = async (file?: File, path = filePath.value): Promise<FormatDetection | undefined> => {
    const revision = ++fileDetectionRevision
    try {
      const bytes = file ? new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer())
        : window.electronAPI?.dataFormatReadHead ? new Uint8Array(await window.electronAPI.dataFormatReadHead(path)) : new Uint8Array()
      const result = inspectFormat(bytes, file?.name ?? path, dataSourceSettings.file.format)
      if (revision === fileDetectionRevision) { detectedFormats.file = result; formatAttempted.file = true; fileProbeBytes = bytes }
      return result
    } catch {
      if (revision === fileDetectionRevision) { detectedFormats.file = undefined; formatAttempted.file = true; fileProbeBytes = new Uint8Array() }
      return undefined
    }
  }
  const detectSelectionKinds = async (files: File[], paths: string[]): Promise<DataFormat[]> => {
    const mode = dataSourceSettings.file.format
    if (mode !== 'auto') return (files.length ? files : paths).map(() => mode)
    if (files.length) return Promise.all(files.map(async (file) => {
      const bytes = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer())
      const result = inspectFormat(bytes, file.name, mode)
      return result?.disabled ? 'raw' : result?.format ?? 'raw'
    }))
    return Promise.all(paths.map(async (path) => {
      let bytes = new Uint8Array()
      try {
        if (window.electronAPI?.dataFormatReadHead) bytes = new Uint8Array(await window.electronAPI.dataFormatReadHead(path))
      } catch { /* The loader reports unreadable paths. */ }
      const result = inspectFormat(bytes, path, mode)
      return result?.disabled ? 'raw' : result?.format ?? 'raw'
    }))
  }

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
      const mode = dataSourceSettings.file.format
      const inspected = await Promise.all(files.map(async (file) => {
        const bytes = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer())
        const detected = inspectFormat(bytes, file.name, mode)
        return { file, bytes, detected, format: mode === 'auto' ? (detected?.candidate || detected?.disabled ? 'raw' : detected?.format ?? 'raw') : mode }
      }))
      // LiDAR MCAP 录像优先分发（避免被文本分支误吞）；一次拖入多个分片时合并为单会话加载
      const mcapFiles = inspected.filter((item) => item.format === 'mcap').map((item) => item.file)
      // GNSS-Raw 文件（RTCM 单文件 / RINEX obs+nav 组合）按名字识别，合并一次加载
      const gnssRawFiles = inspected.filter((item) => item.format === 'rtcm3' || item.format === 'rinex').map((item) => item.file)
      if (new Set(inspected.filter((item) => item.format === 'rtcm3' || item.format === 'rinex').map((item) => item.format)).size > 1) {
        ElMessage.warning(t('app.toolbar.fileSelectionMixed'))
        return
      }

      for (const item of inspected) {
        const { file, bytes, detected, format } = item
        try {
          detectedFormats.file = detected
          formatAttempted.file = true
          if (mode !== 'auto' && detected && detected.format !== mode && mode !== 'raw' && mode !== 'regex') {
            ElMessage.warning(t('data.formatMismatch', { selected: FORMAT_LABELS[mode], detected: FORMAT_LABELS[detected.format] }))
          }
          // 根据文件类型进行不同处理
          if (format === 'mcap') {
            // 分片随首个 .mcap 一起批量加载，其余分片跳过
            if (file !== mcapFiles[0]) continue
            const ok = await mcapPlayer.loadFromFiles(mcapFiles)
            if (ok) {
              // 拖入单个分片可能已自动展开为整族,以实际加载的分片数为准
              const partCount = mcapPlayer.fileInfo.value?.partCount ?? mcapFiles.length
              ElMessage({
                message:
                  partCount > 1
                    ? t('app.toolbar.mcapLoadedParts', { count: partCount })
                    : t('app.toolbar.mcapLoaded', { name: file.name }),
                type: 'success',
                placement: 'bottom-right',
                offset: 50,
              })
              continue
            }
            if (mcapPlayer.status.value === 'error') {
              throw new Error(mcapPlayer.errorText.value)
            }
            continue
          }
          if (format === 'rtcm3' || format === 'rinex') {
            // 原始观测格式优先；切换应用后残留的 NMEA/POS 设置不能把它们当作定位文本。
            // 同批 GNSS-Raw 文件随首个一起加载（RTCM 单文件 / RINEX obs+nav）
            if (file !== gnssRawFiles[0]) continue
            const droppedPath = window.electronAPI?.getPathForFile(file) || file.name
            selectedFiles.value = gnssRawFiles
            selectedFilePath.value = droppedPath
            filePath.value = droppedPath
            dataSourceSettings.activeSource = 'file'
            saveDataSourceSettings()
            const ok = await gnssRaw.loadFromFiles(gnssRawFiles, format === 'rtcm3' ? 'rtcm' : 'rnx')
            if (ok) {
              ElMessage({
                message: t(
                  format === 'rtcm3' && gnssRawFiles.length === 1
                    ? 'app.toolbar.rtcmLoaded'
                    : 'app.toolbar.rnxLoaded',
                  { name: file.name, count: gnssRawFiles.length },
                ),
                type: 'success',
                placement: 'bottom-right',
                offset: 50,
              })
              continue
            }
            throw new Error(gnssRaw.errorText.value)
          }
          if (format !== 'raw' || !bytes.some((byte) => byte === 0 || byte < 9 || (byte > 13 && byte < 32))) {
            // 处理文本文件
            const droppedPath = window.electronAPI?.getPathForFile(file) || file.name
            selectedFiles.value = [file]
            selectedFilePath.value = droppedPath
            filePath.value = droppedPath
            recentInputFilesStore.record({
              path: droppedPath,
              name: file.name,
              sizeBytes: file.size,
            })
            globalDevice.value = {
              type: 'file',
              path: droppedPath,
              connected: false,
            }
            dataSourceSettings.activeSource = 'file'
            saveDataSourceSettings()

            if (
              isGnssSolutionParser(activeDataParser.value)
            ) {
              await filePlaybackService.stop()
              await loadGnssTimelineFile(file, 'loaded')
              break
            }

            await handleTextFile(file)
          } else {
            initFlowConsole(Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' '))
            ElMessage.warning(detected?.disabled ? t('data.formatDisabled', { format: FORMAT_LABELS[detected.format] }) : t('data.formatBinaryPreview'))
          }
        } catch (error) {
          if (
            activeDataModes.value.includes('gnss') ||
            isGnssSolutionParser(activeDataParser.value)
          ) {
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

  // 路径/最近文件选择清除浏览器 File 引用，避免读到上一次选择的文件。
  const selectFilePath = (path: string) => {
    selectedFiles.value = []
    selectedPaths.value = []
    selectedFilePath.value = ''
    filePath.value = path
    detectedFormats.file = undefined
    formatAttempted.file = false
    if (path) void detectSelectedFile(undefined, path)
  }

  // 文件输入统一选择文本文件或同一会话的 MCAP 分片，确认时按扩展名分发。
  // 使用带 scope 记忆的原生对话框: 数据接入的上次目录独立于其它模块记忆。
  const selectTargetFile = async () => {
    const solutionParserSelected = dataSourceSettings.file.format !== 'auto' && isGnssSolutionParser(dataSourceSettings.file.parser)
    const acceptGnssText = activeDataModes.value.includes('gnss') || solutionParserSelected
    // Web 构建没有原生对话框：退回隐藏的 input[type=file]，选择语义保持一致。
    if (!window.electronAPI?.openFileDialog) {
      const fileInput = document.createElement('input')
      fileInput.type = 'file'
      fileInput.accept = acceptGnssText
        ? ''
        : '.txt,.csv,.dat,.log,.nmea,.pos,.mcap,.rtcm3,.rtcm,.rtc,.rt3,.rnx,.obs,.nav,.glo'
      fileInput.multiple = !solutionParserSelected
      fileInput.style.display = 'none'
      document.body.appendChild(fileInput)
      fileInput.onchange = async () => {
        const files = Array.from(fileInput.files ?? [])
        fileInput.remove()
        if (files.length === 0) return
        const kinds = await detectSelectionKinds(files, [])
        const allMcap = kinds.every((kind) => kind === 'mcap')
        const allRnx = kinds.every((kind) => kind === 'rinex')
        if (files.length > 1 && !allMcap && !allRnx) {
          ElMessage.warning(t('app.toolbar.fileSelectionMixed'))
          return
        }
        const file = files[0]
        filePath.value = window.electronAPI?.getPathForFile(file) || file.name
        selectedFilePath.value = filePath.value
        selectedFiles.value = files
        selectedPaths.value = []
        void detectSelectedFile(file, filePath.value)
      }
      fileInput.oncancel = () => fileInput.remove()
      fileInput.click()
      return
    }
    selectedFiles.value = []
    selectedPaths.value = []
    const paths = (await window.electronAPI.openFileDialog({
      scope: 'data-access-file',
      filters: acceptGnssText
        ? [
            { name: 'NMEA / RTKLIB POS / Text', extensions: ['*'] },
            { name: 'All Files', extensions: ['*'] },
          ]
        : [
            {
              name: 'Log / MCAP / RTCM / RINEX',
              extensions: [
                'txt',
                'csv',
                'dat',
                'log',
                'nmea',
                'pos',
                'mcap',
                'rtcm3',
                'rtcm',
                'rtc',
                'rt3',
                'rnx',
                'obs',
                'nav',
                'gnav',
                'hnav',
                'qnav',
                'lnav',
                'cnav',
                'glo',
                'gps',
                'gal',
              ],
            },
            { name: 'All Files', extensions: ['*'] },
          ],
      multi: !solutionParserSelected,
    })) as string[] | null
    if (!paths || paths.length === 0) return
    const kinds = await detectSelectionKinds([], paths)
    const allMcap = kinds.every((kind) => kind === 'mcap')
    const allRnx = kinds.every((kind) => kind === 'rinex')
    if (paths.length > 1 && !allMcap && !allRnx) {
      ElMessage.warning(t('app.toolbar.fileSelectionMixed'))
      return
    }
    filePath.value = paths[0]
    selectedFilePath.value = paths[0]
    selectedPaths.value = paths
    void detectSelectedFile(undefined, paths[0])
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

    recentInputFilesStore.record({
      path: fileCmd,
      name: mcapBasename(fileCmd),
      sizeBytes: selectedFilePath.value === fileCmd ? (selectedFile.value?.size ?? 0) : 0,
    })

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

    if (isGnssSolutionParser(activeDataParser.value)) {
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
    if (selectedFile.value && selectedFilePath.value === fileCmd) {
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
    } else if (window.ipcRenderer) {
      // 原生文件对话框只返回路径（没有浏览器 File 对象）：
      // Electron 下按路径经主进程读全文，与拖放（带 File 对象）行为对齐。
      fileTimeline.clearTimeline()
      const chunks: string[] = []
      void textFileStreamService
        .read(fileCmd, {
          onChunk: (chunk) => chunks.push(chunk),
          onProgress: () => undefined,
        })
        .then(() => {
          try {
            if (loadTextIntoActiveWindows(chunks.join(''))) {
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
        })
        .catch((error) => {
          ElMessage({
            message: t('data.dataLoadFailed', {
              error: error instanceof Error ? error.message : String(error),
            }),
            type: 'error',
            placement: 'bottom-right',
            offset: 50,
          })
        })
    } else {
      // 浏览器端没有文件对象时无法按路径读取，显示提示信息
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
        const device = globalDevice.value
        const options = currentSerialOptions()
        if (!options) return
        globalDevice.value.connecting = true
        serialService
          .open(options)
          .then(() => {
            if (globalDevice.value !== device) return
            beginStreamDetection('serial')
            beginLiveGnssHistory()
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
            if (globalDevice.value !== device) return
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
        const device = globalDevice.value
        const options = currentSerialOptions()
        if (!options) return
        serialService.close(options).then(() => {
          if (globalDevice.value !== device) return
          finishStreamDetection()
          activeDataTransport.clear('serial')
          stopLiveGnssHistory()
          globalDevice.value = { connected: null }
        })
      } else if (globalDevice.value.type === 'network') {
        const device = globalDevice.value
        cancelNetworkReconnect()
        // 移除设备时一并作废在途的连接尝试: 否则循环重连的迟到 open() 一旦成功,
        // 会在 socket 已被销毁后把 connected 重新置为 true(假「已连接」)
        networkOpenAttempt++
        networkService.close().then(() => {
          if (globalDevice.value !== device) return
          finishStreamDetection()
          activeDataTransport.clear('network')
          stopLiveGnssHistory()
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
        const device = globalDevice.value
        const options = currentSerialOptions()
        if (!options) return
        serialService.close(options).then(() => {
          if (globalDevice.value !== device) return
          finishStreamDetection()
          activeDataTransport.clear('serial')
          stopLiveGnssHistory()
          if (globalDevice.value.type) {
            globalDevice.value.connected = false
          }
        })
      } else if (globalDevice.value.type === 'network') {
        const device = globalDevice.value
        cancelNetworkReconnect()
        // 手动断开同样作废在途尝试, 避免迟到 open() 成功后状态复活为「已连接」
        networkOpenAttempt++
        networkService.close().then(() => {
          if (globalDevice.value !== device) return
          finishStreamDetection()
          activeDataTransport.clear('network')
          stopLiveGnssHistory()
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
  const handleInputSubmit = async () => {
    if (fileInputLoading.value) return
    if (activeTab.value === 'file' && filePath.value.trim()) {
      const path = filePath.value.trim()
      const file = selectedFilePath.value === path ? selectedFile.value ?? undefined : undefined
      const detected = await detectSelectedFile(file, path)
      const chosen = dataSourceSettings.file.format
      if (chosen !== 'auto' && chosen !== 'raw' && chosen !== 'regex' && detected && detected.format !== chosen)
        ElMessage.warning(t('data.formatMismatch', { selected: FORMAT_LABELS[chosen], detected: FORMAT_LABELS[detected.format] }))
    }
    // MCAP 自带结构与时间索引，不经过文本解析器、时间标签回放或设备连接。
    if (activeTab.value === 'file' && fileIsMcap.value) {
      const path = filePath.value.trim()
      const files = selectedFilePath.value === path ? selectedFiles.value : []
      const pathList = selectedFilePath.value === path ? selectedPaths.value : []
      const recent = recentInputFilesStore.list().find((item) => item.path === path)
      fileInputLoading.value = true
      try {
        const ok =
          files.length > 0
            ? await mcapPlayer.loadFromFiles(files)
            : pathList.length > 1
              ? await mcapPlayer.loadFromPaths(pathList)
              : recent?.paths?.length
                ? await mcapPlayer.loadFromPaths(recent.paths)
                : await mcapPlayer.loadFromPath(path)
        if (!ok) {
          if (mcapPlayer.status.value === 'error') throw new Error(mcapPlayer.errorText.value)
          return
        }
        dataSourceChangesCommitted = true
        dataSourceSettings.activeSource = 'file'
        filePath.value = path
        saveDataSourceSettings()
        showInputDialog.value = false
      } catch (error) {
        ElMessage.error(
          `${t('lidar.playback.loadFailed')}: ${error instanceof Error ? error.message : String(error)}`,
        )
      } finally {
        fileInputLoading.value = false
      }
      return
    }
    // RTCM 二进制流 / RINEX 文本自带解码管线（Worker + WASM），不经过文本解析器、时间标签回放或设备连接。
    if (activeTab.value === 'file') {
      const path = filePath.value.trim()
      const files = selectedFilePath.value === path ? selectedFiles.value : []
      const pathList = selectedFilePath.value === path ? selectedPaths.value : []
      const format = effectiveFormat('file')
      const isGnssRaw = format === 'rtcm3' || format === 'rinex'
      if (isGnssRaw) {
        // 立即关闭弹框、后台解码：加载进度由各 GNSS-Raw 面板的进度条展示，
        // 失败时弹错误提示（面板内同时显示错误状态）。
        dataSourceChangesCommitted = true
        dataSourceSettings.activeSource = 'file'
        saveDataSourceSettings()
        showInputDialog.value = false
        void (async () => {
          try {
            const ok =
              files.length > 0
                ? await gnssRaw.loadFromFiles(files, format === 'rtcm3' ? 'rtcm' : 'rnx')
                : await gnssRaw.loadFromPaths(pathList.length > 1 ? pathList : [path], format === 'rtcm3' ? 'rtcm' : 'rnx')
            if (!ok) throw new Error(gnssRaw.errorText.value)
          } catch (error) {
            ElMessage.error(
              `${t('gnssRaw.common.loadError')}: ${error instanceof Error ? error.message : String(error)}`,
            )
          }
        })()
        return
      }
    }
    if (activeTab.value === 'file' && effectiveFormat('file') === 'raw' && fileProbeBytes.some((byte) => byte === 0 || byte < 9 || (byte > 13 && byte < 32))) {
      initFlowConsole(Array.from(fileProbeBytes, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' '))
      ElMessage.warning(t('data.formatBinaryPreview'))
      dataSourceChangesCommitted = true
      dataSourceSettings.activeSource = 'file'
      saveDataSourceSettings()
      showInputDialog.value = false
      return
    }
    if (sourceFormat.value === 'regex') {
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
    fileIsMcap,
    fileIsMcapPartSlice,
    fileInputLoading,
    selectedFileCount,
    fileTimeTag,
    fileReplaySpeed,
    fileStartOffset,
    fileSampleInterval,
    filePositionBytes,
    networkIp,
    networkPort,
    networkProtocol,
    networkLoop,
    sourceParser,
    sourceFormat,
    sourceDetectedFormat,
    sourceFormatAttempted,
    sourceRegexPattern,
    activeDataParser,
    serialPorts,
    baudRates,
    dataBits,
    stopBits,
    parities,
    deviceConnected,
    deviceConnecting,
    activeSource,
    logRecordingActive,
    logRecordingPath,
    globalDevice,
    isDragOver,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    selectTargetFile,
    selectFilePath,
    handleInputSubmit,
    inputDialog,
    openCurrDevice,
    cancelNetworkConnect,
    closeCurrDevice,
    removeCurrDevice,
    toggleLogRecording,
    searchSerialPorts,
  }
}
