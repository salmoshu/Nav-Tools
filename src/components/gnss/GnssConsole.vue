<template>
  <div class="gnss-console">
    <div class="console-header">
      <div class="console-controls">
        <button @click="toggleAutoScroll" class="control-btn">{{ autoScroll ? '禁用自动滚动' : '启用自动滚动' }}</button>
        <button @click="toggleAddTimestamp" class="control-btn">{{ addTimestamp ? '禁用时间戳' : '启用时间戳' }}</button>
        <button @click="clearConsole" class="control-btn">清除</button>
      </div>
    </div>
    <div ref="consoleContent" class="console-content">
      <div v-for="(message, index) in nmeaMessages" :key="index" class="message-line">
        <span v-if="addTimestamp" class="timestamp">{{ message.timestamp }}: </span>
        <span :class="{'valid-message': message.isValid, 'invalid-message': !message.isValid}">
          {{ message.raw }}
        </span>
      </div>
    </div>
    <div class="console-footer">
      <p>共 {{ nmeaMessages.length }} 条消息 | 有效: {{ validCount }} | 无效: {{ invalidCount }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';

// 控制台相关状态
const consoleContent = ref<HTMLDivElement | null>(null);
const nmeaMessages = ref<{ timestamp: string; raw: string; isValid: boolean }[]>([]);
const autoScroll = ref(true);
const validCount = ref(0);
const invalidCount = ref(0);

// 处理接收到的NMEA数据
const handleNmeaData = (rawData: string) => {
  const now = new Date();
  const timestamp = now.toLocaleTimeString() + '.' + now.getMilliseconds().toString().padStart(3, '0');

  try {
    nmeaMessages.value.push({
      timestamp,
      raw: rawData,
      isValid: true
    });
    validCount.value++;
  } catch (error) {
    nmeaMessages.value.push({
      timestamp,
      raw: rawData,
      isValid: false
    });
    invalidCount.value++;
  }

  // 限制消息数量
  if (nmeaMessages.value.length > 200) {
    nmeaMessages.value.shift();
  }

  // 优化自动滚动
  if (autoScroll.value) {
    nextTick(() => {
      if (consoleContent.value) {
        // 直接滚动，避免requestAnimationFrame可能带来的延迟
        consoleContent.value.scrollTop = consoleContent.value.scrollHeight;
      }
    });
  }
};

// 清除控制台
const clearConsole = () => {
  nmeaMessages.value = [];
  validCount.value = 0;
  invalidCount.value = 0;
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

// 监听NMEA数据事件
onMounted(() => {
  // 假设通过ipc接收NMEA数据
  window.ipcRenderer.on("serial-data-to-renderer", (_, data: string) => {
    // console.log("src/hooks/useDevice.ts 收到串口数据:", data);
    handleNmeaData(data);
  });
  console.log('GnssConsole组件已挂载，开始监听NMEA数据');
});

// 清理监听
onUnmounted(() => {
  // 注意：这里需要根据实际的ipc实现来移除监听
  console.log('GnssConsole组件已卸载，停止监听NMEA数据');
});
</script>

<style scoped>
/* 修改后的浅色主题样式 */
.gnss-console {
  display: flex;
  flex-direction: column;
  height: 500px;
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
