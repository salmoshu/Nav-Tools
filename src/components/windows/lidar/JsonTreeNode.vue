<template>
  <div class="json-node">
    <div class="json-row" :style="{ paddingLeft: depth * 14 + 'px' }">
      <span
        v-if="isExpandable"
        class="json-caret"
        :class="{ open: expanded }"
        @click.stop="expanded = !expanded"
      >▶</span>
      <span v-else class="json-caret-placeholder"></span>
      <span class="json-key" v-if="label !== undefined">{{ label }}<i class="json-colon">:</i></span>
      <span class="json-value" :class="valueClass">{{ preview }}</span>
      <span class="json-copy" v-if="isExpandable" @click.stop="copy" :title="t('lidar.inspector.copy')">⧉</span>
    </div>
    <template v-if="isExpandable && expanded">
      <JsonTreeNode
        v-for="child in childEntries.slice(0, MAX_CHILDREN)"
        :key="child.key"
        :label="child.key"
        :value="child.value"
        :depth="depth + 1"
      />
      <div class="json-more" :style="{ paddingLeft: (depth + 1) * 14 + 'px' }" v-if="childEntries.length > MAX_CHILDREN">
        … +{{ childEntries.length - MAX_CHILDREN }}
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { t } from '@/i18n'

const props = defineProps<{
  label?: string
  value: unknown
  depth?: number
}>()

const MAX_CHILDREN = 50
const depth = props.depth ?? 0
const expanded = ref(depth < 3)

const typedArrayName = computed(() => {
  const value = props.value
  if (value instanceof Float32Array) return 'Float32Array'
  if (value instanceof Float64Array) return 'Float64Array'
  if (value instanceof Uint8Array) return 'Uint8Array'
  if (value instanceof Int8Array) return 'Int8Array'
  if (value instanceof Int16Array) return 'Int16Array'
  if (value instanceof Uint16Array) return 'Uint16Array'
  if (value instanceof Int32Array) return 'Int32Array'
  if (value instanceof Uint32Array) return 'Uint32Array'
  return undefined
})

const isExpandable = computed(() => !!typedArrayName.value || isPlainObjectLike(props.value))

function isPlainObjectLike(value: unknown): value is Record<string, unknown> | unknown[] {
  if (Array.isArray(value)) return true
  if (typeof value === 'object' && value !== null) {
    const proto = Object.getPrototypeOf(value)
    return proto === Object.prototype || proto === null
  }
  return false
}

const childEntries = computed<{ key: string; value: unknown }[]>(() => {
  const value = props.value
  if (typedArrayName.value) {
    const array = value as ArrayLike<number>
    const list: { key: string; value: unknown }[] = []
    const shown = Math.min(array.length, 8)
    for (let i = 0; i < shown; i++) list.push({ key: String(i), value: array[i] })
    return list
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => ({ key: String(index), value: entry }))
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value as Record<string, unknown>).map(([key, entry]) => ({ key, value: entry }))
  }
  return []
})

const preview = computed(() => {
  const value = props.value
  if (typedArrayName.value) return `${typedArrayName.value}(${(value as ArrayLike<number>).length})`
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : String(value)
  if (typeof value === 'bigint') return `${value}n`
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return `Array(${value.length})`
  if (typeof value === 'object') return '{…}'
  return String(value)
})

const valueClass = computed(() => {
  const value = props.value
  if (typeof value === 'string') return 'v-string'
  if (typeof value === 'number' || typeof value === 'bigint') return 'v-number'
  if (typeof value === 'boolean') return 'v-bool'
  if (typedArrayName.value || Array.isArray(value)) return 'v-array'
  if (isExpandable.value) return 'v-object'
  return 'v-null'
})

async function copy(): Promise<void> {
  try {
    const value = props.value
    const text = JSON.stringify(value, (_key, entry) =>
      typeof entry === 'object' && entry !== null && ArrayBuffer.isView(entry)
        ? Array.from(entry as unknown as ArrayLike<number>)
        : entry,
    )
    await navigator.clipboard.writeText(text)
  } catch {
    // 剪贴板不可用时静默
  }
}
</script>

<script lang="ts">
// 递归组件：name 显式声明以便自引用
export default { name: 'JsonTreeNode' }
</script>

<style scoped>
.json-node {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.7;
}

.json-row {
  display: flex;
  align-items: baseline;
  gap: 5px;
  white-space: nowrap;
}

.json-caret {
  cursor: pointer;
  display: inline-block;
  width: 12px;
  font-size: 9px;
  transform: rotate(0deg);
  transition: transform 0.12s;
  color: var(--app-text-secondary);
  user-select: none;
}

.json-caret.open {
  transform: rotate(90deg);
}

.json-caret-placeholder {
  display: inline-block;
  width: 12px;
}

.json-key {
  color: #b18cff;
}

.json-colon {
  color: var(--app-text-secondary);
  font-style: normal;
  margin-left: 1px;
}

.v-string { color: #7dd87d; }
.v-number { color: #5ab8f5; }
.v-bool { color: #f59e0b; }
.v-array { color: var(--app-text-secondary); }
.v-object { color: var(--app-text-secondary); }
.v-null { color: var(--app-text-secondary); }

.json-copy {
  cursor: pointer;
  opacity: 0.45;
  font-size: 11px;
}

.json-copy:hover {
  opacity: 1;
}

.json-more {
  color: var(--app-text-secondary);
}
</style>
