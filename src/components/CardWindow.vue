<template>
  <div class="card-window">
    <component
      v-if="cardComponent"
      :is="cardComponent"
      v-bind="cardProps"
    />
    <div v-else-if="loadError" class="load-error">
      <p class="message">{{ t('app.cardWindow.loadFailed') }}</p>
      <p class="detail">{{ loadError }}</p>
      <button class="close-btn" @click="closeWindow">{{ t('app.cardWindow.close') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { markRaw, onMounted, onUnmounted, ref } from 'vue'
import type { Component } from 'vue'
import { ElMessageBox } from 'element-plus'
import { routeDataToWindow } from '@/hooks/useDevice'
import { getWindowById } from '@/settings/config'
import { buildComponentIconDataUrl } from '@/core/panels/componentIcon'
import { t } from '@/i18n'

// 构建后动态 import 的路径会被打包成哈希文件名，
// 因此用 import.meta.glob 预扫描所有组件，运行时按键查找
const modules = import.meta.glob([
  './windows/common/*.vue',
  './windows/gnss/*.vue',
  './windows/motor/*.vue',
  './windows/lidar/*.vue',
  './windows/gnssraw/*.vue',
])

const cardComponent = ref<Component | null>(null)
const cardProps = ref<Record<string, any>>({})
const cardTitle = ref('Card Window')
const cardWindowId = ref<string | undefined>(undefined)
const loadError = ref('')

onMounted(async () => {
  void pollPendingCloseRequest()
  const hash = window.location.hash.slice(1) // 移除 #
  if (!hash.startsWith('card/')) {
    loadError.value = t('app.cardWindow.invalidAddress')
    return
  }

  try {
    const encodedData = hash.slice(5) // 移除 'card/'
    const decodedData = JSON.parse(decodeURIComponent(encodedData))
    const { componentName, props, title, windowId } = decodedData
    cardWindowId.value = windowId

    // componentName 为面板类型名，组件实际位于对应的分类目录中。
    const loader =
      modules[`./${componentName}.vue`] ??
      Object.entries(modules).find(([path]) =>
        path.endsWith(`/${componentName}.vue`)
      )?.[1]

    if (!loader) {
      loadError.value = t('app.cardWindow.componentNotFound', { v: componentName })
      return
    }

    const component = await loader()
    cardComponent.value = markRaw((component as any).default || component)
    cardProps.value = props || {}
    cardTitle.value = title || 'Card Window'
    // 快捷方式冷启动时主进程只有 i18n key,窗口标题在此修正为本地化组件名
    if (cardWindowId.value) {
      const definition = getWindowById(cardWindowId.value)
      if (definition) document.title = t(definition.title)
      // 组件独立窗口的任务栏/Alt+Tab 图标换成「主图标+组件角标」，
      // 主进程同时缓存 PNG 供下次开窗口（含快捷方式冷启动）直接使用
      void buildComponentIconDataUrl(cardWindowId.value)
        .then((dataUrl) =>
          window.ipcRenderer?.invoke('set-component-window-icon', { dataUrl }),
        )
        .catch(() => {
          /* 图标合成失败时使用默认应用图标 */
        })
    }
  } catch (error) {
    console.error('Error loading card component:', error)
    loadError.value = error instanceof Error ? error.message : String(error)
  }
})

// 接收主窗口广播的实时数据并路由到当前独立窗口的组件
const incomingDataListener = (_event: unknown, data: unknown) => {
  if (typeof data === 'string' && cardWindowId.value) {
    routeDataToWindow(data, cardWindowId.value)
  }
}
window.ipcRenderer?.on('incoming-data', incomingDataListener)
onUnmounted(() => {
  window.ipcRenderer?.off('incoming-data', incomingDataListener)
})

// 主进程拦截 Terminal 独立窗口的关闭后推送确认请求,这里弹应用内确认框并回报结果
const closeRequestListener = () => {
  void confirmWindowClose()
}
window.ipcRenderer?.on('card-window-close-request', closeRequestListener)
onUnmounted(() => {
  window.ipcRenderer?.off('card-window-close-request', closeRequestListener)
})

let closeConfirmOpen = false

async function confirmWindowClose(): Promise<void> {
  if (closeConfirmOpen) return
  closeConfirmOpen = true
  let confirmed = false
  try {
    await ElMessageBox.confirm(
      t('common.terminal.closeWindowConfirm'),
      t('common.terminal.closeWindowTitle'),
      { type: 'warning', customClass: 'app-message-box' },
    )
    confirmed = true
  } catch {
    confirmed = false
  } finally {
    closeConfirmOpen = false
  }
  try {
    await window.ipcRenderer?.invoke('card-window-close-response', confirmed)
  } catch {
    // 窗口正在销毁时回报可能失败,关闭流程保持原状,用户可再次触发关闭
  }
}

// 补查挂载前已发出的关闭确认请求(主进程的推送可能早于监听器注册)
async function pollPendingCloseRequest(): Promise<void> {
  const pending = await window.ipcRenderer
    ?.invoke('card-window-close-request-pending')
    .catch(() => false)
  if (pending) void confirmWindowClose()
}

function closeWindow() {
  void window.electronAPI?.closeWindow()
}
</script>

<style scoped>
.card-window {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: auto;
  color: var(--app-text);
  background: var(--app-surface);
}

.load-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  color: var(--app-text-muted);
}

.load-error .message {
  font-size: 16px;
  font-weight: 600;
  color: #d4380d;
}

.load-error .detail {
  font-size: 13px;
  word-break: break-all;
  padding: 0 20px;
}

.load-error .close-btn {
  margin-top: 8px;
  padding: 4px 16px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  color: var(--app-text);
  background: var(--app-surface);
  cursor: pointer;
}
</style>
