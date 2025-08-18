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
  if (nmeaMessages.value.length > 1000) {
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
.gnss-console {
  display: flex;
  flex-direction: column;
  height: 500px;
  max-height: 100%;
  border: 1px solid #ccc;
  border-radius: 4px;
  overflow: hidden;
  background-color: #1e1e1e;
  color: #d4d4d4;
  box-sizing: border-box;
}

.console-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background-color: #2d2d2d;
  border-bottom: 1px solid #3d3d3d;
  height: 40px;
  box-sizing: border-box;
}

.console-controls {
  display: flex;
  gap: 8px;
}

.control-btn {
  padding: 4px 8px;
  background-color: #3d3d3d;
  color: #d4d4d4;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.control-btn:hover {
  background-color: #4d4d4d;
}

.console-content {
  flex: 1;
  padding: 12px;
  overflow-y: auto;
  overflow-x: hidden;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 14px;
  line-height: 1.5;
  box-sizing: border-box;
  /* 优化字体渲染 */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

/* 简化滚动条样式 */
.console-content::-webkit-scrollbar {
  width: 10px;
}

.console-content::-webkit-scrollbar-track {
  background: #2d2d2d;
}

.console-content::-webkit-scrollbar-thumb {
  background-color: #4d4d4d;
  border-radius: 5px;
  border: 2px solid #2d2d2d;
}

/* 确保消息行清晰 */
.message-line {
  margin-bottom: 5px;
  padding-left: 4px;
  border-left: 2px solid transparent;
  white-space: pre-wrap; /* 修改为pre-wrap以保留换行符并允许自动换行 */
  word-wrap: break-word; /* 确保长单词也能换行 */
  overflow-wrap: break-word; /* 现代浏览器中的换行控制 */
  text-align: left;
}

.timestamp {
  color: #73c991;
  margin-right: 8px;
  font-weight: bold;
}

.valid-message {
  color: #e0e0e0;
  border-left-color: #608b4e;
}

.invalid-message {
  color: #ff8a80;
  border-left-color: #ff6b6b;
}

.console-footer {
  padding: 8px 12px;
  background-color: #2d2d2d;
  border-top: 1px solid #3d3d3d;
  font-size: 12px;
  color: #999;
}
</style>
