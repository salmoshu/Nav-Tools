<template>
  <div
    ref="railElement"
    class="block-rail"
    role="navigation"
    :aria-label="t('common.terminal.guiBlockRail')"
  >
    <button
      v-for="entry in entries"
      :key="entry.id"
      type="button"
      class="block-rail__entry"
      :class="[
        `is-${entry.status}`,
        { 'is-active': entry.id === activeId, 'is-nav': entry.id === navId },
      ]"
      :data-rail-id="entry.id"
      :title="entry.title"
      @click="emit('select', entry.index)"
    >
      <span class="block-rail__dot" aria-hidden="true"></span>
      <span class="block-rail__command">{{ entry.command || unknownLabel }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
// 命令块预览导航条（zcode 对话预览条同款交互）：逐块一行（状态点 + 命令单行），
// 点击跳转对应块；条目超出可视高度时自身可滚动；主视图滚动时高亮当前块并
// 保持其可见（nearest，不抢用户自己的预览条滚动）；吸底时新块到达自动滚到底。
import { nextTick, onMounted, ref, watch } from 'vue'
import { useTerminalTranslate } from '@/core/terminal/TerminalI18n'

export interface TerminalBlockRailEntry {
  id: number
  /** 块在会话块列表里的下标，点击时回传给父级做跳转 */
  index: number
  /** 命令文本（可能为空，空时显示 unknownLabel） */
  command: string
  /** 与块头一致的状态：success / error / running */
  status: string
  /** 悬浮提示（命令 · 目录 · 时间 · 退出码，父级已格式化翻译） */
  title: string
}

const props = defineProps<{
  entries: TerminalBlockRailEntry[]
  /** 主视图当前视口锚线命中的块 id */
  activeId?: number
  /** 键盘/预览条导航选中的块 id（高亮优先于 activeId） */
  navId?: number
  /** 主视图吸底中：新块到达时预览条同步滚到底 */
  followTail: boolean
  /** 无命令文本块的占位标签（父级已翻译） */
  unknownLabel: string
}>()
const emit = defineEmits<{ select: [index: number] }>()

const t = useTerminalTranslate()
const railElement = ref<HTMLDivElement | null>(null)

function scrollEntryIntoView(id: number | undefined, smooth = false): void {
  if (id === undefined) return
  railElement.value
    ?.querySelector(`[data-rail-id="${id}"]`)
    ?.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' })
}

// 导航块（键盘/点击选中）变化：平滑滚动保持可见
watch(
  () => props.navId,
  (id) => scrollEntryIntoView(id, true),
)
// 当前块（主视图滚动位置）变化：无导航选中时才跟随，避免与显式导航打架
watch(
  () => props.activeId,
  (id) => {
    if (props.navId === undefined) scrollEntryIntoView(id)
  },
)
// 新块到达且主视图吸底：预览条同步滚到底
watch(
  () => props.entries.length,
  async () => {
    if (!props.followTail) return
    await nextTick()
    const element = railElement.value
    if (element) element.scrollTop = element.scrollHeight
  },
)

// 挂载时 entries 已就位（length watcher 不会触发）：同样按吸底初始化
onMounted(async () => {
  await nextTick()
  if (props.followTail && railElement.value) {
    railElement.value.scrollTop = railElement.value.scrollHeight
  }
})
</script>

<style scoped>
.block-rail {
  flex: 0 0 136px;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 6px 6px 4px;
  border-left: 1px solid color-mix(in srgb, var(--terminal-fg) 12%, transparent);
  display: flex;
  flex-direction: column;
  gap: 2px;
  scrollbar-width: thin;
}
.block-rail__entry {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  padding: 2px 6px;
  border: none;
  border-left: 2px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: color-mix(in srgb, var(--terminal-fg) 68%, transparent);
  font-size: 11px;
  line-height: 1.3;
  text-align: left;
  cursor: pointer;
}
.block-rail__entry:hover {
  background: color-mix(in srgb, var(--terminal-fg) 8%, transparent);
  color: var(--terminal-fg);
}
.block-rail__entry.is-active {
  background: color-mix(in srgb, var(--terminal-fg) 10%, transparent);
  color: var(--terminal-fg);
}
.block-rail__entry.is-nav {
  border-left-color: var(--el-color-primary);
}
.block-rail__dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--terminal-fg) 35%, transparent);
}
.block-rail__entry.is-success .block-rail__dot {
  background: var(--el-color-success);
}
.block-rail__entry.is-error .block-rail__dot {
  background: var(--el-color-error);
}
.block-rail__entry.is-running .block-rail__dot {
  background: var(--el-color-primary);
  animation: block-rail-pulse 1.1s ease-in-out infinite;
}
@keyframes block-rail-pulse {
  50% {
    opacity: 0.3;
  }
}
.block-rail__command {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--terminal-font-family, monospace);
}
</style>
