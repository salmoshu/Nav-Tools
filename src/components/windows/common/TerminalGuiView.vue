<template>
  <div class="terminal-gui-view">
    <div ref="scrollElement" class="terminal-gui-view__blocks">
      <div v-if="blocks.length === 0" class="gui-empty" role="status">
        <span class="gui-empty__icon"><LayoutGrid /></span>
        <strong>{{ t('common.terminal.guiEmptyTitle') }}</strong>
        <small>{{ t('common.terminal.guiEmptyDescription') }}</small>
      </div>
      <article
        v-for="block in blocks"
        :key="block.id"
        class="command-block"
        :class="blockStatus(block)"
      >
        <header class="command-block__header" @click="toggleCollapsed(block.id)">
          <span class="command-block__status" aria-hidden="true"></span>
          <span class="command-block__command" :title="block.command">{{
            block.command || t('common.terminal.guiUnknownCommand')
          }}</span>
          <span class="command-block__meta">
            <span
              v-if="block.exitCode !== undefined && block.exitCode !== 0"
              class="command-block__exit-code"
              >{{ t('common.terminal.guiExitCode', { code: block.exitCode }) }}</span
            >
            <span class="command-block__time">{{ formatTime(block.startedAt) }}</span>
          </span>
          <span class="command-block__actions" @click.stop>
            <el-tooltip
              :content="t('common.terminal.copyOutput')"
              placement="bottom"
              :show-after="400"
            >
              <el-button
                text
                class="command-block__action"
                :aria-label="t('common.terminal.copyOutput')"
                @click="$emit('copy', displayOutput(block))"
                ><el-icon><CopyDocument /></el-icon
              ></el-button>
            </el-tooltip>
            <el-tooltip
              v-if="block.command"
              :content="t('common.terminal.rerunCommand')"
              placement="bottom"
              :show-after="400"
            >
              <el-button
                text
                class="command-block__action"
                :aria-label="t('common.terminal.rerunCommand')"
                @click="$emit('rerun', block.command || '')"
                ><el-icon><RefreshRight /></el-icon
              ></el-button>
            </el-tooltip>
            <el-tooltip
              :content="
                collapsed.has(block.id)
                  ? t('common.terminal.expandBlock')
                  : t('common.terminal.collapseBlock')
              "
              placement="bottom"
              :show-after="400"
            >
              <el-button
                text
                class="command-block__action"
                :aria-label="t('common.terminal.collapseBlock')"
                @click="toggleCollapsed(block.id)"
                ><el-icon
                  ><component :is="collapsed.has(block.id) ? ArrowDownBold : ArrowUpBold" /></el-icon
              ></el-button>
            </el-tooltip>
          </span>
        </header>
        <template v-if="!collapsed.has(block.id)">
          <TerminalRichContent
            v-for="(payload, index) in block.rich ?? []"
            :key="`${block.id}-${index}`"
            :payload="payload"
          />
          <pre v-if="displayOutput(block)" class="command-block__output">{{ displayOutput(block) }}<span v-if="block.truncated" class="command-block__truncated">{{ t('common.terminal.guiOutputTruncated') }}</span></pre>
        </template>
      </article>
    </div>
    <div class="gui-input-row">
      <el-icon class="gui-input-row__prompt"><ChevronRight /></el-icon>
      <input
        v-model="draft"
        class="gui-input"
        type="text"
        spellcheck="false"
        autocomplete="off"
        :placeholder="t('common.terminal.guiInputPlaceholder')"
        :aria-label="t('common.terminal.guiInputPlaceholder')"
        @keydown="handleInputKeydown"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { ArrowDownBold, ArrowUpBold, CopyDocument, RefreshRight } from '@element-plus/icons-vue'
import { ChevronRight, LayoutGrid } from '@lucide/vue'
import { t } from '@/i18n'
import { stripAnsiSequences, type TerminalCommandBlock } from '@/core/terminal/CommandBlocks'
import TerminalRichContent from './TerminalRichContent.vue'

const props = defineProps<{
  blocks: TerminalCommandBlock[]
}>()
const emit = defineEmits<{
  rerun: [command: string]
  copy: [text: string]
  submit: [text: string]
}>()

const scrollElement = ref<HTMLDivElement | null>(null)
const collapsed = ref<Set<number>>(new Set())
/** 用户回滚查看历史时不再强制吸底 */
let stickToBottom = true

const draft = ref('')
/** 会话内输入历史,↑/↓ 翻阅;仅存内存,不持久化 */
const history: string[] = []
let historyIndex = -1

function handleInputKeydown(event: KeyboardEvent): void {
  // 输入法组词期间的回车是选词,不应提交
  if (event.isComposing) return
  if (event.key === 'Enter') {
    const command = draft.value.trim()
    if (!command) return
    history.push(command)
    if (history.length > 100) history.shift()
    historyIndex = -1
    draft.value = ''
    emit('submit', command)
    return
  }
  if (event.key === 'ArrowUp') {
    if (history.length === 0) return
    event.preventDefault()
    historyIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1)
    draft.value = history[historyIndex]
    return
  }
  if (event.key === 'ArrowDown') {
    if (historyIndex === -1) return
    event.preventDefault()
    historyIndex += 1
    if (historyIndex >= history.length) {
      historyIndex = -1
      draft.value = ''
    } else {
      draft.value = history[historyIndex]
    }
  }
}

function displayOutput(block: TerminalCommandBlock): string {
  return stripAnsiSequences(block.output).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
}

function blockStatus(block: TerminalCommandBlock): string {
  if (block.finishedAt === undefined) return 'running'
  return block.exitCode === undefined || block.exitCode === 0 ? 'success' : 'error'
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function toggleCollapsed(id: number): void {
  const next = new Set(collapsed.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsed.value = next
}

function handleScroll(): void {
  const element = scrollElement.value
  if (!element) return
  stickToBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 40
}

watch(
  () => props.blocks,
  async () => {
    await nextTick()
    const element = scrollElement.value
    if (element && stickToBottom) element.scrollTop = element.scrollHeight
  },
)

watch(scrollElement, (element, previous) => {
  previous?.removeEventListener('scroll', handleScroll)
  element?.addEventListener('scroll', handleScroll, { passive: true })
})
</script>

<style scoped>
/* 终端画布固定为深色(--terminal-bg),GUI 视图整体取终端配色而非应用浅色表面 */
.terminal-gui-view {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--terminal-bg);
  text-align: left;
}
.terminal-gui-view__blocks {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
}
.gui-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: color-mix(in srgb, var(--terminal-fg) 55%, transparent);
  text-align: center;
}
.gui-empty__icon {
  display: grid;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 18%, var(--terminal-bg));
  place-items: center;
}
.gui-empty strong {
  font-size: 13px;
  font-weight: 650;
  color: var(--terminal-fg);
}
.gui-empty small {
  font-size: 11px;
  line-height: 1.5;
  max-width: 320px;
}
.command-block {
  flex: none;
  border: 1px solid color-mix(in srgb, var(--terminal-fg) 9%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--terminal-fg) 4%, var(--terminal-bg));
  overflow: hidden;
}
.command-block__header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 3px 8px;
  cursor: pointer;
  user-select: none;
}
.command-block__status {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 50%;
  background: color-mix(in srgb, var(--terminal-fg) 40%, transparent);
}
.command-block.success .command-block__status {
  background: var(--el-color-success);
}
.command-block.error .command-block__status {
  background: var(--el-color-danger);
}
.command-block.running .command-block__status {
  background: var(--el-color-warning);
}
.command-block__command {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--terminal-fg);
  font-family: 'Cascadia Mono', Consolas, 'Noto Sans Mono', monospace;
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.command-block__meta {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
}
.command-block__exit-code {
  padding: 0 6px;
  border-radius: 5px;
  color: var(--el-color-danger);
  background: color-mix(in srgb, var(--el-color-danger) 18%, transparent);
  font-size: 10px;
  line-height: 16px;
}
.command-block__time {
  color: color-mix(in srgb, var(--terminal-fg) 45%, transparent);
  font-size: 10px;
}
.command-block__actions {
  display: flex;
  flex: none;
  align-items: center;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.command-block:hover .command-block__actions,
.command-block:focus-within .command-block__actions {
  opacity: 1;
}
.command-block__actions :deep(.command-block__action) {
  width: 20px;
  height: 20px;
  margin: 0;
  padding: 0;
  border-radius: 5px;
  color: color-mix(in srgb, var(--terminal-fg) 55%, transparent);
}
.command-block__actions :deep(.command-block__action:hover) {
  color: var(--terminal-fg);
  background: color-mix(in srgb, var(--terminal-fg) 10%, transparent);
}
.command-block__output {
  margin: 0;
  padding: 8px 10px;
  border-top: 1px solid color-mix(in srgb, var(--terminal-fg) 8%, transparent);
  color: color-mix(in srgb, var(--terminal-fg) 88%, transparent);
  background: var(--terminal-bg);
  font-family: 'Cascadia Mono', Consolas, 'Noto Sans Mono', monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-all;
  user-select: text;
}
.command-block__output:empty {
  display: none;
}
.command-block__truncated {
  display: block;
  margin-top: 4px;
  color: var(--el-color-warning);
  font-size: 10px;
}
.gui-input-row {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-top: 1px solid color-mix(in srgb, var(--terminal-fg) 10%, transparent);
  background: color-mix(in srgb, var(--terminal-fg) 4%, var(--terminal-bg));
}
.gui-input-row:focus-within {
  background: color-mix(in srgb, var(--terminal-fg) 7%, var(--terminal-bg));
}
.gui-input-row__prompt {
  flex: none;
  color: var(--el-color-primary);
  font-size: 14px;
}
.gui-input {
  flex: 1;
  min-width: 0;
  padding: 0;
  border: none;
  outline: none;
  color: var(--terminal-fg);
  background: transparent;
  font-family: 'Cascadia Mono', Consolas, 'Noto Sans Mono', monospace;
  font-size: 12px;
  line-height: 20px;
}
.gui-input::placeholder {
  color: color-mix(in srgb, var(--terminal-fg) 38%, transparent);
}
</style>
