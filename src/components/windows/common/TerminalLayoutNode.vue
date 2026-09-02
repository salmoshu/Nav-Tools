<template>
  <TerminalPane
    v-if="node.kind === 'pane'"
    :pane="node"
    :focused="node.id === focusedPaneId"
    :pane-count="paneCount"
    :expanded="node.id === expandedPaneId"
    :capabilities="capabilities"
    :profiles="profiles"
    :session-info="sessionInfos[node.sessionId || '']"
    :auto-open-ssh="node.id === autoOpenSshPaneId"
    @session="(...args) => $emit('session', ...args)"
    @focus="(id) => $emit('focus', id)"
    @expand="(id) => $emit('expand', id)"
    @split="(...args) => $emit('split', ...args)"
    @close="(id) => $emit('close', id)"
    @toggle-presentation="(id) => $emit('toggle-presentation', id)"
    @save-profile="(profile) => $emit('save-profile', profile)"
    @remove-profile="(id) => $emit('remove-profile', id)"
    @ssh-dialog-opened="(id) => $emit('ssh-dialog-opened', id)"
  />
  <div v-else ref="splitElement" class="split-node" :class="node.direction">
    <TerminalLayoutNode
      class="split-child"
      :style="{ flex: `${node.ratio ?? 0.5} 1 0%` }"
      :node="node.first"
      :focused-pane-id="focusedPaneId"
      :pane-count="paneCount"
      :expanded-pane-id="expandedPaneId"
      :capabilities="capabilities"
      :profiles="profiles"
      :session-infos="sessionInfos"
      :auto-open-ssh-pane-id="autoOpenSshPaneId"
      @session="(...args) => $emit('session', ...args)"
      @focus="(id) => $emit('focus', id)"
      @expand="(id) => $emit('expand', id)"
      @resize="(...args) => $emit('resize', ...args)"
      @split="(...args) => $emit('split', ...args)"
      @close="(id) => $emit('close', id)"
      @toggle-presentation="(id) => $emit('toggle-presentation', id)"
      @save-profile="(profile) => $emit('save-profile', profile)"
      @remove-profile="(id) => $emit('remove-profile', id)"
      @ssh-dialog-opened="(id) => $emit('ssh-dialog-opened', id)"
    />
    <div
      ref="dividerElement"
      class="split-divider"
      :class="{ dragging }"
      role="separator"
      tabindex="0"
      :aria-orientation="node.direction === 'horizontal' ? 'vertical' : 'horizontal'"
      :aria-valuenow="Math.round((node.ratio ?? 0.5) * 100)"
      aria-valuemin="5"
      aria-valuemax="95"
      :title="t('common.terminal.resizeSplitHint')"
      @pointerdown="startResize"
      @pointermove="resizeWithPointer"
      @pointerup="finishResize"
      @pointercancel="finishResize"
      @lostpointercapture="finishResize"
      @dblclick="$emit('resize', node.id, 0.5)"
      @keydown="resizeWithKeyboard"
    ></div>
    <TerminalLayoutNode
      class="split-child"
      :style="{ flex: `${1 - (node.ratio ?? 0.5)} 1 0%` }"
      :node="node.second"
      :focused-pane-id="focusedPaneId"
      :pane-count="paneCount"
      :expanded-pane-id="expandedPaneId"
      :capabilities="capabilities"
      :profiles="profiles"
      :session-infos="sessionInfos"
      :auto-open-ssh-pane-id="autoOpenSshPaneId"
      @session="(...args) => $emit('session', ...args)"
      @focus="(id) => $emit('focus', id)"
      @expand="(id) => $emit('expand', id)"
      @resize="(...args) => $emit('resize', ...args)"
      @split="(...args) => $emit('split', ...args)"
      @close="(id) => $emit('close', id)"
      @toggle-presentation="(id) => $emit('toggle-presentation', id)"
      @save-profile="(profile) => $emit('save-profile', profile)"
      @remove-profile="(id) => $emit('remove-profile', id)"
      @ssh-dialog-opened="(id) => $emit('ssh-dialog-opened', id)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useTerminalTranslate } from '@/core/terminal/TerminalI18n'
import type { TerminalLayoutNode, TerminalSplitDirection } from '@/core/terminal/TerminalLayout'
import type {
  SshConnectionProfile,
  TerminalCapabilities,
  TerminalLaunchSpec,
  TerminalSessionInfo,
} from '@/core/terminal/TerminalTypes'
import TerminalPane from './TerminalPane.vue'

const t = useTerminalTranslate()

const props = defineProps<{
  node: TerminalLayoutNode
  focusedPaneId?: string
  paneCount: number
  expandedPaneId?: string
  capabilities: TerminalCapabilities
  profiles: SshConnectionProfile[]
  sessionInfos: Record<string, TerminalSessionInfo>
  autoOpenSshPaneId?: string
}>()
const emit = defineEmits<{
  session: [paneId: string, session: TerminalSessionInfo, launch: TerminalLaunchSpec]
  focus: [paneId: string]
  expand: [paneId: string]
  resize: [splitId: string, ratio: number]
  split: [paneId: string, direction: TerminalSplitDirection, inherit: boolean]
  close: [paneId: string]
  'toggle-presentation': [paneId: string]
  'save-profile': [profile: SshConnectionProfile]
  'remove-profile': [id: string]
  'ssh-dialog-opened': [paneId: string]
}>()

const splitElement = ref<HTMLDivElement | null>(null)
const dividerElement = ref<HTMLDivElement | null>(null)
const dragging = ref(false)
let activePointerId: number | null = null

function startResize(event: PointerEvent): void {
  if (event.button !== 0 || props.node.kind !== 'split') return
  event.preventDefault()
  activePointerId = event.pointerId
  dragging.value = true
  dividerElement.value?.setPointerCapture(event.pointerId)
  resizeWithPointer(event)
}

function resizeWithPointer(event: PointerEvent): void {
  if (!dragging.value || event.pointerId !== activePointerId || props.node.kind !== 'split') return
  const rect = splitElement.value?.getBoundingClientRect()
  if (!rect?.width || !rect.height) return
  const ratio =
    props.node.direction === 'horizontal'
      ? (event.clientX - rect.left) / rect.width
      : (event.clientY - rect.top) / rect.height
  emit('resize', props.node.id, clampRatio(ratio))
}

function finishResize(event: PointerEvent): void {
  if (event.pointerId !== activePointerId) return
  const divider = dividerElement.value
  if (divider?.hasPointerCapture(event.pointerId)) divider.releasePointerCapture(event.pointerId)
  activePointerId = null
  dragging.value = false
}

function resizeWithKeyboard(event: KeyboardEvent): void {
  if (props.node.kind !== 'split') return
  const horizontal = props.node.direction === 'horizontal'
  const decrease = horizontal ? event.key === 'ArrowLeft' : event.key === 'ArrowUp'
  const increase = horizontal ? event.key === 'ArrowRight' : event.key === 'ArrowDown'
  if (!decrease && !increase) return
  event.preventDefault()
  const delta = event.shiftKey ? 0.1 : 0.03
  emit('resize', props.node.id, clampRatio((props.node.ratio ?? 0.5) + (increase ? delta : -delta)))
}

function clampRatio(ratio: number): number {
  if (props.node.kind !== 'split') return ratio
  const rect = splitElement.value?.getBoundingClientRect()
  const total = props.node.direction === 'horizontal' ? rect?.width : rect?.height
  const minimumRatio = total ? Math.min(0.5, 50 / total) : 0.05
  return Math.min(1 - minimumRatio, Math.max(minimumRatio, ratio))
}
</script>

<style scoped>
.split-node {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
}
.split-node.horizontal {
  flex-direction: row;
}
.split-node.vertical {
  flex-direction: column;
}
.split-child {
  flex-basis: 0;
  min-width: 0;
  min-height: 0;
}
.split-divider {
  position: relative;
  z-index: 2;
  flex: 0 0 10px;
  outline: none;
  background: transparent;
  touch-action: none;
}
.split-divider::after {
  position: absolute;
  border-radius: 2px;
  background: var(--app-border-strong);
  content: '';
  transition:
    background 0.12s ease,
    box-shadow 0.12s ease;
}
.split-divider:hover::after,
.split-divider:focus-visible::after,
.split-divider.dragging::after {
  background: var(--el-color-primary);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--el-color-primary) 18%, transparent);
}
.split-node.horizontal > .split-divider {
  cursor: col-resize;
}
.split-node.horizontal > .split-divider::after {
  top: 0;
  bottom: 0;
  left: 50%;
  width: 4px;
  transform: translateX(-50%);
}
.split-node.vertical > .split-divider {
  cursor: row-resize;
}
.split-node.vertical > .split-divider::after {
  top: 50%;
  right: 0;
  left: 0;
  height: 4px;
  transform: translateY(-50%);
}
</style>
