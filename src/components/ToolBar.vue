<template>
  <div
    class="toolbar"
    :class="[`toolbar-${position}`, { 'toolbar-dragging': isDragging }]"
    :style="toolbarStyle"
    @mousedown="startDrag"
  >
    <div class="toolbar-handle">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
      </svg>
    </div>
    <div class="toolbar-content">
      <!-- IO: Input/Output -->
      <div class="toggle-switch-container">
        <div
          class="toggle-switch"
          :class="{ 'toggle-on': deviceConnected }"
          @click="handleDeviceConnected"
          :title="deviceConnected ? '断开连接' : '连接设备'"
        >
          <div class="toggle-slider">
            <span
              class="slider-icon"
              v-html="deviceConnected ? toolBarIcon.connected : toolBarIcon.disconnected"
            ></span>
          </div>
        </div>
      </div>
      <button
        v-for="item in ioList"
        :key="item.msg"
        class="toolbar-btn"
        @click="
          handleIo(item.msg)
          ;($event.currentTarget as HTMLElement)?.blur()
        "
        :title="item.title"
        v-html="item.icon"
      ></button>

      <span class="divider" aria-hidden="true"></span>

      <!-- Actions: Draw/Data/Config... -->
      <button
        class="toolbar-btn"
        @click="
          handleStatus()
          ;($event.currentTarget as HTMLElement)?.blur()
        "
        :title="statusBtn.title"
        v-html="statusBtn.icon"
      ></button>
      <button
        v-for="item in handleList"
        :key="item.msg"
        class="toolbar-btn"
        @click="
          handleAction(item.msg)
          ;($event.currentTarget as HTMLElement)?.blur()
        "
        :title="item.title"
      >
        <el-icon class="toolbar-window-icon" :size="18">
          <component :is="getPanelIconComponent(item.action)" />
        </el-icon>
      </button>

      <span class="divider" aria-hidden="true"></span>

      <!-- Layout: Edit/Save/Reset -->
      <button
        v-if="showSaveButton"
        class="toolbar-btn"
        @click="
          handleLayout('save')
          ;($event.currentTarget as HTMLElement)?.blur()
        "
        :title="layoutList[1].title"
        v-html="layoutList[1].icon"
      ></button>
      <button
        class="toolbar-btn"
        @click="
          handleLayout('auto')
          ;($event.currentTarget as HTMLElement)?.blur()
        "
        :title="layoutList[2].title"
        v-html="layoutList[2].icon"
      ></button>
      <button
        class="toolbar-btn"
        @click="
          handleLayout('reset')
          ;($event.currentTarget as HTMLElement)?.blur()
        "
        :title="layoutList[3].title"
        v-html="layoutList[3].icon"
      ></button>
    </div>
    <div class="toolbar-dock-zones" v-if="isDragging && activeDockZone">
      <div
        :class="['dock-zone', `dock-zone-${activeDockZone}`]"
        :style="getDockZoneStyle(activeDockZone)"
      ></div>
    </div>
  </div>
  <el-dialog
    title="数据接入"
    v-model="showInputDialog"
    class="data-input-dialog"
    width="min(520px, calc(100vw - 32px))"
    :close-on-click-modal="true"
    :close-on-press-escape="true"
    :append-to-body="true"
    modal-class="data-input-overlay"
    :z-index="8000"
    align-center
  >
    <el-tabs v-model="activeTab">
      <el-tab-pane label="串口连接" name="serial">
        <div class="input-group">
          <span class="input-label">
            <el-button @click="searchSerialPorts" class="icon-only-refresh">
              <el-icon><Refresh /></el-icon>
            </el-button>
            端口:
          </span>
          <el-select
            v-model="serialPort"
            placeholder="请选择串口"
            style="flex: 1"
            :teleported="false"
            @click="searchSerialPorts"
          >
            <el-option v-for="port in serialPorts" :key="port" :label="port" :value="port" />
          </el-select>
        </div>
        <div class="input-group">
          <span class="input-label">波特率:</span>
          <el-select
            v-model="serialBaudRate"
            placeholder="请选择或输入波特率"
            filterable
            allow-create
            style="flex: 1"
            :teleported="false"
          >
            <el-option v-for="rate in baudRates" :key="rate" :label="rate" :value="rate" />
          </el-select>
        </div>
        <div class="input-group" v-if="serialAdvanced">
          <span class="input-label">数据位:</span>
          <el-select
            v-model="serialDataBits"
            placeholder="请选择数据位"
            style="flex: 1"
            :teleported="false"
          >
            <!-- 默认为8 -->
            <el-option v-for="bit in dataBits" :key="bit" :label="bit" :value="bit" />
          </el-select>
        </div>
        <div class="input-group" v-if="serialAdvanced">
          <span class="input-label">停止位:</span>
          <el-select
            v-model="serialStopBits"
            placeholder="请选择停止位"
            style="flex: 1"
            :teleported="false"
          >
            <el-option v-for="bit in stopBits" :key="bit" :label="bit" :value="bit" />
          </el-select>
        </div>
        <div class="input-group" v-if="serialAdvanced">
          <span class="input-label">校验位:</span>
          <el-select
            v-model="serialParity"
            placeholder="请选择校验位"
            style="flex: 1"
            :teleported="false"
          >
            <el-option
              v-for="parity in parities"
              :key="parity.value"
              :label="parity.label"
              :value="parity.value"
            />
          </el-select>
        </div>
        <div class="input-group">
          <span class="input-label">高级选项:</span>
          <el-checkbox v-model="serialAdvanced"></el-checkbox>
        </div>
      </el-tab-pane>

      <el-tab-pane label="文件输入" name="file">
        <div class="input-group">
          <span class="input-label">文件路径:</span>
          <el-input v-model="filePath" placeholder="请输入文件路径" />
          <el-button type="default" @click="triggerFileSelection">选择文件</el-button>
        </div>
      </el-tab-pane>

      <el-tab-pane label="网络连接" name="network">
        <div class="input-group">
          <span class="input-label">网络协议:</span>
          <el-select v-model="networkProtocol" style="flex: 1" :teleported="false">
            <el-option label="TCP" value="tcp" />
            <el-option label="UDP" value="udp" />
          </el-select>
        </div>
        <div class="input-group">
          <span class="input-label">{{
            networkProtocol === 'tcp' ? '远端地址:' : '监听地址:'
          }}</span>
          <el-input
            v-model="networkIp"
            :placeholder="networkProtocol === 'tcp' ? '127.0.0.1' : '0.0.0.0'"
          />
        </div>
        <div class="input-group">
          <span class="input-label">网络端口:</span>
          <el-input
            v-model="networkPortText"
            inputmode="numeric"
            maxlength="5"
            placeholder="请输入端口"
            style="flex: 1; width: 100%"
          />
        </div>
      </el-tab-pane>
    </el-tabs>
    <template #footer>
      <el-button @click="showInputDialog = false">取消</el-button>
      <el-button type="primary" @click="handleInputSubmit">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, inject, nextTick, type Ref } from 'vue'
import { ButtonItem } from '@/settings/config'
import { toolBarIcon } from '@/settings/icons'
import {
  getWindowButtonList,
  getLayoutList,
  getIoList,
  handleIo,
} from '@/composables/useToolsManager'
import { showStatusBar } from '@/composables/useStatusManager'

import emitter from '@/hooks/useMitt'
import {
  ElDialog,
  ElTabs,
  ElTabPane,
  ElButton,
  ElSelect,
  ElOption,
  ElInput,
  ElCheckbox,
  ElIcon,
} from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { useApplicationSelector } from '@/composables/useApplicationSelector'
import { getPanelIconComponent } from '@/settings/panelIcons'

const ipcRenderer = window.ipcRenderer
const position = ref<'top' | 'right' | 'bottom' | 'left'>('bottom')
const showSaveButton = ref(false)
const { currentApplication, currentApplicationId } = useApplicationSelector()

import { useDevice } from '@/hooks/useDevice'

const deviceInstance = useDevice()
const deviceConnected = deviceInstance.deviceConnected

// 从useDevice获取对话框相关状态和方法
const {
  showInputDialog,
  activeTab,
  serialPort,
  serialBaudRate,
  serialDataBits,
  serialStopBits,
  serialParity,
  serialAdvanced,
  selectTargetFile,
  filePath,
  networkIp,
  networkPort,
  networkProtocol,
  serialPorts,
  baudRates,
  dataBits,
  stopBits,
  parities,
  inputDialog,
  searchSerialPorts,
  handleInputSubmit,
} = deviceInstance

// 添加triggerFileSelection函数，注意这里是const而不是sconst
const triggerFileSelection = () => {
  selectTargetFile()
}

watch(networkProtocol, (protocol) => {
  if (protocol === 'udp' && networkIp.value === '127.0.0.1') networkIp.value = '0.0.0.0'
  if (protocol === 'tcp' && networkIp.value === '0.0.0.0') networkIp.value = '127.0.0.1'
})

const networkPortText = computed({
  get: () => (networkPort.value === undefined ? '' : String(networkPort.value)),
  set: (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 5)
    if (!digits) {
      networkPort.value = undefined
      return
    }

    const port = Number(digits)
    networkPort.value = port > 65535 ? 65535 : port
  },
})

const handleDeviceConnected = () => {
  if (deviceConnected.value === true) {
    deviceInstance.closeCurrDevice()
  } else {
    if (deviceInstance.globalDevice.value.connected === null) {
      // 如果没有设备配置，打开输入对话框
      showInputDialog.value = true
      searchSerialPorts(true)
    } else {
      deviceInstance.openCurrDevice()
    }
  }
}

const handleStatus = () => {
  showStatusBar.value = !showStatusBar.value
}

const statusBtn: ButtonItem = {
  msg: 'status',
  title: 'Status',
  icon: toolBarIcon.status,
  template: '', // 补充 template 属性
  text: '', // 补充 text 属性
}

const handleList = computed(() => getWindowButtonList(currentApplication.value?.windowIds ?? []))

// 使用computed属性替代原来的reactive数组
const layoutList = computed(() => getLayoutList(position.value))
const ioList = computed(() => getIoList(position.value))

watch(currentApplicationId, (newApplicationId, oldApplicationId) => {
  if (newApplicationId === oldApplicationId) return

  showSaveButton.value = false
  ipcRenderer?.send('console-to-node', ['watch:application', newApplicationId])
  deviceInstance.removeCurrDevice()
})

// 扩展事件定义
const emit = defineEmits<{
  action: [action: string]
  positionChange: [position: 'top' | 'right' | 'bottom' | 'left']
}>()

const isDragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })
const toolbarRect = ref({ x: 0, y: 0 })
const activeDockZone = ref<'top' | 'right' | 'bottom' | 'left' | null>(null)
const toolbarSize = 40

const getHeaderHeight = () => {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--app-header-height')
  return Number.parseFloat(value) || 0
}

const toolbarStyle = computed(() => {
  return {
    left: `${toolbarRect.value.x}px`,
    top: `${toolbarRect.value.y}px`,
  }
})

// 新增：根据dock-zone类型返回样式
const getDockZoneStyle = (zone: 'top' | 'right' | 'bottom' | 'left') => {
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight
  const headerHeight = getHeaderHeight()

  switch (zone) {
    case 'top':
      return {
        top: `${headerHeight}px`,
        left: '0px',
        width: `${windowWidth}px`,
        height: `${toolbarSize}px`,
      }
    case 'right':
      // 当statusbar在右边时，dock-zone应该避开statusbar
      // const rightOffset = statusbarPosition?.value === 'right' ? statusbarWidth : 0
      return {
        top: `${headerHeight}px`,
        // left: `${windowWidth - dockWidth - rightOffset}px`,
        left: `${windowWidth - toolbarSize}px`,
        width: `${toolbarSize}px`,
        height: `${windowHeight - headerHeight}px`,
      }
    case 'bottom':
      return {
        top: `${windowHeight - toolbarSize}px`,
        left: '0px',
        width: `${windowWidth}px`,
        height: `${toolbarSize}px`,
      }
    case 'left':
      // 当statusbar在左边时，dock-zone应该避开statusbar
      // const leftOffset = statusbarPosition?.value === 'left' ? statusbarWidth : 0
      return {
        top: `${headerHeight}px`,
        // left: `${leftOffset}px`,
        left: `0px`,
        width: `${toolbarSize}px`,
        height: `${windowHeight - headerHeight}px`,
      }
    default:
      return {}
  }
}

// 在变量声明区域添加
const originalState = ref({
  x: 0,
  y: 0,
  position: 'top' as const,
})

// 修改startDrag函数
const startDrag = (event: MouseEvent) => {
  const handle = (event.target as HTMLElement).closest('.toolbar-handle')
  if (!handle) return

  isDragging.value = true
  activeDockZone.value = null

  // 保存拖动前的状态
  originalState.value = {
    x: toolbarRect.value.x,
    y: toolbarRect.value.y,
    position: position.value as typeof originalState.value.position,
  }

  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  dragOffset.value = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }

  document.addEventListener('mousemove', handleDrag)
  document.addEventListener('mouseup', stopDrag)
}

const stopDrag = () => {
  if (!isDragging.value) return

  isDragging.value = false

  const threshold = 50
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight
  const headerHeight = getHeaderHeight()
  const x = toolbarRect.value.x
  const y = toolbarRect.value.y

  let shouldSnap = false
  let finalPosition = position.value

  // 计算最近的边缘
  const distances = [
    { zone: 'top' as const, distance: Math.abs(y - headerHeight) },
    { zone: 'bottom' as const, distance: Math.abs(windowHeight - y - toolbarSize) },
    { zone: 'left' as const, distance: Math.abs(x) },
    { zone: 'right' as const, distance: Math.abs(windowWidth - x - toolbarSize) },
  ]

  let minDistance = Infinity
  distances.forEach(({ zone, distance }) => {
    if (distance < threshold && distance < minDistance) {
      minDistance = distance
      finalPosition = zone
      shouldSnap = true
    }
  })

  if (shouldSnap) {
    // 吸附到边缘
    position.value = finalPosition
    emit('positionChange', finalPosition)
    snapToEdge()
  } else {
    // 恢复到拖动前的状态
    toolbarRect.value = {
      x: originalState.value.x,
      y: originalState.value.y,
    }
    position.value = originalState.value.position
    emit('positionChange', originalState.value.position)
  }

  activeDockZone.value = null
  document.removeEventListener('mousemove', handleDrag)
  document.removeEventListener('mouseup', stopDrag)
}

const handleDrag = (event: MouseEvent) => {
  if (!isDragging.value) return

  const x = event.clientX - dragOffset.value.x
  const y = event.clientY - dragOffset.value.y

  // 只更新临时位置，不改变实际位置
  toolbarRect.value = { x, y }

  // 简化的边缘检测，只用于高亮显示
  const threshold = 50
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight
  const headerHeight = getHeaderHeight()

  let nearestZone: 'top' | 'right' | 'bottom' | 'left' | null = null
  let minDistance = Infinity

  const distances = [
    { zone: 'top', distance: Math.abs(y - headerHeight) },
    { zone: 'bottom', distance: Math.abs(windowHeight - y - toolbarSize) },
    { zone: 'left', distance: Math.abs(x) },
    { zone: 'right', distance: Math.abs(windowWidth - x - toolbarSize) },
  ]

  distances.forEach(({ zone, distance }) => {
    if (distance < threshold && distance < minDistance) {
      minDistance = distance
      nearestZone = zone as 'top' | 'right' | 'bottom' | 'left'
    }
  })

  activeDockZone.value = nearestZone
  // 注意：这里不再调用emit('positionChange')和实时更新position
}

const handleAction = (action: string) => {
  emitter.emit(action)
}

const dataInputNoDragSelector = [
  '.data-input-overlay',
  '.data-input-overlay *',
  '.data-input-dialog',
  '.data-input-dialog *',
  '.el-popper',
  '.el-select-dropdown',
  '.el-select-dropdown *',
].join(',')

let dataInputMutationObserver: MutationObserver | undefined
let lastPointerInput: HTMLInputElement | HTMLTextAreaElement | undefined
let lastPointerInputUntil = 0

function forceNoDragOnDataInputDialog() {
  document.body.style.setProperty('-webkit-app-region', 'no-drag', 'important')
  document.querySelectorAll<HTMLElement>(dataInputNoDragSelector).forEach((element) => {
    element.style.setProperty('-webkit-app-region', 'no-drag', 'important')
  })
  document
    .querySelectorAll<HTMLElement>(
      '.data-input-dialog input, .data-input-dialog textarea, .data-input-dialog .el-input__inner',
    )
    .forEach((element) => {
      element.style.setProperty('pointer-events', 'auto', 'important')
      element.style.setProperty('user-select', 'text', 'important')
      element.style.setProperty('-webkit-user-select', 'text', 'important')
    })
}

function resolveDialogTextInput(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return undefined
  if (!target.closest('.data-input-dialog')) return undefined
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return target

  return (
    target.closest('.el-input')?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea') ??
    undefined
  )
}

function restorePointerInputFocus() {
  const input = lastPointerInput
  if (!input || Date.now() > lastPointerInputUntil || !document.contains(input)) return
  if (document.activeElement !== input) input.focus({ preventScroll: true })
}

function handleDataInputPointer(event: Event) {
  if (!showInputDialog.value) return
  forceNoDragOnDataInputDialog()

  const input = resolveDialogTextInput(event.target)
  if (!input) {
    lastPointerInput = undefined
    lastPointerInputUntil = 0
    return
  }

  lastPointerInput = input
  lastPointerInputUntil = Date.now() + 300
  requestAnimationFrame(restorePointerInputFocus)
  window.setTimeout(restorePointerInputFocus, 0)
  window.setTimeout(restorePointerInputFocus, 60)
  window.setTimeout(restorePointerInputFocus, 160)
}

watch(showInputDialog, async (visible) => {
  if (!visible) {
    dataInputMutationObserver?.disconnect()
    dataInputMutationObserver = undefined
    lastPointerInput = undefined
    lastPointerInputUntil = 0
    return
  }

  await nextTick()
  forceNoDragOnDataInputDialog()
  dataInputMutationObserver?.disconnect()
  dataInputMutationObserver = new MutationObserver(forceNoDragOnDataInputDialog)
  dataInputMutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style'],
  })
})

// 修改handleLayout函数
const handleLayout = (action: string) => {
  switch (action) {
    case 'save':
      showSaveButton.value = false
      emitter.emit('save')
      break
    case 'auto':
      emitter.emit('auto')
      break
    case 'reset':
      showStatusBar.value = true
      emitter.emit('reset')
      break
  }
}

// 注入状态栏位置信息
const statusbarPosition = inject<Ref<'left' | 'right'>>('statusbarPosition')
const statusbarSize = inject<Ref<{ width: number; height: number }>>('statusbarSize')

const snapToEdge = () => {
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight
  const headerHeight = getHeaderHeight()

  switch (position.value) {
    case 'top':
      toolbarRect.value = { x: 0, y: headerHeight }
      break
    case 'right':
      // 当ToolBar在右边时，紧贴屏幕右边缘
      toolbarRect.value = { x: windowWidth - toolbarSize, y: headerHeight }
      break
    case 'bottom':
      toolbarRect.value = { x: 0, y: windowHeight - toolbarSize }
      break
    case 'left':
      // 当ToolBar在左边时，紧贴屏幕左边缘
      toolbarRect.value = { x: 0, y: headerHeight }
      break
  }

  emit('positionChange', position.value)
}

function handleDeviceEvent(event: KeyboardEvent) {
  // 处理Ctrl+F快捷键 - 打开搜索框
  if ((event.ctrlKey || event.metaKey) && event.key === 'd') {
    event.preventDefault()
    event.stopPropagation()
    handleDeviceConnected()
  }
}

function handleInputDialogEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !showInputDialog.value) return
  event.preventDefault()
  showInputDialog.value = false
}

onMounted(() => {
  searchSerialPorts(true)
  emitter.on('input-event', inputDialog)
  document.addEventListener('pointerdown', handleDataInputPointer, true)
  document.addEventListener('mousedown', handleDataInputPointer, true)
  document.addEventListener('click', handleDataInputPointer, true)
  document.addEventListener('focusout', restorePointerInputFocus, true)

  snapToEdge()
  window.addEventListener('resize', snapToEdge)
  window.addEventListener('keyup', handleDeviceEvent)
  window.addEventListener('keydown', handleInputDialogEscape, { capture: true })

  // 监听状态栏位置变化
  watch(
    [statusbarPosition, statusbarSize],
    () => {
      snapToEdge()
    },
    { immediate: true },
  )

  // 添加布局更改监听
  emitter.on('layout-changed', () => {
    showSaveButton.value = true
  })
})

onUnmounted(() => {
  dataInputMutationObserver?.disconnect()
  document.removeEventListener('mousemove', handleDrag)
  document.removeEventListener('mouseup', stopDrag)
  document.removeEventListener('pointerdown', handleDataInputPointer, true)
  document.removeEventListener('mousedown', handleDataInputPointer, true)
  document.removeEventListener('click', handleDataInputPointer, true)
  document.removeEventListener('focusout', restorePointerInputFocus, true)
  window.removeEventListener('resize', snapToEdge)
  window.removeEventListener('keyup', handleDeviceEvent)
  window.removeEventListener('keydown', handleInputDialogEscape, { capture: true })

  // 移除布局更改监听
  emitter.off('layout-changed')
})
</script>

<style scoped>
.toolbar {
  position: fixed;
  color: var(--app-text-secondary);
  background: var(--app-surface);
  display: flex;
  align-items: center;
  border: 1px solid var(--app-border);
  box-shadow: 0 2px 10px var(--app-shadow);
  z-index: 1000;
  transition: none;
  padding: 0;
  margin: 0;
  user-select: none; /* 现代浏览器 */
  -webkit-user-select: none; /* Safari */
  -moz-user-select: none; /* Firefox */
  -ms-user-select: none; /* IE11/Edge 旧版 */
}

.toolbar-top {
  top: var(--app-header-height, 0px);
  left: 0;
  width: 100%;
  height: 40px;
  transform: none;
  border-radius: 0;
  border-width: 0 0 1px;
  flex-direction: row;
  padding: 0;
  margin: 0;
}

.toolbar-bottom {
  bottom: 0;
  left: 0;
  width: 100%;
  height: 40px;
  transform: none;
  border-radius: 0;
  border-width: 1px 0 0;
  flex-direction: row;
  padding: 0;
  margin: 0;
}

.toolbar-left {
  top: var(--app-header-height, 0px);
  left: 0;
  width: 40px;
  height: calc(100vh - var(--app-header-height, 0px));
  transform: none;
  border-radius: 0;
  border-width: 0 1px 0 0;
  flex-direction: column;
  padding: 0;
  margin: 0;
}

.toolbar-right {
  top: var(--app-header-height, 0px);
  right: 0;
  width: 40px;
  height: calc(100vh - var(--app-header-height, 0px));
  transform: none;
  border-radius: 0;
  border-width: 0 0 0 1px;
  flex-direction: column;
  padding: 0;
  margin: 0;
}

.toolbar-handle {
  color: var(--app-text-muted);
  cursor: grab;
  padding: 4px;
  margin: 8px 4px;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.toolbar-handle:hover {
  opacity: 1;
}

.toolbar-left .toolbar-handle,
.toolbar-right .toolbar-handle {
  margin-right: 0;
  margin-bottom: 8px;
  transform: rotate(90deg);
}

.toolbar-content {
  display: flex;
  min-width: 0;
  gap: 4px;
  font-size: 12px;
  font-family: inherit;
  align-items: center;
}

.toolbar-top .toolbar-content,
.toolbar-bottom .toolbar-content {
  flex: 1;
  overflow-x: auto;
  scrollbar-width: none;
}

.toolbar-top .toolbar-content::-webkit-scrollbar,
.toolbar-bottom .toolbar-content::-webkit-scrollbar {
  display: none;
}

.toolbar-left .toolbar-content,
.toolbar-right .toolbar-content {
  flex-direction: column;
}

.toolbar-btn {
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--app-text-secondary);
  padding: 5px;
  cursor: pointer;
  transition:
    color 140ms ease,
    background-color 140ms ease;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.toolbar-btn :deep(svg) {
  display: block;
  width: 18px !important;
  height: 18px !important;
  color: inherit;
}

.toolbar-btn :deep(svg path),
.toolbar-btn :deep(svg circle),
.toolbar-btn :deep(svg rect),
.toolbar-btn :deep(svg polygon),
.toolbar-btn :deep(svg polyline) {
  fill: currentColor !important;
  opacity: 1;
}

.toolbar-btn :deep(svg [fill='none']) {
  fill: none !important;
  stroke: currentColor !important;
}

.divider {
  width: 1px;
  height: 20px;
  padding: 0;
  border-left: 1px solid var(--app-border);
  color: transparent;
  cursor: default;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toolbar-left .toolbar-btn,
.toolbar-right .toolbar-btn {
  padding: 5px;
  font-size: 12px;
  flex: none;
}

.toolbar-btn:hover {
  color: var(--app-text);
  background: var(--app-hover);
}

.toolbar-dock-zones {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  opacity: 0;
  transition: opacity 0.3s;
  pointer-events: none;
  z-index: 9000;
}

.toolbar-dragging .toolbar-dock-zones {
  opacity: 1;
  pointer-events: auto;
}

.dock-zone {
  position: fixed;
  background: color-mix(in srgb, var(--el-color-primary) 18%, transparent);
  border: 2px dashed var(--el-color-primary);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-color-primary);
  font-size: 12px;
  font-weight: bold;
  z-index: 999;
  transition: all 0.3s;
  box-sizing: border-box;
}

.dock-zone:hover {
  background: color-mix(in srgb, var(--el-color-primary) 30%, transparent);
}
/* 更新滑块容器样式 */
.toggle-switch-container {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px; /* 减少内边距 */
}

/* 更新水平滑轨样式 */
.toggle-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  padding: 2px;
  width: 44px;
  height: 24px;
  box-sizing: border-box;
  border-radius: 12px; /* 从14px减小到12px */
  border: 1px solid var(--app-border-strong);
  background-color: var(--app-surface-muted);
  transition: background-color 0.3s;
}

/* 更新滑块样式 */
.toggle-slider {
  position: absolute;
  width: 18px;
  height: 18px;
  left: 3px;
  top: 50%;
  transform: translateY(-50%);
  transition: transform 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 更新滑块激活状态的移动距离 */
.toggle-switch.toggle-on .toggle-slider {
  transform: translate(18px, -50%);
}

/* 更新滑块图标大小 */
.slider-icon {
  font-size: 12px; /* 从14px减小到12px */
  line-height: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.slider-icon :deep(svg) {
  display: block;
  width: 18px !important;
  height: 18px !important;
}

/* 更新垂直工具栏的滑轨样式 */
.toolbar-left .toggle-switch,
.toolbar-right .toggle-switch {
  flex-direction: column;
  width: 24px;
  height: 44px;
  border-radius: 12px; /* 从14px减小到12px */
}

.toolbar-left .toggle-slider,
.toolbar-right .toggle-slider {
  top: 3px;
  left: 2px;
  transform: none;
}

/* 更新垂直工具栏的滑块激活状态移动距离 */
.toolbar-left .toggle-switch.toggle-on .toggle-slider,
.toolbar-right .toggle-switch.toggle-on .toggle-slider {
  transform: translateY(18px);
}

.toolbar-left .toggle-content,
.toolbar-right .toggle-content {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* 输入对话框样式 */
.input-group {
  display: flex;
  align-items: center;
  min-height: 32px;
  margin-bottom: 14px;
}

.input-label {
  min-width: 94px;
  text-align: right;
  margin-right: 12px;
  font-size: 14px;
  color: var(--app-text-secondary);
}

/* 添加输入框和按钮之间的间距 */
.input-group .el-input {
  flex: 1;
  margin-right: 8px; /* 在输入框右侧添加间距 */
}

.input-group :deep(.el-select),
.input-group :deep(.el-input-number) {
  flex: 1;
}

:global(.data-input-dialog .el-input-number .el-input__inner) {
  text-align: left !important;
}

:global(.data-input-dialog .el-dialog__body) {
  padding: 8px 22px 10px;
}

:global(.data-input-overlay),
:global(.data-input-overlay *),
:global(.data-input-overlay .el-overlay-dialog),
:global(.data-input-dialog),
:global(.data-input-dialog *),
:global(.data-input-dialog .el-input__wrapper),
:global(.data-input-dialog .el-input__inner),
:global(.data-input-dialog .el-select),
:global(.data-input-dialog .el-button),
:global(.el-popper),
:global(.el-select-dropdown),
:global(.el-select-dropdown *) {
  -webkit-app-region: no-drag !important;
}

:global(.data-input-dialog .el-input__inner),
:global(.data-input-dialog input),
:global(.data-input-dialog textarea) {
  user-select: text;
  -webkit-user-select: text;
  pointer-events: auto;
}

:global(.data-input-dialog .el-tabs__header) {
  margin-bottom: 20px;
}

@media (max-width: 560px) {
  .input-group {
    align-items: stretch;
    flex-direction: column;
    gap: 6px;
  }

  .input-label {
    min-width: 0;
    margin-right: 0;
    text-align: left;
  }
}

/* 优化文件选择按钮的样式 */
.input-group .el-button {
  white-space: nowrap; /* 确保按钮文字不换行 */
}

/* 保留原有的.el-input样式 */
.el-input {
  flex: 1;
}

.dialog-footer {
  text-align: right;
}

.icon-only-refresh {
  background: transparent !important;
  border: none !important;
  padding: 4px !important;
  min-width: auto !important;
  width: 32px !important;
  height: 32px !important;
  display: inline-block !important;
  align-items: center !important;
  justify-content: center !important;
  color: var(--app-text-secondary) !important;
}

.icon-only-refresh:hover {
  background: var(--app-hover) !important;
  color: #4096ff !important;
}

.icon-only-refresh .el-icon {
  font-size: 16px !important;
}
</style>
