import { ref, shallowRef, computed } from "vue";
import type { Ref } from "vue";
import { activeDataTransport } from '@/core/device/ActiveDataTransport'
import { useFileTimeline } from '@/composables/useFileTimeline'
import {
  DEFAULT_KEY_VALUE_REGEX,
  parseTextRecord,
} from '@/core/data/TextRecordParser'

// 消息类型定义
export interface ConsoleMessage {
  timestamp: string;
  raw: string;
  dataType: "json" | "nmea" | "regex" | "csv" | "none";
  isValid: boolean;
  key: string;
  fileElapsedMilliseconds?: number;
}

export function findTimelineMessageIndex(
  source: readonly ConsoleMessage[],
  cutoffMilliseconds: number,
): number {
  if (source.length === 0) return -1;

  let low = 0;
  let high = source.length - 1;
  let targetIndex = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const elapsed = source[middle].fileElapsedMilliseconds;
    if (elapsed === undefined || elapsed <= cutoffMilliseconds) {
      targetIndex = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return targetIndex;
}

// 控制台状态接口
export interface ConsoleState {
  messages: Ref<ConsoleMessage[]>;
  dataFormat: Ref<"none" | "json" | "nmea" | "regex" | "csv">;
  regexPattern: Ref<string>;
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
  beginFileReplayMessages: () => void;
  addFileReplayData: (rawData: string) => void;
  endFileReplayMessages: () => void;
  clearMessages: () => void;
  toggleFilter: () => void;
  toggleDisplayFormat: () => void;
  toggleTimestamp: () => void;
  toggleAutoScroll: () => void;
  togglePause: () => void;
  saveToFile: () => void;
  exportMessages: () => void;
  searchMessages: (query: string) => void;
  sendMessage: (data: string, format: "hex" | "ascii", addNewLine: boolean) => void;
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
  const messages = shallowRef<ConsoleMessage[]>([]);
  const dataFormat = ref<"none" | "json" | "nmea" | "regex" | "csv">("none");
  const regexPattern = ref(DEFAULT_KEY_VALUE_REGEX);
  const displayFormat = ref<'hex' | 'ascii'>('ascii')
  const dataFilter = ref(false);
  const dataTimestamp = ref(true);
  const dataAutoScroll = ref(true);
  const isPaused = ref(false);
  const validNmeaCount = ref(0);
  const validJsonCount = ref(0);
  const validRegexCount = ref(0);
  const validCsvCount = ref(0);
  const fileTimeline = useFileTimeline();
  const hasFileReplayMessages = ref(false);
  let fileReplayBuffer = '';
  let fileReplayFirstClock: number | null = null;
  let fileReplayPreviousClock: number | null = null;
  let fileReplayDayOffset = 0;
  let fileReplayLastElapsed = 0;
  let tempDataString = ''; // 临时存储数据，用于处理不完整的消息
  let messageKeySequence = 0;
  let noneFlushTimer: ReturnType<typeof setTimeout> | null = null; // none模式下无换行符时的刷新定时器
  const NONE_FLUSH_DELAY = 300; // ms，无新数据到达后刷新缓冲区

  // 搜索
  const searchQuery = ref('')

  // 配置常量
  const maxMessages = 10000;

  // 计算属性
  const timelineMessages = computed(() => {
    const shouldProjectReplay =
      hasFileReplayMessages.value &&
      (fileTimeline.indexing.value ||
        (fileTimeline.active.value && fileTimeline.mode.value === 'replay'));
    if (!shouldProjectReplay) return messages.value;

    const cutoff = Math.max(0, fileTimeline.elapsedMilliseconds.value);
    return messages.value.filter(
      (message) =>
        message.fileElapsedMilliseconds === undefined ||
        message.fileElapsedMilliseconds <= cutoff,
    );
  });

  const filteredMessages = computed(() => {
    if (!dataFilter.value) {
      return timelineMessages.value;
    }
    return timelineMessages.value.filter(
      (msg) => msg.dataType === dataFormat.value && msg.isValid
    );
  });
  const validMsgCount = computed(() => {
    if (!hasFileReplayMessages.value) {
      return dataFormat.value === 'nmea'
        ? validNmeaCount.value
        : dataFormat.value === 'json'
          ? validJsonCount.value
        : dataFormat.value === 'regex'
          ? validRegexCount.value
          : dataFormat.value === 'csv'
            ? validCsvCount.value
            : 0;
    }
    return timelineMessages.value.filter(
      (message) => message.dataType === dataFormat.value && message.isValid,
    ).length;
  });

  const totalCount = computed(() => timelineMessages.value.length);

  const updateValidCount = (message: ConsoleMessage, delta: 1 | -1) => {
    if (!message.isValid) return;
    if (message.dataType === 'nmea') validNmeaCount.value += delta;
    if (message.dataType === 'json') validJsonCount.value += delta;
    if (message.dataType === 'regex') validRegexCount.value += delta;
    if (message.dataType === 'csv') validCsvCount.value += delta;
  };

  // 批量缓冲：消息先进入 pendingMessages，定时批量提交到 messages，
  // 避免每条消息都触发一次响应式更新和虚拟滚动列表的全量重建（O(n²) 劣化）
  let pendingMessages: ConsoleMessage[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const flushPendingMessages = () => {
    flushTimer = null;
    if (pendingMessages.length === 0) return;
    let merged = messages.value.concat(pendingMessages);
    pendingMessages = [];
    // 限制消息数量，保持内存使用
    const excess = hasFileReplayMessages.value ? 0 : merged.length - maxMessages;
    if (excess > 0) {
      for (let i = 0; i < excess; i++) updateValidCount(merged[i], -1);
      merged = merged.slice(excess);
    }
    messages.value = merged;
  };

  const scheduleFlush = () => {
    if (flushTimer === null) {
      flushTimer = setTimeout(flushPendingMessages, 200);
    }
  };

  const appendConsoleMessage = (message: ConsoleMessage) => {
    pendingMessages.push(message);
    updateValidCount(message, 1);
    scheduleFlush();
  };

  const trimMessages = (limit: number) => {
    const excess = messages.value.length - limit;
    if (excess <= 0) return;
    for (const message of messages.value.slice(0, excess)) updateValidCount(message, -1);
    messages.value = messages.value.slice(excess);
  };

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

  const generateKey = (timestamp: string): string => {
    messageKeySequence += 1;
    return `${timestamp}_${messageKeySequence}`;
  };

  const parseNmeaClock = (line: string): number | null => {
    const sentenceStart = line.indexOf('$');
    if (sentenceStart < 0) return null;

    const fields = line
      .slice(sentenceStart + 1)
      .split('*', 1)[0]
      .split(',');
    const sentenceType = fields[0]?.slice(-3).toUpperCase();
    const timeFieldIndex = sentenceType === 'GLL' ? 5 : 1;
    if (!['GGA', 'RMC', 'GST', 'ZDA', 'GLL'].includes(sentenceType)) return null;

    const compactTime = fields[timeFieldIndex];
    const match = compactTime?.match(/^(\d{2})(\d{2})(\d{2}(?:\.\d+)?)$/);
    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    if (hours > 23 || minutes > 59 || seconds >= 60) return null;
    return ((hours * 60 + minutes) * 60 + seconds) * 1000;
  };

  const resolveFileElapsedMilliseconds = (line: string): number => {
    const clock = parseNmeaClock(line);
    if (clock === null) return fileReplayLastElapsed;

    if (
      fileReplayPreviousClock !== null &&
      clock < fileReplayPreviousClock - 12 * 60 * 60 * 1000
    ) {
      fileReplayDayOffset += 24 * 60 * 60 * 1000;
    }
    fileReplayPreviousClock = clock;

    const absoluteClock = fileReplayDayOffset + clock;
    if (fileReplayFirstClock === null) fileReplayFirstClock = absoluteClock;
    fileReplayLastElapsed = Math.max(
      fileReplayLastElapsed,
      absoluteClock - fileReplayFirstClock,
      0,
    );
    return fileReplayLastElapsed;
  };

  const appendFileReplayLine = (line: string) => {
    if (line.trim() === '') return;
    const timestamp = generateTimestamp();
    let dataType: ConsoleMessage['dataType'] = 'none';
    let isValid = false;
    const nmeaStart = line.indexOf('$');
    const trimmedLine = line.trim();

    if (dataFormat.value === 'regex') {
      dataType = 'regex';
      isValid = parseTextRecord(line, 'regex', regexPattern.value).valid;
    } else if (dataFormat.value === 'csv') {
      dataType = 'csv';
      isValid = parseTextRecord(line, 'csv').valid;
    } else if (nmeaStart >= 0) {
      dataType = 'nmea';
      isValid = validateNmeaMessage(line.slice(nmeaStart).trim());
    } else if (
      (dataFormat.value === 'json' || trimmedLine.startsWith('{')) &&
      trimmedLine.endsWith('}')
    ) {
      dataType = 'json';
      isValid = validateJsonMessage(trimmedLine);
    }

    appendConsoleMessage({
      timestamp: dataType === 'nmea' ? timestamp : timestamp + ' [MSG ⬅️]',
      raw: line,
      dataType,
      isValid,
      key: generateKey(timestamp),
      fileElapsedMilliseconds: resolveFileElapsedMilliseconds(line),
    });
  };

  // 核心方法
  const addMessage = (rawData: string) => {
    if (isPaused.value) return;

    // 统一换行符：\r\n -> \n, 单独的 \r -> \n，避免 \r 导致显示异常
    const normalizedData = rawData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    if (dataFormat.value === 'none') {
      // Raw 模式：缓冲并按行拆分，避免串口分片导致消息断裂
      tempDataString += normalizedData;

      if (tempDataString.includes('\n')) {
        // 取消刷新定时器，因为有完整行可以处理
        if (noneFlushTimer !== null) {
          clearTimeout(noneFlushTimer);
          noneFlushTimer = null;
        }

        const lines = tempDataString.split('\n');
        // 保留最后一行，因为它可能是不完整的
        tempDataString = lines[lines.length - 1];

        // 处理所有完整的行（除了最后一行）
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i];
          if (line === '') continue;
          const timestamp = generateTimestamp();
          const message: ConsoleMessage = {
            timestamp: timestamp + ' [MSG ⬅️]',
            raw: line,
            dataType: 'none',
            isValid: false,
            key: generateKey(timestamp),
          };
          appendConsoleMessage(message);
        }
        trimMessages(maxMessages);
      } else {
        // 无换行符：启动刷新定时器，超时后强制输出缓冲区内容
        // 防止设备不发换行符时数据永远不显示
        if (noneFlushTimer !== null) clearTimeout(noneFlushTimer);
        noneFlushTimer = setTimeout(() => {
          noneFlushTimer = null;
          if (tempDataString.length > 0 && dataFormat.value === 'none') {
            const timestamp = generateTimestamp();
            const message: ConsoleMessage = {
              timestamp: timestamp + ' [MSG ⬅️]',
              raw: tempDataString,
              dataType: 'none',
              isValid: false,
              key: generateKey(timestamp),
            };
            appendConsoleMessage(message);
            tempDataString = '';
            trimMessages(maxMessages);
          }
        }, NONE_FLUSH_DELAY);
      }
      return;
    }

    // 结构化模式（nmea/json）：缓冲并按行拆分
    tempDataString += normalizedData;
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
              key: generateKey(timestamp),
            };
            appendConsoleMessage(message);
          } else if (dataFormat.value === 'json') {
            isValid = validateJsonMessage(line);
            const message: ConsoleMessage = {
              timestamp: timestamp + ' [MSG ⬅️]',
              raw: line,
              dataType: 'json',
              isValid,
              key: generateKey(timestamp),
            };
            appendConsoleMessage(message);
          } else if (dataFormat.value === 'regex') {
            isValid = parseTextRecord(line, 'regex', regexPattern.value).valid;
            const message: ConsoleMessage = {
              timestamp: timestamp + ' [MSG ⬅️]',
              raw: line,
              dataType: 'regex',
              isValid,
              key: generateKey(timestamp),
            };
            appendConsoleMessage(message);
          } else if (dataFormat.value === 'csv') {
            isValid = parseTextRecord(line, 'csv').valid;
            const message: ConsoleMessage = {
              timestamp: timestamp + ' [MSG ⬅️]',
              raw: line,
              dataType: 'csv',
              isValid,
              key: generateKey(timestamp),
            };
            appendConsoleMessage(message);
          }
        }
      }

      // 限制消息数量，保持内存使用
      trimMessages(maxMessages);
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
        let dataType: "json" | "nmea" | "regex" | "csv" = "json";

        // 自动检测数据类型
        if (dataFormat.value === 'regex') {
          dataType = 'regex';
          isValid = parseTextRecord(cleanedLine, 'regex', regexPattern.value).valid;
        } else if (dataFormat.value === 'csv') {
          dataType = 'csv';
          isValid = parseTextRecord(cleanedLine, 'csv').valid;
        } else if (cleanedLine.startsWith("$")) {
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
          key: generateKey(messageTimestamp),
        };

        appendConsoleMessage(message);
      }
    }

    // 限制消息数量
    trimMessages(maxMessages * 2);
  };

  const beginFileReplayMessages = () => {
    hasFileReplayMessages.value = true;
    fileReplayBuffer = '';
    fileReplayFirstClock = null;
    fileReplayPreviousClock = null;
    fileReplayDayOffset = 0;
    fileReplayLastElapsed = 0;
  };

  const addFileReplayData = (rawData: string) => {
    fileReplayBuffer += rawData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (!fileReplayBuffer.includes('\n')) return;

    const lines = fileReplayBuffer.split('\n');
    fileReplayBuffer = lines.pop() ?? '';
    for (const line of lines) appendFileReplayLine(line);
  };

  const endFileReplayMessages = () => {
    if (fileReplayBuffer.trim() !== '') appendFileReplayLine(fileReplayBuffer);
    fileReplayBuffer = '';
    if (flushTimer !== null) clearTimeout(flushTimer);
    flushPendingMessages();
  };

  const clearMessages = () => {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (noneFlushTimer !== null) {
      clearTimeout(noneFlushTimer);
      noneFlushTimer = null;
    }
    pendingMessages = [];
    messages.value = [];
    validNmeaCount.value = 0;
    validJsonCount.value = 0;
    validRegexCount.value = 0;
    validCsvCount.value = 0;
    tempDataString = '';
    hasFileReplayMessages.value = false;
    fileReplayBuffer = '';
    fileReplayFirstClock = null;
    fileReplayPreviousClock = null;
    fileReplayDayOffset = 0;
    fileReplayLastElapsed = 0;
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
  const sendMessage = (data: string, format: "hex" | "ascii", addNewLine: boolean = false) => {
    if (!window.ipcRenderer) {
      console.error('IPC通信不可用');
      return;
    }

    if (addNewLine) {
      console.log("换行了")
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
        // ASCII格式，如果需要添加换行符
        sendData = data;
        if (addNewLine) {
          sendData += '\r\n';
        }
      }

      const sendChannel = activeDataTransport.sendChannel(format)
      if (!sendChannel) {
        console.error('没有可用的数据连接')
        return
      }
      window.ipcRenderer.send(sendChannel, sendData)
      
      // 在控制台显示发送的消息
      const timestamp = generateTimestamp();
      const message: ConsoleMessage = {
        timestamp: timestamp + ' [' + (format==='ascii'?'STR':'HEX') + ' ➡️]',
        raw: data,
        dataType: 'none',
        isValid: false,
        key: generateKey(timestamp),
      };
      appendConsoleMessage(message);
      
      // 限制消息数量
      trimMessages(maxMessages);
    } catch (error) {
      console.error('发送消息失败:', error);
    }
  };

  const instance: ConsoleState = {
    messages,
    dataFormat,
    regexPattern,
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
    beginFileReplayMessages,
    addFileReplayData,
    endFileReplayMessages,
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
