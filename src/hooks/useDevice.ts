import { computed, ref } from "vue"
import { ElMessage } from "element-plus"
import { navMode } from "@/settings/config"
import { useNmea } from '@/composables/gnss/useNmea'
import { useUltrasonic } from '@/composables/ultrasonic/useUltrasonic'
import { useFlow } from '@/composables/flow/useFlow'
import { useConsole } from '@/composables/flow/useConsole'
import emitter from '@/hooks/useMitt'

const { processRawData: processNmeaRawData } = useNmea()
const { addRawData: addUltrasonicRawData } = useUltrasonic()
const { addRawData: addFlowRawData, initRawData: initFlowRawData } = useFlow()
const { handleRawDataBatch: initFlowConsole, handleRawData: addFlowConsole } = useConsole()

// 串口配置
const serialPort = ref("");
const serialBaudRate = ref("115200");
const serialDataBits = ref("8");
const serialStopBits = ref("1");
const serialParity = ref("none");
const serialAdvanced = ref(false);

// 网络配置
const networkIp = ref("");
const networkPort = ref("");

// 文件配置
const filePath = ref("");
// const fileContent = ref("");

// 创建全局设备变量，connected值：null(无设备)、true(有设备已连接)、false(有设备未连接)
const globalDevice = ref<{
  type?: 'serial' | 'network' | 'file',
  path?: string,
  baudRate?: number,
  dataBits?: number,
  stopBits?: number,
  parity?: string,
  connected: null | boolean
}>({ connected: null })

const deviceConnected = computed(() => {
  return globalDevice.value.connected === true
})

// 创建全局事件管理器
class IpcEventManager {
  private static instance: IpcEventManager;
  private listeners: Map<string, Function[]> = new Map();

  static getInstance(): IpcEventManager {
    if (!IpcEventManager.instance) {
      IpcEventManager.instance = new IpcEventManager();
    }
    return IpcEventManager.instance;
  }

  on(channel: string, callback: Function) {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, []);
      window.ipcRenderer.on(channel, callback as (event: import('electron').IpcRendererEvent, ...args: any[]) => void);
    }
    this.listeners.get(channel)!.push(callback);
  }

  removeAllListeners(channel: string) {
    if (this.listeners.has(channel)) {
      const callbacks = this.listeners.get(channel)!;
      callbacks.forEach(callback => {
        window.ipcRenderer.removeListener(channel, callback as (event: import('electron').IpcRendererEvent, ...args: any[]) => void);
      });
      this.listeners.delete(channel);
    }
  }
}

/**
 * 设备管理组合式函数
 * 提供串口、网络和文件输入相关的状态和方法
 */
export function useDevice() {
  const ipcManager = IpcEventManager.getInstance();

  const isDragOver = ref(false)

  // 对话框状态
  const showInputDialog = ref(false);
  const activeTab = ref("serial");

  // 下拉框选项数据
  const serialPorts = ref([]); // 示例端口
  const baudRates = [
    "9600",
    "19200",
    "38400",
    "57600",
    "115200",
    "230400",
    "460800",
    "921600",
  ];
  const dataBits = ["5", "6", "7", "8"];
  const stopBits = ["1", "1.5", "2"];
  const parities = [
    { label: "无", value: "none" },
    { label: "奇校验", value: "odd" },
    { label: "偶校验", value: "even" },
  ];

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
    if (!relatedTarget || !event.currentTarget || 
        !(event.currentTarget as HTMLElement).contains(relatedTarget)) {
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
          if (file.type.toLowerCase().includes('log') || 
              file.name.toLowerCase().endsWith('.log') || 
              file.type.toLowerCase().includes('text') || 
              file.name.toLowerCase().endsWith('.txt') || 
              file.type.toLowerCase().includes('dat') || 
              file.name.toLowerCase().endsWith('.dat')) {
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
          
          // 根据当前模式处理数据
          switch (navMode.funcMode) {
            case 'flow':
              ElMessage({
                message: `成功导入文件: ${file.name}`,
                type: 'success',
                placement: 'bottom-right',
                offset: 50,
              })
              initFlowRawData(content)
              initFlowConsole(content)
              break
            default:
              // 其他模式下发送通用事件
              emitter.emit('file-imported', { type: 'text', data: content, filename: file.name })
              break
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
    showInputDialog.value = true;
    searchSerialPorts();
  };

  /**
   * 自动检索当前存在的串口设备
   */
  const searchSerialPorts = () => {
    window.ipcRenderer
      .invoke("search-serial-ports")
      .then((ports) => {
        serialPorts.value = ports;
      })
      .catch((error) => {
        console.error("自动检索串口设备失败:", error);
        ElMessage({
          message: "自动检索串口设备失败",
          type: "error",
          placement: 'bottom-right',
          offset: 50,
        });
      });
  };

  /**
   * 处理串口配置提交
   * @returns 串口命令字符串
   */
  const handleSerialSubmit = (): string => {
    const friendlyName = serialPort.value;
    const baudRate = serialBaudRate.value;
    const dataBits = serialDataBits.value;
    const stopBits = serialStopBits.value;
    const parity = serialParity.value;
  
    if (!friendlyName || !baudRate || !dataBits || !stopBits || !parity)
      return "";
  
    const match = friendlyName.match(
      /\b([A-Z]+\d+(?:[A-Z]*\d*)*)\b(?=->|$|\))/i
    );
    const port = match ? match[1] : "";

    if (globalDevice.value.connected === true) {
      if (globalDevice.value.path === port) {
        return port;
      } else {
        closeCurrDevice();
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
      connected: false
    };
  
    // 调用 openCurrDevice 函数打开设备
    openCurrDevice();
  
    return port;
  };
  
  /**
   * 处理网络配置提交
   * @returns 网络命令字符串
   */
  const handleNetworkSubmit = (): string => {
    const networkCmd = networkIp.value + ":" + networkPort.value;
    ElMessage({
      message: `网络功能暂未实现`,
      type: 'info',
      placement: 'bottom-right',
      offset: 50,
    })
  
    console.log("网络配置:", networkCmd);
  
    return networkCmd;
  }

  // 重构selectTargetFile函数，只负责选择文件并设置filePath
  const selectTargetFile = () => {
    // 创建一个隐藏的文件输入元素
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.txt,.csv,.dat,.log';
    fileInput.style.display = 'none';
    
    // 添加到文档中
    document.body.appendChild(fileInput);
    
    // 设置文件选择后的回调
    fileInput.onchange = (event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      if (file) {
        // 尝试使用完整路径，如果不能则使用文件名
        filePath.value = file.path || file.name;
        
        // 在Electron环境中，可以考虑存储文件对象引用，以便后续读取
        if (file instanceof File) {
          // 存储文件对象引用
          selectedFile.value = file;
        }
      }
      
      // 移除临时元素
      document.body.removeChild(fileInput);
    };
    
    // 触发文件选择对话框
    fileInput.click();
  };
  
  // 添加一个响应式变量来存储选择的文件对象
  const selectedFile = ref<File | null>(null);
  
  // 重构handleFileSubmit函数，负责读取文件内容并初始化数据
  const handleFileSubmit = (): string => {
    const fileCmd = filePath.value;
    
    // 设置全局设备信息
    globalDevice.value = {
      type: 'file',
      path: fileCmd,
      connected: false // 仅实时数据能修改globalDevice为true
    };
    
    if (!selectedFile.value && !fileCmd) {
      ElMessage({
        message: `请先选择文件`,
        type: 'error',
        placement: 'bottom-right',
        offset: 50,
      });
      return '';
    }
    
    // 如果有文件对象引用，直接使用它读取内容
    if (selectedFile.value) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        try {
          switch (navMode.funcMode) {
            case 'flow':
              initFlowRawData(content);
              initFlowConsole(content);
              ElMessage({
                message: `数据加载成功`,
                type: 'success',
                placement: 'bottom-right',
                offset: 50,
              });
              break;
            default:
              ElMessage({
                message: `未定义的文件处理模式`,
                type: 'error',
                placement: 'bottom-right',
                offset: 50,
              });
              break;
          }
        } catch (error) {
          ElMessage({
            message: `数据加载失败: ${error}`,
            type: 'error',
            placement: 'bottom-right',
            offset: 50,
          });
        }
      };
      
      reader.onerror = () => {
        ElMessage({
          message: `文件读取失败`,
          type: 'error',
          placement: 'bottom-right',
          offset: 50,
        });
      };
      
      reader.readAsText(selectedFile.value);
    } else {
      // 如果没有文件对象，显示提示信息
      ElMessage({
        message: `请重新选择文件以加载数据`,
        type: 'warning',
        placement: 'bottom-right',
        offset: 50,
      });
    }
    
    return fileCmd;
  };
  
  const openCurrDevice = () => {
    if (globalDevice.value.connected === false) {
      if (globalDevice.value.type === 'serial') {
        window.ipcRenderer
          .invoke("open-serial-port", {
            path: globalDevice.value.path,
            baudRate: globalDevice.value.baudRate,
            dataBits: globalDevice.value.dataBits,
            stopBits: globalDevice.value.stopBits,
            parity: globalDevice.value.parity,
          })
          .then(() => {
            globalDevice.value.connected = true;
  
            ElMessage({
              message: `串口${globalDevice.value.path}打开成功`,
              type: "success",
              placement: 'bottom-right',
              offset: 50,
            });
          })
          .catch((error) => {
            ElMessage({
              message: `${error.message}`,
              type: "error",
              placement: 'bottom-right',
              offset: 50,
            });
          });
      } else if (globalDevice.value.type === 'network') {
        // 网络设备连接逻辑
      }
    }
  }

  const removeCurrDevice = () => {
    if (globalDevice.value.connected !== null) {
      if (globalDevice.value.type === 'serial') {
        window.ipcRenderer.invoke('close-serial-port', {
          path: globalDevice.value.path,
          baudRate: globalDevice.value.baudRate,
          dataBits: globalDevice.value.dataBits,
          stopBits: globalDevice.value.stopBits,
          parity: globalDevice.value.parity,
        }).then(() => {
          globalDevice.value = { connected: null }
          serialPort.value = ""
          serialBaudRate.value = "115200"
          serialDataBits.value = "8"
          serialStopBits.value = "1"
          serialParity.value = "none"
          serialAdvanced.value = false
        })
      } else if (globalDevice.value.type === 'network') {
        globalDevice.value = { connected: null }
      }
    }
  }

  const closeCurrDevice = () => {
    if (globalDevice.value.connected !== null) {
      if (globalDevice.value.type === 'serial') {
        window.ipcRenderer.invoke('close-serial-port', {
          path: globalDevice.value.path,
          baudRate: globalDevice.value.baudRate,
          dataBits: globalDevice.value.dataBits,
          stopBits: globalDevice.value.stopBits,
          parity: globalDevice.value.parity,
        }).then(() => {
          if (globalDevice.value.type) {
            globalDevice.value.connected = false
          }
        })
      } else if (globalDevice.value.type === 'network') {
        // globalDevice.value.connected = false
      }
    }
  }

  /**
   * 提交输入表单
   */
  const handleInputSubmit = () => {
    let command = "";
  
    switch (activeTab.value) {
      case "serial":
        command = handleSerialSubmit();
        break;
      case "network":
        command = handleNetworkSubmit();
        break;
      case "file":
        command = handleFileSubmit();
        break;
    }
  
    if (command || activeTab.value === 'file') {
      // 对于文件类型，即使没有返回command也关闭对话框
      // 因为文件选择是通过新的对话框进行的
      if (activeTab.value !== 'file') {
        console.log("输入的指令:", command);
      }
      showInputDialog.value = false;
    } else {
      ElMessage({
        message: "请输入指令",
        type: "warning",
        placement: 'bottom-right',
        offset: 50,
      });
    }
  };

  ipcManager.on('serial-data-to-renderer', (event: any, data: string) => {
    switch (navMode.funcMode) {
      case 'gnss':
        processNmeaRawData(data);
        break;
      case 'ultrasonic':
        addUltrasonicRawData(data)
        break;
      case 'flow':
        addFlowConsole(data);
        addFlowRawData(data);
        break;
      default:
        break;
    }
  });

  ipcManager.on('serial-disconnected', (event: any, data: { path: string }) => {
    // 检查断开的是否是当前连接的串口
    if (globalDevice.value.path === data.path) {
      // 更新全局设备状态
      globalDevice.value.connected = false;
      searchSerialPorts();
      
      // 显示断开连接的消息
      ElMessage({
        message: `串口${data.path}已断开连接`,
        type: "warning",
        placement: 'bottom-right',
        offset: 50,
      });
    }
  });

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
  };
}
