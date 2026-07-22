<template>
  <header class="app-header">
    <div class="brand">
      <img src="/logo.svg" alt="" class="brand-logo" />
      <span class="brand-name">{{ brandTitle || 'Nav-Tools' }}</span>
      <span v-if="version" class="brand-version">V{{ version }}</span>
      <button
        v-if="showApplicationSelector"
        class="header-button application-button"
        type="button"
        title="选择应用"
        aria-label="选择应用"
        @mousedown.stop
        @dblclick.stop
        @click="$emit('open-application-selector')"
      >
        <el-icon><Grid /></el-icon>
      </button>
      <span v-if="contextTitle" class="context-title">{{ contextTitle }}</span>
    </div>

    <div class="header-controls" @mousedown.stop @dblclick.stop>
      <button
        v-if="showDetachedControls"
        class="header-button"
        type="button"
        title="还原到主窗口"
        aria-label="还原面板到主窗口"
        @click="restoreDetachedPanel"
      >
        <PanelTopOpen :size="16" :stroke-width="1.8" aria-hidden="true" />
      </button>
      <button
        v-if="showDetachedControls"
        class="header-button"
        :class="{ active: alwaysOnTop }"
        type="button"
        :title="alwaysOnTop ? '取消保持置顶' : '保持置顶'"
        :aria-label="alwaysOnTop ? '取消保持置顶' : '保持置顶'"
        :aria-pressed="alwaysOnTop"
        @click="toggleAlwaysOnTop"
      >
        <Pin :size="16" :stroke-width="1.8" aria-hidden="true" />
      </button>
      <el-dropdown
        v-if="!showDetachedControls"
        trigger="click"
        placement="bottom-end"
        :teleported="false"
        @command="handleThemeCommand"
      >
        <button
          class="header-button"
          type="button"
          :title="`主题模式：${themeLabel}`"
          :aria-label="`选择主题模式，当前为${themeLabel}`"
        >
          <ThemeModeIcon :mode="themeMode" />
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="system">
              <ThemeModeIcon mode="system" />
              <span>跟随系统</span>
              <el-icon v-if="themeMode === 'system'" class="theme-check"><Check /></el-icon>
            </el-dropdown-item>
            <el-dropdown-item command="light">
              <ThemeModeIcon mode="light" />
              <span>浅色模式</span>
              <el-icon v-if="themeMode === 'light'" class="theme-check"><Check /></el-icon>
            </el-dropdown-item>
            <el-dropdown-item command="dark">
              <ThemeModeIcon mode="dark" />
              <span>深色模式</span>
              <el-icon v-if="themeMode === 'dark'" class="theme-check"><Check /></el-icon>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <button
        class="header-button"
        type="button"
        title="最小化"
        aria-label="最小化窗口"
        @click="minimize"
      >
        <el-icon><Minus /></el-icon>
      </button>
      <button
        class="header-button"
        type="button"
        :title="maximized ? '还原' : '最大化'"
        :aria-label="maximized ? '还原窗口' : '最大化窗口'"
        @click="toggleMaximize"
      >
        <el-icon><CopyDocument v-if="maximized" /><FullScreen v-else /></el-icon>
      </button>
      <button
        class="header-button close"
        type="button"
        title="关闭"
        aria-label="关闭窗口"
        @click="close"
      >
        <el-icon><Close /></el-icon>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Check, Close, CopyDocument, FullScreen, Grid, Minus } from '@element-plus/icons-vue'
import { PanelTopOpen, Pin } from '@lucide/vue'
import { useTheme, type ThemeMode } from '@/composables/useTheme'
import { getBrowserWindowService } from '@/core/window/browserWindowService'
import ThemeModeIcon from './ThemeModeIcon.vue'

defineProps<{
  brandTitle?: string
  contextTitle?: string
  showApplicationSelector?: boolean
  showDetachedControls?: boolean
}>()

const emit = defineEmits<{
  'open-application-selector': []
  'maximized-change': [maximized: boolean]
}>()

const version = ref('')
const maximized = ref(false)
const alwaysOnTop = ref(false)
const { themeMode, setTheme } = useTheme()
const windowService = getBrowserWindowService()
let removeWindowStateListener: (() => void) | undefined
const themeLabel = computed(
  () =>
    ({
      system: '跟随系统',
      light: '浅色模式',
      dark: '深色模式',
    })[themeMode.value],
)

function handleThemeCommand(command: ThemeMode) {
  setTheme(command)
}

function applyWindowState(state?: { maximized?: boolean; alwaysOnTop?: boolean }) {
  maximized.value = Boolean(state?.maximized)
  alwaysOnTop.value = Boolean(state?.alwaysOnTop)
  emit('maximized-change', maximized.value)
}

async function minimize() {
  await windowService.minimize()
}

async function toggleMaximize() {
  const next = await windowService.toggleMaximize()
  if (typeof next === 'boolean') applyWindowState({ maximized: next })
}

async function close() {
  await windowService.close()
}

async function toggleAlwaysOnTop() {
  alwaysOnTop.value = await windowService.toggleAlwaysOnTop()
}

async function restoreDetachedPanel() {
  await windowService.restoreDetachedPanel()
}

onMounted(async () => {
  const [appVersion, state] = await Promise.all([
    windowService.getAppVersion(),
    windowService.getState(),
  ])
  version.value = appVersion?.replace(/^v/i, '') ?? ''
  applyWindowState(state)
  removeWindowStateListener = windowService.onStateChanged((state) => applyWindowState(state))
})

onUnmounted(() => {
  removeWindowStateListener?.()
})
</script>

<style scoped>
.app-header {
  --header-height: 38px;
  position: relative;
  z-index: 6000;
  display: flex;
  flex: 0 0 var(--header-height);
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: var(--header-height);
  border-bottom: 1px solid var(--app-border);
  color: var(--app-text);
  background: var(--app-surface);
  box-sizing: border-box;
  user-select: none;
  -webkit-app-region: drag;
}

.brand {
  display: flex;
  align-self: stretch;
  align-items: center;
  min-width: 0;
  padding-left: 10px;
  gap: 7px;
}

.brand-logo {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.brand-name {
  display: inline-flex;
  flex: none;
  align-self: center;
  align-items: center;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}

.brand-version {
  display: inline-flex;
  align-self: center;
  align-items: center;
  color: var(--app-text-muted);
  font-size: 11px;
  line-height: 1;
}

.application-button {
  width: 38px;
  margin-left: 1px;
}

.context-title {
  max-width: min(36vw, 360px);
  margin-left: 8px;
  padding-left: 12px;
  border-left: 1px solid var(--app-border);
  color: var(--app-text-muted);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-controls {
  display: flex;
  align-self: stretch;
  -webkit-app-region: no-drag;
}

.header-controls :deep(.el-dropdown) {
  height: 100%;
}

.header-controls :deep(.el-tooltip__trigger) {
  height: 100%;
  outline: none;
}

.theme-check {
  margin-left: auto;
}

.header-button {
  display: grid;
  place-items: center;
  width: 42px;
  height: 100%;
  padding: 0;
  border: 0;
  border-radius: 0;
  color: var(--app-text-secondary);
  background: transparent;
  outline: none;
  -webkit-app-region: no-drag;
}

.header-button:hover,
.header-button:focus-visible {
  color: var(--app-text);
  background: var(--app-hover);
}

.header-button.active {
  color: var(--el-color-primary);
  background: var(--app-hover);
}

.header-button.close:hover,
.header-button.close:focus-visible {
  color: #ffffff;
  background: #d92d3a;
}

.header-button .el-icon {
  font-size: 16px;
}

@media (max-width: 600px) {
  .brand-version,
  .context-title {
    display: none;
  }
}

@media (max-width: 420px) {
  .brand {
    gap: 5px;
    padding-left: 8px;
  }

  .header-button,
  .application-button {
    width: 36px;
  }
}
</style>
