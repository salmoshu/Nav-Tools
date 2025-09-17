<template>
  <div class="flow-console">
    <div class="console-header">
      <div class="console-controls">
        <!-- 左侧按钮组 -->
        <div class="left-controls">
          <el-select class="custom-select" v-model="dataFormat" placeholder="选择格式" size="small" style="width: 72px;">
            <el-option label="JSON" value="json"></el-option>
            <el-option label="NMEA" value="nmea"></el-option>
          </el-select>
          <el-button @click="toggleDataFilter" type="default" size="small">
            <span :style="{ textDecoration: dataFilter ? 'line-through' : 'none' }">{{ dataFilter ? `过滤${dataFormat.toUpperCase()}` : `过滤${dataFormat.toUpperCase()}` }}</span>
          </el-button>
          <el-button @click="toggleAddTimestamp" type="default" size="small">
            <span :style="{ textDecoration: addTimestamp ? 'line-through' : 'none' }">时间</span>
          </el-button>
          <el-button @click="toggleAutoScroll" type="default" size="small">
            <span :style="{ textDecoration: autoScroll ? 'line-through' : 'none' }">滚动</span>
          </el-button>
        </div>
        
        <!-- 右侧按钮组 -->
        <div class="right-controls">
          <el-button @click="saveConsoleData" type="default" size="small" :disabled="rawMessages.length === 0">保存</el-button>
          <el-button @click="clearConsole" type="default" size="small">清除</el-button>
        </div>
      </div>
    </div>
    <div ref="consoleContent" class="console-content">
      <div v-for="message in rawMessages" :key="getMessageKey(message)" class="message-line">
        <div v-if="!dataFilter || (message.dataType === dataFormat && message.isValid)">
          <span v-if="addTimestamp" class="timestamp">{{ message.timestamp }}: </span>
          <span :class="{'valid-message': message.isValid, 'invalid-message': !message.isValid}">
            {{ message.raw }}
          </span>
        </div>
      </div>
    </div>
    <div class="console-footer">
      <p>共 {{ rawMessages.length }} 条消息 | 有效数目: {{ msgCount }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { ElMessage, ElButton, ElSelect, ElOption } from 'element-plus';
import { navMode } from '@/settings/config';

// 控制台相关状态
const consoleContent = ref<HTMLDivElement | null>(null);
const rawMessages = ref<{ 
  timestamp: string;
  raw: string;
  dataType: 'nmea' | 'json';
  isValid: boolean
}[]>([]);
const autoScroll = ref(true);
const msgCount = ref(0);
const msgNmeaCount = ref(0);
const msgJsonCount = ref(0);
const dataFormat = ref<'json' | 'nmea'>('json');

const calculateNmeaChecksum = (sentence: string): string => {
  let checksum = 0;
  for (let i = 0; i < sentence.length; i++) {
    checksum ^= sentence.charCodeAt(i);
  }
  // 转换为2位十六进制字符串
  return checksum.toString(16).toUpperCase().padStart(2, '0');
}

const isValidNmea = (str: string) => {
  // 基本格式检查
  if (!str.startsWith('$')) {
    return false;
  }
  
  // 移除结尾的换行符以便处理
  const cleanStr = str.trimEnd();
  
  // 检查是否包含星号(校验和分隔符)
  const asteriskIndex = cleanStr.indexOf('*');
  if (asteriskIndex === -1 || asteriskIndex < 6) { // 至少需要$xxxx,格式
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
}

const isValidJson = (str: string) => {
  if (str.endsWith('\n')) {
    str = str.slice(0, -1);
  }
  if (str.endsWith('\r')) {
    str = str.slice(0, -1);
  }
  // 目前仅考虑大括号起始的JSON格式
  if (!str.startsWith('{') || !str.endsWith('}')) {
    return false;
  }
  try {
    JSON.parse(str, (_, value) => {
      // 需要以大括号起始
       return value
    })
    return true;
  } catch (error) {
    return false;
  }
}

// 处理接收到的Flow数据
let totalString = ''
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
      // 
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
  }
};

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

// 定义命名的回调函数
const handleSerialData = (_: unknown, data: string) => {
  handleRawData(data);
};

onMounted(() => {
  if (navMode.funcMode === 'gnss') {
    dataFormat.value = 'nmea';
  } else {
    dataFormat.value = 'json';
  }
  window.ipcRenderer.on("serial-data-to-renderer", handleSerialData);
});

onUnmounted(() => {
  window.ipcRenderer.off('serial-data-to-renderer', handleSerialData);
});
// 在script部分添加获取消息唯一key的函数
const getMessageKey = (message: { raw: string; timestamp: string }) => {
  // 结合原始内容和时间戳生成唯一标识
  return `${message.timestamp}_${message.raw}`;
};
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

.console-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.left-controls, .right-controls {
  display: flex;
}

:deep(.custom-select) {
  margin-right: 10px;
}
</style>
