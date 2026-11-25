<template>
  <!-- 徽章区固定两行流式布局:按容器实际宽度动态决定完整可见的个数,+N 排在行末,余下收进弹层 -->
  <div
    ref="rowEl"
    class="panel-list"
    :class="{ 'panel-list--compact': compact }"
    :style="{ maxHeight: `${maxRows * 26 + (maxRows - 1) * 6}px` }"
  >
    <button
      v-for="(windowDefinition, index) in windows"
      v-show="index < visibleCount"
      :key="windowDefinition.id"
      :ref="(element) => collectChip(index, element)"
      type="button"
      class="panel-chip"
      :title="t('app.selector.openComponentWindow', { v: t(windowDefinition.title) })"
      @click.stop="emit('open', windowDefinition.id)"
    >
      <SquareArrowOutUpRight :size="12" :stroke-width="2" aria-hidden="true" />
      <span>{{ t(windowDefinition.title) }}</span>
    </button>
    <el-popover
      v-if="windows.length > visibleCount"
      placement="bottom-start"
      trigger="hover"
      :width="260"
      :teleported="true"
      popper-class="panel-overflow-popper"
    >
      <template #reference>
        <button
          type="button"
          class="panel-chip panel-chip--more"
          :title="t('app.selector.moreComponents')"
        >
          +{{ windows.length - visibleCount }}
        </button>
      </template>
      <div class="panel-overflow">
        <button
          v-for="windowDefinition in windows.slice(visibleCount)"
          :key="windowDefinition.id"
          type="button"
          class="panel-overflow__item"
          @click="emit('open', windowDefinition.id)"
        >
          <SquareArrowOutUpRight :size="12" :stroke-width="2" aria-hidden="true" />
          <span>{{ t(windowDefinition.title) }}</span>
        </button>
      </div>
    </el-popover>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { SquareArrowOutUpRight } from '@lucide/vue'
import { t } from '@/i18n'
import type { WindowDefinition } from '@/settings/config'

const props = withDefaults(
  defineProps<{
    windows: WindowDefinition[]
    maxRows?: number
    compact?: boolean
  }>(),
  { maxRows: 2, compact: false },
)

const emit = defineEmits<{
  open: [windowId: string]
}>()

const CHIP_GAP_PX = 6
/** 「+N」角标宽度估算:两位数也按这个预算,宁少勿溢出 */
const MORE_CHIP_WIDTH_PX = 44

const rowEl = ref<HTMLElement | null>(null)
const chipEls: HTMLElement[] = []
const visibleCount = ref(props.windows.length)

function collectChip(index: number, element: unknown): void {
  if (element instanceof HTMLElement) chipEls[index] = element
}

/** 贪心流式装箱:逐个放入徽章,行宽用尽换行,超过 maxRows 停止。 */
function packItems(widths: number[], available: number, maxRows: number): number {
  let rows = 1
  let usedInRow = 0
  let count = 0
  for (const width of widths) {
    const gap = usedInRow > 0 ? CHIP_GAP_PX : 0
    if (usedInRow + gap + width > available) {
      if (rows >= maxRows) break
      rows++
      usedInRow = width
    } else {
      usedInRow += gap + width
    }
    count++
  }
  return count
}

/** 给「+N」预留末尾位置，确保行模式也只占指定的一行。 */
function measure(): void {
  const row = rowEl.value
  if (!row) return
  const chips = chipEls.filter(Boolean)
  if (chips.length === 0) {
    visibleCount.value = 0
    return
  }
  visibleCount.value = props.windows.length
  void nextTick(() => {
    const available = row.clientWidth
    if (available <= 0) return
    const widths = chips.map((chip) => chip.offsetWidth)
    const rows = Math.max(1, Math.min(4, Math.floor(props.maxRows)))
    let count = packItems(widths, available, rows)
    if (count < widths.length) {
      count = Math.max(0, packItems([...widths, MORE_CHIP_WIDTH_PX], available, rows) - 1)
    }
    visibleCount.value = count
  })
}

let resizeObserver: ResizeObserver | undefined

onMounted(() => {
  resizeObserver = new ResizeObserver(() => measure())
  if (rowEl.value) resizeObserver.observe(rowEl.value)
  void nextTick(measure)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = undefined
})

watch(
  () => [props.windows, props.maxRows, props.compact] as const,
  () => {
    chipEls.length = 0
    void nextTick(measure)
  },
)
</script>

<style scoped>
/* 两行流式徽章:动态收纳保证不截断文字、不溢出卡片 */
.panel-list {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: var(--ui-space-sm);
  overflow: clip;
}

.panel-list--compact {
  gap: var(--ui-space-xs);
}

.panel-list--compact .panel-chip {
  padding: 2px 6px;
  font-size: 11px;
}

.panel-chip {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--ui-space-xs);
  padding: 3px 7px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  color: var(--app-text-secondary);
  background: var(--app-surface-muted);
  font-size: 12px;
  cursor: pointer;
  transition:
    border-color 120ms ease,
    color 120ms ease,
    background 120ms ease;
}

.panel-chip:hover,
.panel-chip:focus-visible {
  border-color: var(--application-accent);
  color: var(--app-text);
  background: color-mix(in srgb, var(--application-accent) 10%, var(--app-surface));
  outline: none;
}

.panel-chip--more {
  font-weight: 600;
}
</style>

<style>
/* +N 弹层内容 teleport 到 body,scoped 样式够不到,走全局 */
.panel-overflow-popper .panel-overflow {
  display: flex;
  max-height: 260px;
  flex-direction: column;
  gap: var(--ui-space-tight);
  overflow-y: auto;
}

.panel-overflow-popper .panel-overflow__item {
  display: flex;
  align-items: center;
  gap: var(--ui-space-sm);
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  color: var(--app-text-secondary);
  background: transparent;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.panel-overflow-popper .panel-overflow__item:hover,
.panel-overflow-popper .panel-overflow__item:focus-visible {
  color: var(--app-text);
  background: var(--app-surface-muted);
  outline: none;
}
</style>
