<template>
  <div class="rich-content" :class="`rich-content--${kind}`">
    <pre v-if="kind === 'text'" class="rich-text">{{ text }}</pre>
    <!-- markdown 渲染输出由 MarkdownLite 先全文转义再变换,可安全 v-html -->
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div v-else-if="kind === 'markdown'" class="rich-markdown" v-html="markdownHtml"></div>
    <TerminalJsonTree v-else-if="kind === 'json'" :value="jsonValue" />
    <table v-else-if="kind === 'csv'" class="rich-csv">
      <thead v-if="csvRows.length > 0">
        <tr>
          <th v-for="(cell, index) in csvRows[0]" :key="index">{{ cell }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, rowIndex) in csvRows.slice(1)" :key="rowIndex">
          <td v-for="(cell, cellIndex) in row" :key="cellIndex">{{ cell }}</td>
        </tr>
      </tbody>
    </table>
    <img
      v-else-if="kind === 'image'"
      class="rich-image"
      :src="imageSrc"
      :alt="payload.mime"
      loading="lazy"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { decodeBase64Text, type TerminalRichPayload } from '@/core/terminal/CommandBlocks'
import { renderMarkdownLite } from '@/core/terminal/MarkdownLite'
import { parseCsv } from '@/core/terminal/CsvLite'
import TerminalJsonTree from './TerminalJsonTree.vue'

const props = defineProps<{
  payload: TerminalRichPayload
}>()

const kind = computed(() => {
  if (props.payload.mime === 'text/markdown') return 'markdown'
  if (props.payload.mime === 'application/json') return 'json'
  if (props.payload.mime === 'text/csv') return 'csv'
  if (props.payload.mime.startsWith('image/')) return 'image'
  return 'text'
})

const text = computed(() => decodeBase64Text(props.payload.data))
const markdownHtml = computed(() => renderMarkdownLite(text.value))
const jsonValue = computed<unknown>(() => {
  try {
    return JSON.parse(text.value)
  } catch {
    return { error: 'invalid JSON', raw: text.value.slice(0, 500) }
  }
})
const csvRows = computed(() => parseCsv(text.value))
const imageSrc = computed(() => `data:${props.payload.mime};base64,${props.payload.data}`)
</script>

<style scoped>
.rich-content {
  padding: 8px 10px;
  border-top: 1px solid color-mix(in srgb, var(--terminal-fg) 8%, transparent);
  color: color-mix(in srgb, var(--terminal-fg) 88%, transparent);
  background: var(--terminal-bg);
  font-size: 12px;
  line-height: 1.6;
  overflow-x: auto;
  text-align: left;
}
.rich-text {
  margin: 0;
  font-family: 'Cascadia Mono', Consolas, 'Noto Sans Mono', monospace;
  white-space: pre-wrap;
  word-break: break-all;
}
.rich-image {
  display: block;
  max-width: 100%;
  border-radius: 6px;
}
.rich-csv {
  border-collapse: collapse;
  font-size: 12px;
}
.rich-csv th,
.rich-csv td {
  padding: 3px 10px;
  border: 1px solid color-mix(in srgb, var(--terminal-fg) 14%, transparent);
  text-align: left;
  white-space: pre-wrap;
}
.rich-csv th {
  background: color-mix(in srgb, var(--terminal-fg) 8%, transparent);
  font-weight: 650;
}
.rich-markdown {
  line-height: 1.65;
}
.rich-markdown :deep(h1),
.rich-markdown :deep(h2),
.rich-markdown :deep(h3),
.rich-markdown :deep(h4) {
  margin: 10px 0 6px;
  line-height: 1.35;
}
.rich-markdown :deep(h1) {
  font-size: 18px;
}
.rich-markdown :deep(h2) {
  font-size: 16px;
}
.rich-markdown :deep(h3) {
  font-size: 14px;
}
.rich-markdown :deep(p) {
  margin: 6px 0;
}
.rich-markdown :deep(ul),
.rich-markdown :deep(ol) {
  margin: 6px 0;
  padding-left: 22px;
}
.rich-markdown :deep(code) {
  padding: 1px 5px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--terminal-fg) 9%, transparent);
  font-family: 'Cascadia Mono', Consolas, 'Noto Sans Mono', monospace;
  font-size: 11px;
}
.rich-markdown :deep(.md-code) {
  margin: 8px 0;
  padding: 8px 10px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--terminal-fg) 9%, transparent);
  overflow-x: auto;
}
.rich-markdown :deep(.md-code code) {
  padding: 0;
  background: transparent;
  font-size: 12px;
  line-height: 1.55;
}
.rich-markdown :deep(blockquote) {
  margin: 6px 0;
  padding: 2px 10px;
  border-left: 3px solid var(--el-color-primary);
  color: color-mix(in srgb, var(--terminal-fg) 60%, transparent);
}
.rich-markdown :deep(a) {
  color: var(--el-color-primary);
}
.rich-markdown :deep(.md-table) {
  border-collapse: collapse;
  margin: 8px 0;
}
.rich-markdown :deep(.md-table th),
.rich-markdown :deep(.md-table td) {
  padding: 3px 10px;
  border: 1px solid color-mix(in srgb, var(--terminal-fg) 14%, transparent);
  text-align: left;
}
.rich-markdown :deep(.md-table th) {
  background: color-mix(in srgb, var(--terminal-fg) 8%, transparent);
}
.rich-markdown :deep(hr) {
  border: 0;
  border-top: 1px solid color-mix(in srgb, var(--terminal-fg) 12%, transparent);
  margin: 10px 0;
}
</style>
