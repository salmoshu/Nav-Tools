<template>
  <div class="status">
    <div class="status-container">
      <div class="status-group">
        <div class="status-grid">
          <div class="status-row">
            <span class="status-label">线速度</span>
            <span class="status-value">{{ carState.linearSpeed.toFixed(1) }}</span>
            <span class="status-label">角速度</span>
            <span class="status-value">{{ carState.angularSpeed.toFixed(2) }}</span>
            <span class="status-label">朝向角度</span>
            <span class="status-value">{{ (carState.angle * 180 / Math.PI).toFixed(1) }}°</span>
          </div>
          <div class="status-row">
            <span class="status-label">目标角度</span>
            <span class="status-value">{{ (targetAngle * 180 / Math.PI).toFixed(1) }}°</span>
            <span class="status-label">距离</span>
            <span class="status-value">{{ distance.toFixed(1) }}</span>
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

.status-group h4 {
  margin: 0 0 16px 0;
  color: #2c3e50;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.status-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  font-size: 14px;
  line-height: 1.6;
}

.status-row {
  display: contents;
}

.status-label {
  color: #6c757d;
  font-weight: 500;
  font-size: 13px;
}

.status-value {
  color: #2c3e50;
  font-weight: 600;
  font-size: 14px;
  padding: 4px 8px;
  background: #f8f9fa;
  border-radius: 6px;
  display: inline-block;
  min-width: 60px;
  text-align: center;
  transition: all 0.3s ease;
}

.status-value:hover {
  background: #e9ecef;
  transform: translateY(-1px);
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

.status-row:nth-child(1) .status-value {
  background: rgba(233, 236, 239, 0.5);
  color: #6c757d;
}

.status-row:nth-child(2) .status-value {
  background: rgba(233, 236, 239, 0.5);
  color: #6c757d;
}

.status-row:nth-child(1) .status-value.in-fov,
.status-row:nth-child(1) .status-value.out-fov,
.status-row:nth-child(2) .status-value.in-fov,
.status-row:nth-child(2) .status-value.out-fov {
  background: rgba(0, 184, 148, 0.1);
  color: #00b894;
}

.status-row:nth-child(2) .status-value.out-fov {
  background: rgba(255, 107, 107, 0.1);
  color: #ff6b6b;
}

@media (max-width: 768px) {
  .status {
    padding: 16px;
  }
  
  .status-grid {
    grid-template-columns: 1fr;
    gap: 12px;
    font-size: 13px;
  }
}
</style>