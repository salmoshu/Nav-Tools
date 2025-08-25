<template>
  <div class="snr-container">
    <div class="snr-content">
      <div class="snr-table-container">
        <el-table
          :data="filteredSatelliteData"
          style="width: 100%"
          height="100%"
          stripe
          border
          :default-sort="{ prop: 'constellation', order: 'ascending' }"
          @sort-change="handleSortChange"
        >
          <el-table-column
            prop="constellation"
            label="星座"
            width="100"
            sortable
            :filters="constellationFilters"
            :filter-method="filterConstellation"
            filter-placement="bottom-end"
          >
            <template #default="{ row }">
              <el-tag :type="getConstellationTagType(row.constellation)" size="small">
                {{ row.constellation }}
              </el-tag>
            </template>
          </el-table-column>
          
          <el-table-column
            prop="prn"
            label="PRN"
            width="80"
            sortable
          />
          
          <el-table-column
            prop="snr"
            label="信号强度 (SNR)"
            width="150"
            sortable
          >
            <template #default="{ row }">
              <div class="snr-cell">
                <el-progress
                  :percentage="Math.min(row.snr, 60) * (100/60)"
                  :color="getSnrColor(row.snr)"
                  :stroke-width="10"
                  :show-text="false"
                  style="width: 100px; margin-right: 10px"
                />
                <span :style="{ color: getSnrColor(row.snr) }" class="snr-value">
                  {{ row.snr }} dB
                </span>
              </div>
            </template>
          </el-table-column>
          
          <el-table-column
            prop="elevation"
            label="仰角"
            width="100"
            sortable
          >
            <template #default="{ row }">
              {{ row.elevation }}°
            </template>
          </el-table-column>
          
          <el-table-column
            prop="azimuth"
            label="方位角"
            width="100"
            sortable
          >
            <template #default="{ row }">
              {{ row.azimuth }}°
            </template>
          </el-table-column>
          
          <el-table-column
            prop="timestamp"
            label="更新时间"
            width="180"
            sortable
          >
            <template #default="{ row }">
              {{ formatTime(row.timestamp) }}
            </template>
          </el-table-column>
          
          <el-table-column
            prop="status"
            label="状态"
            width="100"
            fixed="right"
          >
            <template #default="{ row }">
              <el-tag :type="getStatusTagType(row.snr)" size="small">
                {{ getStatusText(row.snr) }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue';
import { useNmea } from '../../composables/gnss/useNmea';

// 初始化NMEA解析器
const { satelliteSnrData, processRawData } = useNmea();

// 星座过滤选项
const constellationFilters = [
  { text: 'GPS', value: 'GPS' },
  { text: 'GLONASS', value: 'GLONASS' },
  { text: 'BEIDOU', value: 'BEIDOU' },
  { text: 'GALILEO', value: 'GALILEO' },
  { text: 'OTHER', value: 'OTHER' }
];

// 获取最新的卫星数据（每个PRN只保留最新的一条）
// 修改 getLatestSatelliteData 函数，确保数据按星座和PRN排序
function getLatestSatelliteData() {
  const latestMap = new Map();
  
  // 按时间戳排序，确保最新的数据在后面
  const sortedData = [...satelliteSnrData.value].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  
  // 对于每个PRN，只保留最新的数据
  sortedData.forEach(sat => {
    latestMap.set(sat.prn, sat);
  });
  
  // 返回按星座和PRN升序排序的数据
  return Array.from(latestMap.values()).sort((a, b) => {
    // 首先按星座升序排序
    if (a.constellation !== b.constellation) {
      return a.constellation.localeCompare(b.constellation);
    }
    // 然后按PRN数字升序排序
    return parseInt(a.prn) - parseInt(b.prn);
  });
}

// 过滤后的卫星数据（现在显示所有星座的数据）
const filteredSatelliteData = computed(() => {
  return getLatestSatelliteData();
});

// 获取星座标签类型
function getConstellationTagType(constellation) {
  const typeMap = {
    'GPS': 'success',
    'GLONASS': 'primary',
    'BEIDOU': 'warning',
    'GALILEO': 'info',
    'OTHER': 'danger'
  };
  return typeMap[constellation] || 'info';
}

// 获取SNR颜色
function getSnrColor(snr) {
  if (snr >= 45) return '#52c41a';
  if (snr >= 35) return '#1890ff';
  if (snr >= 25) return '#faad14';
  return '#ff4d4f';
}

// 获取状态标签类型
function getStatusTagType(snr) {
  if (snr >= 45) return 'success';
  if (snr >= 35) return 'primary';
  if (snr >= 25) return 'warning';
  return 'danger';
}

// 获取状态文本
function getStatusText(snr) {
  if (snr >= 45) return '优秀';
  if (snr >= 35) return '良好';
  if (snr >= 25) return '一般';
  return '较差';
}

// 格式化时间
function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// 星座过滤方法
function filterConstellation(value, row) {
  return row.constellation === value;
}

// 监听串口数据
const handleSerialData = (event, data) => {
  processRawData(data);
};

// 组件挂载时初始化
onMounted(() => {
  // 监听串口数据
  window.ipcRenderer.on('read', handleSerialData);
});

// 清理函数
onUnmounted(() => {
  window.ipcRenderer.off('read', handleSerialData);
});
</script>

<style scoped>
.snr-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background-color: #f5f7fa;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.snr-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 15px;
}

.snr-table-container {
  flex: 1;
  background-color: #fff;
  border-radius: 4px;
  overflow: hidden;
}

.snr-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.snr-value {
  font-weight: bold;
  font-size: 14px;
}

:deep(.el-table__header-wrapper) {
  background-color: #f8f9fa;
}

:deep(.el-table__row:hover) {
  background-color: #f5f7fa;
}
</style>