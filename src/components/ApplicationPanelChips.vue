<template>
  <div class="panel-list">
    <!-- 徽章区固定单行,按容器实际宽度动态决定完整可见的个数,放不下的收进 +N -->
    <div ref="rowEl" class="panel-list__chips">
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
        <el-icon :size="11"><TopRight /></el-icon>
        <span>{{ t(windowDefinition.title) }}</span>
      </button>
    </div>
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
          <el-icon :size="11"><TopRight /></el-icon>
          <span>{{ t(windowDefinition.title) }}</span>
        </button>
      </div>
    </el-popover>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { TopRight } from '@element-plus/icons-vue'
import { t } from '@/i18n'
import type { WindowDefinition } from '@/settings/config'

const props = defineProps<{
  windows: WindowDefinition[]
}>()

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

/**
 * 逐个累加徽章宽度:一旦当前徽章或其后的「+N」放不下就停,
 * 保证可见徽章全部完整、有溢出时 +N 必有位置。
 */
function measure(): void {
  const row = rowEl.value
  if (!row) return
  const chips = chipEls.filter(Boolean)
  if (chips.length === 0) {
    visibleCount.value = 0
    return
  }
  // 先全部显示拿到真实宽度,再按预算收紧(测量在 nextTick 后的 DOM 上进行)
  visibleCount.value = props.windows.length
  void nextTick(() => {
    const available = row.clientWidth
    if (available <= 0) return
    const widths = chips.map((chip) => chip.offsetWidth)
    let used = 0
    let count = 0
    for (let index = 0; index < widths.length; index++) {
      const itemWidth = widths[index] + (count > 0 ? CHIP_GAP_PX : 0)
      const moreReserve =
        index < widths.length - 1 ? MORE_CHIP_WIDTH_PX + CHIP_GAP_PX : 0
      if (used + itemWidth + moreReserve > available) break
      used += itemWidth
      count++
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
  () => props.windows,
  () => {
    chipEls.length = 0
    void nextTick(measure)
  },
)
</script>

<style scoped>
.panel-list {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 徽章区固定单行:卡片高度不随组件数变化,动态收纳保证不截断文字 */
.panel-list__chips {
  display: flex;
  flex: 1;
  min-width: 0;
  gap: 6px;
  overflow: clip;
  white-space: nowrap;
}

.panel-chip {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
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
  gap: 2px;
  overflow-y: auto;
}

.panel-overflow-popper .panel-overflow__item {
  display: flex;
  align-items: center;
  gap: 6px;
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
