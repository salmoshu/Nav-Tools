import { ref } from "vue"
import { ElMessage } from "element-plus"
import { navMode } from "@/settings/config"
import { useNmea } from '@/composables/gnss/useNmea'

export const deviceConnected = ref(false);
const deviceList: any[] = []

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

  // 文件配置
  const fileInput = ref("");

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
        
        deviceList.push({
          type: 'serial',
          path: port,
          baudRate: Number(baudRate),
          dataBits: Number(dataBits),
          stopBits: Number(stopBits),
          parity: parity,
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
    if (!networkIp.value) return "";
    if (!networkPort.value) return "";

    console.log("网络配置:", networkCmd);

    // 可以在这里添加更多网络相关的逻辑

    return networkCmd;
  };

  /**
   * 处理文件配置提交
   * @returns 文件命令字符串
   */
  const handleFileSubmit = (): string => {
    const filePath = fileInput.value;
    if (!filePath) return "";

    console.log("文件路径:", filePath);

    window.ipcRenderer
      .invoke('read-file-event', filePath)
      .then((data) => {
        console.log('文件内容:', data);
      })
      .catch((error) => {
        console.error('读取文件失败:', error);
      });

    return filePath;
  };

  /**
   * 打开文件选择对话框
   */
  const openFileDialog = () => {
    window.ipcRenderer
      .invoke("open-file-dialog")
      .then((result) => {
        if (result.canceled) return;
        if (result.filePaths && result.filePaths.length > 0) {
          fileInput.value = result.filePaths[0];
        }
      })
      .catch((error) => {
        console.error("打开文件对话框失败:", error);
        ElMessage({
          message: "打开文件对话框失败",
          type: "error",
        });
      });
  };

  const closeAllDevice = () => {
    deviceList.forEach((item) => {
      if (item.type === 'serial') {
        window.ipcRenderer.invoke('close-serial-port', {
          path: item.path,
          baudRate: item.baudRate,
          dataBits: item.dataBits,
          stopBits: item.stopBits,
          parity: item.parity,
        }).then(() => {
          const index = deviceList.indexOf(item)
          if (index !== -1) {
            deviceList.splice(index, 1)
          }
          if (deviceList.length === 0) {
            deviceConnected.value = false
          }
        })
      }
    })
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
        useNmea().processRawData(data);
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
    fileInput,
    serialPorts,
    baudRates,
    dataBits,
    stopBits,
    parities,
    handleInputSubmit,
    inputDialog,
    openFileDialog,
    closeAllDevice,
    searchSerialPorts,
  };
}
