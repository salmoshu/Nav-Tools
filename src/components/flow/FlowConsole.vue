<template>
  <div class="flow-console" @keyup.esc="toggleSearch" ref="consoleRoot" tabindex="0">
    <div class="console-header">
      <div class="console-controls">
        <!-- 左侧按钮组 -->
        <div class="left-controls">
          <el-select class="custom-select" v-model="dataFormat" placeholder="选择格式" size="small" style="width: 72px;">
            <el-option label="JSON" value="json"></el-option>
            <el-option label="NMEA" value="nmea"></el-option>
          </el-select>
          <el-button @click="toggleDataFilter" type="default" size="small">
            <el-icon><Filter /></el-icon>&nbsp;{{dataFilter?"还原":"过滤"}}
          </el-button>
          <el-button @click="toggleAddTimestamp" type="default" size="small">
            <el-icon><Clock /></el-icon>&nbsp;{{addTimestamp?"禁用时间":"开启时间"}}
          </el-button>
          <el-button @click="toggleAutoScroll" type="default" size="small">
            <el-icon v-if="autoScroll"><Sort /></el-icon>
            <el-icon v-else><Bottom /></el-icon>&nbsp;{{autoScroll?"滚动":"吸附"}}
          </el-button>
          <el-button @click="toggleSearch" type="default" size="small">
            <el-icon><Search /></el-icon>
          </el-button>
        </div>
        
        <!-- 右侧按钮组 -->
        <div class="right-controls">
          <el-button @click="saveConsoleData" type="default" size="small" :disabled="rawMessages.length === 0">
            <el-icon><Download /></el-icon>&nbsp;保存
          </el-button>
          <el-button @click="clearConsole" type="default" size="small">
            <el-icon><Delete /></el-icon>&nbsp;清除
          </el-button>
        </div>
      </div>
    </div>
    
    <!-- 悬浮搜索框 - 移到console-header下方 -->
    <div v-show="showSearch" class="search-overlay">
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
            <i class="el-icon-search"></i>
          </template>
        </el-input>
        <el-button @click="findPrev" type="text" size="small" style="color: #606266; margin-right: -10px;">↑</el-button>
        <el-button @click="findNext" type="text" size="small" style="color: #606266; margin-right: 5px;">↓</el-button>
        <span class="search-info-text" v-if="searchQuery">
          找到 {{ searchResults.length }} 个匹配项，当前是第 {{ currentResultIndex + 1 }} 项
        </span>
        <el-button @click="clearSearch" type="text" size="small" style="color: #909399; margin-left: 10px;">清除</el-button>
      </div>
    </div>
    
    <div ref="consoleContent" class="console-content" @keydown.ctrl.f.prevent="toggleSearch">
      <div v-for="message in filteredMessages" :key="getMessageKey(message)" class="message-line">
        <span v-if="addTimestamp" class="timestamp">{{ message.timestamp }}: </span>
        <span 
          :class="{ 
            'valid-message': message.isValid, 
            'invalid-message': !message.isValid, 
            'search-match': searchQuery && isMatch(message.raw, searchQuery) 
          }"
          v-html="highlightSearch(message.raw, searchQuery)"
        >
        </span>
      </div>
    </div>
    <div class="console-footer">
      <p>共 {{ rawMessages.length }} 条消息 | 有效数目: {{ msgCount }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { ElMessage, ElButton, ElSelect, ElOption, ElInput } from 'element-plus';
import { navMode } from '@/settings/config';
import { useConsole } from '@/composables/flow/useConsole';

const {
  consoleContent,
  autoScroll,
  rawMessages,
  visibleMessages, // 使用visibleMessages替代rawMessages
  msgCount,
  dataFormat,
  searchQuery,
  showSearch,
  searchInput,
  searchResults,
  currentResultIndex,
  handleRawData,
  clearConsole,
  toggleSearch,
  clearSearch,
  performSearch,
  scrollToResult,
  isMatch,
  initScrollListener,
  removeScrollListener,
  toggleAutoScrollLocal // 使用新的toggleAutoScrollLocal函数
} = useConsole();

const filteredMessages = computed(() => {
  if (!dataFilter.value) {
    return visibleMessages.value;
  }
  return visibleMessages.value.filter(
    message => message.dataType === dataFormat.value && message.isValid
  );
});

const saveConsoleData = () => {
  if (rawMessages.value.length === 0) {
    ElMessage({
      message: `没有可保存的数据`,
      type: 'warning',
      placement: 'bottom-right',
      offset: 50,
    });
    return;
  }

  // 生成文件内容，根据是否显示时间戳决定输出格式
  const fileContent = rawMessages.value
    .map(message => addTimestamp.value 
      ? `${message.timestamp}: ${message.raw}` 
      : message.raw)
    .join('\n');

  // 创建Blob并下载文件
  const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  
  // 生成带时间戳的文件名
  const now = new Date();
  const timestamp = now.getUTCFullYear() + '-' +
    String(now.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(now.getUTCDate()).padStart(2, '0') + 'T' +
    String(now.getUTCHours()).padStart(2, '0') + '-' +
    String(now.getUTCMinutes()).padStart(2, '0') + '-' +
    String(now.getUTCSeconds()).padStart(2, '0') + 'Z';
  
  a.download = `Nav-Tools_${timestamp}.log`;
  a.click();
  URL.revokeObjectURL(a.href);
};

// 切换自动滚动
const toggleAutoScroll = () => {
  toggleAutoScrollLocal();
};

const addTimestamp = ref(true);
const toggleAddTimestamp = () => {
  addTimestamp.value = !addTimestamp.value;
};

const dataFilter = ref(false);
const toggleDataFilter = () => {
  dataFilter.value = !dataFilter.value;
};

const highlightSearch = (text: string, query: string): string => {
  if (!query) return text;
  const regex = new RegExp(`(${query})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
};

const findNext = () => {
  if (searchResults.value.length === 0) return;
  
  currentResultIndex.value = 
    (currentResultIndex.value + 1) % searchResults.value.length;
  scrollToResult(currentResultIndex.value);
};

const findPrev = () => {
  if (searchResults.value.length === 0) return;
  
  currentResultIndex.value = 
    (currentResultIndex.value - 1 + searchResults.value.length) % searchResults.value.length;
  scrollToResult(currentResultIndex.value);
};

// 获取消息唯一key的函数
const getMessageKey = (message: { raw: string; timestamp: string }) => {
  // 结合原始内容和时间戳生成唯一标识
  return `${message.timestamp}_${message.raw}`;
};

// 添加全局ESC键处理函数
const consoleRoot = ref<HTMLDivElement | null>(null);
const handleSearchEvent = (event: KeyboardEvent) => {
  // 只有当搜索框显示时才处理ESC键
  if (event.key === 'Escape' && showSearch.value) {
    toggleSearch();
  }

  // 处理Ctrl+F快捷键 - 打开搜索框
  if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
    event.preventDefault();
    event.stopPropagation();
    toggleSearch();
  }
};

onMounted(() => {
  clearConsole();
  
  if (navMode.funcMode === 'gnss') {
    dataFormat.value = 'nmea';
  } else {
    dataFormat.value = 'json';
  }

  // 添加全局ESC键事件监听
  nextTick(() => {
    if (consoleRoot.value) {
      consoleRoot.value.addEventListener('keyup', handleSearchEvent);
    }
    // 初始化滚动监听
    initScrollListener();
  });
});

onUnmounted(() => {
  // 移除全局ESC键事件监听
  if (consoleRoot.value) {
    consoleRoot.value.removeEventListener('keyup', handleSearchEvent);
  }
  // 移除滚动监听
  removeScrollListener();
});
</script>

<style scoped>
/* 修改后的浅色主题样式 */
.flow-console {
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
}

.flow-console:focus {
  outline: none;
}

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

/* 悬浮搜索框样式 */
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
  justify-content: left;
}

.search-info-text {
  color: #096dd9;
  font-size: 12px;
  margin-right: 10px;
}

.console-content {
  flex: 1;
  padding: 12px;
  overflow-y: auto;
  overflow-x: hidden;
  font-family: 'Consolas', 'Monaco', 'Menlo', monospace;
  font-size: 14px;
  line-height: 1.5;
  box-sizing: border-box;
  background-color: #ffffff;
  /* 优化字体渲染 */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  margin-top: 0;
  /* 添加过渡效果，当搜索框出现时内容区域平滑下移 */
  transition: margin-top 0.2s ease;
}

/* 当搜索框显示时，给内容区域添加上边距 */
:deep(.search-overlay[style*="display: block"]) ~ .console-content {
  margin-top: 45px;
}

/* 搜索结果样式 */
.search-match {
  border-left-color: #409eff;
}

.current-search-result {
  background-color: #e6f4ff !important;
  border-left-color: #409eff;
  font-weight: bold;
}

.message-line mark {
  background-color: #ffecb3;
  padding: 0 2px;
  border-radius: 2px;
}

/* 优化滚动条样式 */
.console-content::-webkit-scrollbar {
  width: 8px;
}

.console-content::-webkit-scrollbar-track {
  background: #f8f9fa;
}

.console-content::-webkit-scrollbar-thumb {
  background-color: #dee2e6;
  border-radius: 4px;
  border: 2px solid #f8f9fa;
}

.console-content::-webkit-scrollbar-thumb:hover {
  background-color: #adb5bd;
}

/* 确保消息行清晰 */
.message-line {
  margin-bottom: 4px;
  padding: 2px 4px;
  padding-left: 8px;
  border-left: 2px solid transparent;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word;
  text-align: left;
  border-radius: 2px;
  transition: background-color 0.1s ease;
}

.message-line:hover {
  background-color: #f8f9fa;
}

/* 搜索结果样式 */
.search-match {
  border-left-color: #409eff;
}

.current-search-result {
  background-color: #e6f4ff !important;
  border-left-color: #409eff;
  font-weight: bold;
}

.message-line mark {
  background-color: #ffecb3;
  padding: 0 2px;
  border-radius: 2px;
}

.timestamp {
  color: #28a745;
  margin-right: 8px;
  font-weight: 600;
  font-size: 13px;
}

.valid-message {
  color: #212529;
  border-left-color: #28a745;
}

.invalid-message {
  color: #dc3545;
  border-left-color: #dc3545;
}

.console-footer {
  padding: 0px 12px;
  background-color: #f8f9fa;
  border-top: 1px solid #e9ecef;
  font-size: 12px;
  color: #6c757d;
  font-weight: 500;
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

/* 搜索相关样式 */
.search-container {
  display: flex;
  align-items: center;
  margin-right: 10px;
}

.search-info {
  position: sticky;
  top: 0;
  background-color: #f0f9ff;
  color: #096dd9;
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 4px;
  margin-bottom: 8px;
  z-index: 10;
}

.search-info.no-results {
  background-color: #fff2f0;
  color: #ff4d4f;
}

:deep(.custom-select) {
  margin-right: 10px;
}
</style>
