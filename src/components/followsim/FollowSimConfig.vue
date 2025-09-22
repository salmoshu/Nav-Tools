<template>
  <div class="controls">
    <div class="controls-content">
      <div class="control-group linear-pid">
        <h4>线速度PID参数</h4>
        <div class="control-item">
          <label>线速度P</label>
          <div class="slider-container">
            <input type="range" v-model="config.linearPID.kp" min="0" max="10" step="0.1" class="custom-slider">
            <span class="value-display">{{ config.linearPID.kp }}</span>
          </div>
        </div>
        <div class="control-item">
          <label>线速度I</label>
          <div class="slider-container">
            <input type="range" v-model="config.linearPID.ki" min="0" max="2" step="0.05" class="custom-slider">
            <span class="value-display">{{ config.linearPID.ki }}</span>
          </div>
        </div>
        <div class="control-item">
          <label>线速度D</label>
          <div class="slider-container">
            <input type="range" v-model="config.linearPID.kd" min="0" max="2" step="0.05" class="custom-slider">
            <span class="value-display">{{ config.linearPID.kd }}</span>
          </div>
        </div>
      </div>
      
      <div class="control-group angular-pid">
        <h4>角速度PID参数</h4>
        <div class="control-item">
          <label>角速度P</label>
          <div class="slider-container">
            <input type="range" v-model="config.angularPID.kp" min="0" max="5" step="0.1" class="custom-slider">
            <span class="value-display">{{ config.angularPID.kp }}</span>
          </div>
        </div>
        <div class="control-item">
          <label>角速度I</label>
          <div class="slider-container">
            <input type="range" v-model="config.angularPID.ki" min="0" max="1" step="0.05" class="custom-slider">
            <span class="value-display">{{ config.angularPID.ki }}</span>
          </div>
        </div>
        <div class="control-item">
          <label>角速度D</label>
          <div class="slider-container">
            <input type="range" v-model="config.angularPID.kd" min="0" max="1" step="0.05" class="custom-slider">
            <span class="value-display">{{ config.angularPID.kd }}</span>
          </div>
        </div>
      </div>
      
      <div class="control-group other-params">
        <h4>其他参数</h4>
        <div class="control-item">
          <label>跟随距离 (mm)</label>
          <div class="slider-container">
            <input type="range" v-model="config.followDistance" min="100" max="200" step="5" class="custom-slider">
            <span class="value-display">{{ config.followDistance }}</span>
          </div>
        </div>
        <div class="control-item">
          <label>最大线速度</label>
          <div class="slider-container">
            <input type="range" v-model="config.maxLinearSpeed" min="20" max="200" step="10" class="custom-slider">
            <span class="value-display">{{ config.maxLinearSpeed }}</span>
          </div>
        </div>
        <div class="control-item">
          <label>最大角速度</label>
          <div class="slider-container">
            <input type="range" v-model="config.maxAngularSpeed" min="0.5" max="6" step="0.1" class="custom-slider">
            <span class="value-display">{{ config.maxAngularSpeed }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { watch, onMounted, onUnmounted, toRaw } from 'vue'
import { storeToRefs } from 'pinia'
import { useFollowStore } from '@/stores/followsim'

const followStore = useFollowStore()
const { config } = storeToRefs(followStore)

watch(config, (newConfig) => {
  window.ipcRenderer.send('update-follow-config', toRaw(newConfig))
}, { deep: true })

function handleConfigUpdate(event: Event, newConfig: typeof config) {
  Object.assign(config, newConfig)
}

onMounted(() => {
  window.ipcRenderer.on('follow-config-updated', (event: Electron.IpcRendererEvent, newConfig: typeof config) => handleConfigUpdate(event as unknown as Event, newConfig))
})

onUnmounted(() => {
  window.ipcRenderer.off('follow-config-updated', (event: Electron.IpcRendererEvent, newConfig: typeof config) => handleConfigUpdate(event as unknown as Event, newConfig))
})
</script>

<style scoped>
.controls {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 20px;
  flex: 1;
  overflow-y: auto;
  max-height: 100%;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}

.controls-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.control-group {
  background: white;
  border-radius: 10px;
  padding: 18px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.control-group:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 25px rgba(0, 0, 0, 0.1);
}

.control-group h4 {
  margin: 0 0 16px 0;
  color: #333;
  font-size: 16px;
  font-weight: 600;
}

.control-item {
  margin-bottom: 16px;
}

.control-item:last-child {
  margin-bottom: 0;
}

label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #555;
  transition: color 0.2s ease;
}

.control-item:hover label {
  color: #333;
}

/* 在现有的样式基础上添加以下调整 */
.slider-container {
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
  /* 确保容器高度足够容纳滑块 */
  height: 36px;
  max-width: 400px;
}

/* 自定义滑块样式 */
.custom-slider {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: #e6e6e6;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  transition: background 0.2s ease;
  /* 重置可能的默认边距 */
  margin: 0;
  /* 确保滑块控件在容器中垂直居中 */
  vertical-align: middle;
}

/* Chrome, Safari, Edge 滑块样式 */
.custom-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #409EFF;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 2px solid white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  /* 关键修复：调整垂直位置，让滑块在Chrome等WebKit浏览器中居中 */
  margin-top: -6px; /* (18px - 6px) / 2 = 6px，负值上移 */
}

.control-group.angular-pid .custom-slider::-webkit-slider-thumb {
  background: #67C23A;
}

.control-group.other-params .custom-slider::-webkit-slider-thumb {
  background: #E6A23C;
}

/* Firefox 滑块样式 */
.custom-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #409EFF;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 2px solid white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  /* Firefox不需要像WebKit那样调整margin，默认位置通常较好 */
}

.control-group.angular-pid .custom-slider::-moz-range-thumb {
  background: #67C23A;
}

.control-group.other-params .custom-slider::-moz-range-thumb {
  background: #E6A23C;
}

/* 滑块进度条样式 */
.custom-slider::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 3px;
  background: #e6e6e6;
  /* 重要：移除默认的边距和内边距 */
  margin: 0;
  padding: 0;
}

.custom-slider::-moz-range-track {
  height: 6px;
  border-radius: 3px;
  background: #e6e6e6;
  border: none;
  /* 确保Firefox中的轨道样式一致 */
  margin: 0;
  padding: 0;
}

/* 数值显示样式调整 */
.value-display {
  min-width: 40px;
  padding: 6px 12px;
  background: #f0f0f0;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 600;
  color: #333;
  text-align: center;
  transition: all 0.2s ease;
  /* 确保数值显示在容器中垂直居中 */
  height: 24px;
  line-height: 24px;
  margin: auto 0;
}

.control-group:hover .value-display {
  background: #e8e8e8;
}

.control-group.linear-pid .value-display {
  background: rgba(64, 158, 255, 0.1);
  color: #409EFF;
}

.control-group.linear-pid:hover .value-display {
  background: rgba(64, 158, 255, 0.15);
}

.control-group.angular-pid .value-display {
  background: rgba(103, 194, 58, 0.1);
  color: #67C23A;
}

.control-group.angular-pid:hover .value-display {
  background: rgba(103, 194, 58, 0.15);
}

.control-group.other-params .value-display {
  background: rgba(230, 162, 60, 0.1);
  color: #E6A23C;
}

.control-group.other-params:hover .value-display {
  background: rgba(230, 162, 60, 0.15);
}
</style>