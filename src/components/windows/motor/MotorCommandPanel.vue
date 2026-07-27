<template>
  <div class="command-control">
    <el-tabs :model-value="activeTab" type="card" class="control-tabs" @update:model-value="$emit('update:activeTab', String($event))">
      <el-tab-pane name="read">
        <template #label>
          <span><el-icon><Position /></el-icon> {{ t('motor.readTab') }} <el-tag v-if="readCommands.length" size="small" type="info">{{ readCommands.length }}</el-tag></span>
        </template>
        <div class="command-list">
          <div v-for="command in readCommands" :key="command.name" class="command-item">
            <el-button
              type="primary"
              :disabled="!isConfigValid"
              :class="{ 'is-active': activeReadCommands.has(command.name) }"
              @click="$emit('sendRead', command)"
            >
              <el-icon><Position /></el-icon>
              {{ activeReadCommands.has(command.name) ? t('motor.stop') : command.name }}
            </el-button>
            <div class="frequency-input-wrapper">
              <el-input-number
                v-model="command.frequency"
                :min="0"
                :max="100"
                :disabled="!isConfigValid || activeReadCommands.has(command.name)"
                controls-position="right"
              />
              <span>Hz</span>
            </div>
          </div>
          <el-empty v-if="readCommands.length === 0" :description="t('motor.noReadConfig')" :image-size="48" />
        </div>
      </el-tab-pane>

      <el-tab-pane name="write">
        <template #label>
          <span><el-icon><Edit /></el-icon> {{ t('motor.writeTab') }} <el-tag v-if="writeCommands.length" size="small" type="info">{{ writeCommands.length }}</el-tag></span>
        </template>
        <div class="command-list">
          <div v-for="command in writeCommands" :key="command.name" class="command-item">
            <el-button type="success" :disabled="!isConfigValid" @click="$emit('sendWrite', command)">
              <el-icon><Edit /></el-icon> {{ command.name }}
            </el-button>
            <div class="data-input-wrapper">
              <div v-if="getDataCount(command) === 1" class="data-input">
                <el-input
                  :model-value="decimalInputs[command.name]"
                  :disabled="!isConfigValid || command.length === 0"
                  @input="$emit('singleInput', command, String($event))"
                />
                <span class="hex-display">{{ command.data }}</span>
              </div>
              <div v-else class="multi-data-inputs">
                <div v-for="(dataItem, index) in splitData(command.data, getDataCount(command), command.dataType)" :key="index" class="data-input">
                  <el-input
                    :model-value="decimalInputs[getDataInputKey(command, index)]"
                    :disabled="!isConfigValid"
                    @input="$emit('multiInput', command, index, String($event))"
                  />
                  <span class="hex-display">{{ dataItem }}</span>
                </div>
              </div>
            </div>
          </div>
          <el-empty v-if="writeCommands.length === 0" :description="t('motor.noWriteConfig')" :image-size="48" />
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { Edit, Position } from '@element-plus/icons-vue'
import { t } from '@/i18n'
import type { Command, ReadCommand, WriteCommand } from '@/composables/motor/useMotorCmd'

defineProps<{
  activeTab: string
  readCommands: ReadCommand[]
  writeCommands: WriteCommand[]
  activeReadCommands: Set<string>
  decimalInputs: Record<string, string>
  isConfigValid: boolean | string
  getDataCount: (command: Command) => number
  splitData: (data: string, count: number, dataType?: 'int16' | 'float32') => string[]
  getDataInputKey: (command: Command, index: number) => string
}>()

defineEmits<{
  'update:activeTab': [value: string]
  sendRead: [command: ReadCommand]
  sendWrite: [command: WriteCommand]
  singleInput: [command: Command, value: string]
  multiInput: [command: Command, index: number, value: string]
}>()
</script>

<style scoped>
.command-control,
.control-tabs {
  width: 100%;
  height: 100%;
}

.command-list {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 12px;
  padding: 12px;
}

.command-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.frequency-input-wrapper,
.data-input,
.multi-data-inputs {
  display: flex;
  align-items: center;
  gap: 6px;
}

.frequency-input-wrapper :deep(.el-input-number) {
  width: 100px;
}

.data-input :deep(.el-input) {
  width: 110px;
}

.hex-display {
  min-width: 44px;
  color: var(--app-text-muted);
  font-family: monospace;
}
</style>
