import { computed, ref } from "vue"
import { ElMessage } from "element-plus"
import { navMode } from "@/settings/config"
import { useNmea } from '@/composables/gnss/useNmea'
import { useUltrasonic } from '@/composables/ultrasonic/useUltrasonic'
import { useFollow } from '@/composables/follow/useFollow'

export const deviceConnected = ref(false);
const deviceList = ref<any[]>([])

const { processRawData } = useNmea()
const { addRawData: addUltrasonicRawData } = useUltrasonic()
const { addRawData: addFollowRawData } = useFollow()

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
      window.ipcRenderer.on(channel, callback);
    }
    this.listeners.get(channel)!.push(callback);
  }

  removeAllListeners(channel: string) {
    if (this.listeners.has(channel)) {
      const callbacks = this.listeners.get(channel)!;
      callbacks.forEach(callback => {
        window.ipcRenderer.removeListener(channel, callback);
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

  const deviceBusy = computed(() => {
    return deviceList.value.length > 0
  })

  /**
   * 打开输入对话框
   */
  const inputDialog = () => {
    showInputDialog.value = true;
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

    window.ipcRenderer
      .invoke("open-serial-port", {
        path: port,
        baudRate: Number(baudRate),
        dataBits: Number(dataBits),
        stopBits: Number(stopBits),
        parity: parity,
      })
      .then(() => {
        deviceConnected.value = true;
        
        deviceList.value.push({
          type: 'serial',
          path: port,
          baudRate: Number(baudRate),
          dataBits: Number(dataBits),
          stopBits: Number(stopBits),
          parity: parity,
          connected: true
        })

        ElMessage({
          message: `串口${port}打开成功`,
          type: "success",
        });
      })
      .catch((error) => {
        ElMessage({
          message: `${error.message}`,
          type: "error",
        });
      });

    return port;
  };

  /**
   * 处理网络配置提交
   * @returns 网络命令字符串
   */
  const handleNetworkSubmit = (): string => {
    const networkCmd = networkIp.value + ":" + networkPort.value;
    ElMessage.info('网络功能暂未实现')

    // // 输入验证
    // if (!networkIp.value) return "";
    // if (!networkPort.value) return "";

    console.log("网络配置:", networkCmd);

    // 可以在这里添加更多网络相关的逻辑

    return networkCmd;
  };

  const removeAllDevice = () => {
    deviceList.value.forEach((item) => {
      if (item.type === 'serial') {
        window.ipcRenderer.invoke('close-serial-port', {
          path: item.path,
          baudRate: item.baudRate,
          dataBits: item.dataBits,
          stopBits: item.stopBits,
          parity: item.parity,
        }).then(() => {
          const index = deviceList.value.indexOf(item)
          if (index !== -1) {
            deviceList.value.splice(index, 1)
          }
          if (deviceList.value.length === 0) {
            deviceConnected.value = false
          }
        })
      }
    })
  }

  const closeAllDevice = () => {
    deviceList.value.forEach((item) => {
      if (item.type === 'serial') {
        window.ipcRenderer.invoke('close-serial-port', {
          path: item.path,
          baudRate: item.baudRate,
          dataBits: item.dataBits,
          stopBits: item.stopBits,
          parity: item.parity,
        }).then(() => {
          item.connected = false
        })
      }
    })
    deviceConnected.value = false
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
        processRawData(data);
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

  ipcManager.on('read-file-success', (event: any, data: string) => {
    switch (navMode.funcMode) {
      default:
        break;
    }
  })

  ipcManager.on('read-file-error', (event: any, error: string) => {
    switch (navMode.funcMode) {
      default:
        break;
    }
  })

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
    deviceBusy,
    handleInputSubmit,
    inputDialog,
    closeAllDevice,
    removeAllDevice,
    searchSerialPorts,
  };
}
