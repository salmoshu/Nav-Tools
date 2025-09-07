import { computed, ref } from "vue"
import { ElMessage } from "element-plus"
import { navMode } from "@/settings/config"
import { useNmea } from '@/composables/gnss/useNmea'
import { useUltrasonic } from '@/composables/ultrasonic/useUltrasonic'
import { useFollow } from '@/composables/follow/useFollow'

const { processRawData: processNmeaRawData } = useNmea()
const { addRawData: addUltrasonicRawData } = useUltrasonic()
const { addRawData: addFollowRawData } = useFollow()

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

// 创建全局设备变量，connected值：null(无设备)、true(有设备已连接)、false(有设备未连接)
const globalDevice = ref<{
  type?: 'serial' | 'network',
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
    ElMessage.info('网络功能暂未实现')
  
    console.log("网络配置:", networkCmd);
  
    return networkCmd;
  }
  
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
            });
          })
          .catch((error) => {
            ElMessage({
              message: `${error.message}`,
              type: "error",
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
    }

    if (command) {
      console.log("输入的指令:", command);
      showInputDialog.value = false;
    } else {
      ElMessage({
        message: "请输入指令",
        type: "warning",
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
      case 'follow':
        addFollowRawData(data)
        break;
      default:
        break;
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
    networkIp,
    networkPort,
    serialPorts,
    baudRates,
    dataBits,
    stopBits,
    parities,
    deviceConnected,
    globalDevice,
    handleInputSubmit,
    inputDialog,
    openCurrDevice,
    closeCurrDevice,
    removeCurrDevice,
    searchSerialPorts,
  };
}
