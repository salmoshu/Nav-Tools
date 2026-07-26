import { computed, ref, toRef, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useApplicationSelector } from '@/composables/useApplicationSelector'
import { useNmea } from '@/composables/gnss/useNmea'
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
import { normalizeRtspUrl, type TextDataParser } from '@/core/data/DataSourceStorage'
import { FilePlaybackService } from '@/core/file/FilePlaybackService'
import { LogRecordingService } from '@/core/file/LogRecordingService'

const {
  processRawData: addGnssData,
  clearData: clearGnssData,
  clearBuffer: clearGnssBuffer,
} = useNmea()
const {
  addRawData: addFlowData,
  initRawData: initFlowData,
  clearRawData: clearFlowData,
} = useFlow()
const {
  addMessages: initFlowConsole,
  addMessage: addFlowConsole,
  clearMessages: clearFlowConsole,
  dataFormat: flowDataFormat,
  displayFormat: flowDisplayFormat,
} = useConsole(true) // 使用全局实例
const { convertByteArrayToJson } = useMotorCmd()
const { activeDataModes, currentWindows } = useApplicationSelector()
const ipc = createBrowserIpcTransport()
const serialService = new SerialService(ipc)
const networkService = new NetworkService(ipc)
const filePlaybackService = new FilePlaybackService(ipc)
const logRecordingService = new LogRecordingService(ipc)
const dataRouter = new IncomingDataRouter({
  appendGnss: addGnssData,
  appendRaw: addFlowConsole,
  appendPlot: addFlowData,
  decodeMotorHex: convertByteArrayToJson,
})
const { settings: dataSourceSettings, saveSettings: saveDataSourceSettings } =
  useDataSourceManager()

const isWindowActive = (windowId: string) =>
  currentWindows.value.some((windowDefinition) => windowDefinition.id === windowId)

const loadTextIntoActiveWindows = (content: string) => {
  let handled = false
  if (isWindowActive('plot')) {
    initFlowData(content)
    handled = true
  }
  if (isWindowActive('raw-messages')) {
    initFlowConsole(content)
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

// 文件配置
const filePath = toRef(dataSourceSettings.file, 'path')
const fileTimeTag = toRef(dataSourceSettings.file, 'timeTag')
const fileReplaySpeed = toRef(dataSourceSettings.file, 'replaySpeed')
const fileStartOffset = toRef(dataSourceSettings.file, 'startOffset')
const filePositionBytes = toRef(dataSourceSettings.file, 'filePositionBytes')
const cameraStreamUrl = toRef(dataSourceSettings.camera, 'url')
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
  connected: null | boolean
}>({ connected: null })

const deviceConnected = computed(() => {
  return globalDevice.value.connected === true
})

const activeDataParser = computed<TextDataParser>(() => {
  if (globalDevice.value.type === 'serial') return dataSourceSettings.serial.parser
  if (globalDevice.value.type === 'network') return dataSourceSettings.network.parser
  if (globalDevice.value.type === 'file') return dataSourceSettings.file.parser
  return 'raw'
})

watch(
  activeDataParser,
  (parser) => {
    flowDataFormat.value = parser === 'raw' ? 'none' : parser
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
    message: `串口${data.path}已断开连接`,
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
    message: connection.reason || `${connection.protocol.toUpperCase()} 网络连接已断开`,
    type: 'warning',
    placement: 'bottom-right',
    offset: 50,
  })
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
      message: '时间戳播放已开始',
      type: 'success',
      placement: 'bottom-right',
      offset: 50,
    })
    return
  }

  globalDevice.value.connected = false
  if (status.state === 'completed') {
    ElMessage({
      message: '时间戳播放已完成',
      type: 'success',
      placement: 'bottom-right',
      offset: 50,
    })
  } else if (status.state === 'error') {
    ElMessage({
      message: `时间戳播放失败: ${status.message ?? '未知错误'}`,
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
      message: `开始录制日志: ${status.path}`,
      type: 'success',
      placement: 'bottom-right',
      offset: 50,
    })
  } else if (status.state === 'stopped') {
    ElMessage({
      message: `日志已保存: ${status.path}`,
      type: 'success',
      placement: 'bottom-right',
      offset: 50,
    })
  } else {
    ElMessage({
      message: `日志录制失败: ${status.message ?? '未知错误'}`,
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
      message: `日志录制操作失败: ${error instanceof Error ? error.message : String(error)}`,
      type: 'error',
      placement: 'bottom-right',
      offset: 50,
    })
  }
}

function startTimestampPlayback(path: string): void {
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
        message: `时间戳播放失败: ${error instanceof Error ? error.message : String(error)}`,
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
  const activeTab = ref<'serial' | 'file' | 'network' | 'camera'>('file')
  let dataSourceSnapshot: typeof dataSourceSettings | undefined
  let dataSourceChangesCommitted = false

  const snapshotDataSourceSettings = (): typeof dataSourceSettings => ({
    version: 1,
    serial: { ...dataSourceSettings.serial },
    file: { ...dataSourceSettings.file },
    network: { ...dataSourceSettings.network },
    camera: { ...dataSourceSettings.camera },
  })

  const restoreDataSourceSnapshot = () => {
    if (!dataSourceSnapshot) return
    Object.assign(dataSourceSettings.serial, dataSourceSnapshot.serial)
    Object.assign(dataSourceSettings.file, dataSourceSnapshot.file)
    Object.assign(dataSourceSettings.network, dataSourceSnapshot.network)
    Object.assign(dataSourceSettings.camera, dataSourceSnapshot.camera)
  }

  watch(showInputDialog, (open) => {
    if (open) {
      dataSourceSnapshot = snapshotDataSourceSettings()
      dataSourceChangesCommitted = false
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

  // 下拉框选项数据
  const baudRates = ['9600', '19200', '38400', '57600', '115200', '230400', '460800', '921600']
  const dataBits = ['5', '6', '7', '8']
  const stopBits = ['1', '1.5', '2']
  const parities = [
    { label: '无', value: 'none' },
    { label: '奇校验', value: 'odd' },
    { label: '偶校验', value: 'even' },
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
            await handleTextFile(file)
          } else {
            // 其他文件类型
            ElMessage({
              message: `不支持的文件类型: ${file.name}`,
              type: 'warning',
              placement: 'bottom-right',
              offset: 50,
            })
          }
        } catch (error) {
          ElMessage({
            message: `处理文件 ${file.name} 失败: ${error}`,
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
              message: `成功导入文件: ${file.name}`,
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
            message: `读取文本文件失败: ${file.name}: ${error}`,
            type: 'error',
            placement: 'bottom-right',
            offset: 50,
          })
          reject(error)
        }
      }

      reader.onerror = () => reject(new Error('读取文件失败'))
      reader.readAsText(file)
    })
  }

  /**
   * 打开输入对话框
   */
  const inputDialog = (request?: unknown) => {
    const requestedTab =
      typeof request === 'string'
        ? request
        : request && typeof request === 'object' && 'tab' in request
          ? (request as { tab?: unknown }).tab
          : undefined
    if (
      requestedTab === 'serial' ||
      requestedTab === 'file' ||
      requestedTab === 'network' ||
      requestedTab === 'camera'
    ) {
      activeTab.value = requestedTab
    } else if (
      currentWindows.value.length === 1 &&
      currentWindows.value[0]?.id === 'camera-video'
    ) {
      activeTab.value = 'camera'
    }
    showInputDialog.value = true
    searchSerialPorts(true)
  }

  /**
   * 自动检索当前存在的串口设备
   */
  const searchSerialPorts = (silent: boolean | Event = false) => {
    serialService
      .listPorts()
      .then((ports) => {
        serialPorts.value = ports
      })
      .catch((error) => {
        console.error('自动检索串口设备失败:', error)
        if (silent !== true) {
          ElMessage({
            message: '自动检索串口设备失败',
            type: 'error',
            placement: 'bottom-right',
            offset: 50,
          })
        }
      })
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
  const selectedFile = ref<File | null>(null)

  // 重构handleFileSubmit函数，负责读取文件内容并初始化数据
  const handleFileSubmit = (): string => {
    const fileCmd = filePath.value.trim()

    if (!fileCmd) {
      ElMessage({
        message: `请先选择文件`,
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

    // 如果有文件对象引用，直接使用它读取内容
    if (selectedFile.value) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = e.target?.result as string
        try {
          if (loadTextIntoActiveWindows(content)) {
            ElMessage({
              message: `数据加载成功`,
              type: 'success',
              placement: 'bottom-right',
              offset: 50,
            })
          }
        } catch (error) {
          ElMessage({
            message: `数据加载失败: ${error}`,
            type: 'error',
            placement: 'bottom-right',
            offset: 50,
          })
        }
      }

      reader.onerror = () => {
        ElMessage({
          message: `文件读取失败`,
          type: 'error',
          placement: 'bottom-right',
          offset: 50,
        })
      }

      reader.readAsText(selectedFile.value)
    } else {
      // 如果没有文件对象，显示提示信息
      ElMessage({
        message: `请重新选择文件以加载数据`,
        type: 'warning',
        placement: 'bottom-right',
        offset: 50,
      })
    }

    return fileCmd
  }

  const handleCameraSubmit = (): string => {
    const url = normalizeRtspUrl(cameraStreamUrl.value)
    if (!url) {
      ElMessage({
        message: '请输入以 rtsp:// 开头的有效视频地址',
        type: 'warning',
        placement: 'bottom-right',
        offset: 50,
      })
      return ''
    }

    cameraStreamUrl.value = url
    saveDataSourceSettings()
    ElMessage({
      message: 'Camera RTSP 数据源已保存',
      type: 'success',
      placement: 'bottom-right',
      offset: 50,
    })
    return url
  }

  const openCurrDevice = () => {
    if (globalDevice.value.connected === false) {
      if (globalDevice.value.type === 'serial') {
        const options = currentSerialOptions()
        if (!options) return
        serialService
          .open(options)
          .then(() => {
            globalDevice.value.connected = true
            activeDataTransport.activate('serial')

            ElMessage({
              message: `串口${globalDevice.value.path}打开成功`,
              type: 'success',
              placement: 'bottom-right',
              offset: 50,
            })
          })
          .catch((error) => {
            ElMessage({
              message: `${error.message}`,
              type: 'error',
              placement: 'bottom-right',
              offset: 50,
            })
          })
      } else if (globalDevice.value.type === 'network') {
        const options = currentNetworkOptions()
        if (!options) return
        networkService
          .open(options)
          .then(() => {
            globalDevice.value.connected = true
            activeDataTransport.activate('network')
            const action = options.protocol === 'tcp' ? '连接' : '监听'
            ElMessage({
              message: `${options.protocol.toUpperCase()} ${options.host}:${options.port} ${action}成功`,
              type: 'success',
              placement: 'bottom-right',
              offset: 50,
            })
          })
          .catch((error) => {
            globalDevice.value.connected = false
            ElMessage({
              message: error instanceof Error ? error.message : String(error),
              type: 'error',
              placement: 'bottom-right',
              offset: 50,
            })
          })
      } else if (
        globalDevice.value.type === 'file' &&
        globalDevice.value.path &&
        fileTimeTag.value
      ) {
        startTimestampPlayback(globalDevice.value.path)
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
        networkService.close().then(() => {
          activeDataTransport.clear('network')
          globalDevice.value = { connected: null }
        })
      } else if (globalDevice.value.type === 'file') {
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
        networkService.close().then(() => {
          activeDataTransport.clear('network')
          if (globalDevice.value.type === 'network') globalDevice.value.connected = false
        })
      } else if (globalDevice.value.type === 'file') {
        globalDevice.value.connected = false
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
      case 'camera':
        command = handleCameraSubmit()
        break
    }

    if (command) {
      dataSourceChangesCommitted = true
      if (activeTab.value !== 'file') {
        console.log('输入的指令:', command)
      }
      showInputDialog.value = false
    } else {
      ElMessage({
        message: '请输入指令',
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
    sourceParser,
    activeDataParser,
    cameraStreamUrl,
    serialPorts,
    baudRates,
    dataBits,
    stopBits,
    parities,
    deviceConnected,
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
