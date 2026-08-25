<template>
  <div class="settings-page">
    <header class="settings-header">
      <button
        class="back-button"
        type="button"
        :title="t('app.settingsBack')"
        :aria-label="t('app.settingsBack')"
        @click="$emit('close')"
      >
        <ArrowLeft :size="15" :stroke-width="1.8" aria-hidden="true" />
        <span>{{ t('app.settingsBack') }}</span>
      </button>
      <h1 class="settings-title">{{ t('app.settings') }}</h1>
    </header>

    <div class="settings-body">
      <nav class="settings-nav" :aria-label="t('app.settings')">
        <button
          v-for="section in sections"
          :key="section.key"
          class="nav-item"
          :class="{ active: activeSection === section.key }"
          type="button"
          :aria-pressed="activeSection === section.key"
          @click="activeSection = section.key"
        >
          <component :is="section.icon" class="nav-item-icon" aria-hidden="true" />
          <span>{{ t(section.labelKey) }}</span>
        </button>
      </nav>

      <div class="settings-content">
        <section v-if="activeSection === 'theme'" class="settings-section">
          <h2 class="section-title">{{ t('app.settingsTheme') }}</h2>
          <div class="settings-card" role="radiogroup" :aria-label="t('app.settingsTheme')">
            <button
              v-for="option in themeOptions"
              :key="option.mode"
              class="option-row"
              type="button"
              role="radio"
              :aria-checked="themeMode === option.mode"
              @click="setTheme(option.mode)"
            >
              <ThemeModeIcon :mode="option.mode" />
              <span class="option-label">{{ t(option.labelKey) }}</span>
              <el-icon
                class="option-check"
                :class="{ visible: themeMode === option.mode }"
                aria-hidden="true"
              >
                <Check />
              </el-icon>
            </button>
          </div>
        </section>

        <section v-else-if="activeSection === 'language'" class="settings-section">
          <h2 class="section-title">{{ t('app.settingsLanguage') }}</h2>
          <div class="settings-card" role="radiogroup" :aria-label="t('app.settingsLanguage')">
            <button
              v-for="option in languageOptions"
              :key="option.value"
              class="option-row"
              type="button"
              role="radio"
              :aria-checked="locale === option.value"
              @click="setLocale(option.value)"
            >
              <span class="option-icon-slot" aria-hidden="true"></span>
              <span class="option-label">{{ t(option.labelKey) }}</span>
              <el-icon
                class="option-check"
                :class="{ visible: locale === option.value }"
                aria-hidden="true"
              >
                <Check />
              </el-icon>
            </button>
          </div>
        </section>

        <section v-else-if="activeSection === 'shortcuts'" class="settings-section">
          <h2 class="section-title">{{ t('app.settingsShortcuts') }}</h2>
          <p class="section-hint">{{ t('app.settingsShortcutHint') }}</p>
          <div class="settings-card shortcut-card">
            <div class="shortcut-category" role="heading" aria-level="3">
              {{ t('app.settingsShortcutCategoryTerminal') }}
            </div>
            <div v-for="command in shortcutCommands" :key="command.id" class="shortcut-command-row">
              <span class="shortcut-command-label">{{ t(command.labelKey) }}</span>
              <div class="shortcut-bindings">
                <input
                  v-for="(binding, bindingIndex) in command.bindings"
                  :key="`${command.id}-${bindingIndex}`"
                  class="shortcut-input"
                  :class="{ recording: isRecording(command.id, bindingIndex) }"
                  type="text"
                  readonly
                  :value="formatTerminalShortcutBinding(binding, shortcutPlatform)"
                  :aria-label="`${t(command.labelKey)} ${bindingIndex + 1}`"
                  :title="t('app.settingsShortcutRecord')"
                  @focus="beginShortcutRecording(command.id, bindingIndex)"
                  @keydown="captureShortcut($event, command.id, bindingIndex)"
                />
              </div>
            </div>
            <p v-if="shortcutError" class="shortcut-error" role="alert">{{ shortcutError }}</p>
            <div class="shortcut-footer">
              <span class="shortcut-footer-hint">{{ t('app.settingsShortcutRecord') }}</span>
              <el-button size="small" @click="resetShortcuts">
                {{ t('app.settingsShortcutReset') }}
              </el-button>
            </div>
          </div>
        </section>

        <section v-else-if="activeSection === 'version'" class="settings-section">
          <h2 class="section-title">{{ t('app.settingsVersion') }}</h2>
          <div class="settings-card version-card">
            <div class="version-header">
              <span class="version-current">
                {{ t('update.currentVersion') }}
                <span class="version-tag">v{{ appVersion || '-' }}</span>
              </span>
              <el-button
                size="small"
                type="primary"
                :loading="checking || updateDownloading"
                :disabled="updateDownloading"
                @click="handleUpdateAction"
              >
                {{ updateActionText }}
              </el-button>
            </div>

            <div v-if="updaterEvent?.type === 'update-available'" class="version-status">
              <span>{{ t('update.newVersionDesc', { version: updaterEvent.version }) }}</span>
              <span v-if="updaterPrefs.autoDownload" class="version-status-hint">
                {{ t('update.backgroundDownloading') }}
              </span>
              <pre v-if="updateNotesSummary" class="version-notes">{{ updateNotesSummary }}</pre>
            </div>
            <el-progress
              v-else-if="updaterEvent?.type === 'download-progress'"
              class="version-progress"
              :percentage="Math.round(updaterEvent.percent ?? 0)"
              :stroke-width="6"
            />
            <p
              v-else-if="updaterEvent?.type === 'update-not-available'"
              class="version-status version-status-hint"
            >
              {{ t('update.upToDate') }}
            </p>
            <p
              v-else-if="updaterEvent?.type === 'update-downloaded'"
              class="version-status version-status-hint"
            >
              {{ t('update.readyDesc', { version: updaterEvent.version }) }}
            </p>
            <p
              v-else-if="updaterEvent?.type === 'error'"
              class="version-status version-status-error"
            >
              {{ t('update.checkFailed', { message: updaterEvent.message ?? '' }) }}
              {{ t('update.networkHint') }}
            </p>

            <div class="version-prefs">
              <div class="version-prefs-title">{{ t('update.autoUpdate') }}</div>
              <div class="version-pref-row">
                <el-switch
                  :model-value="updaterPrefs.autoCheck"
                  @change="handleUpdaterPrefChange('autoCheck', $event)"
                />
                <span>{{ t('update.autoCheck') }}</span>
              </div>
              <div class="version-pref-row">
                <el-switch
                  :model-value="updaterPrefs.autoDownload"
                  @change="handleUpdaterPrefChange('autoDownload', $event)"
                />
                <span>{{ t('update.autoDownload') }}</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, type Component } from 'vue'
import { Check, Refresh } from '@element-plus/icons-vue'
import { ArrowLeft, Keyboard, Languages, Palette } from '@lucide/vue'
import { useTheme, type ThemeMode } from '@/composables/useTheme'
import { useLocale } from '@/composables/useLocale'
import {
  formatTerminalShortcutBinding,
  normalizeTerminalShortcutPlatform,
  TerminalShortcutSettings,
  terminalShortcutInputFromKeyboardEvent,
  type TerminalShortcutCommandId,
} from '@/core/terminal/TerminalShortcuts'
import { getBrowserWindowService } from '@/core/window/browserWindowService'
import { getUpdaterService } from '@/core/update/browserUpdaterService'
import type { UpdateStatusEvent, UpdaterPrefs } from '@/core/update/UpdaterService'
import { summarizeReleaseNotes } from '@/core/update/releaseNotes'
import { t, type AppLocale } from '@/i18n'
import ThemeModeIcon from './ThemeModeIcon.vue'

defineEmits<{
  close: []
}>()

// 设置分类注册表：新增分类时在 sections 中追加一项，
// 并在内容区添加对应的 <section v-if="activeSection === '...'"> 即可。
type SettingsSectionKey = 'theme' | 'language' | 'shortcuts' | 'version'

interface SettingsSection {
  key: SettingsSectionKey
  labelKey: string
  icon: Component
}

const sections: SettingsSection[] = [
  { key: 'theme', labelKey: 'app.settingsTheme', icon: Palette },
  { key: 'language', labelKey: 'app.settingsLanguage', icon: Languages },
  { key: 'shortcuts', labelKey: 'app.settingsShortcuts', icon: Keyboard },
  { key: 'version', labelKey: 'app.settingsVersion', icon: Refresh },
]

const activeSection = ref<SettingsSectionKey>('theme')

const { themeMode, setTheme } = useTheme()
const { locale, setLocale } = useLocale()

const themeOptions: { mode: ThemeMode; labelKey: string }[] = [
  { mode: 'system', labelKey: 'theme.system' },
  { mode: 'light', labelKey: 'theme.light' },
  { mode: 'dark', labelKey: 'theme.dark' },
]

const languageOptions: { value: AppLocale; labelKey: string }[] = [
  { value: 'zh-CN', labelKey: 'language.zh' },
  { value: 'en-US', labelKey: 'language.en' },
]

// ---- 版本更新 ----
// 更新事件由 UpdaterService 统一缓存并合并 releaseNotes（见 getLastStatus），
// 与 UpdateDialog 共用同一份状态源，这里不重复维护合并逻辑。
const shortcutFallbackStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}
const shortcutStorage = typeof localStorage === 'undefined' ? shortcutFallbackStorage : localStorage
const shortcutPlatform = normalizeTerminalShortcutPlatform(
  typeof navigator === 'undefined' ? 'win32' : navigator.platform,
)
const shortcutSettings = new TerminalShortcutSettings(shortcutStorage, shortcutPlatform)
const shortcutCommands = ref(shortcutSettings.getCommands())
const shortcutError = ref('')
const recordingTarget = ref<{ commandId: TerminalShortcutCommandId; bindingIndex: number } | null>(
  null,
)

function refreshShortcutCommands() {
  shortcutCommands.value = shortcutSettings.getCommands()
}

function isRecording(commandId: TerminalShortcutCommandId, bindingIndex: number): boolean {
  return (
    recordingTarget.value?.commandId === commandId &&
    recordingTarget.value.bindingIndex === bindingIndex
  )
}

function beginShortcutRecording(commandId: TerminalShortcutCommandId, bindingIndex: number) {
  recordingTarget.value = { commandId, bindingIndex }
  shortcutError.value = ''
}

function captureShortcut(
  event: KeyboardEvent,
  commandId: TerminalShortcutCommandId,
  bindingIndex: number,
) {
  if (event.key === 'Escape') {
    event.preventDefault()
    recordingTarget.value = null
    shortcutError.value = ''
    return
  }
  if (!isRecording(commandId, bindingIndex)) return

  event.preventDefault()
  const result = shortcutSettings.updateBinding(
    commandId,
    bindingIndex,
    terminalShortcutInputFromKeyboardEvent(event),
  )
  if (!result.ok) {
    shortcutError.value =
      result.error.code === 'conflict'
        ? t('app.settingsShortcutConflict')
        : t('app.settingsShortcutInvalid')
    return
  }
  refreshShortcutCommands()
  recordingTarget.value = null
  shortcutError.value = ''
}

function resetShortcuts() {
  shortcutSettings.reset()
  refreshShortcutCommands()
  recordingTarget.value = null
  shortcutError.value = ''
}

const updater = getUpdaterService()
const windowService = getBrowserWindowService()

const appVersion = ref('')
const updaterEvent = ref<UpdateStatusEvent | null>(updater.getLastStatus())
const updaterPrefs = ref<UpdaterPrefs>(updater.getPrefs())
const checking = ref(updaterEvent.value?.type === 'checking')
// autoDownload 关闭时用户点击「立即下载」后的手动下载中状态
const manualDownloading = ref(false)

const offUpdateStatus = updater.onStatusChanged((e) => {
  updaterEvent.value = e
  checking.value = e.type === 'checking'
  if (e.type !== 'download-progress') manualDownloading.value = false
})

onMounted(async () => {
  const version = await windowService.getAppVersion()
  appVersion.value = version?.replace(/^v/i, '') ?? ''
})

onUnmounted(offUpdateStatus)

const updateDownloaded = computed(() => updaterEvent.value?.type === 'update-downloaded')

/** 下载中：进度事件 / 手动下载进行中 / 发现新版本且自动下载开启（后台静默下载） */
const updateDownloading = computed(
  () =>
    updaterEvent.value?.type === 'download-progress' ||
    manualDownloading.value ||
    (updaterEvent.value?.type === 'update-available' && updaterPrefs.value.autoDownload),
)

/** 单按钮状态机文案：检查更新 → 立即下载 → 下载中… → 立即重启更新 */
const updateActionText = computed(() => {
  if (updateDownloaded.value) return t('update.restartNow')
  if (updateDownloading.value) return t('update.downloadingShort')
  if (updaterEvent.value?.type === 'update-available') return t('update.downloadNow')
  return t('update.check')
})

const updateNotesSummary = computed(() =>
  summarizeReleaseNotes(updaterEvent.value?.releaseNotes ?? ''),
)

async function handleUpdateAction() {
  const event = updaterEvent.value
  if (event?.type === 'update-downloaded') {
    await updater.quitAndInstall()
    return
  }
  if (event?.type === 'update-available' && !updaterPrefs.value.autoDownload) {
    if (manualDownloading.value) return
    manualDownloading.value = true
    try {
      await updater.downloadUpdate()
    } catch {
      // 失败由主进程 error 事件覆盖
    } finally {
      manualDownloading.value = false
    }
    return
  }
  if (checking.value) return
  checking.value = true
  try {
    await updater.checkForUpdates()
  } catch {
    checking.value = false
  }
}

/** 更新偏好：立即持久化并经 UpdaterService 同步给主进程 */
function handleUpdaterPrefChange(
  key: 'autoCheck' | 'autoDownload',
  value: string | number | boolean,
) {
  updaterPrefs.value = updater.setPrefs({ [key]: Boolean(value) })
}
</script>

<style scoped>
.settings-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  color: var(--app-text);
  background: var(--app-bg);
  user-select: none;
}

.settings-header {
  display: flex;
  flex: none;
  align-items: center;
  height: 52px;
  padding: 0 16px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-surface);
  gap: 12px;
  box-sizing: border-box;
}

.back-button {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  color: var(--app-text-secondary);
  background: transparent;
  font: inherit;
  font-size: 13px;
  gap: 6px;
  cursor: pointer;
  outline: none;
}

.back-button:hover,
.back-button:focus-visible {
  color: var(--app-text);
  background: var(--app-hover);
}

.settings-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.settings-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.settings-nav {
  display: flex;
  flex: 0 0 180px;
  flex-direction: column;
  padding: 12px 8px;
  border-right: 1px solid var(--app-border);
  background: var(--app-surface);
  gap: 2px;
  overflow-y: auto;
  box-sizing: border-box;
}

.nav-item {
  display: flex;
  align-items: center;
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  color: var(--app-text-secondary);
  background: transparent;
  font: inherit;
  font-size: 13px;
  text-align: left;
  gap: 8px;
  cursor: pointer;
  outline: none;
}

.nav-item:hover,
.nav-item:focus-visible {
  color: var(--app-text);
  background: var(--app-hover);
}

.nav-item.active {
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
  font-weight: 600;
}

.nav-item-icon {
  flex: none;
  width: 16px;
  height: 16px;
}

.settings-content {
  flex: 1;
  min-width: 0;
  padding: 20px 24px;
  overflow-y: auto;
  box-sizing: border-box;
}

.settings-section {
  max-width: 560px;
  margin: 0 auto;
}

.section-title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
}

.settings-card {
  display: grid;
  padding: 6px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-surface);
  box-shadow: 0 1px 3px var(--app-shadow);
  gap: 2px;
  box-sizing: border-box;
}

.section-hint {
  margin: -4px 0 10px;
  color: var(--app-text-muted);
  font-size: 12px;
}

.shortcut-card {
  display: block;
  padding: 10px;
}

.shortcut-category {
  padding: 2px 8px 8px;
  border-bottom: 1px solid var(--app-border);
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.shortcut-command-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(170px, auto);
  align-items: center;
  min-height: 42px;
  padding: 4px 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--app-border) 65%, transparent);
  gap: 12px;
}

.shortcut-command-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  white-space: nowrap;
}

.shortcut-bindings {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.shortcut-input {
  width: 106px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  color: var(--app-text-secondary);
  background: var(--app-surface-muted);
  font: inherit;
  font-size: 12px;
  text-align: center;
  cursor: pointer;
  outline: none;
  box-sizing: border-box;
}

.shortcut-input:hover,
.shortcut-input:focus,
.shortcut-input.recording {
  border-color: var(--el-color-primary);
  color: var(--app-text);
  background: var(--app-hover);
}

.shortcut-error {
  margin: 8px 8px 0;
  color: var(--el-color-error);
  font-size: 12px;
}

.shortcut-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 8px 2px;
  gap: 12px;
}

.shortcut-footer-hint {
  color: var(--app-text-muted);
  font-size: 12px;
}

.option-row {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) 16px;
  align-items: center;
  width: 100%;
  height: 34px;
  padding: 0 8px;
  border: 0;
  border-radius: 4px;
  color: inherit;
  background: transparent;
  font: inherit;
  font-size: 13px;
  text-align: left;
  gap: 8px;
  cursor: pointer;
  outline: none;
}

.option-row:hover,
.option-row:focus-visible {
  background: var(--app-hover);
}

.option-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.option-check {
  visibility: hidden;
  color: var(--el-color-primary);
}

.option-check.visible {
  visibility: visible;
}

.option-icon-slot {
  width: 16px;
  height: 16px;
}

/* 版本更新卡片：与选项列表卡片同底色，改用块级布局 */
.version-card {
  display: block;
  padding: 14px 16px;
}

.version-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.version-current {
  font-size: 13px;
  color: var(--app-text-secondary);
}

.version-tag {
  margin-left: 6px;
  color: var(--el-color-primary);
  font-weight: 600;
}

.version-status {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--app-text);
}

.version-status-hint {
  color: var(--app-text-muted);
}

.version-status-error {
  color: var(--el-color-error);
}

.version-notes {
  max-height: 120px;
  margin: 8px 0 0;
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

.version-progress {
  margin-top: 12px;
}

.version-prefs {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--app-border);
}

.version-prefs-title {
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--app-text-secondary);
}

.version-pref-row {
  display: flex;
  align-items: center;
  font-size: 13px;
  gap: 10px;
}

.version-pref-row + .version-pref-row {
  margin-top: 8px;
}
</style>
