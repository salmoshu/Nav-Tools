<template>
  <div class="terminal-gui-view">
    <div ref="scrollElement" class="terminal-gui-view__blocks">
      <div v-if="blocks.length === 0" class="gui-empty" role="status">
        <span class="gui-empty__icon"><LayoutGrid /></span>
        <strong>{{ t('common.terminal.guiEmptyTitle') }}</strong>
        <small>{{ t('common.terminal.guiEmptyDescription') }}</small>
      </div>
      <article
        v-for="entry in renderedBlocks"
        :key="entry.block.id"
        class="command-block"
        :class="blockStatus(entry.block)"
        :data-block-id="entry.block.id"
      >
        <header class="command-block__header" @click="toggleCollapsed(entry.block.id)">
          <span class="command-block__status" aria-hidden="true"></span>
          <span class="command-block__command" :title="entry.block.command">{{
            entry.block.command || t('common.terminal.guiUnknownCommand')
          }}</span>
          <span class="command-block__meta">
            <span v-if="entry.block.cwd" class="command-block__cwd" :title="entry.block.cwd">{{
              entry.block.cwd
            }}</span>
            <span
              v-if="entry.block.exitCode !== undefined && entry.block.exitCode !== 0"
              class="command-block__exit-code"
              >{{ t('common.terminal.guiExitCode', { code: entry.block.exitCode }) }}</span
            >
            <span class="command-block__time">{{ formatTime(entry.block.startedAt) }}</span>
          </span>
          <span class="command-block__actions" @click.stop>
            <el-tooltip
              v-if="entry.sniffedPayload"
              :content="
                rawView.has(entry.block.id)
                  ? t('common.terminal.guiShowRendered')
                  : t('common.terminal.guiShowRaw')
              "
              placement="bottom"
              :show-after="400"
            >
              <el-button
                text
                class="command-block__action"
                :aria-label="t('common.terminal.guiShowRaw')"
                @click="toggleRawView(entry.block.id)"
                ><el-icon><View /></el-icon
              ></el-button>
            </el-tooltip>
            <el-tooltip
              :content="t('common.terminal.copyOutput')"
              placement="bottom"
              :show-after="400"
            >
              <el-button
                text
                class="command-block__action"
                :aria-label="t('common.terminal.copyOutput')"
                @click="$emit('copy', entry.output)"
                ><el-icon><CopyDocument /></el-icon
              ></el-button>
            </el-tooltip>
            <el-tooltip
              v-if="entry.block.command"
              :content="t('common.terminal.rerunCommand')"
              placement="bottom"
              :show-after="400"
            >
              <el-button
                text
                class="command-block__action"
                :aria-label="t('common.terminal.rerunCommand')"
                @click="$emit('rerun', entry.block.command || '')"
                ><el-icon><RefreshRight /></el-icon
              ></el-button>
            </el-tooltip>
            <el-tooltip
              :content="
                collapsed.has(entry.block.id)
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
                @click="toggleCollapsed(entry.block.id)"
                ><el-icon
                  ><component
                    :is="collapsed.has(entry.block.id) ? ArrowDownBold : ArrowUpBold"
                  /></el-icon
              ></el-button>
            </el-tooltip>
          </span>
        </header>
        <template v-if="!collapsed.has(entry.block.id)">
          <TerminalRichContent
            v-for="(payload, index) in entry.block.rich ?? []"
            :key="`${entry.block.id}-${index}`"
            :payload="payload"
          />
          <!-- 嗅探命中且未被用户切回原始:富化渲染;否则按可点击路径的普通文本 -->
          <TerminalRichContent
            v-if="entry.sniffedPayload && !rawView.has(entry.block.id)"
            :payload="entry.sniffedPayload"
          />
          <div v-else-if="entry.output" class="command-block__output">
            <template v-for="(segment, index) in entry.segments" :key="index">
              <a
                v-if="segment.path && isExistingPath(segment.path.path)"
                class="command-block__path"
                :title="t('common.terminal.guiPathClickHint')"
                href="#"
                @click.prevent="togglePreview(entry.block, segment.path)"
                ><template v-if="segment.parts.length">
                  <span
                    v-for="(part, partIndex) in segment.parts"
                    :key="partIndex"
                    class="search-hit"
                    :class="{ 'is-hit': part.hit, 'is-current': part.current }"
                    >{{ part.text }}</span
                  >
                </template>
                <template v-else>{{ segment.text }}</template></a
              >
              <span
                v-else-if="segment.path"
                class="command-block__path-candidate"
                @mouseenter="probePath(segment.path)"
                ><template v-if="segment.parts.length">
                  <span
                    v-for="(part, partIndex) in segment.parts"
                    :key="partIndex"
                    class="search-hit"
                    :class="{ 'is-hit': part.hit, 'is-current': part.current }"
                    >{{ part.text }}</span
                  >
                </template>
                <template v-else>{{ segment.text }}</template></span
              >
              <span v-else-if="segment.parts.length"
                ><span
                  v-for="(part, partIndex) in segment.parts"
                  :key="partIndex"
                  class="search-hit"
                  :class="{ 'is-hit': part.hit, 'is-current': part.current }"
                  >{{ part.text }}</span
                ></span
              >
              <span v-else>{{ segment.text }}</span>
            </template>
            <span v-if="entry.block.truncated" class="command-block__truncated">{{
              t('common.terminal.guiOutputTruncated')
            }}</span>
          </div>
          <div v-if="previews.get(entry.block.id)" class="command-block__preview">
            <div class="command-block__preview-header">
              <span class="command-block__preview-path">{{ previews.get(entry.block.id)!.path }}</span>
              <el-button
                text
                class="command-block__action"
                :aria-label="t('common.terminal.guiPreviewClose')"
                @click="closePreview(entry.block.id)"
                ><el-icon><CloseBold /></el-icon
              ></el-button>
            </div>
            <div v-if="previews.get(entry.block.id)!.status === 'loading'" class="command-block__preview-note">
              {{ t('common.terminal.guiPreviewLoading') }}
            </div>
            <div
              v-else-if="previews.get(entry.block.id)!.status === 'unavailable'"
              class="command-block__preview-note"
            >
              {{ t('common.terminal.guiPreviewUnavailable') }}
            </div>
            <template v-else>
              <TerminalRichContent :payload="previews.get(entry.block.id)!.payload!" />
              <span
                v-if="previews.get(entry.block.id)!.truncated"
                class="command-block__preview-note"
                >{{ t('common.terminal.guiPreviewTruncated') }}</span
              >
            </template>
          </div>
        </template>
      </article>
    </div>
    <div class="gui-input-row">
      <!-- Ctrl+R 历史模糊搜索:输入行即查询框,回车选中回填,Esc 关闭 -->
      <div v-if="historySearchOpen" class="history-search" role="listbox">
        <div v-if="historyMatches.length === 0" class="history-search__empty">
          {{ t('common.terminal.guiHistorySearchEmpty') }}
        </div>
        <button
          v-for="(match, index) in historyMatches"
          :key="match.text + index"
          class="history-search__item"
          :class="{ 'is-active': index === historySearchIndex }"
          type="button"
          role="option"
          :aria-selected="index === historySearchIndex"
          @click="pickHistory(match.text)"
          @mousemove="historySearchIndex = index"
        >
          <span
            v-for="(char, charIndex) in match.text"
            :key="charIndex"
            class="history-search__char"
            :class="{ 'is-hit': match.positions.includes(charIndex) }"
            >{{ char }}</span
          >
        </button>
      </div>
      <el-icon class="gui-input-row__prompt"><ChevronRight /></el-icon>
      <span v-if="cwd" class="gui-input-row__cwd" :title="cwd">{{ cwd }}</span>
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
import { computed, nextTick, ref, watch } from 'vue'
import { ArrowDownBold, ArrowUpBold, CloseBold, CopyDocument, RefreshRight, View } from '@element-plus/icons-vue'
import { ChevronRight, LayoutGrid } from '@lucide/vue'
import { t } from '@/i18n'
import { normalizeTerminalLayout, encodeTextBase64, type TerminalCommandBlock } from '@/core/terminal/CommandBlocks'
import { splitOutputByPaths, type DetectedPath } from '@/core/terminal/PathDetection'
import { sniffContent, type SniffedContent } from '@/core/terminal/ContentSniff'
import { fuzzySearch } from '@/core/terminal/FuzzyMatch'
import type { TerminalRichPayload } from '@/core/terminal/CommandBlocks'
import TerminalRichContent from './TerminalRichContent.vue'

const props = defineProps<{
  blocks: TerminalCommandBlock[]
  /** 当前会话最近上报的工作目录,显示在输入行,告诉用户下一条命令在哪个目录执行 */
  cwd?: string
  /** xterm 当前列宽,用于折行续写判定;未知时按 80 列处理 */
  cols?: number
  /** 会话标识,用于把输出里的路径候选解析到正确的文件系统(本机 / WSL / SSH) */
  sessionId?: string
  /** 父级搜索条的查询词;空串表示搜索未激活 */
  searchQuery?: string
  /** 「下一条」触发计数,父级每点击/回车一次自增 */
  searchNextTick?: number
  /** 「上一条」触发计数 */
  searchPrevTick?: number
}>()
const emit = defineEmits<{
  rerun: [command: string]
  copy: [text: string]
  submit: [text: string]
  /** 搜索状态回报:命中总数与当前序号(1 起);总数为 0 表示无命中 */
  'search-status': [total: number, current: number]
}>()

/** 路径预览最大读取字节数:预览不需要整个文件,超限时交给 truncated 提示 */
const PREVIEW_MAX_BYTES = 512 * 1024

interface PreviewState {
  path: string
  status: 'loading' | 'ready' | 'unavailable'
  payload?: TerminalRichPayload
  size?: number
  truncated?: boolean
}

const scrollElement = ref<HTMLDivElement | null>(null)
const collapsed = ref<Set<number>>(new Set())
/** 用户回滚查看历史时不再强制吸底 */
let stickToBottom = true

const draft = ref('')
/** 会话内输入历史,↑/↓ 翻阅;仅存内存,不持久化 */
const history: string[] = []
let historyIndex = -1

/** Ctrl+R 历史模糊搜索的开关与选中项 */
const historySearchOpen = ref(false)
const historySearchIndex = ref(0)
const historyMatches = computed(() =>
  historySearchOpen.value ? fuzzySearch(draft.value.trim(), history, 10) : [],
)

function closeHistorySearch(): void {
  historySearchOpen.value = false
  historySearchIndex.value = 0
}

/** 查询词变化后选中项可能越界,回到第一条 */
watch(draft, () => {
  if (historySearchOpen.value) historySearchIndex.value = 0
})

/** 选中一条历史:回填输入行但不直接执行,让用户确认后再回车 */
function pickHistory(command: string): void {
  draft.value = command
  historyIndex = -1
  closeHistorySearch()
}

function handleInputKeydown(event: KeyboardEvent): void {
  // 输入法组词期间的回车是选词,不应提交
  if (event.isComposing) return

  // Ctrl+R:开/续历史模糊搜索;搜索已开时按键移到下一条
  if (event.ctrlKey && (event.key === 'r' || event.key === 'R')) {
    if (history.length === 0) return
    event.preventDefault()
    if (!historySearchOpen.value) {
      historySearchOpen.value = true
      historySearchIndex.value = 0
    } else if (historyMatches.value.length > 0) {
      historySearchIndex.value = (historySearchIndex.value + 1) % historyMatches.value.length
    }
    return
  }

  if (historySearchOpen.value) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeHistorySearch()
      return
    }
    if (event.key === 'Enter') {
      // 搜索态回车 = 选中回填;再按一次回车才执行
      const match = historyMatches.value[historySearchIndex.value]
      if (match) {
        event.preventDefault()
        pickHistory(match.text)
      }
      return
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      if (historyMatches.value.length === 0) return
      event.preventDefault()
      const delta = event.key === 'ArrowUp' ? -1 : 1
      const count = historyMatches.value.length
      historySearchIndex.value = (historySearchIndex.value + delta + count) % count
      return
    }
  }

  if (event.key === 'Enter') {
    const command = draft.value.trim()
    if (!command) return
    history.push(command)
    if (history.length > 100) history.shift()
    historyIndex = -1
    draft.value = ''
    closeHistorySearch()
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
  return normalizeTerminalLayout(block.output, props.cols ?? 80).trim()
}

/** 每块归一化输出:搜索与切片共用,避免同一周期重复做布局归一化 */
const blockOutputs = computed(() => props.blocks.map((block) => displayOutput(block)))

/** 文本搜索的命中:块下标 + 在该块归一化输出里的绝对区间(供高亮与导航) */
interface SearchMatch {
  blockIndex: number
  start: number
  end: number
}

const searchMatches = computed<SearchMatch[]>(() => {
  const query = props.searchQuery?.trim() ?? ''
  if (!query) return []
  const needle = query.toLowerCase()
  const matches: SearchMatch[] = []
  blockOutputs.value.forEach((output, blockIndex) => {
    const haystack = output.toLowerCase()
    let cursor = 0
    for (;;) {
      const found = haystack.indexOf(needle, cursor)
      if (found === -1) break
      matches.push({ blockIndex, start: found, end: found + needle.length })
      cursor = found + Math.max(1, needle.length)
    }
  })
  return matches
})

const activeMatchIndex = ref(0)

function emitSearchStatus(): void {
  const total = searchMatches.value.length
  emit('search-status', total, total > 0 ? activeMatchIndex.value + 1 : 0)
}

/** 把当前命中滚动进可视区;用户在导航历史,吸底逻辑应让位 */
function scrollActiveMatchIntoView(): void {
  const match = searchMatches.value[activeMatchIndex.value]
  if (!match) return
  const block = props.blocks[match.blockIndex]
  scrollElement.value
    ?.querySelector(`[data-block-id="${block?.id}"]`)
    ?.scrollIntoView({ block: 'center' })
}

function stepActiveMatch(direction: 1 | -1): void {
  const total = searchMatches.value.length
  if (total === 0) return
  activeMatchIndex.value = (activeMatchIndex.value + direction + total) % total
  emitSearchStatus()
  scrollActiveMatchIntoView()
}

watch(
  () => props.searchQuery,
  async () => {
    activeMatchIndex.value = 0
    emitSearchStatus()
    if (searchMatches.value.length > 0) {
      await nextTick()
      scrollActiveMatchIntoView()
    }
  },
)
watch(
  searchMatches,
  () => {
    if (activeMatchIndex.value >= searchMatches.value.length) activeMatchIndex.value = 0
    emitSearchStatus()
  },
)
watch(
  () => props.searchNextTick,
  () => stepActiveMatch(1),
)
watch(
  () => props.searchPrevTick,
  () => stepActiveMatch(-1),
)

/** 搜索高亮切片:一段文本按命中区间切成小段,命中段标 hit,当前段标 current */
interface SearchPart {
  text: string
  hit: boolean
  current: boolean
}

function buildSearchParts(
  text: string,
  segmentStart: number,
  blockMatches: SearchMatch[],
  currentMatch: SearchMatch | undefined,
): SearchPart[] {
  if (blockMatches.length === 0) return []
  const parts: SearchPart[] = []
  let cursor = 0
  for (const match of blockMatches) {
    if (match.end <= segmentStart) continue
    if (match.start >= segmentStart + text.length) break
    const relStart = Math.max(0, match.start - segmentStart)
    const relEnd = Math.min(text.length, match.end - segmentStart)
    if (relStart > cursor) parts.push({ text: text.slice(cursor, relStart), hit: false, current: false })
    parts.push({
      text: text.slice(relStart, relEnd),
      hit: true,
      current: match === currentMatch,
    })
    cursor = relEnd
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), hit: false, current: false })
  return parts
}

/**
 * 归一化后的输出按路径候选切片,供模板直接渲染成可点击片段。
 * 段带绝对起始下标,搜索激活时按命中区间再细分为高亮切片。
 * sniffed 是渲染侧内容嗅探结论:已有程序主动上报的富内容时不嗅探,
 * 避免同一份内容渲染两遍。
 */
const renderedBlocks = computed(() => {
  const queryActive = (props.searchQuery?.trim() ?? '').length > 0
  return props.blocks.map((block, blockIndex) => {
    const output = blockOutputs.value[blockIndex] ?? ''
    const sniffed = block.rich?.length ? null : sniffContent(output)
    const blockMatches = queryActive
      ? searchMatches.value.filter((match) => match.blockIndex === blockIndex)
      : []
    const currentMatch = queryActive ? searchMatches.value[activeMatchIndex.value] : undefined
    let offset = 0
    const segments = splitOutputByPaths(output).map((segment) => {
      const parts = buildSearchParts(segment.text, offset, blockMatches, currentMatch)
      offset += segment.text.length
      return { ...segment, parts }
    })
    return {
      block,
      output,
      segments,
      /** 嗅探命中时的等价富内容负载;未命中为 undefined,模板按普通文本渲染 */
      sniffedPayload: sniffed ? buildSniffedPayload(sniffed, output) : undefined,
    }
  })
})

/** 用户显式要求看原始输出的块;嗅探富化一律可一键撤销 */
const rawView = ref(new Set<number>())

function toggleRawView(id: number): void {
  const next = new Set(rawView.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  rawView.value = next
}

/** 嗅探结论 → 富内容负载;MIME 与程序主动上报的 OSC 1338 保持同一套映射 */
function buildSniffedPayload(type: NonNullable<SniffedContent>, text: string): TerminalRichPayload {
  const mime = type === 'markdown' ? 'text/markdown' : type === 'json' ? 'application/json' : 'text/csv'
  return { mime, data: encodeTextBase64(text) }
}

/** 路径存在性缓存:键为 `会话|路径`——同一路径在不同会话里结论不同 */
const pathExists = ref(new Map<string, boolean>())
const probing = new Set<string>()

function pathKey(path: string): string {
  return `${props.sessionId ?? ''}|${path}`
}

function isExistingPath(path: string): boolean {
  return pathExists.value.get(pathKey(path)) === true
}

/**
 * 悬停时确认路径是否真实存在,只有确认过的才给「可点击」外观。
 * 纯语法判断无法区分 `foo.txt` 是文件名还是普通文本,这一步是必需的。
 */
async function probePath(found: DetectedPath): Promise<void> {
  if (!props.sessionId) return
  const key = pathKey(found.path)
  if (pathExists.value.has(key) || probing.has(key)) return
  probing.add(key)
  try {
    const stat = (await window.ipcRenderer.invoke('terminal-path-stat', {
      sessionId: props.sessionId,
      path: found.path,
    })) as { exists?: boolean } | null
    const next = new Map(pathExists.value)
    next.set(key, stat?.exists === true)
    pathExists.value = next
  } catch {
    // 探测失败保持"不可点击":宁可不给入口,也不给一个点了报错的入口
  } finally {
    probing.delete(key)
  }
}

const previews = ref(new Map<number, PreviewState>())

function closePreview(blockId: number): void {
  const next = new Map(previews.value)
  next.delete(blockId)
  previews.value = next
}

async function togglePreview(block: TerminalCommandBlock, found: DetectedPath): Promise<void> {
  const current = previews.value.get(block.id)
  if (current?.path === found.path) {
    closePreview(block.id)
    return
  }
  if (!props.sessionId) return

  const next = new Map(previews.value)
  next.set(block.id, { path: found.path, status: 'loading' })
  previews.value = next

  let state: PreviewState
  try {
    const read = (await window.ipcRenderer.invoke('terminal-path-read', {
      sessionId: props.sessionId,
      path: found.path,
      maxBytes: PREVIEW_MAX_BYTES,
    })) as { mime: string; data: string; size: number; truncated: boolean } | null
    state = read
      ? {
          path: found.path,
          status: 'ready',
          payload: { mime: read.mime, data: read.data },
          size: read.size,
          truncated: read.truncated,
        }
      : { path: found.path, status: 'unavailable' }
  } catch {
    state = { path: found.path, status: 'unavailable' }
  }
  const applied = new Map(previews.value)
  applied.set(block.id, state)
  previews.value = applied
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
.command-block__cwd {
  max-width: 240px;
  overflow: hidden;
  color: color-mix(in srgb, var(--terminal-fg) 55%, transparent);
  font-family: 'Cascadia Mono', Consolas, 'Noto Sans Mono', monospace;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
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
/* 已确认存在的路径:可点击展开块内预览 */
.command-block__path {
  color: var(--el-color-primary);
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 2px;
  cursor: pointer;
}
.command-block__path:hover {
  text-decoration-style: solid;
}
.command-block__preview {
  border-top: 1px solid color-mix(in srgb, var(--terminal-fg) 12%, transparent);
  background: color-mix(in srgb, var(--terminal-fg) 3%, var(--terminal-bg));
}
.command-block__preview-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 8px;
}
.command-block__preview-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: color-mix(in srgb, var(--terminal-fg) 70%, transparent);
  font-family: 'Cascadia Mono', Consolas, 'Noto Sans Mono', monospace;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: text;
}
.command-block__preview-note {
  display: block;
  padding: 6px 10px;
  color: var(--el-color-warning);
  font-size: 11px;
}
/* 文本搜索命中:全部命中给淡底,当前命中给主题色底 */
.search-hit.is-hit {
  border-radius: 3px;
  background: color-mix(in srgb, var(--el-color-warning) 40%, transparent);
  color: var(--terminal-fg);
}
.search-hit.is-current {
  border-radius: 3px;
  background: var(--el-color-primary);
  color: var(--terminal-bg);
}
.gui-input-row {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-top: 1px solid color-mix(in srgb, var(--terminal-fg) 10%, transparent);
  background: color-mix(in srgb, var(--terminal-fg) 4%, var(--terminal-bg));
}
.history-search {
  position: absolute;
  right: 12px;
  bottom: 100%;
  left: 12px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  max-height: 260px;
  margin-bottom: 6px;
  padding: 4px;
  overflow-y: auto;
  border: 1px solid color-mix(in srgb, var(--terminal-fg) 16%, transparent);
  border-radius: 8px;
  background: var(--terminal-bg);
  box-shadow: 0 6px 18px rgb(0 0 0 / 35%);
}
.history-search__empty {
  padding: 8px 10px;
  color: color-mix(in srgb, var(--terminal-fg) 50%, transparent);
  font-size: 11px;
}
.history-search__item {
  display: block;
  padding: 4px 8px;
  border: none;
  border-radius: 6px;
  color: color-mix(in srgb, var(--terminal-fg) 80%, transparent);
  background: transparent;
  font-family: 'Cascadia Mono', Consolas, 'Noto Sans Mono', monospace;
  font-size: 12px;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.history-search__item.is-active {
  background: color-mix(in srgb, var(--el-color-primary) 22%, var(--terminal-bg));
}
.history-search__char.is-hit {
  color: var(--el-color-primary);
  font-weight: 700;
}
.gui-input-row:focus-within {
  background: color-mix(in srgb, var(--terminal-fg) 7%, var(--terminal-bg));
}
.gui-input-row__prompt {
  flex: none;
  color: var(--el-color-primary);
  font-size: 14px;
}
.gui-input-row__cwd {
  flex: none;
  max-width: 40%;
  overflow: hidden;
  color: color-mix(in srgb, var(--terminal-fg) 60%, transparent);
  font-family: 'Cascadia Mono', Consolas, 'Noto Sans Mono', monospace;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: text;
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
