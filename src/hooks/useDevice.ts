import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useApplicationSelector } from '@/composables/useApplicationSelector'
import { useNmea } from '@/composables/gnss/useNmea'
import { useFlow } from '@/composables/flow/useFlow'
import { useConsole } from '@/composables/flow/useConsole'
import { useMotorCmd } from '@/composables/motor/useMotorCmd'
import { IncomingDataRouter } from '@/core/data/IncomingDataRouter'
import { activeDataTransport } from '@/core/device/ActiveDataTransport'
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

const { processRawData: addGnssData } = useNmea()
const { addRawData: addFlowData, initRawData: initFlowData } = useFlow()
const {
  addMessages: initFlowConsole,
  addMessage: addFlowConsole,
  displayFormat: flowDisplayFormat,
} = useConsole(true) // 使用全局实例
const { convertByteArrayToJson } = useMotorCmd()
const { activeDataModes, currentWindows } = useApplicationSelector()
const ipc = createBrowserIpcTransport()
const serialService = new SerialService(ipc)
const networkService = new NetworkService(ipc)
const dataRouter = new IncomingDataRouter({
  appendGnss: addGnssData,
  appendRaw: addFlowConsole,
  appendPlot: addFlowData,
  decodeMotorHex: convertByteArrayToJson,
})

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
const serialPort = ref('')
const serialBaudRate = ref('115200')
const serialDataBits = ref('8')
const serialStopBits = ref('1')
const serialParity = ref('none')
const serialAdvanced = ref(false)

// 网络配置
const networkProtocol = ref<NetworkProtocol>('tcp')
const networkIp = ref('127.0.0.1')
const networkPort = ref<number | undefined>()

// 文件配置
const filePath = ref('')
const serialPorts = ref<string[]>([])
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
  dataRouter.route(data, {
    activeDataModes: activeDataModes.value,
    activeWindowIds: currentWindows.value.map((windowDefinition) => windowDefinition.id),
    displayFormat: flowDisplayFormat.value === 'hex' ? 'hex' : 'ascii',
  })
}

serialService.onData(routeIncomingData)
networkService.onData(routeIncomingData)

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

/**
 * 设备管理组合式函数
 * 提供串口、网络和文件输入相关的状态和方法
 */
export function useDevice() {
  const isDragOver = ref(false)

  // 对话框状态
  const showInputDialog = ref(false)
  const activeTab = ref('serial')

  // 下拉框选项数据
  const baudRates = ['9600', '19200', '38400', '57600', '115200', '230400', '460800', '921600']
  const dataBits = ['5', '6', '7', '8']
  const stopBits = ['1', '1.5', '2']
  const parities = [
    { label: '无', value: 'none' },
    { label: '奇校验', value: 'odd' },
    { label: '偶校验', value: 'even' },
  ]

  // 拖拽事件处理函数
  const handleDragOver = (event: DragEvent) => {
    event.preventDefault() // 允许放置
    event.stopPropagation()
  }

  const handleDragEnter = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    isDragOver.value = true
  }

  const handleDragLeave = (event: DragEvent) => {
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
  const inputDialog = () => {
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
    const fileCmd = filePath.value

    // 设置全局设备信息
    globalDevice.value = {
      type: 'file',
      path: fileCmd,
      connected: false, // 仅实时数据能修改globalDevice为true
    }

    if (!selectedFile.value && !fileCmd) {
      ElMessage({
        message: `请先选择文件`,
        type: 'error',
        placement: 'bottom-right',
        offset: 50,
      })
      return ''
    }

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
          serialPort.value = ''
          serialBaudRate.value = '115200'
          serialDataBits.value = '8'
          serialStopBits.value = '1'
          serialParity.value = 'none'
          serialAdvanced.value = false
        })
      } else if (globalDevice.value.type === 'network') {
        networkService.close().then(() => {
          activeDataTransport.clear('network')
          globalDevice.value = { connected: null }
          networkProtocol.value = 'tcp'
          networkIp.value = '127.0.0.1'
          networkPort.value = undefined
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
    }

    if (command || activeTab.value === 'file') {
      // 对于文件类型，即使没有返回command也关闭对话框
      // 因为文件选择是通过新的对话框进行的
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
    networkIp,
    networkPort,
    networkProtocol,
    serialPorts,
    baudRates,
    dataBits,
    stopBits,
    parities,
    deviceConnected,
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
    searchSerialPorts,
  }
}
