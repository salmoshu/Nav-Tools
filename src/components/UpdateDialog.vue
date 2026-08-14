<template>
  <div v-if="visible" class="update-dialog">
    <button type="button" class="update-dialog-close" :title="t('update.ignoreVersion')" @click="handleIgnore">
      <el-icon><Close /></el-icon>
    </button>

    <!-- 更新已就绪：自动下载开启时全程静默,仅此时提醒 -->
    <template v-if="phase === 'ready'">
      <div class="update-dialog-title">{{ t('update.readyTitle') }}</div>
      <p class="update-dialog-desc">{{ t('update.readyDesc', { version }) }}</p>
      <div class="update-dialog-actions">
        <el-button size="small" @click="handleIgnore">{{ t('update.later') }}</el-button>
        <el-button size="small" type="primary" :icon="RefreshRight" @click="handleRestart">
          {{ t('update.restartNow') }}
        </el-button>
      </div>
    </template>

    <!-- 发现新版本：仅自动下载关闭时出现 -->
    <template v-else-if="phase === 'available'">
      <div class="update-dialog-title">{{ t('update.newVersionTitle') }}</div>
      <p class="update-dialog-desc">{{ t('update.newVersionDesc', { version }) }}</p>
      <pre v-if="releaseNotesSummary" class="update-dialog-notes">{{ releaseNotesSummary }}</pre>
      <div class="update-dialog-actions">
        <el-button size="small" @click="handleIgnore">{{ t('update.ignoreVersion') }}</el-button>
        <el-button size="small" type="primary" :icon="Download" :loading="manualDownloading" @click="handleDownload">
          {{ t('update.downloadNow') }}
        </el-button>
      </div>
    </template>

    <!-- 手动下载中：进度条 -->
    <template v-else>
      <div class="update-dialog-title">{{ t('update.downloading', { version }) }}</div>
      <el-progress :percentage="percent" :stroke-width="6" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { Close, Download, RefreshRight } from '@element-plus/icons-vue'
import { t } from '@/i18n'
import { getUpdaterService } from '@/core/update/browserUpdaterService'
import { summarizeReleaseNotes } from '@/core/update/releaseNotes'
import { compareVersions } from '@/core/update/version'
import type { UpdateStatusEvent } from '@/core/update/UpdaterService'

/**
 * 全局更新提醒(右下角浮层卡片):
 * - 自动下载开启时全程静默,仅在下载完成、需要重启安装时出现;
 * - 自动下载关闭时,发现新版本出现「立即下载 / 忽略此版本」卡片;
 * - 「忽略此版本」持久化:仅出现更新的版本号时才重新提醒。
 * 挂载于 App.vue 顶层(仅非 card 窗口)。
 */

const updater = getUpdaterService()

const event = ref<UpdateStatusEvent | null>(updater.getLastStatus())
const prefs = ref(updater.getPrefs())
// 下载进度卡片可在本次会话内关闭;发现新版本时重新显示
const sessionHidden = ref(false)
// autoDownload 关闭时用户点击「立即下载」后的手动下载中状态
const manualDownloading = ref(false)

// 事件已由 UpdaterService 统一缓存并合并 releaseNotes,这里只维护弹框自身的显隐状态
const off = updater.onStatusChanged((e) => {
  if (e.type === 'update-available') {
    event.value = e
    sessionHidden.value = false
    manualDownloading.value = false
  } else if (e.type === 'download-progress') {
    event.value = e
  } else if (e.type === 'update-downloaded') {
    event.value = e
    sessionHidden.value = false
    manualDownloading.value = false
  } else if (e.type === 'update-not-available' || e.type === 'error') {
    // 检查/下载错误不打扰,交由设置页展示
    event.value = null
    manualDownloading.value = false
  }
})
onUnmounted(off)

const version = computed(() => event.value?.version ?? '')
const percent = computed(() => event.value?.percent ?? 0)

/** 已忽略的版本不再提醒(下载完成也遵守忽略语义,直到出现更新版本号) */
const ignored = computed(
  () =>
    Boolean(prefs.value.ignoredVersion) &&
    Boolean(version.value) &&
    compareVersions(version.value, prefs.value.ignoredVersion ?? '') <= 0,
)

/** releaseNotes 摘要:与设置页版本区共用 summarizeReleaseNotes */
const releaseNotesSummary = computed(() =>
  summarizeReleaseNotes(event.value?.releaseNotes ?? ''),
)

type Phase = 'available' | 'progress' | 'ready'

const phase = computed<Phase | null>(() => {
  const e = event.value
  if (!e || ignored.value) return null
  if (e.type === 'update-downloaded') return 'ready'
  if (prefs.value.autoDownload) return null
  if (e.type === 'update-available') return 'available'
  if (e.type === 'download-progress' && manualDownloading.value) return 'progress'
  return null
})

const visible = computed(() => phase.value !== null && !(phase.value === 'progress' && sessionHidden.value))

function handleDownload(): void {
  manualDownloading.value = true
  updater.downloadUpdate().catch(() => {
    manualDownloading.value = false
  })
}

function handleRestart(): void {
  void updater.quitAndInstall()
}

function handleIgnore(): void {
  if (phase.value === 'progress') {
    sessionHidden.value = true
    return
  }
  if (version.value) {
    prefs.value = updater.setPrefs({ ignoredVersion: version.value })
  }
  event.value = null
}
</script>

<style scoped>
.update-dialog {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 9000;
  width: 320px;
  padding: 14px 16px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-surface-raised);
  box-shadow: 0 8px 24px var(--app-shadow);
}

.update-dialog-close {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--app-text-muted);
  cursor: pointer;
}

.update-dialog-close:hover {
  background: var(--app-hover);
  color: var(--app-text);
}

.update-dialog-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text);
}

.update-dialog-desc {
  margin: 6px 0 12px;
  font-size: 13px;
  color: var(--app-text-secondary);
}

.update-dialog-notes {
  max-height: 120px;
  margin: 0 0 12px;
  padding: 8px 10px;
  overflow: auto;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-surface-muted);
  font-family: inherit;
  font-size: 12px;
  white-space: pre-wrap;
  color: var(--app-text-secondary);
}

.update-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
