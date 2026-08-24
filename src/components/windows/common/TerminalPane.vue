<template>
  <div class="terminal-pane" :class="{ focused }" @pointerdown="focusPane">
    <header class="pane-header">
      <div class="pane-actions">
        <el-tooltip
          v-if="sessionInfo?.kind === 'ssh'"
          :content="t('common.terminal.openSftp')"
          placement="bottom"
          :show-after="400"
        >
          <el-button text class="pane-action" @click="sftpVisible = !sftpVisible">
            <el-icon><FolderOpened /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip
          v-if="sessionInfo?.kind === 'ssh'"
          :content="t('common.terminal.portForwarding')"
          placement="bottom"
          :show-after="400"
        >
          <el-button text class="pane-action" @click="forwardVisible = true">
            <el-icon><Connection /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip
          v-if="paneCount > 1"
          :content="
            expanded ? t('common.terminal.restorePane') : t('common.terminal.maximizePaneShortcut')
          "
          placement="bottom"
          :show-after="400"
        >
          <el-button text class="pane-action" @click="$emit('expand', pane.id)">
            <el-icon><component :is="expanded ? ScaleToOriginal : FullScreen" /></el-icon>
          </el-button>
        </el-tooltip>
        <el-dropdown
          trigger="click"
          popper-class="terminal-pane-menu"
          @command="handleSplitCommand"
        >
          <el-button text class="pane-action" :aria-label="t('common.terminal.splitTerminal')">
            <el-icon><SquareSplitVertical /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="right">
                <el-icon><PanelRightClose /></el-icon>
                <span>{{ t('common.terminal.splitRight') }}</span>
                <kbd>{{ splitRightShortcut }}</kbd>
              </el-dropdown-item>
              <el-dropdown-item command="down">
                <el-icon><PanelBottomClose /></el-icon>
                <span>{{ t('common.terminal.splitDown') }}</span>
                <kbd>{{ splitDownShortcut }}</kbd>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-tooltip
          v-if="paneCount > 1"
          :content="t('common.terminal.closePaneShortcut')"
          placement="bottom"
          :show-after="400"
        >
          <el-button
            text
            class="pane-action pane-action--danger"
            :aria-label="t('common.terminal.closePaneShortcut')"
            @click="$emit('close', pane.id)"
          >
            <el-icon><Close /></el-icon>
          </el-button>
        </el-tooltip>
      </div>
    </header>

    <div v-if="!pane.sessionId" class="launcher">
      <div class="launcher-shell">
        <div class="launcher-heading">
          <span class="launcher-heading__icon"><Monitor /></span>
          <span>
            <strong>{{ t('common.terminal.startSession') }}</strong>
            <small>{{ t('common.terminal.startSessionDescription') }}</small>
          </span>
        </div>
        <div class="launcher-cwd">
          <el-icon><FolderOpened /></el-icon>
          <el-input
            v-model="cwd"
            :placeholder="t('common.terminal.initialDirectoryOptional')"
            class="cwd-input"
          />
        </div>
        <div class="launcher-grid">
          <button
            v-for="shell in capabilities.localShells"
            :key="shell.kind"
            class="launch-card"
            :disabled="connecting"
            @click="launchLocal(shell.kind, shell.label)"
          >
            <span class="launch-card__icon"><Monitor /></span>
            <span class="launch-card__copy">
              <strong>{{ shell.label }}</strong>
              <small>{{ t('common.terminal.localShellDescription') }}</small>
            </span>
            <el-icon class="launch-card__arrow"><Right /></el-icon>
          </button>
          <button
            v-if="capabilities.wslDistros.length"
            class="launch-card"
            :disabled="connecting"
            @click="wslDialogVisible = true"
          >
            <span class="launch-card__icon"><Platform /></span>
            <span class="launch-card__copy">
              <strong>WSL</strong>
              <small>{{ t('common.terminal.wslDescription') }}</small>
            </span>
            <el-icon class="launch-card__arrow"><Right /></el-icon>
          </button>
          <button
            v-if="capabilities.sshAvailable"
            class="launch-card launch-card--ssh"
            :disabled="connecting"
            @click="openSshDialog"
          >
            <span class="launch-card__icon"><Connection /></span>
            <span class="launch-card__copy">
              <strong>SSH</strong>
              <small>{{ t('common.terminal.sshDescription') }}</small>
            </span>
            <el-icon class="launch-card__arrow"><Right /></el-icon>
          </button>
        </div>
        <el-alert
          v-if="launchError && !sshDialogVisible"
          type="error"
          show-icon
          :title="launchError"
          :closable="false"
        />
        <div v-if="connecting && !sshDialogVisible" class="connecting" role="status">
          <span class="connecting__icon">
            <el-icon class="is-loading"><Loading /></el-icon>
          </span>
          <span>
            <strong>{{ t('common.terminal.connecting') }}</strong>
            <small>{{ connectingTarget }}</small>
          </span>
        </div>
      </div>
    </div>

    <div v-show="pane.sessionId" class="session-body">
      <TerminalSftpPanel
        v-if="sftpVisible && pane.sessionId && sessionInfo?.kind === 'ssh'"
        :session-id="pane.sessionId"
      />
      <div ref="terminalElement" class="xterm-host"></div>
    </div>

    <TerminalConnectionDialog
      v-model="sshDialogVisible"
      :profiles="profiles"
      :connecting="connecting"
      :connection-error="sshDialogVisible ? launchError : ''"
      @connect="launchSsh"
      @remove="$emit('remove-profile', $event)"
    />

    <el-dialog
      v-model="wslDialogVisible"
      :title="t('common.terminal.selectWsl')"
      class="app-dialog"
      width="420px"
      append-to-body
      align-center
      :z-index="8000"
    >
      <el-select v-model="selectedWsl" style="width: 100%" popper-class="app-dialog-select-popper">
        <el-option
          v-for="distro in capabilities.wslDistros"
          :key="distro"
          :label="distro"
          :value="distro"
        />
      </el-select>
      <template #footer>
        <el-button @click="wslDialogVisible = false">{{ t('common.terminal.cancel') }}</el-button>
        <el-button
          type="primary"
          :loading="connecting"
          :disabled="!selectedWsl"
          @click="launchWsl"
          >{{ t('common.terminal.start') }}</el-button
        >
      </template>
    </el-dialog>

    <el-dialog
      v-model="forwardVisible"
      :title="t('common.terminal.portForwarding')"
      class="app-dialog"
      width="min(900px, 94vw)"
      append-to-body
      align-center
      :z-index="8000"
    >
      <div class="forward-dialog-toolbar">
        <el-button size="small" @click="addRuntimeForward('local')">+ Local</el-button>
        <el-button size="small" @click="addRuntimeForward('remote')">+ Remote</el-button>
        <el-button size="small" @click="addRuntimeForward('dynamic')">+ SOCKS</el-button>
      </div>
      <div v-for="rule in runtimeForwards" :key="rule.id" class="runtime-forward-row">
        <el-switch
          :model-value="forwardActive(rule.id)"
          @change="(value: boolean) => toggleForward(rule, value)"
        />
        <el-select v-model="rule.kind"
          ><el-option label="Local" value="local" /><el-option
            label="Remote"
            value="remote" /><el-option label="SOCKS" value="dynamic"
        /></el-select>
        <el-input v-model="rule.name" :placeholder="t('common.terminal.ruleName')" />
        <el-input v-model="rule.bindAddress" placeholder="127.0.0.1" />
        <el-input-number v-model="rule.bindPort" :min="0" :max="65535" />
        <el-input
          v-if="rule.kind !== 'dynamic'"
          v-model="rule.targetHost"
          :placeholder="t('common.terminal.targetHost')"
        />
        <el-input-number
          v-if="rule.kind !== 'dynamic'"
          v-model="rule.targetPort"
          :min="1"
          :max="65535"
        />
        <span class="forward-state" :class="forwardStatuses[rule.id]?.status">{{
          forwardStatuses[rule.id]?.message || forwardStatuses[rule.id]?.status || ''
        }}</span>
        <el-button text type="danger" @click="removeRuntimeForward(rule.id)"
          ><el-icon><Delete /></el-icon
        ></el-button>
      </div>
      <el-empty v-if="!runtimeForwards.length" :description="t('common.terminal.noForwardRules')" />
      <template #footer>
        <el-button @click="forwardVisible = false">{{ t('common.terminal.close') }}</el-button>
        <el-button
          v-if="activeProfile?.source === 'nav-tools'"
          type="primary"
          @click="saveRuntimeForwards"
          >{{ t('common.terminal.saveRules') }}</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  Close,
  Connection,
  Delete,
  FolderOpened,
  FullScreen,
  Loading,
  Monitor,
  Platform,
  Right,
  ScaleToOriginal,
} from '@element-plus/icons-vue'
import { PanelBottomClose, PanelRightClose, SquareSplitVertical } from '@lucide/vue'
import { ElMessage } from 'element-plus'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { t } from '@/i18n'
import type { TerminalPaneNode, TerminalSplitDirection } from '@/core/terminal/TerminalLayout'
import {
  createPortForwardRule,
  type LocalShellKind,
  type PortForwardKind,
  type PortForwardRule,
  type PortForwardStatusEvent,
  type SshConnectionProfile,
  type SshConnectionSecrets,
  type TerminalCapabilities,
  type TerminalSessionInfo,
} from '@/core/terminal/TerminalTypes'
import TerminalConnectionDialog from './TerminalConnectionDialog.vue'
import TerminalSftpPanel from './TerminalSftpPanel.vue'

const SESSION_CREATE_TIMEOUT_MS = 55_000

const props = defineProps<{
  pane: TerminalPaneNode
  focused: boolean
  paneCount: number
  expanded: boolean
  capabilities: TerminalCapabilities
  profiles: SshConnectionProfile[]
  sessionInfo?: TerminalSessionInfo
}>()
const emit = defineEmits<{
  session: [paneId: string, session: TerminalSessionInfo]
  focus: [paneId: string]
  expand: [paneId: string]
  split: [paneId: string, direction: TerminalSplitDirection, inherit: boolean]
  close: [paneId: string]
  'save-profile': [profile: SshConnectionProfile]
  'remove-profile': [id: string]
}>()

const terminalElement = ref<HTMLDivElement | null>(null)
const sshDialogVisible = ref(false)
const wslDialogVisible = ref(false)
const forwardVisible = ref(false)
const sftpVisible = ref(false)
const selectedWsl = ref('')
const cwd = ref('')
const connecting = ref(false)
const connectingTarget = ref('')
const launchError = ref('')
const runtimeForwards = ref<PortForwardRule[]>([])
const forwardStatuses = ref<Record<string, PortForwardStatusEvent>>({})
const activeProfile = computed(() =>
  props.profiles.find((profile) => profile.id === props.sessionInfo?.profileId),
)

let terminal: Terminal | undefined
let fitAddon: FitAddon | undefined
let resizeObserver: ResizeObserver | undefined
let attachedSessionId = ''

async function createSession(request: Record<string, unknown>, target: string): Promise<boolean> {
  connecting.value = true
  connectingTarget.value = target
  launchError.value = ''
  try {
    const session = await withTimeout(
      window.ipcRenderer.invoke('terminal-session-create', {
        ...request,
        cols: Math.max(2, terminal?.cols || 80),
        rows: Math.max(1, terminal?.rows || 24),
      }),
      SESSION_CREATE_TIMEOUT_MS,
      t('common.terminal.connectionRequestTimeout'),
      (lateSession: TerminalSessionInfo) =>
        void window.ipcRenderer.invoke('terminal-session-close', lateSession.id),
    )
    emit('session', props.pane.id, session)
    return true
  } catch (error) {
    launchError.value = errorMessage(error)
    return false
  } finally {
    connecting.value = false
    connectingTarget.value = ''
  }
}

function launchLocal(kind: LocalShellKind, label: string): void {
  void createSession({ kind: 'local', localShell: kind, cwd: cwd.value || undefined }, label)
}

async function launchWsl(): Promise<void> {
  const connected = await createSession(
    { kind: 'wsl', wslDistro: selectedWsl.value, cwd: cwd.value || undefined },
    `WSL · ${selectedWsl.value}`,
  )
  if (connected) wslDialogVisible.value = false
}

async function launchSsh(
  profile: SshConnectionProfile,
  secrets: SshConnectionSecrets,
  save: boolean,
): Promise<void> {
  if (save) emit('save-profile', profile)
  const connected = await createSession(
    { kind: 'ssh', sshProfile: profile, sshSecrets: secrets },
    `${profile.username}@${profile.host}:${profile.port}`,
  )
  if (connected) sshDialogVisible.value = false
}

function openSshDialog(): void {
  launchError.value = ''
  sshDialogVisible.value = true
}

function emitSplit(direction: TerminalSplitDirection, inherit: boolean): void {
  emit('split', props.pane.id, direction, inherit)
}

const isMac = navigator.userAgent.includes('Mac')
const splitRightShortcut = isMac ? '⌘D' : 'Ctrl+Shift+D'
const splitDownShortcut = isMac ? '⌘⇧D' : 'Alt+Shift+D'

function handleSplitCommand(command: 'right' | 'down'): void {
  emitSplit(command === 'right' ? 'horizontal' : 'vertical', Boolean(props.pane.sessionId))
}

function focusPane(): void {
  emit('focus', props.pane.id)
}

async function attachSession(sessionId: string | undefined): Promise<void> {
  if (!terminal || !sessionId || sessionId === attachedSessionId) return
  attachedSessionId = sessionId
  terminal.reset()
  const session = await window.ipcRenderer.invoke('terminal-session-attach', sessionId)
  if (!session) return
  if (session.scrollback) terminal.write(session.scrollback)
  await nextTick()
  fitTerminal()
}

function fitTerminal(): void {
  if (!terminal || !fitAddon || !props.pane.sessionId || !terminalElement.value?.clientWidth) return
  try {
    fitAddon.fit()
    void window.ipcRenderer.invoke('terminal-session-resize', {
      sessionId: props.pane.sessionId,
      cols: terminal.cols,
      rows: terminal.rows,
    })
  } catch {
    // A pane can be temporarily zero-sized while its split tree is changing.
  }
}

function handleOutput(_event: unknown, event: { sessionId: string; data: string }): void {
  if (event.sessionId === props.pane.sessionId) terminal?.write(event.data)
}

function handleForwardStatus(_event: unknown, event: PortForwardStatusEvent): void {
  forwardStatuses.value = { ...forwardStatuses.value, [event.ruleId]: event }
}

function addRuntimeForward(kind: PortForwardKind): void {
  runtimeForwards.value.push(createPortForwardRule(kind))
}

async function toggleForward(rule: PortForwardRule, active: boolean): Promise<void> {
  if (!props.pane.sessionId) return
  try {
    await window.ipcRenderer.invoke(
      active ? 'terminal-forward-start' : 'terminal-forward-stop',
      active
        ? { sessionId: props.pane.sessionId, rule }
        : { sessionId: props.pane.sessionId, ruleId: rule.id },
    )
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

function forwardActive(ruleId: string): boolean {
  return forwardStatuses.value[ruleId]?.status === 'active'
}

async function removeRuntimeForward(ruleId: string): Promise<void> {
  if (forwardActive(ruleId) && props.pane.sessionId) {
    await window.ipcRenderer.invoke('terminal-forward-stop', {
      sessionId: props.pane.sessionId,
      ruleId,
    })
  }
  runtimeForwards.value = runtimeForwards.value.filter((rule) => rule.id !== ruleId)
}

function saveRuntimeForwards(): void {
  if (!activeProfile.value) return
  emit('save-profile', { ...activeProfile.value, forwards: structuredClone(runtimeForwards.value) })
  ElMessage.success(t('common.terminal.rulesSaved'))
}

watch(
  () => props.pane.sessionId,
  (id) => void attachSession(id),
  { immediate: true },
)
watch(
  () => props.focused,
  (active) => {
    if (active) void nextTick(() => terminal?.focus())
  },
)
watch(
  activeProfile,
  (profile) => {
    runtimeForwards.value = structuredClone(profile?.forwards || [])
  },
  { immediate: true },
)
watch(forwardVisible, (open) => {
  if (open) runtimeForwards.value = structuredClone(activeProfile.value?.forwards || [])
})

onMounted(() => {
  const rootStyle = getComputedStyle(document.documentElement)
  terminal = new Terminal({
    cursorBlink: true,
    convertEol: false,
    fontFamily: "'Cascadia Mono', Consolas, 'Noto Sans Mono', monospace",
    fontSize: 13,
    scrollback: 10_000,
    theme: {
      background: rootStyle.getPropertyValue('--terminal-bg').trim() || '#111318',
      foreground: rootStyle.getPropertyValue('--terminal-fg').trim() || '#d8dee9',
      cursor: '#7aa2f7',
      selectionBackground: '#33467c',
    },
  })
  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  if (terminalElement.value) terminal.open(terminalElement.value)
  terminal.onData((data) => {
    if (props.pane.sessionId)
      void window.ipcRenderer.invoke('terminal-session-write', {
        sessionId: props.pane.sessionId,
        data,
      })
  })
  terminal.attachCustomKeyEventHandler((event) => {
    if (event.type !== 'keydown') return true
    if (event.ctrlKey && event.shiftKey && event.code === 'KeyC') {
      const selection = terminal?.getSelection()
      if (selection) void navigator.clipboard.writeText(selection)
      return false
    }
    if (event.ctrlKey && event.shiftKey && event.code === 'KeyV') {
      void navigator.clipboard.readText().then((text) => terminal?.paste(text))
      return false
    }
    return true
  })
  resizeObserver = new ResizeObserver(() => fitTerminal())
  if (terminalElement.value) resizeObserver.observe(terminalElement.value)
  window.ipcRenderer?.on('terminal-output', handleOutput)
  window.ipcRenderer?.on('terminal-forward-status', handleForwardStatus)
  void attachSession(props.pane.sessionId)
  if (props.focused) void nextTick(() => terminal?.focus())
})

onUnmounted(() => {
  window.ipcRenderer?.off('terminal-output', handleOutput)
  window.ipcRenderer?.off('terminal-forward-status', handleForwardStatus)
  resizeObserver?.disconnect()
  terminal?.dispose()
})

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  onLateResolve?: (value: T) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timeout = window.setTimeout(() => {
      settled = true
      reject(new Error(message))
    }, timeoutMs)
    promise.then(
      (value) => {
        if (settled) {
          onLateResolve?.(value)
          return
        }
        settled = true
        window.clearTimeout(timeout)
        resolve(value)
      },
      (error) => {
        if (settled) return
        settled = true
        window.clearTimeout(timeout)
        reject(error)
      },
    )
  })
}
</script>

<style scoped>
.terminal-pane {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--app-bg);
  border: 1px solid transparent;
  opacity: 0.92;
  overflow: hidden;
  transition: opacity 0.12s ease;
}
.terminal-pane.focused {
  opacity: 1;
}
.pane-header {
  position: absolute;
  z-index: 5;
  top: 5px;
  right: 14px;
  left: 8px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  pointer-events: none;
  color: var(--app-text);
  background: transparent;
}
.pane-actions {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 1px;
  border: 1px solid color-mix(in srgb, var(--app-border) 82%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--app-surface-raised) 90%, transparent);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--app-shadow) 35%, transparent);
  backdrop-filter: blur(8px);
  opacity: 0.72;
  pointer-events: none;
  transition: opacity 0.12s ease;
}
.terminal-pane.focused .pane-actions,
.terminal-pane:hover .pane-actions,
.terminal-pane:focus-within .pane-actions {
  opacity: 1;
  pointer-events: auto;
}
.pane-actions :deep(.pane-action) {
  width: 22px;
  height: 22px;
  margin: 0;
  padding: 0;
  border-radius: 6px;
  color: var(--app-text-muted);
}
.pane-actions :deep(.pane-action:hover),
.pane-actions :deep(.pane-action:focus-visible) {
  color: var(--app-text);
  background: var(--app-hover);
}
.pane-actions :deep(.pane-action--danger:hover),
.pane-actions :deep(.pane-action--danger:focus-visible) {
  color: var(--el-color-danger);
}
.session-body {
  min-height: 0;
  flex: 1;
  display: flex;
  background: var(--terminal-bg);
}
.xterm-host {
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: 4px;
  background: var(--terminal-bg);
  direction: ltr;
  text-align: left;
}
.xterm-host :deep(.xterm) {
  height: 100%;
  text-align: left;
}
.launcher {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  padding: clamp(16px, 4vh, 34px) 18px;
  color: var(--app-text);
  background:
    radial-gradient(
      circle at 50% 0%,
      color-mix(in srgb, var(--el-color-primary) 7%, transparent),
      transparent 44%
    ),
    var(--app-surface);
}
.launcher-shell {
  display: flex;
  width: min(620px, 100%);
  min-height: 100%;
  margin: auto;
  flex-direction: column;
  justify-content: center;
  gap: 14px;
}
.launcher-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 2px;
  text-align: left;
}
.launcher-heading__icon {
  display: grid;
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 10px;
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 11%, var(--app-surface));
  place-items: center;
}
.launcher-heading__icon > svg {
  width: 19px;
}
.launcher-heading > span:last-child,
.connecting > span:last-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}
.launcher-heading strong {
  font-size: 15px;
  font-weight: 650;
}
.launcher-heading small,
.launch-card small,
.connecting small {
  color: var(--app-text-muted);
  font-size: 11px;
  line-height: 1.35;
}
.launcher-cwd {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 10px;
  border: 1px solid var(--app-border);
  border-radius: 9px;
  color: var(--app-text-muted);
  background: var(--app-surface-muted);
}
.cwd-input {
  width: 100%;
}
.cwd-input :deep(.el-input__wrapper) {
  padding: 0;
  background: transparent;
  box-shadow: none;
}
.launcher-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}
.launch-card {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 58px;
  padding: 9px 11px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  color: var(--app-text);
  background: var(--app-surface-raised);
  cursor: pointer;
  text-align: left;
  transition:
    border-color 0.16s ease,
    background 0.16s ease,
    transform 0.16s ease;
}
.launch-card:hover {
  border-color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 5%, var(--app-surface-raised));
  transform: translateY(-1px);
}
.launch-card:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--el-color-primary) 55%, transparent);
  outline-offset: 2px;
}
.launch-card__icon {
  display: grid;
  width: 32px;
  height: 32px;
  flex: none;
  border-radius: 8px;
  color: var(--app-text-secondary);
  background: var(--app-surface-muted);
  place-items: center;
}
.launch-card--ssh .launch-card__icon {
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 10%, var(--app-surface));
}
.launch-card__copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}
.launch-card__copy strong {
  overflow: hidden;
  font-size: 12px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.launch-card__arrow {
  flex: none;
  color: var(--app-text-muted);
  font-size: 12px;
  opacity: 0;
  transform: translateX(-3px);
  transition: 0.16s ease;
}
.launch-card:hover .launch-card__arrow {
  color: var(--el-color-primary);
  opacity: 1;
  transform: translateX(0);
}
.launch-card:disabled {
  opacity: 0.5;
  cursor: wait;
  transform: none;
}
.connecting {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--el-color-primary) 22%, var(--app-border));
  border-radius: 9px;
  color: var(--app-text);
  background: color-mix(in srgb, var(--el-color-primary) 7%, var(--app-surface));
  text-align: left;
}
.connecting__icon {
  display: grid;
  width: 28px;
  height: 28px;
  flex: none;
  border-radius: 7px;
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 12%, var(--app-surface));
  place-items: center;
}
.connecting strong {
  font-size: 12px;
}
.forward-dialog-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.runtime-forward-row {
  display: grid;
  grid-template-columns:
    auto 90px minmax(80px, 1fr) minmax(100px, 1fr) 110px minmax(100px, 1fr)
    110px 110px auto;
  gap: 6px;
  align-items: center;
  margin-bottom: 8px;
}
.runtime-forward-row :deep(.el-select),
.runtime-forward-row :deep(.el-input-number) {
  width: 100%;
}
.forward-state {
  font-size: 11px;
  color: var(--app-text-muted);
}
.forward-state.active {
  color: #3fb950;
}
.forward-state.error {
  color: #f85149;
}
:global(.terminal-pane-menu .el-dropdown-menu__item) {
  display: grid;
  min-width: 210px;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
}
:global(.terminal-pane-menu kbd) {
  color: var(--app-text-muted);
  font-family: inherit;
  font-size: 10px;
}
@media (max-width: 560px) {
  .launcher-grid {
    grid-template-columns: 1fr;
  }
}
</style>
