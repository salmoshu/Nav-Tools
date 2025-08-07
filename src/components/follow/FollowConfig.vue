<template>
  <div class="controls">
    <div class="controls-content">
      <div class="control-group">
        <h4>线速度PID参数</h4>
        <label>线速度P: 
          <input type="range" v-model="config.linearPID.kp" min="0" max="10" step="0.1">
          <span>{{ config.linearPID.kp }}</span>
        </label>
        <label>线速度I: 
          <input type="range" v-model="config.linearPID.ki" min="0" max="2" step="0.05">
          <span>{{ config.linearPID.ki }}</span>
        </label>
        <label>线速度D: 
          <input type="range" v-model="config.linearPID.kd" min="0" max="2" step="0.05">
          <span>{{ config.linearPID.kd }}</span>
        </label>
      </div>
      
      <div class="control-group">
        <h4>角速度PID参数</h4>
        <label>角速度P: 
          <input type="range" v-model="config.angularPID.kp" min="0" max="5" step="0.1">
          <span>{{ config.angularPID.kp }}</span>
        </label>
        <label>角速度I: 
          <input type="range" v-model="config.angularPID.ki" min="0" max="1" step="0.05">
          <span>{{ config.angularPID.ki }}</span>
        </label>
        <label>角速度D: 
          <input type="range" v-model="config.angularPID.kd" min="0" max="1" step="0.05">
          <span>{{ config.angularPID.kd }}</span>
        </label>
      </div>
      
      <div class="control-group">
        <h4>其他参数</h4>
        <label>跟随距离: 
          <input type="range" v-model="config.followDistance" min="100" max="200" step="5">
          <span>{{ config.followDistance }}</span>
        </label>
        <label>最大线速度: 
          <input type="range" v-model="config.maxLinearSpeed" min="20" max="200" step="10">
          <span>{{ config.maxLinearSpeed }}</span>
        </label>
        <label>最大角速度: 
          <input type="range" v-model="config.maxAngularSpeed" min="0.5" max="6" step="0.1">
          <span>{{ config.maxAngularSpeed }}</span>
        </label>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { config } from '@/composables/follow/useFollowMain'
</script>

<style scoped>
.controls {
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 15px;
  flex: 1;
  overflow-y: auto;
}

.control-group {
  margin-bottom: 15px;
}

.control-group h4 {
  margin: 0 0 10px 0;
  color: #333;
  font-size: 14px;
}

label {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  color: #666;
}

input[type="range"] {
  width: 100%;
  margin: 5px 0;
}
</style>