<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('flow.trackConfigTitle')"
    class="app-dialog deviation-config-dialog"
    width="min(710px, calc(100vw - 24px))"
    destroy-on-close
    :append-to-body="true"
    :z-index="8000"
    align-center
    :close-on-click-modal="true"
    :close-on-press-escape="true"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <template #header>
      <AppDialogTitle
        :icon="Aim"
        :title="t('flow.trackConfigTitle')"
        :description="t('flow.trackConfigDesc')"
      />
    </template>

    <div class="chart-config-grid">
      <section v-for="track in 4" :key="track" class="chart-config-section">
        <header>
          <h4>{{ t('flow.trackN', { n: track }) }}</h4>
          <el-color-picker
            :model-value="getValue(track, 'Color')"
            @update:model-value="setValue(track, 'Color', $event)"
          />
        </header>
        <label>
          <span>{{ t('flow.xAxisLabel') }}</span>
          <el-select
            :model-value="getValue(track, 'X')"
            popper-class="app-dialog-select-popper"
            :placeholder="t('flow.selectXAxisField')"
            @update:model-value="setValue(track, 'X', $event)"
          >
            <el-option label="<None>" value="" />
            <el-option v-for="source in availableSources" :key="source" :label="source" :value="source" />
          </el-select>
        </label>
        <label>
          <span>{{ t('flow.yAxisLabel') }}</span>
          <el-select
            :model-value="getValue(track, 'Y')"
            popper-class="app-dialog-select-popper"
            :placeholder="t('flow.selectYAxisField')"
            @update:model-value="setValue(track, 'Y', $event)"
          >
            <el-option label="<None>" value="" />
            <el-option v-for="source in availableSources" :key="source" :label="source" :value="source" />
          </el-select>
        </label>
      </section>
    </div>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">{{ t('flow.cancel') }}</el-button>
      <el-button type="primary" @click="$emit('apply')">{{ t('flow.confirm') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { Aim } from '@element-plus/icons-vue'
import AppDialogTitle from '@/components/AppDialogTitle.vue'
import { t } from '@/i18n'

type DeviationConfig = Record<string, { value: unknown }>

const props = defineProps<{
  modelValue: boolean
  availableSources: string[]
  config: DeviationConfig
}>()

defineEmits<{
  'update:modelValue': [value: boolean]
  apply: []
}>()

function key(track: number, field: 'X' | 'Y' | 'Color'): string {
  return `track${track}${field}`
}

function getValue(track: number, field: 'X' | 'Y' | 'Color'): unknown {
  return props.config[key(track, field)]?.value
}

function setValue(track: number, field: 'X' | 'Y' | 'Color', value: unknown): void {
  const target = props.config[key(track, field)]
  if (target) target.value = value
}
</script>

<style scoped>
.chart-config-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.chart-config-section {
  padding: 14px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface-muted);
}

header,
label {
  display: flex;
  align-items: center;
  gap: 10px;
}

header {
  justify-content: space-between;
  margin-bottom: 14px;
}

h4 {
  margin: 0;
  color: var(--app-text);
}

label + label {
  margin-top: 10px;
}

label span {
  width: 48px;
  color: var(--app-text-secondary);
}

label :deep(.el-select) {
  flex: 1;
}

@media (max-width: 680px) {
  .chart-config-grid {
    grid-template-columns: 1fr;
  }
}
</style>
