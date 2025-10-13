import { ref, nextTick } from "vue";
import { ElInput } from 'element-plus';

const MAX_RAW_MESSAGES = 72000; // 2h 10Hz 数据
const DISPLAY_COUNT = 100; // 显示的消息数量
const CONTEXT_COUNT = 50; // 上下文消息数量

// 窗口状态
const consoleContent = ref<HTMLDivElement | null>(null);
const autoScroll = ref(true);
const dataFormat = ref<"json" | "nmea">("json");

// 数据状态
const msgCount = ref(0);
const msgNmeaCount = ref(0);
const msgJsonCount = ref(0);
const rawMessages = ref<
  {
    timestamp: string;
    raw: string;
    dataType: "nmea" | "json";
    isValid: boolean;
  }[]
>([]);
const visibleMessages = ref<typeof rawMessages.value>([]);

// 滚动状态
const currentViewStartIndex = ref(0);
const isSearchMode = ref(false);
const lastScrollTop = ref(0);
const isAtBottom = ref(true);
const isAtTop = ref(false);
const lastAutoScrollIndex = ref(0); // 记录自动滚动时的最后索引

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
    visibleMessages.value = [];
    msgCount.value = 0;
    msgNmeaCount.value = 0;
    msgJsonCount.value = 0;
    currentViewStartIndex.value = 0;
    isAtBottom.value = true;
    isAtTop.value = true;
    lastAutoScrollIndex.value = 0;
    totalString = '';
    clearSearch();
  };

  // 更新可见消息
  const updateVisibleMessages = (startIndex?: number, contextMode: 'top' | 'bottom' | 'normal' | 'search' = 'normal') => {
    if (isSearchMode.value && searchResults.value.length > 0) {
      // 查找模式：显示当前结果前后各50条
      const resultIndex = searchResults.value[currentResultIndex.value]?.index || 0;
      const start = Math.max(0, resultIndex - CONTEXT_COUNT);
      const end = Math.min(rawMessages.value.length, resultIndex + CONTEXT_COUNT + 1);
      visibleMessages.value = rawMessages.value.slice(start, end);
      currentViewStartIndex.value = start;
      
      // 更新滚动位置状态
      isAtTop.value = start === 0;
      isAtBottom.value = end === rawMessages.value.length;
    } else {
      // 普通模式
      let start: number;
      let end: number;
      
      if (contextMode === 'top' && !isAtTop.value) {
        // 显示置顶数据的前后各50条数据
        const center = currentViewStartIndex.value;
        const upOffset = 5;
        start = Math.max(0, center - upOffset);
        end = Math.min(rawMessages.value.length, center + (DISPLAY_COUNT-upOffset) + 1);
      } else if (contextMode === 'bottom' && !isAtBottom.value) {
        // 显示置底数据的前后各50条数据
        const center = currentViewStartIndex.value + DISPLAY_COUNT - 1;
        const upOffset = 5;
        start = Math.max(0, center - (DISPLAY_COUNT-upOffset));
        end = Math.min(rawMessages.value.length, center + upOffset + 1);
      } else {
        // 标准显示模式
        start = startIndex !== undefined ? startIndex : currentViewStartIndex.value;
        end = Math.min(start + DISPLAY_COUNT, rawMessages.value.length);
      }
      
      visibleMessages.value = rawMessages.value.slice(start, end);
      currentViewStartIndex.value = start;
      
      // 更新滚动位置状态
      isAtTop.value = start === 0;
      isAtBottom.value = end === rawMessages.value.length;
    }
  };

  // 处理接收到的Flow数据
  let totalString = '';
  const handleRawData = (rawData: string) => {
    totalString += rawData;

    if (totalString.includes('\n')) {
      const now = new Date();
      const timestamp = now.toLocaleTimeString() + '.' + now.getMilliseconds().toString().padStart(3, '0');
      const lines = totalString.split('\n');
      
      // 保留最后一行，因为它可能是不完整的
      totalString = lines[lines.length - 1];

      // 处理所有完整的行（除了最后一行）
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        if (line.trim() !== '') {
          // 检测是否为JSON格式
          let isValid = true;

          if (dataFormat.value === 'nmea') {
            isValid = isValidNmea(line);
            if (isValid) {
              msgNmeaCount.value++;
            }
            rawMessages.value.push({
              timestamp,
              raw: line,
              dataType: 'nmea',
              isValid
            });
            msgCount.value = msgNmeaCount.value;
          } else {
            isValid = isValidJson(line);
            if (isValid) {
              msgJsonCount.value++;
            }
            rawMessages.value.push({
              timestamp,
              raw: line,
              dataType: 'json',
              isValid
            });
            msgCount.value = msgJsonCount.value;
          }
        }
      }

      if (rawMessages.value.length > MAX_RAW_MESSAGES) {
        const removedCount = rawMessages.value.length - MAX_RAW_MESSAGES;
        rawMessages.value.shift();
        
        // 更新相关计数
        if (dataFormat.value === 'nmea') {
          msgNmeaCount.value = Math.max(0, msgNmeaCount.value - removedCount);
          msgCount.value = msgNmeaCount.value;
        } else {
          msgJsonCount.value = Math.max(0, msgJsonCount.value - removedCount);
          msgCount.value = msgJsonCount.value;
        }
        
        // 调整当前视图起始索引
        if (currentViewStartIndex.value > 0) {
          currentViewStartIndex.value = Math.max(0, currentViewStartIndex.value - removedCount);
        }
      }

      // 根据自动滚动状态更新可见消息
      if (autoScroll.value) {
        // 自动滚动：显示最新的100条
        const start = Math.max(0, rawMessages.value.length - DISPLAY_COUNT);
        updateVisibleMessages(start);
        lastAutoScrollIndex.value = start;
        
        nextTick(() => {
          if (consoleContent.value) {
            consoleContent.value.scrollTop = consoleContent.value.scrollHeight;
            lastScrollTop.value = consoleContent.value.scrollTop;
          }
        });
      } else if (isAtBottom.value) {
        // 非自动滚动但在底部：更新可见消息
        updateVisibleMessages(Math.max(0, rawMessages.value.length - DISPLAY_COUNT));
      }
    }
  };

  // 处理批量数据
  const handleRawDataBatch = (rawData: string) => {
    clearConsole();
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
    if (rawMessages.value.length > MAX_RAW_MESSAGES*2) {
      const removedCount = rawMessages.value.length - MAX_RAW_MESSAGES*2;
      rawMessages.value.splice(0, removedCount);
      
      // 更新相关计数
      if (dataFormat.value === 'nmea') {
        msgNmeaCount.value = Math.max(0, msgNmeaCount.value - removedCount);
        msgCount.value = msgNmeaCount.value;
      } else {
        msgJsonCount.value = Math.max(0, msgJsonCount.value - removedCount);
        msgCount.value = msgJsonCount.value;
      }
    }
  
    // 更新可见消息 - 批量加载时默认显示最新的100条
    const start = Math.max(0, rawMessages.value.length - DISPLAY_COUNT);
    
    // 直接设置当前视图起始索引，确保显示最新数据
    currentViewStartIndex.value = start;
    isAtBottom.value = true;
    isAtTop.value = start === 0;
    visibleMessages.value = rawMessages.value.slice(start, Math.min(start + DISPLAY_COUNT, rawMessages.value.length));
    
    // 优化自动滚动
    if (autoScroll.value) {
      nextTick(() => {
        if (consoleContent.value) {
          consoleContent.value.scrollTop = consoleContent.value.scrollHeight;
          lastScrollTop.value = consoleContent.value.scrollTop;
        }
      });
    }
  };

  // 处理滚动事件
  const handleScroll = () => {
    if (!consoleContent.value) return;

    const { scrollTop, scrollHeight, clientHeight } = consoleContent.value;
    
    // 检测是否滚动到底部
    const isBottom = scrollTop + clientHeight >= scrollHeight - 10; // 容差10px
    // 检测是否滚动到顶部
    const isTop = scrollTop <= 10; // 容差10px
    
    // 在搜索模式下，只允许置顶、置底刷新数据，并且不影响搜索状态
    if (isSearchMode.value) {
      if (isBottom && !isAtBottom.value) {
        // 滚动到底部：显示置底数据的前后各50条数据
        updateVisibleMessages(undefined, 'bottom');
        
        // 调整滚动位置以保持视觉连续性
        nextTick(() => {
          if (consoleContent.value) {
            // 保持在底部附近
            const newScrollTop = Math.max(0, consoleContent.value.scrollHeight - clientHeight - 50);
            consoleContent.value.scrollTop = newScrollTop;
            lastScrollTop.value = newScrollTop;
          }
        });
      } else if (isTop && !isAtTop.value) {
        // 滚动到顶部：显示置顶数据的前后各50条数据
        updateVisibleMessages(undefined, 'top');
        
        // 调整滚动位置以保持视觉连续性
        nextTick(() => {
          if (consoleContent.value) {
            // 保持在顶部附近
            consoleContent.value.scrollTop = 50;
            lastScrollTop.value = 50;
          }
        });
      }
      
      lastScrollTop.value = scrollTop;
      return;
    }
    
    if (autoScroll.value) {
      // 如果用户手动滚动了，禁用自动滚动
      if (Math.abs(scrollTop - lastScrollTop.value) > 10 && !isBottom) {
        autoScroll.value = false;
      }
    } else {
      // 判断滚动方向
      const scrollDirection = scrollTop > lastScrollTop.value ? 'down' : 'up';
      
      if (isBottom && !isAtBottom.value) {
        // 滚动到底部：显示置底数据的前后各50条数据
        updateVisibleMessages(undefined, 'bottom');
        
        // 调整滚动位置以保持视觉连续性
        nextTick(() => {
          if (consoleContent.value) {
            // 保持在底部附近
            const newScrollTop = Math.max(0, consoleContent.value.scrollHeight - clientHeight - 50);
            consoleContent.value.scrollTop = newScrollTop;
            lastScrollTop.value = newScrollTop;
          }
        });
      } else if (isTop && !isAtTop.value) {
        // 滚动到顶部：显示置顶数据的前后各50条数据
        updateVisibleMessages(undefined, 'top');
        
        // 调整滚动位置以保持视觉连续性
        nextTick(() => {
          if (consoleContent.value) {
            // 保持在顶部附近
            consoleContent.value.scrollTop = 50;
            lastScrollTop.value = 50;
          }
        });
      } else if (Math.abs(scrollTop - lastScrollTop.value) > 50) {
        // 滚动超过阈值，更新显示区域
        const scrollAmount = Math.floor(Math.abs(scrollTop - lastScrollTop.value) / 20); // 每20px滚动调整一次
        
        let newStartIndex = currentViewStartIndex.value;
        if (scrollDirection === 'down' && !isAtBottom.value) {
          newStartIndex = Math.min(currentViewStartIndex.value + scrollAmount, rawMessages.value.length - DISPLAY_COUNT);
        } else if (scrollDirection === 'up' && !isAtTop.value) {
          newStartIndex = Math.max(currentViewStartIndex.value - scrollAmount, 0);
        }
        
        if (newStartIndex !== currentViewStartIndex.value) {
          updateVisibleMessages(newStartIndex);
          
          // 调整滚动位置以保持视觉连续性
          nextTick(() => {
            if (consoleContent.value) {
              consoleContent.value.scrollTop = scrollTop;
              lastScrollTop.value = scrollTop;
            }
          });
        }
      }
    }
    
    lastScrollTop.value = scrollTop;
  };

  // 初始化滚动监听
  const initScrollListener = () => {
    if (consoleContent.value) {
      consoleContent.value.addEventListener('scroll', handleScroll);
    }
  };

  // 移除滚动监听
  const removeScrollListener = () => {
    if (consoleContent.value) {
      consoleContent.value.removeEventListener('scroll', handleScroll);
    }
  };

  const clearSearch = () => {
    searchQuery.value = '';
    searchResults.value = [];
    currentResultIndex.value = -1;
    isSearchMode.value = false;
    
    // 恢复正常显示模式
    updateVisibleMessages();
    
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
    isSearchMode.value = true;
    currentResultIndex.value = index;
    
    // 更新显示的消息为当前结果前后各50条
    updateVisibleMessages();
    
    nextTick(() => {
      const messageElements = document.querySelectorAll('.message-line');
      const resultIndex = searchResults.value[index]?.index || 0;
      const relativeIndex = resultIndex - currentViewStartIndex.value;
      
      if (messageElements[relativeIndex]) {
        messageElements[relativeIndex].scrollIntoView({
          behavior: 'auto',
          block: 'center',
          inline: 'nearest'
        });
        
        // 高亮当前结果
        messageElements.forEach((element, i) => {
          if (i === relativeIndex) {
            element.classList.add('current-search-result');
          } else {
            element.classList.remove('current-search-result');
          }
        });
      }
    });
  };

  const performSearch = () => {
    if (!searchQuery.value) {
      clearSearch();
      return;
    }
    
    searchResults.value = [];
    currentResultIndex.value = -1;
    
    // 查找所有匹配项
    rawMessages.value.forEach((message, index) => {
      if (isMatch(message.raw, searchQuery.value)) {
        searchResults.value.push({ index, element: null });
      }
    });
    
    if (searchResults.value.length > 0) {
      currentResultIndex.value = 0;
      scrollToResult(0);
    }
  };

  // 切换自动滚动
  const toggleAutoScrollLocal = () => {
    autoScroll.value = !autoScroll.value;
    if (autoScroll.value) {
      isSearchMode.value = false;
      // 滚动到底部并更新显示
      const start = Math.max(0, rawMessages.value.length - DISPLAY_COUNT);
      updateVisibleMessages(start);
      nextTick(() => {
        if (consoleContent.value) {
          consoleContent.value.scrollTop = consoleContent.value.scrollHeight;
          lastScrollTop.value = consoleContent.value.scrollTop;
        }
      });
    }
  };

  return {
    consoleContent,
    autoScroll,
    msgCount,
    msgNmeaCount,
    msgJsonCount,
    dataFormat,
    rawMessages,
    visibleMessages, // 返回可见消息而不是原始消息
    searchQuery,
    showSearch,
    searchInput,
    searchResults,
    currentResultIndex,
    isValidNmea,
    isValidJson,
    clearConsole,
    handleRawData,
    handleRawDataBatch,
    toggleSearch,
    clearSearch,
    performSearch,
    scrollToResult,
    isMatch,
    initScrollListener,
    removeScrollListener,
    toggleAutoScrollLocal,
    updateVisibleMessages
  };
}
