<template>
  <div class="flow-console-virtual" ref="consoleRoot" tabindex="0">
    <!-- 头部控制栏 -->
    <div class="console-header">
      <div class="console-controls">
        <!-- 左侧按钮组 -->
        <div class="left-controls">
          <el-select class="custom-select" v-model="dataFormat" placeholder="选择格式" size="small" style="width: 72px;">
            <el-option label="JSON" value="json"></el-option>
            <el-option label="NMEA" value="nmea"></el-option>
          </el-select>
          
          <el-button @click="toggleFilter" type="default" size="small" :title="dataFilter?'取消过滤':'启用过滤'">
            <el-icon><Filter /></el-icon>&nbsp;{{dataFilter?"还原":"过滤"}}
          </el-button>
          <el-button @click="toggleTimestamp" type="default" size="small" :title="dataTimestamp?'隐藏时间戳':'显示时间戳'">
            <el-icon><Clock /></el-icon>&nbsp;{{dataTimestamp?"禁用时间":"开启时间"}}
          </el-button>
          <el-button @click="toggleAutoScroll" type="default" size="small" :title="dataAutoScroll?'自动滚动':'手动滚动'">
            <el-icon v-if="dataAutoScroll"><Sort /></el-icon>
            <el-icon v-else><Bottom /></el-icon>&nbsp;{{dataAutoScroll?"滚动":"置底"}}
          </el-button>
          <el-button @click="togglePause" size="small" :type="isPaused ? 'warning' : 'default'" :title="isPaused?'继续接收':'暂停接收'">
            <el-icon><VideoPause /></el-icon>&nbsp;{{isPaused?"继续":"暂停"}}
          </el-button>
        </div>
        
        <!-- 右侧按钮组 -->
        <div class="right-controls">
          <el-button @click="toggleSearch" size="small" :type="showSearchBox ? 'primary' : 'text'" :title="showSearchBox?'关闭搜索':'打开搜索'">
            <el-icon><Search /></el-icon>
          </el-button>
          <el-button @click="saveConsoleData" type="text" size="small" :disabled="totalCount === 0" style="margin: 0px 0px;" title="保存到文件">
            <el-icon><Download /></el-icon>
          </el-button>
          <el-button @click="clearConsole" type="text" size="small" style="margin: 0px 0px;" title="清空控制台">
            <el-icon><Delete /></el-icon>
          </el-button>
          <el-button @click="connect" v-if="!isConnected" type="text" size="small" style="margin: 0px 0px;" title="连接">
            <el-icon><Connection /></el-icon>
          </el-button>
          <el-button @click="disconnect" v-else size="small" style="margin: 0px 0px;" :type="isConnected ? 'success' : 'text'" title="断开连接">
            <el-icon><SwitchButton /></el-icon>
          </el-button>
        </div>
      </div>
    </div>

    <!-- 搜索框 -->
    <div v-show="showSearchBox" class="search-overlay">
      <div class="search-container">
        <el-input
          ref="searchInput"
          v-model="searchQuery"
          size="small"
          placeholder="搜索... (按ESC关闭)"
          style="width: 200px; margin-right: 5px;"
          @input="performSearch"
          @keyup.enter="findNext"
        >
          <template #suffix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button @click="findPrev" type="text" size="small" style="color: #606266; margin-right: -10px;">
          <el-icon><ArrowUp /></el-icon>
        </el-button>
        <el-button @click="findNext" type="text" size="small" style="color: #606266; margin-right: 5px;">
          <el-icon><ArrowDown /></el-icon>
        </el-button>
        <span class="search-info-text" v-if="searchQuery && !isSearching">
          找到 {{ searchResults.length }} 个匹配项，当前是第 {{ currentResultIndex + 1 }} 项
        </span>
        <el-button @click="clearSearch" type="text" size="small" style="color: #909399; margin-left: 10px;">清除</el-button>
      </div>
    </div>

    <!-- 虚拟滚动消息列表 -->
    <div class="console-content-virtual" ref="consoleContent">
      <DynamicScroller
        class="scroller"
        :items="filteredMessages"
        :min-item-size="20"
        key-field="key"
        v-slot="{ item, index, active }"
      >
        <DynamicScrollerItem
          :item="item"
          :active="active"
          :data-index="index"
        >
          <div 
            class="message-line" 
            :class="getMessageClasses(item, index)"
          >
            <span v-if="dataTimestamp" class="timestamp">{{ item.timestamp }}: </span>
            <span 
              class="message-content"
              v-html="highlightSearch(item.raw, searchQuery)"
            >
            </span>
          </div>
        </DynamicScrollerItem>
      </DynamicScroller>
    </div>

    <!-- 底部状态栏 -->
    <div class="console-footer">
      <div class="footer-left">
        <span>共 {{ totalCount }} 条消息</span>
        <span v-if="dataFilter"> | 显示 {{ filteredMessages.length }} 条</span>
        <span v-if="messageRate > 0"> | {{ messageRate }} 条/秒</span>
        <span v-if="isConnected"> | 已连接</span>
        <span v-if="isPaused"> | 已暂停</span>
      </div>
      <div class="footer-right">
        <span v-if="dataFormat === 'json'">JSON格式</span>
        <span v-if="dataFormat === 'nmea'">NMEA格式</span>
        <span v-if="dataTimestamp"> | 时间戳开启</span>
        <span v-if="!dataTimestamp"> | 时间戳关闭</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { 
  Filter, 
  Clock, 
  Sort, 
  Bottom, 
  Search, 
  Download, 
  Delete,
  VideoPause,
  Connection,
  SwitchButton,
  ArrowUp,
  ArrowDown
} from '@element-plus/icons-vue'
import { useConsolex } from '@/composables/flow/useConsolex'

// DOM引用
const consoleRoot = ref<HTMLDivElement | null>(null)
const consoleContent = ref<HTMLDivElement | null>(null)
const searchInput = ref<InstanceType<typeof HTMLInputElement> | null>(null)

// 搜索状态
const searchQuery = ref('')
const showSearchBox = ref(false)
const currentResultIndex = ref(-1)
const searchResults = ref<any[]>([])
const isSearching = ref(false)

// 使用虚拟滚动控制台组合式函数（使用全局实例）
const {
  dataFormat,
  dataFilter,
  dataTimestamp,
  dataAutoScroll,
  isConnected,
  isPaused,
  filteredMessages,
  totalCount,
  clearMessages,
  toggleFilter,
  toggleTimestamp,
  toggleAutoScroll,
  togglePause,
  connect,
  disconnect,
  saveToFile,
  handleRawDataBatch,
} = useConsolex(true) // 使用全局实例

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
  
  // 执行搜索
  const results = filteredMessages.value.filter(msg => 
    msg.raw.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
    msg.timestamp.toLowerCase().includes(searchQuery.value.toLowerCase())
  )
  
  searchResults.value = results
  currentResultIndex.value = results.length > 0 ? 0 : -1
  
  isSearching.value = false
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
    // DynamicScroller需要手动滚动到指定位置
    const scroller = document.querySelector('.scroller') as any
    if (scroller && scroller.scrollToItem) {
      scroller.scrollToItem(targetIndex)
    }
  }
}

// 清除搜索
const clearSearch = () => {
  searchQuery.value = ''
  searchResults.value = []
  currentResultIndex.value = -1
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
  
  // 如果是当前搜索结果，添加高亮类
  if (index !== undefined && searchResults.value[currentResultIndex.value]?.key === item.key) {
    classes['current-search-result'] = true
  }
  
  return classes
}

const highlightSearch = (text: string, query: string) => {
  if (!query) return text
  const regex = new RegExp(`(${query})`, 'gi')
  return text.replace(regex, '<mark>$1</mark>')
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

// 自动清理
const autoCleanup = () => {
  if (totalCount.value > 50000) { // 当消息超过5万条时
    console.log('执行自动清理，保持内存使用')
  }
}

// 每30秒检查一次
let cleanupInterval: number | null = null

// 键盘事件处理
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && showSearchBox.value) {
    toggleSearch()
  }
  if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
    event.preventDefault()
    toggleSearch()
  }
}

// 监听搜索查询变化
watch(searchQuery, () => {
  performSearch()
})

</script>

<style scoped>
/* 浅色主题样式，与FlowConsole保持一致 */
.flow-console-virtual {
  display: flex;
  flex-direction: column;
  height: 800px;
  max-height: 100%;
  border: 1px solid #e0e0e0;
  overflow: hidden;
  background-color: #ffffff;
  color: #333333;
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
  background-color: #f8f9fa;
  border-bottom: 1px solid #e9ecef;
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

/* 自定义选择框样式 - 浅色主题 */
.custom-select {
  margin-right: 10px;
}

.custom-select :deep(.el-input__wrapper) {
  background: #ffffff;
  box-shadow: 0 0 0 1px #dcdfe6 inset;
}

/* 搜索框样式 - 浅色主题 */
.search-overlay {
  position: absolute;
  top: 50px;
  left: 0;
  right: 0;
  background-color: rgba(240, 249, 255, 0.95);
  border-bottom: 1px solid #d9ecff;
  padding: 8px 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 10;
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
  background-color: #ffffff;
  /* 添加过渡效果，当搜索框出现时内容区域平滑下移 */
  transition: margin-top 0.2s ease;
  position: relative;
}

/* 当搜索框显示时，给内容区域添加上边距 */
:deep(.search-overlay[style*="display: block"]) ~ .console-content-virtual {
  margin-top: 45px;
}

.scroller {
  height: 100%;
  background: #ffffff;
  color: #333333;
  font-family: 'Consolas', 'Monaco', 'Menlo', monospace;
  font-size: 14px;
  line-height: 1.5;
  padding: 12px;
  box-sizing: border-box;
}

.message-line {
  display: flex;
  padding: 2px 12px;
  border-bottom: 1px solid #e9ecef;
  min-height: 20px;
  align-items: center;
  margin-bottom: 0;
  padding-left: 12px;
  border-left: 2px solid transparent;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word;
  text-align: left;
  border-radius: 0;
  transition: background-color 0.1s ease;
}

.message-line:hover {
  background-color: #f8f9fa;
}

.message-line.json { color: #096dd9; }
.message-line.nmea { color: #13c2c2; }
.message-line.error { color: #ff4d4f; }

.message-line.search-match {
  background: #fffbe6;
  border-left-color: #faad14;
}

.message-line.current-search-result {
  background-color: #e6f4ff !important;
  border-left-color: #096dd9;
  font-weight: bold;
}

.timestamp {
  margin-right: 12px;
  opacity: 1;
  min-width: 80px;
  color: #28a745;
  font-size: 12px;
  font-weight: 600;
}

.message-content {
  flex: 1;
  word-break: break-all;
  color: #212529;
}

.message-content :deep(mark) {
  background-color: #ffecb3;
  color: #000;
  padding: 0 2px;
  border-radius: 2px;
}

/* 底部状态栏样式 - 浅色主题 */
.console-footer {
  padding: 6px 12px;
  background-color: #f8f9fa;
  border-top: 1px solid #e9ecef;
  font-size: 12px;
  color: #6c757d;
  font-weight: 500;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
  height: auto;
  min-height: 30px;
}

.footer-left, .footer-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Element Plus 按钮样式调整 - 浅色主题 */
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
  background: #f8f9fa;
}

.scroller::-webkit-scrollbar-thumb {
  background-color: #dee2e6;
  border-radius: 4px;
  border: 2px solid #f8f9fa;
}

.scroller::-webkit-scrollbar-thumb:hover {
  background-color: #adb5bd;
}
</style>