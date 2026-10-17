<template>
  <div class="file-preview-tab">
    <header class="file-preview-tab__bar">
      <span class="file-preview-tab__name" :title="path">{{ name }}</span>
      <span v-if="size !== null" class="file-preview-tab__size">{{
        formatTransferBytes(size)
      }}</span>
      <el-tooltip :content="t('common.terminal.refresh')" placement="bottom">
        <el-button text size="small" :disabled="!sessionActive" @click="load">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </el-tooltip>
    </header>
    <div class="file-preview-tab__body">
      <span v-if="!sessionActive" class="file-preview-tab__empty">
        {{ t('common.terminal.filePreviewSessionGone') }}
      </span>
      <span v-else-if="status === 'loading'" class="file-preview-tab__empty">
        {{ t('common.terminal.guiPreviewLoading') }}
      </span>
      <span v-else-if="status === 'unavailable' || !payload" class="file-preview-tab__empty">
        {{ t('common.terminal.guiPreviewUnavailable') }}
      </span>
      <template v-else>
        <TerminalRichContent :payload="payload" />
        <span v-if="truncated" class="file-preview-tab__note">
          {{ t('common.terminal.guiPreviewTruncated') }}
        </span>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import type { TerminalRichPayload } from '@/core/terminal/CommandBlocks'
import { formatTransferBytes } from '@/core/terminal/FileTreeDownloadStatus'
import { useTerminalTranslate } from '@/core/terminal/TerminalI18n'
import TerminalRichContent from './TerminalRichContent.vue'

const t = useTerminalTranslate()

const props = defineProps<{
  sessionId: string
  path: string
  name: string
  /** 会话是否还在 sessionInfos 里;断开时显示空态,不再发起读取 */
  sessionActive: boolean
}>()

/** 整页预览比侧栏块内预览(512KB)宽一档 */
const PREVIEW_MAX_BYTES = 2 * 1024 * 1024

const status = ref<'loading' | 'ready' | 'unavailable'>('loading')
const payload = ref<TerminalRichPayload | null>(null)
const truncated = ref(false)
const size = ref<number | null>(null)

async function load(): Promise<void> {
  if (!props.sessionActive) return
  status.value = 'loading'
  try {
    const read = (await window.ipcRenderer.invoke('terminal-path-read', {
      sessionId: props.sessionId,
      path: props.path,
      maxBytes: PREVIEW_MAX_BYTES,
    })) as { mime: string; data: string; size: number; truncated: boolean } | null
    if (!read) {
      status.value = 'unavailable'
      return
    }
    payload.value = { mime: read.mime, data: read.data }
    truncated.value = read.truncated
    size.value = read.size
    status.value = 'ready'
  } catch {
    status.value = 'unavailable'
  }
}

onMounted(() => void load())
watch(
  () => [props.sessionId, props.path, props.sessionActive],
  () => void load(),
)
</script>

<style scoped>
.file-preview-tab {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  background: var(--app-bg);
}
.file-preview-tab__bar {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-surface);
}
.file-preview-tab__name {
  overflow: hidden;
  flex: 1;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-preview-tab__size {
  flex: none;
  color: var(--app-text-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.file-preview-tab__body {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 10px 14px;
  font-size: 12px;
}
.file-preview-tab__empty {
  color: var(--app-text-muted);
}
.file-preview-tab__note {
  display: block;
  margin-top: 8px;
  color: var(--app-text-muted);
  font-size: 11px;
}
</style>
