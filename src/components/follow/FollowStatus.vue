<template>
  <div class="status">
    <div class="status-container">
      <div class="status-group">
        <div class="status-grid">
          <div class="status-item">
            <span class="status-label">线速度</span>
            <span class="status-value">{{ carState.linearSpeed.toFixed(1) }}</span>
          </div>
          <div class="status-item">
            <span class="status-label">角速度</span>
            <span class="status-value">{{ carState.angularSpeed.toFixed(2) }}</span>
          </div>
          <div class="status-item">
            <span class="status-label">朝向角度</span>
            <span class="status-value">{{ (carState.angle * 180 / Math.PI).toFixed(1) }}°</span>
          </div>
          <div class="status-item">
            <span class="status-label">目标角度</span>
            <span class="status-value">{{ (targetAngle * 180 / Math.PI).toFixed(1) }}°</span>
          </div>
          <div class="status-item">
            <span class="status-label">距离</span>
            <span class="status-value">{{ distance.toFixed(1) }}</span>
          </div>
          <div class="status-item">
            <span class="status-label">FOV状态</span>
            <span class="status-value" :class="{ 'in-fov': isInFOV, 'out-fov': !isInFOV }">
              {{ isInFOV ? '范围内' : '范围外' }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { useFollowMain } from '@/composables/follow/useFollowMain'

// 使用useFollowMain函数获取状态
const {
  carState,
  distance,
  targetAngle,
  isInFOV
} = useFollowMain()
</script>

<style scoped>
.status {
  background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
  border: 1px solid #e9ecef;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.status-container {
  width: 100%;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  font-size: 14px;
  line-height: 1.6;
}

.status-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px;
  background: rgba(248, 249, 250, 0.5);
  border-radius: 8px;
  transition: all 0.3s ease;
}

.status-item:hover {
  background: rgba(233, 236, 239, 0.8);
  transform: translateY(-1px);
}

.status-label {
  color: #6c757d;
  font-weight: 500;
  font-size: 12px;
  margin-bottom: 4px;
}

.status-value {
  color: #2c3e50;
  font-weight: 600;
  font-size: 16px;
  padding: 4px 0px;
  background: #ffffff;
  border-radius: 6px;
  display: inline-block;
  min-width: 100px;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.in-fov {
  color: #00b894;
  background: rgba(0, 184, 148, 0.1);
  font-weight: 700;
}

.out-fov {
  color: #ff6b6b;
  background: rgba(255, 107, 107, 0.1);
  font-weight: 700;
}

/* 响应式布局 */
@media (min-width: 1400px) {
  .status-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

@media (min-width: 1200px) {
  .status-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

@media (min-width: 800px) and (max-width: 1199px) {
  .status-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 799px) {
  .status-grid {
    grid-template-columns: 1fr;
  }
  
  .status-item {
    flex-direction: row;
    justify-content: space-between;
    padding: 8px 12px;
  }
  
  .status-label {
    margin-bottom: 0;
    margin-right: 8px;
  }
}

@media (max-width: 480px) {
  .status {
    padding: 12px;
  }
  
  .status-grid {
    gap: 8px;
  }
  
  .status-item {
    padding: 8px;
  }
}
</style>