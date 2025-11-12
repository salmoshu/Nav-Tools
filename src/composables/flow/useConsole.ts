import { ref, computed } from "vue";
import type { Ref } from "vue";

// 消息类型定义
export interface ConsoleMessage {
  timestamp: string;
  raw: string;
  dataType: "json" | "nmea" | "undefined";
  isValid: boolean;
  key: string;
}

// 控制台状态接口
export interface ConsoleState {
  messages: Ref<ConsoleMessage[]>;
  dataFormat: Ref<"json" | "nmea">;
  displayFormat: Ref<'hex' | 'ascii'>;
  dataFilter: Ref<boolean>;
  dataTimestamp: Ref<boolean>;
  dataAutoScroll: Ref<boolean>;
  isPaused: Ref<boolean>;
  maxMessages: number;

  // 搜索
  searchQuery: Ref<string>;

  // 计算属性
  filteredMessages: Ref<ConsoleMessage[]>;
  totalCount: Ref<number>;
  validMsgCount: Ref<number>;

  // 方法
  addMessage: (rawData: string) => void;
  addMessages: (rawData: string) => void;
  clearMessages: () => void;
  toggleFilter: () => void;
  toggleDisplayFormat: () => void;
  toggleTimestamp: () => void;
  toggleAutoScroll: () => void;
  togglePause: () => void;
  saveToFile: () => void;
  exportMessages: () => void;
  searchMessages: (query: string) => void;
  sendMessage: (data: string, format: "hex" | "ascii") => void;
}

// 全局单例实例
let globalConsolexInstance: ConsoleState | null = null;

/**
 * 虚拟滚动控制台组合式函数
 * 提供高性能的消息处理和状态管理
 * @param useGlobal 是否使用全局单例实例，默认为true
 */
export function useConsole(useGlobal: boolean = true): ConsoleState {
  // 如果使用全局实例且已存在，则返回现有实例
  if (useGlobal && globalConsolexInstance) {
    return globalConsolexInstance;
  }

  // 状态管理
  const messages = ref<ConsoleMessage[]>([]);
  const dataFormat = ref<"json" | "nmea">("json");
  const displayFormat = ref<'hex' | 'ascii'>('ascii')
  const dataFilter = ref(false);
  const dataTimestamp = ref(true);
  const dataAutoScroll = ref(true);
  const isPaused = ref(false);
  let tempDataString = ''; // 临时存储数据，用于处理不完整的消息

  // 搜索
  const searchQuery = ref('')

  // 配置常量
  const maxMessages = 100000;

  // 计算属性
  const filteredMessages = computed(() => {
    if (!dataFilter.value) {
      return messages.value;
    }
    return messages.value.filter(
      (msg) => msg.dataType === dataFormat.value && msg.isValid
    );
  });
  const validMsgCount = computed(() => {
    return messages.value.filter(
      (msg) => msg.dataType === dataFormat.value && msg.isValid
    ).length;
  });

  const totalCount = computed(() => messages.value.length);

  const calcNmeaChecksum = (sentence: string): string => {
    let checksum = 0;
    for (let i = 0; i < sentence.length; i++) {
      checksum ^= sentence.charCodeAt(i);
    }
    // 转换为2位十六进制字符串
    return checksum.toString(16).toUpperCase().padStart(2, "0");
  };

  const validateNmeaMessage = (message: string): boolean => {
    // 基本格式检查
    if (!message.startsWith("$")) {
      return false;
    }
    
    const cleanStr = message.trimEnd(); // 移除结尾的换行符以便处理
    const asteriskIndex = cleanStr.indexOf("*"); // 检查是否包含星号(校验和分隔符)
    if (asteriskIndex === -1 || asteriskIndex < 6) {
      return false; // 至少需要$xxxx,格式
    }

    // 检查校验和是否为2位十六进制字符
    const checksumPart = cleanStr.substring(asteriskIndex + 1);
    if (!/^[0-9A-Fa-f]{2}$/.test(checksumPart)) {
      return false;
    }

    // 验证校验和
    const dataPart = cleanStr.substring(1, asteriskIndex); // 不包含$和校验和部分
    const calculatedChecksum = calcNmeaChecksum(dataPart);
    return calculatedChecksum === checksumPart.toUpperCase();
  };

  // JSON消息验证
  const validateJsonMessage = (message: string): boolean => {
    try {
      JSON.parse(message);
      return true;
    } catch {
      return false;
    }
  };

  // 工具函数
  const generateTimestamp = (): string => {
    const now = new Date();
    return (
      now.toLocaleTimeString() +
      "." +
      now.getMilliseconds().toString().padStart(3, "0")
    );
  };

  const generateKey = (timestamp: string, raw: string): string => {
    return `${timestamp}_${raw}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 11)}`;   // ← 等价于原来的 substr(2, 9)
  };

  // 核心方法
  const addMessage = (rawData: string) => {
    if (isPaused.value) return;

    tempDataString += rawData;
    if (tempDataString.includes('\n')) {
      const timestamp = generateTimestamp();
      const lines = tempDataString.split('\n');

      // 保留最后一行，因为它可能是不完整的
      tempDataString = lines[lines.length - 1];

      // 处理所有完整的行（除了最后一行）
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        if (line.trim() !== '') {
          let isValid = true;

          if (dataFormat.value === 'nmea') {
            isValid = validateNmeaMessage(line);
            const message: ConsoleMessage = {
              timestamp,
              raw: line,
              dataType: 'nmea',
              isValid,
              key: generateKey(timestamp, line),
            };
            messages.value.push(message);
          } else {
            isValid = validateJsonMessage(line);
            const message: ConsoleMessage = {
              timestamp: timestamp + ' [MSG ⬅️]',
              raw: line,
              dataType: 'json',
              isValid,
              key: generateKey(timestamp, line),
            };
            messages.value.push(message);
          }
        }
      }
  
      // 限制消息数量，保持内存使用
      if (messages.value.length > maxMessages) {
        messages.value.shift();
      }
    }
  };

  // 批量导入文件数据
  const addMessages = (rawData: string) => {
    clearMessages();
    const baseTime = new Date();
    const baseTimestamp =
      baseTime.toLocaleTimeString() +
      "." +
      baseTime.getMilliseconds().toString().padStart(3, "0");
    const lines = rawData.split("\n");

    // 批量添加消息
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let cleanedLine = '';

      // 合并时间戳和消息前缀的正则表达式
      const combined_reg = /^(\d{2}:\d{2}:\d{2}\.\d+)?\s*(\[MSG ⬅️\]:\s+|\[STR ➡️\]:\s+|\[HEX ➡️\]:\s+)?/;
      const matchResult = line.match(combined_reg);

      // 提取文件中记录的时间和消息前缀，如果没有则使用当前时间
      let messageTimestamp;
      if (matchResult && matchResult[1]) {
        // 使用文件中记录的时间 + 前缀
        messageTimestamp = matchResult[1] + ' ' + (matchResult[2] ? matchResult[2].trim().slice(0, -1) : "");
      } else {
        // 使用唯一的时间戳
        messageTimestamp =
          baseTimestamp +
          "." +
          (baseTime.getMilliseconds() + i).toString().padStart(3, "0") + ' ' + 
          (matchResult && matchResult[2] ? matchResult[2].trim().slice(0, -1) : "");
      }
      
      // 一次性移除时间戳和消息前缀
      cleanedLine = line.replace(combined_reg, "").trim();

      if (cleanedLine.trim() !== "") {

        // 检测是否为JSON格式
        let isValid = false;
        let dataType: "json" | "nmea" = "json";

        // 自动检测数据类型
        if (cleanedLine.startsWith("$")) {
          dataType = "nmea";
          isValid = validateNmeaMessage(cleanedLine);
        } else if (cleanedLine.startsWith("{") && cleanedLine.endsWith("}")) {
          dataType = "json";
          isValid = validateJsonMessage(cleanedLine);
        } else {
          // 无法识别的格式，默认按JSON处理
          dataType = "json";
          isValid = false;
        }

        const message: ConsoleMessage = {
          timestamp: messageTimestamp,
          raw: cleanedLine,
          dataType,
          isValid,
          key: generateKey(messageTimestamp, cleanedLine),
        };

        messages.value.push(message);
      }
    }

    // 限制消息数量
    if (messages.value.length > maxMessages * 2) {
      const removedCount = messages.value.length - maxMessages * 2;
      messages.value.splice(0, removedCount);
    }
  };

  const clearMessages = () => {
    messages.value = [];
    tempDataString = '';
  };

  const toggleFilter = () => {
    dataFilter.value = !dataFilter.value;
  };

  const toggleDisplayFormat = () => {
    displayFormat.value = displayFormat.value === 'ascii' ? 'hex' : 'ascii';
    window.ipcRenderer.send('serial-data-format', displayFormat.value);
  };

  const toggleTimestamp = () => {
    dataTimestamp.value = !dataTimestamp.value;
  };

  const toggleAutoScroll = () => {
    dataAutoScroll.value = !dataAutoScroll.value;
  };

  const togglePause = () => {
    isPaused.value = !isPaused.value;
  };

  const saveToFile = () => {
    if (messages.value.length === 0) {
      console.warn("没有可保存的数据");
      return;
    }

    try {
      const content = messages.value
        .map((msg) =>
          dataTimestamp.value ? `${msg.timestamp}: ${msg.raw}` : msg.raw
        )
        .join("\n");

      const blob = new Blob([content], { type: "text/plain;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Nav-Tools_${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.log`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("保存文件失败:", error);
    }
  };

  // 导出消息（用于外部使用）
  const exportMessages = (format: "json" | "text" = "text"): string => {
    switch (format) {
      case "json":
        return JSON.stringify(messages.value, null, 2);
      case "text":
      default:
        return messages.value
          .map((msg) =>
            dataTimestamp.value ? `${msg.timestamp}: ${msg.raw}` : msg.raw
          )
          .join("\n");
    }
  };

  // 搜索功能
  const searchMessages = (query: string): ConsoleMessage[] => {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const lowerQuery = query.toLowerCase();
    return messages.value.filter(
      (msg) =>
        msg.raw.toLowerCase().includes(lowerQuery) ||
        msg.timestamp.toLowerCase().includes(lowerQuery)
    );
  };

  // 发送消息到串口
  const sendMessage = (data: string, format: "hex" | "ascii") => {
    if (!window.ipcRenderer) {
      console.error('IPC通信不可用');
      return;
    }

    try {
      let sendData: string;
      
      if (format === "hex") {
        // 验证十六进制格式
        const cleanedData = data.replace(/\s/g, ''); // 移除所有空格
        if (!/^[0-9A-Fa-f]*$/.test(cleanedData)) {
          console.error('无效的十六进制格式');
          return;
        }
        // 确保长度为偶数
        if (cleanedData.length % 2 !== 0) {
          console.error('十六进制数据长度必须为偶数');
          return;
        }
        sendData = cleanedData;
      } else {
        // ASCII格式，直接发送
        sendData = data;
      }

      // 发送到主进程
      window.ipcRenderer.send(`send-serial-${format}-data`, sendData);
      
      // 在控制台显示发送的消息
      const timestamp = generateTimestamp();
      const message: ConsoleMessage = {
        timestamp: timestamp + ' [' + (format==='ascii'?'STR':'HEX') + ' ➡️]',
        raw: data,
        dataType: 'undefined',
        isValid: false,
        key: generateKey(timestamp, data),
      };
      messages.value.push(message);
      
      // 限制消息数量
      if (messages.value.length > maxMessages) {
        messages.value.shift();
      }
    } catch (error) {
      console.error('发送消息失败:', error);
    }
  };

  const instance: ConsoleState = {
    messages,
    dataFormat,
    displayFormat,
    dataFilter,
    dataTimestamp,
    dataAutoScroll,
    isPaused,
    maxMessages,

    // 搜索
    searchQuery,

    filteredMessages,
    totalCount,
    validMsgCount,

    addMessage,
    addMessages,
    clearMessages,
    toggleFilter,
    toggleDisplayFormat,
    toggleTimestamp,
    toggleAutoScroll,
    togglePause,
    saveToFile,
    exportMessages,
    searchMessages,
    sendMessage,
  };

  // 如果是全局实例，则保存到全局变量
  if (useGlobal) {
    globalConsolexInstance = instance;
  }

  return instance;
}
