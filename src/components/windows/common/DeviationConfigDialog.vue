<template>
  <el-dialog
    :model-value="modelValue"
    title="轨迹配置"
    width="710px"
    destroy-on-close
    :close-on-click-modal="true"
    :close-on-press-escape="true"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="chart-config-grid">
      <section v-for="track in 4" :key="track" class="chart-config-section">
        <header>
          <h4>轨迹{{ track }}</h4>
          <el-color-picker
            :model-value="getValue(track, 'Color')"
            @update:model-value="setValue(track, 'Color', $event)"
          />
        </header>
        <label>
          <span>X轴：</span>
          <el-select
            :model-value="getValue(track, 'X')"
            placeholder="选择X轴字段"
            @update:model-value="setValue(track, 'X', $event)"
          >
            <el-option label="<None>" value="" />
            <el-option v-for="source in availableSources" :key="source" :label="source" :value="source" />
          </el-select>
        </label>
        <label>
          <span>Y轴：</span>
          <el-select
            :model-value="getValue(track, 'Y')"
            placeholder="选择Y轴字段"
            @update:model-value="setValue(track, 'Y', $event)"
          >
            <el-option label="<None>" value="" />
            <el-option v-for="source in availableSources" :key="source" :label="source" :value="source" />
          </el-select>
        </label>
      </section>
    </div>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" @click="$emit('apply')">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
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
  border-radius: 6px;
}

header,
label {
  display: flex;
  align-items: center;
  gap: 10px;
}

header {
  justify-content: center;
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
</style>
