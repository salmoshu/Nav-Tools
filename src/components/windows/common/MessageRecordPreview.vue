<script setup lang="ts">
import { computed } from 'vue'
import { splitCsvLine } from '@/core/data/TextRecordParser'
import { inspectMessage, type InspectableMessageFormat } from '@/core/data/MessageViewModel'

const props = defineProps<{
  text: string
  format: InspectableMessageFormat | 'none'
  csvColumns?: readonly string[]
  regex: string
  positionHeaders: readonly string[]
}>()
const cells = computed(() => (props.csvColumns ? splitCsvLine(props.text) : []))
const preview = computed(() =>
  props.csvColumns
    ? null
    : inspectMessage(props.text, props.format, {
        regex: props.regex,
        positionHeaders: props.positionHeaders,
        details: false,
      }),
)
const size = computed(() =>
  props.format === 'rtcm3'
    ? Math.floor(props.text.replace(/\s/g, '').length / 2)
    : new TextEncoder().encode(props.text).length,
)
</script>

<template>
  <template v-if="csvColumns">
    <span
      v-for="(_, index) in csvColumns"
      :key="index"
      class="message-csv-cell"
      :title="cells[index]"
      >{{ cells[index] ?? '' }}</span
    >
  </template>
  <template v-else-if="preview">
    <span class="message-kind" :class="`is-${format}`">{{ preview.code }}</span>
    <span class="message-preview-summary" :title="preview.summary || preview.title">
      {{ preview.summary || preview.title }}
    </span>
    <span v-if="preview.integrity === 'invalid'" class="message-integrity-mark" aria-hidden="true"
      >!</span
    >
    <span class="message-packet-size">{{ size }} B</span>
  </template>
  <span v-else class="message-preview-summary">{{ text }}</span>
</template>

<style scoped>
.message-csv-cell,
.message-preview-summary {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-csv-cell {
  height: 100%;
  align-content: center;
  padding: 0 8px;
  border-inline-start: 1px solid var(--app-border);
}

.message-kind {
  flex: none;
  min-width: 40px;
  padding: 1px 5px;
  border-radius: 4px;
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 12%, var(--app-surface));
  font-size: 10px;
  font-weight: 650;
  text-align: center;
}

.message-kind.is-nmea {
  color: var(--el-color-success);
  background: color-mix(in srgb, var(--el-color-success) 14%, var(--app-surface));
}

.message-integrity-mark {
  color: var(--el-color-danger);
  font-weight: 700;
}

.message-packet-size {
  flex: none;
  margin-inline-start: auto;
  color: var(--app-text-muted);
  font-size: 10px;
}
</style>
