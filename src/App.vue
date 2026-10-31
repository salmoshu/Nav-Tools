<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref } from 'vue'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'
import AppHeader from './components/AppHeader.vue'
import WindowResizeHandles from './components/WindowResizeHandles.vue'
import Dashboard from './components/Dashboard.vue'
import CardWindow from './components/CardWindow.vue'
import SettingsPage from './components/SettingsPage.vue'
import UpdateDialog from './components/UpdateDialog.vue'
import emitter from '@/hooks/useMitt'
import { useApplicationSelector } from '@/composables/useApplicationSelector'
import { useMcapPlayer } from '@/composables/useMcapPlayer'
import { useLocale } from '@/composables/useLocale'
import { getWindowsByIds } from '@/settings/config'
import {
  buildComponentIconDataUrl,
  createComponentDesktopShortcut,
} from '@/core/panels/componentIcon'
import { ElMessage } from 'element-plus'
import { t } from '@/i18n'
import { TERMINAL_EVENT_BUS_KEY, type TerminalEventBus } from '@/core/terminal/TerminalEventBus'
import { TERMINAL_TRANSLATE_KEY } from '@/core/terminal/TerminalI18n'

const terminalEventBus: TerminalEventBus = {
  on(event, handler) {
    emitter.on(event, handler as (payload: unknown) => void)
  },
  off(event, handler) {
    emitter.off(event, handler as (payload: unknown) => void)
  },
  emit(event, payload) {
    emitter.emit(event, payload)
  },
}
provide(TERMINAL_EVENT_BUS_KEY, terminalEventBus)
provide(TERMINAL_TRANSLATE_KEY, t)

const { locale } = useLocale()
const epLocale = computed(() => (locale.value === 'en-US' ? en : zhCn))

interface FullscreenPanelContext {
  title: string
  action?: string
}

const maximized = ref(false)
const dashboardRef = ref<InstanceType<typeof Dashboard> | null>(null)
const fullscreenPanel = ref<FullscreenPanelContext>()
const settingsOpen = ref(false)
const isCardWindow = computed(() => window.location.hash.startsWith('#card/'))
const { currentApplication } = useApplicationSelector()
const mcapPlayer = useMcapPlayer()

const applicationId = computed(() => {
  const match = window.location.hash.match(/^#app\/([^/?]+)/)
  return match ? decodeURIComponent(match[1]) : undefined
})

const contextTitle = computed(() => {
  if (isCardWindow.value) {
    try {
      const payload = JSON.parse(decodeURIComponent(window.location.hash.slice('#card/'.length)))
      return typeof payload.title === 'string' ? payload.title : panelTitleFallback.value
    } catch {
      return panelTitleFallback.value
    }
  }

  if (settingsOpen.value) return t('app.settings')

  return currentApplication.value?.name
})

/** LiDAR 应用激活时,当前播放文件名显示在应用 header(时间轴进度区不再承担) */
const contextFileName = computed(() =>
  currentApplication.value?.id === 'lidar' ? mcapPlayer.fileInfo.value?.name : undefined,
)
const contextFileTitle = computed(() => {
  const info = mcapPlayer.fileInfo.value
  if (!info) return ''
  return info.paths?.join('\n') ?? info.path ?? info.name
})

const panelTitleFallback = computed(() => t('app.panel'))

/** 独立组件窗口标题栏品牌位图标:与任务栏/桌面快捷方式同一合成图标(组件主体+logo角标) */
const cardWindowIconUrl = ref<string>()

async function resolveCardWindowIcon(): Promise<void> {
  if (!isCardWindow.value) return
  try {
    const payload = JSON.parse(
      decodeURIComponent(window.location.hash.slice('#card/'.length)),
    ) as { windowId?: unknown }
    if (typeof payload.windowId !== 'string' || !payload.windowId) return
    cardWindowIconUrl.value = await buildComponentIconDataUrl(payload.windowId)
  } catch {
    /* 合成失败时标题栏回退默认应用 logo */
  }
}

const openApplicationSelector = () => emitter.emit('open-application-selector')
const openSettings = () => {
  settingsOpen.value = true
}

/**
 * 独立组件窗口标题栏「创建桌面快捷方式」:从地址 hash 解析当前组件,
 * 图标合成与 .lnk 落盘复用卡片右键同一条链路。
 */
async function createCardWindowShortcut(): Promise<void> {
  if (!isCardWindow.value) return
  try {
    const payload = JSON.parse(
      decodeURIComponent(window.location.hash.slice('#card/'.length)),
    ) as { windowId?: unknown }
    const windowId = typeof payload.windowId === 'string' ? payload.windowId : ''
    const definition = getWindowsByIds([windowId])[0]
    if (!definition) return
    const saved = await createComponentDesktopShortcut(definition.id, t(definition.title))
    if (!saved) return
    ElMessage({
      message: t('app.cardWindow.shortcutCreated'),
      type: 'success',
      placement: 'bottom-right',
      offset: 50,
    })
  } catch (error) {
    ElMessage({
      message: error instanceof Error ? error.message : String(error),
      type: 'error',
      placement: 'bottom-right',
      offset: 50,
    })
  }
}
const exitPanelFullscreen = () => dashboardRef.value?.exitFullScreen()
const handleFullscreenPanelChange = (panel?: FullscreenPanelContext) => {
  fullscreenPanel.value = panel
}

onMounted(() => {
  emitter.on('open-settings', openSettings)
  void resolveCardWindowIcon()
})

onUnmounted(() => {
  emitter.off('open-settings', openSettings)
})
</script>

<template>
  <el-config-provider :locale="epLocale">
    <div class="app-shell">
      <WindowResizeHandles v-if="!maximized" />
      <AppHeader
        :brand-title="isCardWindow ? contextTitle : 'Nav-Tools'"
        :brand-icon-url="isCardWindow ? cardWindowIconUrl : undefined"
        :context-title="isCardWindow ? undefined : contextTitle"
        :context-file-name="isCardWindow ? undefined : contextFileName"
        :context-file-title="contextFileTitle"
        :context-panel-title="fullscreenPanel?.title"
        :context-icon-action="fullscreenPanel?.action"
        :show-application-selector="!isCardWindow"
        :show-detached-controls="isCardWindow"
        :show-panel-fullscreen-exit="Boolean(fullscreenPanel)"
        @open-application-selector="openApplicationSelector"
        @exit-panel-fullscreen="exitPanelFullscreen"
        @create-shortcut="createCardWindowShortcut"
        @maximized-change="maximized = $event"
      />
      <main class="app-content">
        <CardWindow v-if="isCardWindow" />
        <template v-else>
          <Dashboard
            v-show="!settingsOpen"
            ref="dashboardRef"
            :initial-application-id="applicationId"
            @fullscreen-panel-change="handleFullscreenPanelChange"
          />
          <SettingsPage v-if="settingsOpen" @close="settingsOpen = false" />
        </template>
      </main>
      <UpdateDialog v-if="!isCardWindow" />
    </div>
  </el-config-provider>
</template>

<style>
:root {
  --app-header-height: 38px;
  --app-toolbar-size: 40px;
}

.app-shell {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  color: var(--app-text);
  background: var(--app-bg);
}

.app-content {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
</style>
