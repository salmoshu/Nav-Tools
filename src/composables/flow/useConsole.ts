import { ref, nextTick } from "vue";
import { ElInput } from 'element-plus';

// 控制台相关状态
const consoleContent = ref<HTMLDivElement | null>(null);
const autoScroll = ref(true);
const msgCount = ref(0);
const msgNmeaCount = ref(0);
const msgJsonCount = ref(0);
const dataFormat = ref<"json" | "nmea">("json");
const rawMessages = ref<
  {
    timestamp: string;
    raw: string;
    dataType: "nmea" | "json";
    isValid: boolean;
  }[]
>([]);

// 控制台信息查询
const searchQuery = ref('');
const showSearch = ref(false);
const searchInput = ref<InstanceType<typeof ElInput> | null>(null);
const searchResults = ref<{index: number, element: HTMLElement | null}[]>([]);
const currentResultIndex = ref(-1);

export function useConsole() {
  const calculateNmeaChecksum = (sentence: string): string => {
    let checksum = 0;
    for (let i = 0; i < sentence.length; i++) {
      checksum ^= sentence.charCodeAt(i);
    }
    // 转换为2位十六进制字符串
    return checksum.toString(16).toUpperCase().padStart(2, "0");
  };

  const isValidNmea = (str: string) => {
    // 基本格式检查
    if (!str.startsWith("$")) {
      return false;
    }

    // 移除结尾的换行符以便处理
    const cleanStr = str.trimEnd();

    // 检查是否包含星号(校验和分隔符)
    const asteriskIndex = cleanStr.indexOf("*");
    if (asteriskIndex === -1 || asteriskIndex < 6) {
      // 至少需要$xxxx,格式
      return false;
    }

    // 检查校验和是否为2位十六进制字符
    const checksumPart = cleanStr.substring(asteriskIndex + 1);
    if (!/^[0-9A-Fa-f]{2}$/.test(checksumPart)) {
      return false;
    }

    // 可选：验证校验和
    const dataPart = cleanStr.substring(1, asteriskIndex); // 不包含$和校验和部分
    const calculatedChecksum = calculateNmeaChecksum(dataPart);
    return calculatedChecksum === checksumPart.toUpperCase();
  };

  const isValidJson = (str: string) => {
    if (str.endsWith("\n")) {
      str = str.slice(0, -1);
    }
    if (str.endsWith("\r")) {
      str = str.slice(0, -1);
    }
    // 目前仅考虑大括号起始的JSON格式
    if (!str.startsWith("{") || !str.endsWith("}")) {
      return false;
    }
    try {
      JSON.parse(str, (_, value) => {
        // 需要以大括号起始
        return value;
      });
      return true;
    } catch (error) {
      return false;
    }
  };

  // 清除控制台
  const clearConsole = () => {
    rawMessages.value = [];
    msgCount.value = 0;
    msgNmeaCount.value = 0;
    msgJsonCount.value = 0;
    clearSearch();
  };

  const handleRawDataBatch = (rawData: string) => {
    clearConsole();
    const baseTime = new Date();
    const baseTimestamp =
      baseTime.toLocaleTimeString() +
      "." +
      baseTime.getMilliseconds().toString().padStart(3, "0");
    const lines = rawData.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const time_reg = /^\d{2}:\d{2}:\d{2}\.\d+(?:\.\d+)?:/;
      const cleanedLine = line.replace(time_reg, '').trim();

      if (cleanedLine.trim() !== "") {
        const uniqueTimestamp = 
        baseTimestamp + 
        "." + 
        (baseTime.getMilliseconds() + i).toString().padStart(3, "0");

        // 检测是否为JSON格式
        let isValid = true;

        if (dataFormat.value === "nmea") {
          isValid = isValidNmea(cleanedLine);
          if (isValid) {
            msgNmeaCount.value++;
          }
          rawMessages.value.push({
            timestamp: uniqueTimestamp,
            raw: cleanedLine,
            dataType: "nmea",
            isValid,
          });
          msgCount.value = msgNmeaCount.value;
        } else {
          isValid = isValidJson(cleanedLine);
          if (isValid) {
            msgJsonCount.value++;
          }
          rawMessages.value.push({
            timestamp: uniqueTimestamp,
            raw: cleanedLine,
            dataType: "json",
            isValid,
          });
          msgCount.value = msgJsonCount.value;
        }
      }
    }

    // 限制消息数量
    if (rawMessages.value.length > 100000) {
      rawMessages.value.shift();
    }

    // 优化自动滚动
    if (autoScroll.value) {
      nextTick(() => {
        if (consoleContent.value) {
          consoleContent.value.scrollTop = consoleContent.value.scrollHeight;
        }
      });
    }
  };

  const clearSearch = () => {
    searchQuery.value = '';
    searchResults.value = [];
    currentResultIndex.value = -1;
    
    // 强制重新渲染以清除所有高亮样式
    nextTick(() => {
      const allMessageElements = document.querySelectorAll('.message-line');
      allMessageElements.forEach(element => {
        element.classList.remove('current-search-result');
      });
    });
  };

  // 搜索功能实现
  const toggleSearch = () => {
    showSearch.value = !showSearch.value;
    if (showSearch.value) {
      nextTick(() => {
        if (searchInput.value) {
          searchInput.value.focus();
        }
      });
    } else {
      clearSearch();
    }
  };

  const isMatch = (text: string, query: string): boolean => {
    return text.toLowerCase().includes(query.toLowerCase());
  };

  const scrollToResult = (index: number) => {
    if (searchResults.value[index]?.element) {
      searchResults.value[index].element.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
      
      // 高亮当前结果
      searchResults.value.forEach((result, i) => {
        if (result.element) {
          if (i === index) {
            result.element.classList.add('current-search-result');
          } else {
            result.element.classList.remove('current-search-result');
          }
        }
      });
    }
  };

  const performSearch = () => {
    if (!searchQuery.value) {
      clearSearch();
      return;
    }
    
    searchResults.value = [];
    currentResultIndex.value = -1;
    
    nextTick(() => {
      const messageElements = document.querySelectorAll('.message-line');
      messageElements.forEach((element, index) => {
        const rawText = rawMessages.value[index]?.raw || '';
        if (isMatch(rawText, searchQuery.value)) {
          searchResults.value.push({ index, element: element as HTMLElement });
        }
      });
      
      if (searchResults.value.length > 0) {
        currentResultIndex.value = 0;
        scrollToResult(0);
      }
    });
  };

  return {
    consoleContent,
    autoScroll,
    msgCount,
    msgNmeaCount,
    msgJsonCount,
    dataFormat,
    rawMessages,
    searchQuery,
    showSearch,
    searchInput,
    searchResults,
    currentResultIndex,
    isValidNmea,
    isValidJson,
    clearConsole,
    handleRawDataBatch,
    toggleSearch,
    clearSearch,
    performSearch,
    scrollToResult,
    isMatch,
  };
}
