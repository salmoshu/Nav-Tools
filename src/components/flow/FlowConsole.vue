<template>
  <div class="flow-console">
    <div class="console-header">
      <div class="console-controls">
        <button @click="toggleAutoScroll" class="control-btn">{{ autoScroll ? '禁用自动滚动' : '启用自动滚动' }}</button>
        <button @click="toggleAddTimestamp" class="control-btn">{{ addTimestamp ? '禁用时间戳' : '启用时间戳' }}</button>
        <button @click="toggleDataFilter" class="control-btn">{{ dataFilter ? '禁用数据过滤' : '启用数据过滤' }}</button>
        <button @click="clearConsole" class="control-btn">清除接收</button>
      </div>
    </div>
    <div ref="consoleContent" class="console-content">
      <div v-for="(message, index) in rawMessages" :key="index" class="message-line">
        <span v-if="addTimestamp" class="timestamp">{{ message.timestamp }}: </span>
        <span :class="{'valid-message': message.isValid, 'invalid-message': !message.isValid}">
          {{ message.raw }}
        </span>
      </div>
    </div>
    <div class="console-footer">
      <p>共 {{ rawMessages.length }} 条消息 | 累计数目: {{ msgCount }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';

// 控制台相关状态
const consoleContent = ref<HTMLDivElement | null>(null);
const rawMessages = ref<{ timestamp: string; raw: string; isValid: boolean }[]>([]);
const autoScroll = ref(true);
const msgCount = ref(0);

// 处理接收到的Flow数据
let totalString = ''
const handleRawData = (rawData: string) => {
  totalString += rawData;
  
  if (totalString.includes('\n')) {
    try {
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
          try {
            JSON.parse(line);
          } catch (error) {
            isValid = false;
          }

          if (dataFilter.value && !isValid) {
            continue;
          }
          
          rawMessages.value.push({
            timestamp,
            raw: line,
            isValid
          });
          msgCount.value++;
        }
      }
    } catch (error) {
      // console.error('处理数据时出错:', error);
    }

    // 限制消息数量
    if (rawMessages.value.length > 1000) {
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
  }
};

// 清除控制台
const clearConsole = () => {
  rawMessages.value = [];
  msgCount.value = 0;
};

// 切换自动滚动
const toggleAutoScroll = () => {
  autoScroll.value = !autoScroll.value;
  if (autoScroll.value) {
    nextTick(() => {
      if (consoleContent.value) {
        consoleContent.value.scrollTop = consoleContent.value.scrollHeight;
      }
    });
  }
};

const addTimestamp = ref(true);
const toggleAddTimestamp = () => {
  addTimestamp.value = !addTimestamp.value;
};

const dataFilter = ref(false);
const toggleDataFilter = () => {
  dataFilter.value = !dataFilter.value;
}

// 监听Flow数据事件
onMounted(() => {
  window.ipcRenderer.on("serial-data-to-renderer", (_, data: string) => {
    // console.log("src/hooks/useDevice.ts 收到串口数据:", data);
    handleRawData(data);
  });
  console.log('FlowConsole组件已挂载，开始监听Flow数据');
});

// 清理监听
onUnmounted(() => {
  // 注意：这里需要根据实际的ipc实现来移除监听
  console.log('FlowConsole组件已卸载，停止监听Flow数据');
});
</script>

<style scoped>
/* 修改后的浅色主题样式 */
.flow-console {
  display: flex;
  flex-direction: column;
  height: 650px;
  max-height: 100%;
  border: 1px solid #e0e0e0;
  overflow: hidden;
  background-color: #ffffff;
  color: #333333;
  box-sizing: border-box;
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

.console-controls {
  display: flex;
  gap: 8px;
}

.control-btn {
  padding: 6px 12px;
  background-color: #f8f9fa;
  color: #495057;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;
}

.control-btn:hover {
  background-color: #e9ecef;
  border-color: #adb5bd;
}

.control-btn:active {
  background-color: #dee2e6;
  transform: translateY(1px);
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
</style>
