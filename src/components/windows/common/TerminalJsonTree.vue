<template>
  <span class="json-node">
    <template v-if="isObject">
      <button class="json-toggle" type="button" @click="open = !open">
        {{ open ? '▾' : '▸' }}{{ containerLabel }}
      </button>
      <template v-if="open">
        <div v-for="[key, child] in entries" :key="key" class="json-row">
          <span class="json-key">{{ key }}</span>
          <TerminalJsonTree :value="child" :depth="(depth ?? 0) + 1" />
        </div>
      </template>
    </template>
    <span v-else class="json-scalar" :class="scalarClass">{{ scalarText }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  value: unknown
  depth?: number
}>()

const open = ref((props.depth ?? 0) < 2)

const isArray = computed(() => Array.isArray(props.value))
const isObject = computed(
  () => props.value !== null && typeof props.value === 'object',
)
const entries = computed<Array<[string, unknown]>>(() => {
  if (!isObject.value) return []
  if (isArray.value) {
    return (props.value as unknown[]).map((item, index) => [String(index), item])
  }
  return Object.entries(props.value as Record<string, unknown>)
})

const scalarClass = computed(() => {
  if (props.value === null) return 'json-null'
  return `json-${typeof props.value}`
})
const containerLabel = computed(() =>
  isArray.value ? `[${entries.value.length}]` : `{${entries.value.length}}`,
)
const scalarText = computed(() => {
  if (typeof props.value === 'string') return JSON.stringify(props.value)
  return String(props.value)
})
</script>

<style scoped>
.json-node {
  font-family: 'Cascadia Mono', Consolas, 'Noto Sans Mono', monospace;
  font-size: 12px;
  line-height: 1.6;
}
.json-toggle {
  padding: 0 4px 0 0;
  border: 0;
  color: var(--app-text-muted);
  background: transparent;
  cursor: pointer;
  font: inherit;
}
.json-row {
  padding-left: 16px;
  border-left: 1px solid color-mix(in srgb, var(--app-border) 70%, transparent);
}
.json-key {
  margin-right: 6px;
  color: var(--el-color-primary);
}
.json-string {
  color: var(--el-color-success);
}
.json-number {
  color: var(--el-color-warning);
}
.json-boolean {
  color: var(--el-color-danger);
}
.json-null {
  color: var(--app-text-muted);
}
</style>
