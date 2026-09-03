<template>
  <div class="flow-console-virtual" ref="consoleRoot" tabindex="0">
    <!-- 头部控制栏 -->
    <div class="console-header">
      <div class="console-controls">
        <!-- 左侧按钮组 -->
        <div class="left-controls">
          <div class="data-parser-badge" :title="t('common.rawMessages.parserBadgeTitle')" @click="openParserConfig">
            <el-icon><DataAnalysis /></el-icon>
            <strong>{{ parserLabel(activeDataParser) }}</strong>
          </div>
          
          <el-button @click="toggleFilter" :type="dataFilter ? 'success' : 'default'" size="small" :title="dataFilter ? t('common.rawMessages.filterOff') : t('common.rawMessages.filterOn')" :disabled="dataFormat === 'none'">
            <el-icon><Filter /></el-icon>
            &nbsp;{{ t('common.rawMessages.filter') }}
          </el-button>
          <el-button @click="toggleTimestamp" :type="dataTimestamp ? 'success' : 'default'" size="small" :title="dataTimestamp ? t('common.rawMessages.timestampOff') : t('common.rawMessages.timestampOn')">
            <el-icon><Clock /></el-icon>
            &nbsp;{{ t('common.rawMessages.time') }}
          </el-button>
          <el-button
            @click="handleAutoScroll"
            :type="dataAutoScroll ? 'success' : 'default'"
            size="small"
            :title="dataAutoScroll ? t('common.rawMessages.scrollManual') : t('common.rawMessages.scrollAuto')"
          >
            <el-icon><Bottom /></el-icon>
            &nbsp;{{ t('common.rawMessages.scrollToBottom') }}
          </el-button>

          <el-button @click="toggleDisplayFormat" :type="displayFormat === 'hex' ? 'success' : 'default'" size="small" :title="displayFormat==='hex' ? t('common.rawMessages.hexDisplay') : t('common.rawMessages.asciiDisplay')">
            <el-icon><Coin /></el-icon>
            &nbsp;{{ t('common.rawMessages.hexDisplay') }}
          </el-button>
        </div>
        
        <!-- 右侧按钮组 -->
        <div class="right-controls">
          <el-button @click="toggleSearch" size="small" :type="showSearchBox ? 'primary' : 'text'" :title="showSearchBox ? t('common.rawMessages.searchClose') : t('common.rawMessages.searchOpen')">
            <el-icon><Search /></el-icon>
          </el-button>
          <el-button @click="saveConsoleData" type="text" size="small" :disabled="totalCount === 0" style="margin: 0px 0px;" :title="t('common.rawMessages.saveFile')">
            <el-icon><Document /></el-icon>
          </el-button>
          <el-button @click="clearConsole" type="text" size="small" style="margin: 0px 0px;" :title="t('common.rawMessages.clearConsole')">
            <el-icon><Delete /></el-icon>
          </el-button>
          <el-button @click="togglePause" size="small" style="margin: 0px 0px;" :type="isPaused ? 'text' : 'success'" :title="isPaused ? t('common.rawMessages.resumeReceive') : t('common.rawMessages.pauseReceive')">
            <el-icon v-if="!isPaused"><VideoPause /></el-icon>
            <el-icon v-else><VideoPlay /></el-icon>
          </el-button>
        </div>
      </div>
    </div>

    <!-- 搜索框 -->
    <div v-if="showSearchBox" class="search-bar">
      <div class="search-container">
        <el-input
          ref="searchInput"
          v-model="searchQuery"
          size="small"
          :placeholder="t('common.rawMessages.searchPlaceholder')"
          style="width: 200px; margin-right: 5px;"
          @input="performSearch"
          @keyup.enter="findNext"
        >
          <template #suffix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button @click="findPrev" type="text" size="small" style="color: var(--app-text-secondary); margin-right: -10px;">
          <el-icon><ArrowUp /></el-icon>
        </el-button>
        <el-button @click="findNext" type="text" size="small" style="color: var(--app-text-secondary); margin-right: 5px;">
          <el-icon><ArrowDown /></el-icon>
        </el-button>
        <span class="search-info-text" v-if="searchQuery && !isSearching">
          {{ t('common.rawMessages.searchResults', { count: searchResults.length, index: currentResultIndex + 1 }) }}
        </span>
        <el-button @click="clearSearch" type="text" size="small" style="color: #909399; margin-left: 10px;">{{ t('common.rawMessages.clear') }}</el-button>
      </div>
    </div>

    <!-- 虚拟滚动消息列表 -->
    <div class="console-content-virtual" ref="consoleContent" @mousedown="sortMessageRows">
      <RecycleScroller
        ref="scrollerRef"
        class="scroller"
        :items="filteredMessages"
        :item-size="25"
        key-field="key"
        v-slot="{ item, index }"
      >
        <div
          class="message-line"
          :class="getMessageClasses(item, index)"
          :title="item.raw"
        >
          <span v-if="dataTimestamp" class="timestamp">{{ item.timestamp }}: </span>
          <span
            :class="[
              (item.isValid && item.dataType === dataFormat) ? 'valid-message' : 'invalid-message',
              'message-content'
            ]"
            v-html="highlightSearch(item.raw, searchQuery)"
          >
          </span>
        </div>
      </RecycleScroller>
    </div>

    <!-- 消息输入框 -->
    <div class="console-input-bar">
      <div class="input-container">
        <div class="message-entry">
          <el-select
            v-model="inputFormat"
            class="format-select"
            size="default"
            :placeholder="t('common.rawMessages.format')"
            :aria-label="t('common.rawMessages.format')"
            :teleported="false"
          >
            <el-option label="ASCII" value="ascii"></el-option>
            <el-option label="HEX" value="hex"></el-option>
          </el-select>

          <el-input
            v-model="inputMessage"
            class="message-input"
            size="default"
            :placeholder="inputFormat === 'hex' ? t('common.rawMessages.inputHexPlaceholder') : t('common.rawMessages.inputAsciiPlaceholder')"
            :aria-label="inputFormat === 'hex' ? t('common.rawMessages.inputHexPlaceholder') : t('common.rawMessages.inputAsciiPlaceholder')"
            :disabled="!deviceConnected"
            @keyup.enter="handleSendMessage"
          >
            <template #suffix>
              <el-icon><Edit /></el-icon>
            </template>
          </el-input>
        </div>

        <div class="composer-actions">
          <div class="message-actions">
            <el-button
              :type="addNewLine ? 'success' : 'default'"
              size="default"
              :disabled="inputFormat === 'hex' || !deviceConnected"
              :title="addNewLine ? t('common.rawMessages.newlineOn') : t('common.rawMessages.newlineOff')"
              :aria-pressed="addNewLine"
              @click="addNewLine = !addNewLine"
            >
              <svg
                class="newline-icon"
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M9 10l-5 5 5 5" />
                <path d="M20 4v7a4 4 0 0 1-4 4H4" />
              </svg>
              <span>{{ t('common.rawMessages.newline') }}</span>
            </el-button>

            <el-button
              type="primary"
              size="default"
              :disabled="!deviceConnected || !inputMessage.trim()"
              :title="t('common.rawMessages.sendMessage')"
              @click="handleSendMessage"
            >
              <el-icon><Position /></el-icon>
              <span>{{ t('common.rawMessages.send') }}</span>
            </el-button>
          </div>

          <div class="iap-actions">
            <el-button
              type="warning"
              size="default"
              :title="t('common.rawMessages.iapUpgrade')"
              @click="iapDialogVisible = true"
            >
              <el-icon><UploadFilled /></el-icon>
              <span>{{ t('common.rawMessages.iap') }}</span>
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部状态栏 -->
    <div class="console-footer">
      <span>{{ t('common.rawMessages.totalMessages', { count: totalCount }) }}</span>
      <span>&nbsp;|&nbsp;{{ t('common.rawMessages.validCount', { count: validMsgCount }) }}</span>
      <span v-if="messageRate > 0">&nbsp;|&nbsp;{{ messageRate }} {{ t('common.rawMessages.perSecond') }}</span>
      <span v-if="isPaused">&nbsp;|&nbsp;{{ t('common.rawMessages.paused') }}</span>
    </div>
    <IapUpgradeDialog v-model="iapDialogVisible" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { 
  Filter, 
  Clock, 
  Bottom, 
  Search, 
  Delete,
  VideoPause,
  VideoPlay,
  ArrowUp,
  ArrowDown,
  Edit,
  Position,
  Document,
  Coin,
  DataAnalysis,
  UploadFilled,
} from '@element-plus/icons-vue'
import { findTimelineMessageIndex, useConsole } from '@/composables/flow/useConsole'
import { useFileTimeline } from '@/composables/useFileTimeline'
import { useDevice } from '@/hooks/useDevice'
import emitter from '@/hooks/useMitt'
import { RecycleScroller } from 'vue-virtual-scroller'
import { parserLabel } from '@/composables/useDataSourceManager'
import { t } from '@/i18n'
import IapUpgradeDialog from './IapUpgradeDialog.vue'

// DOM引用
const consoleRoot = ref<HTMLDivElement | null>(null)
const consoleContent = ref<HTMLDivElement | null>(null)
const searchInput = ref<InstanceType<typeof HTMLInputElement> | null>(null)
const scrollerRef = ref<InstanceType<typeof RecycleScroller> | null>(null)

// 搜索状态
const showSearchBox = ref(false)
const currentResultIndex = ref(-1)
const searchResults = ref<any[]>([])
const isSearching = ref(false)

// 使用虚拟滚动控制台组合式函数（使用全局实例）
const {
  validMsgCount,
  dataFormat,
  displayFormat,
  dataFilter,
  dataTimestamp,
  dataAutoScroll,
  isPaused,
  filteredMessages,
  totalCount,
  searchQuery,
  clearMessages,
  toggleFilter,
  toggleDisplayFormat,
  toggleTimestamp,
  toggleAutoScroll,
  togglePause,
  saveToFile,
  sendMessage,
} = useConsole(true) // 使用全局实例

// 获取设备连接状态
const { deviceConnected, activeDataParser } = useDevice()
const fileTimeline = useFileTimeline()

// 点击解析徽标：打开数据接入弹框并短暂高亮数据格式配置
// 注意：useDevice 状态非单例，必须经 emitter 由 ToolBar 自己的实例打开弹框
const openParserConfig = () => {
  emitter.emit('input-event')
  emitter.emit('highlight-parser-format')
}

const iapDialogVisible = ref(false)

// 输入框状态
const inputMessage = ref('')
const inputFormat = ref<'hex' | 'ascii'>('ascii')
const addNewLine = ref(false)

// 性能监控
const messageRate = ref(0)
const lastMessageCount = ref(0)
const lastRateCheck = ref(Date.now())

// 搜索相关方法
const performSearch = () => {
  if (!searchQuery.value.trim()) {
    searchResults.value = []
    currentResultIndex.value = -1
    return
  }
  
  isSearching.value = true
  
  // 执行搜索（忽略空格）
  const searchText = searchQuery.value.toLowerCase().replace(/\s+/g, '')
  const results = filteredMessages.value.filter(msg => {
    const rawText = msg.raw.toLowerCase().replace(/\s+/g, '')
    const timestampText = msg.timestamp.toLowerCase().replace(/\s+/g, '')
    return rawText.includes(searchText) || timestampText.includes(searchText)
  })
  
  searchResults.value = results
  currentResultIndex.value = results.length > 0 ? 0 : -1
  
  isSearching.value = false
  
  // 如果有搜索结果，自动滚动到第一条并居中显示
  if (results.length > 0 && currentResultIndex.value >= 0) {
    nextTick(() => {
      scrollToSearchResult()
      // 搜索完成后聚焦到搜索框，方便继续操作
      searchInput.value?.focus()
    })
  }
}

// 搜索导航
const findNext = () => {
  if (searchResults.value.length === 0) return
  
  currentResultIndex.value = (currentResultIndex.value + 1) % searchResults.value.length
  scrollToSearchResult()
}

const findPrev = () => {
  if (searchResults.value.length === 0) return
  
  currentResultIndex.value = currentResultIndex.value === 0 
    ? searchResults.value.length - 1 
    : currentResultIndex.value - 1
  scrollToSearchResult()
}

const scrollToSearchResult = () => {
  if (currentResultIndex.value < 0 || !searchResults.value[currentResultIndex.value]) return
  
  const targetMessage = searchResults.value[currentResultIndex.value]
  const targetIndex = filteredMessages.value.findIndex(msg => msg.key === targetMessage.key)
  
  if (targetIndex !== -1) {
    nextTick(() => {
      scrollToIndexWithCenter(targetIndex)
    })
  }
}

const scrollToIndexWithCenter = (index: number) => {
  if (!scrollerRef.value) return
  
  try {
    const scroller = scrollerRef.value
    if (typeof scroller.scrollToItem === 'function') {
      // 尝试使用center选项，如果支持的话
      scroller.scrollToItem(index)
    }
  } catch (error) {
    console.warn('[搜索] 滚动失败:', error)
  }
}

// 清除搜索
const clearSearch = () => {
  searchQuery.value = ''
  searchResults.value = []
  currentResultIndex.value = -1
}

// RecycleScroller 复用 DOM 节点,行的 DOM 顺序与视觉顺序经常不一致——库自己只在滚动
// 停止约 300ms 后才重排(sortViews)。若用户在重排前拖选,浏览器按 DOM 顺序序列化选区,
// 会把夹在中间的十几行无关消息一起复制走。拖选开始前主动重排一次,让 DOM 顺序对齐视觉
// 顺序,原生复制即为所见即所选。
const sortMessageRows = (event: MouseEvent) => {
  if (event.button !== 0) return
  const scroller = scrollerRef.value
  if (scroller && typeof scroller.sortViews === 'function') scroller.sortViews()
}

// UI 控制方法
const toggleSearch = () => {
  showSearchBox.value = !showSearchBox.value
  if (showSearchBox.value) {
    nextTick(() => {
      searchInput.value?.focus()
    })
  } else {
    clearSearch()
  }
}

const clearConsole = () => {
  clearMessages()
}

const saveConsoleData = () => {
  saveToFile()
}

const getMessageClasses = (item: any, index?: number) => {
  const classes: any = {
    'valid-message': item.isValid,
    'invalid-message': !item.isValid,
    'search-match': searchQuery.value && item.raw.toLowerCase().includes(searchQuery.value.toLowerCase())
  }
  
  // 添加数据类型类
  if (item.dataType === 'json') {
    classes['json'] = true
  } else if (item.dataType === 'nmea') {
    classes['nmea'] = true
  }
  
  // 如果是当前搜索结果，添加高亮类
  if (index !== undefined && searchResults.value[currentResultIndex.value]?.key === item.key) {
    classes['current-search-result'] = true
  }
  
  return classes
}

const highlightSearch = (text: string, query: string) => {
  if (!query) return text
  
  // 移除查询中的空格用于匹配
  const searchText = query.replace(/\s+/g, '')
  if (!searchText) return text
  
  // 在原始文本中查找匹配的字符序列，忽略中间的空格
  let lastIndex = 0
  let highlightedText = ''
  
  // 逐个字符匹配，忽略空格
  for (let i = 0; i < text.length; i++) {
    let matchCount = 0
    let textIndex = i
    let searchIndex = 0
    
    // 尝试匹配搜索文本
    while (textIndex < text.length && searchIndex < searchText.length) {
      if (text[textIndex] === ' ' || text[textIndex] === '\t') {
        textIndex++
        continue
      }
      if (text[textIndex].toLowerCase() === searchText[searchIndex].toLowerCase()) {
        matchCount++
        searchIndex++
      } else {
        break
      }
      textIndex++
    }
    
    // 如果完全匹配，高亮这部分内容
    if (matchCount === searchText.length) {
      const matchEnd = textIndex
      highlightedText += text.slice(lastIndex, i)
      highlightedText += `<mark>${text.slice(i, matchEnd)}</mark>`
      lastIndex = matchEnd
      i = matchEnd - 1
    }
  }
  
  // 添加剩余文本
  highlightedText += text.slice(lastIndex)
  
  return highlightedText || text
}

// 监控消息速率
watch(totalCount, (newCount) => {
  const now = Date.now()
  const timeDiff = now - lastRateCheck.value
  
  if (timeDiff >= 1000) { // 每秒更新一次
    messageRate.value = Math.round((newCount - lastMessageCount.value) * 1000 / timeDiff)
    lastMessageCount.value = newCount
    lastRateCheck.value = now
  }
})

// 键盘事件处理
const handleKeydown = (event: KeyboardEvent) => {
  // ESC键关闭搜索框
  if (event.key === 'Escape' && showSearchBox.value) {
    toggleSearch()
  }
  
  // Ctrl+F 打开搜索
  if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
    event.preventDefault()
    toggleSearch()
  }
  
  // 搜索模式下的导航快捷键
  if (showSearchBox.value) {
    switch (event.key) {
      case 'Enter':
        // 不处理Enter键，防止触发默认行为
        break
      case 'ArrowUp':
        event.preventDefault()
        findPrev()
        break
      case 'ArrowDown':
        event.preventDefault()
        findNext()
        break
    }
  }
}

const handleAutoScroll = () => {
  if (!dataAutoScroll.value) {
    handleScrollToBottom();
  }
  toggleAutoScroll();
}

// 发送消息
const handleSendMessage = () => {
  if (!inputMessage.value.trim() || !deviceConnected.value) {
    return
  }
  
  try {
    // 传递是否添加换行的标志
    sendMessage(inputMessage.value.trim(), inputFormat.value, addNewLine.value)
  } catch (error) {
    console.error('发送消息失败:', error)
  }
}

// 滚动到底部函数 - rAF 节流版本，避免高频消息下的强制布局风暴
let scrollScheduled = false;
const handleScrollToBottom = () => {
  if (scrollScheduled) return;
  if (!scrollerRef.value || filteredMessages.value.length === 0) return;
  scrollScheduled = true;
  requestAnimationFrame(() => {
    scrollScheduled = false;
    if (!scrollerRef.value) return;
    scrollerRef.value.scrollToItem(filteredMessages.value.length - 1);
  });
};

const scrollToTimelineMessage = () => {
  if (!scrollerRef.value || filteredMessages.value.length === 0) return;

  const targetIndex = findTimelineMessageIndex(
    filteredMessages.value,
    fileTimeline.elapsedMilliseconds.value,
  );
  scrollerRef.value.scrollToItem(targetIndex);
};

// 监听搜索查询变化
watch(searchQuery, () => {
  performSearch()
})

// 监听消息变化，如果处于置底状态则保持置底
watch(() => filteredMessages.value.length, () => {
  if (dataAutoScroll.value && !isPaused.value) {
    nextTick(() => {
      handleScrollToBottom()
    })
  }
})

watch(
  () => [
    fileTimeline.elapsedMilliseconds.value,
    fileTimeline.dragging.value,
    fileTimeline.active.value,
  ] as const,
  () => {
    if (!fileTimeline.active.value || fileTimeline.indexing.value) return;
    if (!dataAutoScroll.value && !fileTimeline.dragging.value) return;
    nextTick(() => {
      scrollToTimelineMessage()
    })
  },
)

// 生命周期钩子
onMounted(() => {
  if (!fileTimeline.active.value && !fileTimeline.indexing.value) {
    clearConsole();
  }
  
  if (dataAutoScroll.value) {
    nextTick(() => {
      handleScrollToBottom()
    })
  }

  dataFormat.value = activeDataParser.value === 'raw' ? 'none' : activeDataParser.value;
  
  // 添加滚动事件监听
  nextTick(() => {
    if (consoleRoot.value) {
      consoleRoot.value.addEventListener('keydown', handleKeydown);
    }
  })
})

onUnmounted(() => {
  if (consoleRoot.value) {
    consoleRoot.value.removeEventListener('keydown', handleKeydown);
  }
})

</script>

<style scoped>
/* 浅色主题样式，与FlowConsole保持一致 */
.flow-console-virtual {
  display: flex;
  flex-direction: column;
  height: 800px;
  max-height: 100%;
  border: 1px solid var(--app-border);
  overflow: hidden;
  background-color: var(--app-surface);
  color: var(--app-text);
  box-sizing: border-box;
  position: relative;
  z-index: 1;
  outline: none;
}

.flow-console-virtual:focus {
  outline: none;
}

/* 头部控制栏样式 - 浅色主题 */
.console-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background-color: var(--app-surface-muted);
  border-bottom: 1px solid var(--app-border);
  height: 50px;
  box-sizing: border-box;
}

.console-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.left-controls, .right-controls {
  display: flex;
  align-items: center;
}

/* 解析方式由 Input 数据源统一配置。 */
.data-parser-badge {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 5px;
  margin-right: 10px;
  padding: 5px 8px;
  border: 1px solid var(--app-border);
  border-radius: 5px;
  cursor: pointer;
  color: var(--app-text-muted);
  background: var(--app-surface);
  font-size: 11px;
  white-space: nowrap;
}

.data-parser-badge:hover {
  background: var(--app-hover);
  border-color: var(--el-color-primary);
}

.data-parser-badge strong {
  color: var(--el-color-primary);
  font-size: 12px;
  font-weight: 600;
}

/* 搜索框样式 - 浅色主题 */
.search-bar {
  background-color: color-mix(in srgb, var(--el-color-primary) 10%, var(--app-surface));
  border-bottom: 1px solid color-mix(in srgb, var(--el-color-primary) 30%, var(--app-border));
  padding: 8px 12px;
  backdrop-filter: blur(2px);
}

.search-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-info-text {
  color: #096dd9;
  font-size: 12px;
  margin-left: 8px;
}

/* 控制台内容区域 - 浅色主题 */
.console-content-virtual {
  flex: 1;
  overflow: hidden;
  background-color: var(--app-surface);
  position: relative;
}

.scroller {
  height: 100%;
  background: var(--app-surface);
  color: var(--app-text);
  font-family: 'Consolas', 'Monaco', 'Menlo', monospace;
  font-size: 14px;
  line-height: 1.5;
  padding: 12px;
  box-sizing: border-box;
}

.message-line {
  display: flex;
  height: 25px;
  box-sizing: border-box;
  padding: 2px 12px;
  border-bottom: 1px solid var(--app-border);
  min-height: 25px;
  align-items: center;
  margin-bottom: 0;
  padding-left: 12px;
  border-left: 2px solid transparent;
  white-space: nowrap;
  overflow: hidden;
  text-align: left;
  border-radius: 0;
  transition: background-color 0.1s ease;
}

.message-line:hover {
  background-color: var(--app-hover);
}

.message-line.json { color: #096dd9; }
.message-line.nmea { color: #13c2c2; }
.message-line.error { color: #ff4d4f; }

/* 有效和无效消息样式 - 参考FlowConsole实现 */
.valid-message {
  color: var(--app-text);
  border-left-color: #28a745;
}

.invalid-message {
  color: #dc3545;
  border-left-color: #dc3545;
}

.message-line.search-match {
  background: color-mix(in srgb, #faad14 14%, var(--app-surface));
  border-left-color: #faad14;
}

.message-line.current-search-result {
  background-color: color-mix(in srgb, #409eff 14%, var(--app-surface)) !important;
  border-left-color: #096dd9;
  font-weight: bold;
}

.timestamp {
  margin-right: 12px;
  opacity: 1;
  color: #28a745;
  font-size: 12px;
  font-weight: 600;
}

.message-content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.message-content :deep(mark) {
  background-color: color-mix(in srgb, #faad14 32%, var(--app-surface));
  color: var(--app-text);
  padding: 0 2px;
  border-radius: 2px;
}

/* 底部状态栏样式 - 浅色主题 */
.console-footer {
  padding: 4px 10px;
  background-color: var(--app-surface-muted);
  border-top: 1px solid var(--app-border);
  font-size: 12px;
  color: var(--app-text-muted);
  font-weight: 500;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
  height: auto;
  min-height: 26px;
}

/* 消息输入栏样式 - 浅色主题 */
.console-input-bar {
  padding: 8px 10px;
  background-color: var(--app-surface-muted);
  border-top: 1px solid var(--app-border);
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.input-container {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  width: 100%;
  gap: 6px;
}

.message-entry {
  display: flex;
  flex: 1 1 360px;
  align-items: center;
  min-width: min(100%, 260px);
  gap: 6px;
}

.format-select {
  flex: 0 0 78px;
  width: 78px;
}

.message-input {
  flex: 1 1 auto;
  min-width: 0;
}

.composer-actions,
.message-actions,
.iap-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
}

.composer-actions {
  flex: 0 1 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 2px;
  margin-left: auto;
}

.message-actions,
.iap-actions {
  flex-wrap: wrap;
}

.input-container :deep(.el-button) {
  min-height: 32px;
  padding-inline: 11px;
  font-size: 12px;
}

.input-container :deep(.el-button + .el-button) {
  margin-left: 0;
}

.newline-icon {
  flex: none;
  margin-right: 6px;
}

/* Element Plus 按钮样式调整 - 浅色主题 */
:deep(.el-button--default) {
  padding: 8px 16px;
  font-size: 13px;
}

:deep(.el-button--small) {
  padding: 6px 12px;
  font-size: 12px;
}

:deep(.el-button--text) {
  color: #6c757d;
}

:deep(.el-button--text:hover) {
  color: #409eff;
}

:deep(.el-button--primary) {
  background: #409eff;
  border-color: #409eff;
}

:deep(.el-button--success) {
  background: #67c23a;
  border-color: #67c23a;
}

:deep(.el-button--warning) {
  background: #e6a700;
  border-color: #e6a700;
}

/* 优化滚动条样式 - 浅色主题 */
.scroller::-webkit-scrollbar {
  width: 8px;
}

.scroller::-webkit-scrollbar-track {
  background: var(--app-surface-muted);
}

.scroller::-webkit-scrollbar-thumb {
  background-color: var(--app-border-strong);
  border-radius: 4px;
  border: 2px solid var(--app-surface-muted);
}

.scroller::-webkit-scrollbar-thumb:hover {
  background-color: #adb5bd;
}

/* Element Plus 选择框样式调整 */
:deep(.el-select__wrapper) {
  font-size: 12px;
}

:deep(.el-select__placeholder) {
  font-size: 12px;
}

</style>
