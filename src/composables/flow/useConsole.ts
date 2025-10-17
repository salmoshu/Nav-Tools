import { ref, computed } from "vue";
import type { Ref } from "vue";

// 消息类型定义
export interface ConsoleMessage {
  timestamp: string;
  raw: string;
  dataType: "json" | "nmea";
  isValid: boolean;
  key: string;
}

// 控制台状态接口
export interface ConsoleState {
  messages: Ref<ConsoleMessage[]>;
  dataFormat: Ref<"json" | "nmea">;
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
  addMessage: (
    raw: string,
    dataType?: "json" | "nmea",
    isValid?: boolean
  ) => void;
  clearMessages: () => void;
  toggleFilter: () => void;
  toggleTimestamp: () => void;
  toggleAutoScroll: () => void;
  togglePause: () => void;
  saveToFile: () => void;
  handleRawDataBatch: (rawData: string) => void;
  exportMessages: () => void;
  searchMessages: (query: string) => void;
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
  const dataFilter = ref(false);
  const dataTimestamp = ref(true);
  const dataAutoScroll = ref(true);
  const isPaused = ref(false);

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

  // 批量导入文件数据
  const handleRawDataBatch = (rawData: string) => {
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
      const time_reg = /^\d{2}:\d{2}:\d{2}\.\d+(?:\.\d+)?:/;
      const cleanedLine = line.replace(time_reg, "").trim();

      if (cleanedLine.trim() !== "") {
        const uniqueTimestamp =
          baseTimestamp +
          "." +
          (baseTime.getMilliseconds() + i).toString().padStart(3, "0");

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
          timestamp: uniqueTimestamp,
          raw: cleanedLine,
          dataType,
          isValid,
          key: generateKey(uniqueTimestamp, cleanedLine),
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

  // NMEA消息验证
  const validateNmeaMessage = (message: string): boolean => {
    if (!message.startsWith("$")) return false;

    const asteriskIndex = message.indexOf("*");
    if (asteriskIndex === -1 || asteriskIndex < 6) return false;

    const checksumPart = message.substring(asteriskIndex + 1);
    if (!/^[0-9A-Fa-f]{2}$/.test(checksumPart)) return false;

    const dataPart = message.substring(1, asteriskIndex);
    let checksum = 0;
    for (let i = 0; i < dataPart.length; i++) {
      checksum ^= dataPart.charCodeAt(i);
    }

    const calculatedChecksum = checksum
      .toString(16)
      .toUpperCase()
      .padStart(2, "0");
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
      .substr(2, 9)}`;
  };

  const validateMessage = (raw: string, dataType: "json" | "nmea"): boolean => {
    if (!raw || raw.trim().length === 0) return false;

    switch (dataType) {
      case "json":
        try {
          JSON.parse(raw);
          return true;
        } catch {
          return false;
        }
      case "nmea":
        // NMEA 格式验证
        return /^\$[A-Z]{2}[A-Z]{3},.*\*[0-9A-F]{2}$/.test(raw.trim());
      default:
        return true;
    }
  };

  // 核心方法
  const addMessage = (
    raw: string,
    dataType: "json" | "nmea" = "json",
    isValid: boolean = true
  ) => {
    if (isPaused.value) return;

    const timestamp = generateTimestamp();
    const actualIsValid = validateMessage(raw, dataType);

    const message: ConsoleMessage = {
      timestamp,
      raw: raw.trim(),
      dataType,
      isValid: actualIsValid,
      key: generateKey(timestamp, raw),
    };

    messages.value.push(message);

    // 限制消息数量，保持内存使用
    if (messages.value.length > maxMessages) {
      messages.value.shift();
    }
  };

  const clearMessages = () => {
    messages.value = [];
  };

  const toggleFilter = () => {
    dataFilter.value = !dataFilter.value;
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

  // 批量添加消息（用于初始化或导入）
  const addMessages = (
    rawMessages: string[],
    dataType: "json" | "nmea" = "json"
  ) => {
    const newMessages = rawMessages
      .filter((raw) => raw && raw.trim().length > 0)
      .map((raw) => {
        const timestamp = generateTimestamp();
        const isValid = validateMessage(raw, dataType);

        return {
          timestamp,
          raw: raw.trim(),
          dataType,
          isValid,
          key: generateKey(timestamp, raw),
        } as ConsoleMessage;
      });

    messages.value.push(...newMessages);

    // 限制总数量
    if (messages.value.length > maxMessages) {
      messages.value = messages.value.slice(-maxMessages);
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

  const instance: ConsoleState = {
    messages,
    dataFormat,
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
    clearMessages,
    toggleFilter,
    toggleTimestamp,
    toggleAutoScroll,
    togglePause,
    saveToFile,
    handleRawDataBatch,
    exportMessages,
    searchMessages,
  };

  // 如果是全局实例，则保存到全局变量
  if (useGlobal) {
    globalConsolexInstance = instance;
  }

  return instance;
}
