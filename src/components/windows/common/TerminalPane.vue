<template>
  <div class="terminal-pane" :class="{ focused }" @pointerdown="focusPane">
    <header class="pane-header">
      <div class="pane-actions">
        <el-tooltip
          :content="
            isGui ? t('common.terminal.switchToTerminalView') : t('common.terminal.switchToGuiView')
          "
          placement="bottom"
          :show-after="400"
        >
          <el-button
            text
            class="pane-action pane-action--toggle-presentation"
            :aria-label="t('common.terminal.togglePresentation')"
            :aria-pressed="isGui"
            @click="$emit('toggle-presentation', pane.id)"
          >
            <el-icon><component :is="isGui ? TerminalIcon : LayoutGrid" /></el-icon>
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
        <el-tooltip :content="t('common.terminal.splitRight')" placement="bottom" :show-after="400">
          <el-button
            text
            class="pane-action pane-action--split-right"
            :aria-label="t('common.terminal.splitRight')"
            @click="emitSplit('horizontal', Boolean(props.pane.sessionId))"
          >
            <el-icon><SquareSplitVertical /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip :content="t('common.terminal.splitDown')" placement="bottom" :show-after="400">
          <el-button
            text
            class="pane-action pane-action--split-down"
            :aria-label="t('common.terminal.splitDown')"
            @click="emitSplit('vertical', Boolean(props.pane.sessionId))"
          >
            <el-icon><SquareSplitVertical /></el-icon>
          </el-button>
        </el-tooltip>
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
        <div v-if="pane.launch" class="launcher-restore" role="status">
          <span class="launcher-restore__icon"><RefreshRight /></span>
          <span class="launcher-restore__copy">
            <strong>{{ t('common.terminal.sessionNeedsReconnect') }}</strong>
            <small>{{ launchDescription }}</small>
          </span>
          <el-button
            class="launcher-restore__action"
            type="primary"
            plain
            :loading="connecting"
            @click="reconnectSession"
          >
            {{ t('common.terminal.reconnect') }}
          </el-button>
        </div>
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
      <div v-if="guiDegraded" class="gui-degraded" role="status">
        <span class="gui-degraded__hint">{{ t('common.terminal.guiDegradedHint') }}</span>
        <el-button
          class="gui-degraded__action"
          size="small"
          @click="$emit('toggle-presentation', pane.id)"
        >
          {{ t('common.terminal.switchToTerminalView') }}
        </el-button>
      </div>
      <div
        v-show="!isGui || guiDegraded"
        ref="terminalElement"
        class="xterm-host"
        @contextmenu.prevent="handleTerminalContextMenu"
      ></div>
      <TerminalGuiView
        v-if="isGui && !guiDegraded"
        :blocks="commandBlocks"
        :cwd="guiCwd"
        :cols="termCols"
        :session-id="sessionInfo?.id"
        @rerun="rerunCommand"
        @copy="writeClipboardText"
        @submit="rerunCommand"
      />
      <div v-if="sessionDisconnected" class="session-disconnected" role="status">
        <span class="session-disconnected__icon"><WarningFilled /></span>
        <span class="session-disconnected__copy">
          <strong>{{ disconnectedTitle }}</strong>
          <small>{{ t('common.terminal.disconnectedDescription') }}</small>
        </span>
        <el-button
          class="session-reconnect"
          type="primary"
          :loading="connecting"
          @click="reconnectSession"
        >
          <el-icon><RefreshRight /></el-icon>
          {{ t('common.terminal.reconnect') }}
        </el-button>
      </div>
    </div>

    <TerminalConnectionDialog
      v-model="sshDialogVisible"
      :profiles="connectionProfiles"
      :preferred-profile-id="preferredSshProfileId"
      :connecting="connecting"
      :connection-error="sshDialogVisible ? launchError : ''"
      @connect="launchSsh"
      @cancel="cancelConnection"
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
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import {
  Close,
  Connection,
  FolderOpened,
  FullScreen,
  Loading,
  Monitor,
  Platform,
  RefreshRight,
  Right,
  ScaleToOriginal,
  WarningFilled,
} from '@element-plus/icons-vue'
import { SquareSplitVertical, LayoutGrid, Terminal as TerminalIcon } from '@lucide/vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { t } from '@/i18n'
import { CommandBlockAssembler, type TerminalCommandBlock } from '@/core/terminal/CommandBlocks'
import type { TerminalPaneNode, TerminalSplitDirection } from '@/core/terminal/TerminalLayout'
import {
  TERMINAL_SSH_RECOVERED_EVENT,
  createTerminalId,
  sshConnectionKey,
  type LocalShellKind,
  type SshConnectionProfile,
  type SshConnectionSecrets,
  type TerminalCapabilities,
  type TerminalLaunchSpec,
  type TerminalSessionInfo,
  type TerminalSshRecoveredEvent,
} from '@/core/terminal/TerminalTypes'
import emitter from '@/hooks/useMitt'
import { ORCA_TERMINAL_THEME } from '@/core/terminal/TerminalTheme'
import TerminalConnectionDialog from './TerminalConnectionDialog.vue'
import TerminalGuiView from './TerminalGuiView.vue'

const SESSION_CREATE_TIMEOUT_MS = 20_000

const props = defineProps<{
  pane: TerminalPaneNode
  focused: boolean
  paneCount: number
  expanded: boolean
  capabilities: TerminalCapabilities
  profiles: SshConnectionProfile[]
  sessionInfo?: TerminalSessionInfo
  autoOpenSsh?: boolean
}>()
const emit = defineEmits<{
  session: [paneId: string, session: TerminalSessionInfo, launch: TerminalLaunchSpec]
  focus: [paneId: string]
  expand: [paneId: string]
  split: [paneId: string, direction: TerminalSplitDirection, inherit: boolean]
  close: [paneId: string]
  'toggle-presentation': [paneId: string]
  'save-profile': [profile: SshConnectionProfile]
  'remove-profile': [id: string]
  'ssh-dialog-opened': [paneId: string]
}>()

const terminalElement = ref<HTMLDivElement | null>(null)
const sshDialogVisible = ref(false)
const wslDialogVisible = ref(false)
const selectedWsl = ref('')
const cwd = ref('')
const connecting = ref(false)
const connectingTarget = ref('')
const launchError = ref('')
const connectionProfiles = computed(() => {
  const restoredProfile =
    props.pane.launch?.kind === 'ssh' ? props.pane.launch.sshProfile : undefined
  if (!restoredProfile || props.profiles.some((profile) => profile.id === restoredProfile.id)) {
    return props.profiles
  }
  return [restoredProfile, ...props.profiles]
})
const preferredSshProfileId = computed(() => {
  if (props.pane.launch?.kind === 'ssh') return props.pane.launch.sshProfile?.id
  return props.sessionInfo?.profileId
})
const sessionDisconnected = computed(
  () => props.sessionInfo?.status === 'closed' || props.sessionInfo?.status === 'error',
)
const disconnectedTitle = computed(() =>
  props.sessionInfo?.status === 'error'
    ? t('common.terminal.sessionExitedWithError')
    : t('common.terminal.sessionDisconnected'),
)
const launchDescription = computed(() => {
  const launch = props.pane.launch
  if (!launch) return ''
  if (launch.kind === 'ssh' && launch.sshProfile) {
    return `${launch.sshProfile.username}@${launch.sshProfile.host}:${launch.sshProfile.port}`
  }
  if (launch.kind === 'wsl') return launch.label || `WSL · ${launch.wslDistro}`
  if (launch.kind === 'local') return launch.label || launch.localShell
  return 'SSH'
})

/** OSC 133 命令块装配:实时输出与恢复回放都经过它,与 xterm 渲染互不干扰 */
const commandBlockAssembler = new CommandBlockAssembler()
const commandBlocks = shallowRef<TerminalCommandBlock[]>([])
/** 会话最近上报的工作目录(OSC 7 / 9;9),随数据帧更新,GUI 输入行展示用 */
const guiCwd = shallowRef('')
const isGui = computed(() => props.pane.presentation === 'gui')
/**
 * SSH 远端 shell(v1.4.4 起不注入标记)与 cmd 不产生 OSC 133 事件,
 * GUI 视图对这类会话降级为终端渲染并给出切回提示。
 */
const guiDegraded = computed(() => {
  if (!isGui.value) return false
  const kind = props.pane.launch?.kind ?? props.sessionInfo?.kind
  if (kind === 'ssh') return true
  return props.pane.launch?.kind === 'local' && props.pane.launch.localShell === 'cmd'
})

function feedCommandBlocks(data: string): void {
  commandBlockAssembler.feed(data)
  commandBlocks.value = [...commandBlockAssembler.getBlocks()]
  guiCwd.value = commandBlockAssembler.currentCwd
}

/** GUI 视图的命令写入:块上的「重新运行」与底部输入框都经此写回当前会话 */
function rerunCommand(command: string): void {
  if (!command || !props.pane.sessionId || !terminalInputEnabled) return
  void window.ipcRenderer
    .invoke('terminal-session-write', { sessionId: props.pane.sessionId, data: `${command}\r` })
    .catch(() => undefined)
}

let terminal: Terminal | undefined
let fitAddon: FitAddon | undefined
let resizeObserver: ResizeObserver | undefined
/** xterm 当前列宽,GUI 视图折行续写判定用;fit 后同步 */
const termCols = shallowRef(80)
let attachedSessionId = ''
let terminalInputEnabled = false
let activeCreateRequestId = ''

async function createSession(
  request: Record<string, unknown>,
  target: string,
  launch: TerminalLaunchSpec,
): Promise<boolean> {
  const requestId = createTerminalId('terminal-create')
  activeCreateRequestId = requestId
  connecting.value = true
  connectingTarget.value = target
  launchError.value = ''
  try {
    const session = await withTimeout(
      window.ipcRenderer.invoke('terminal-session-create', {
        ...request,
        requestId,
        cols: Math.max(2, terminal?.cols || 80),
        rows: Math.max(1, terminal?.rows || 24),
      }),
      SESSION_CREATE_TIMEOUT_MS,
      t('common.terminal.connectionRequestTimeout'),
      (lateSession: TerminalSessionInfo) =>
        void window.ipcRenderer.invoke('terminal-session-close', lateSession.id),
      () => void window.ipcRenderer.invoke('terminal-session-create-cancel', requestId),
    )
    if (activeCreateRequestId !== requestId) {
      void window.ipcRenderer.invoke('terminal-session-close', session.id)
      return false
    }
    emit('session', props.pane.id, session, launch)
    return true
  } catch (error) {
    if (activeCreateRequestId !== requestId) return false
    launchError.value = errorMessage(error)
    return false
  } finally {
    if (activeCreateRequestId === requestId) {
      activeCreateRequestId = ''
      connecting.value = false
      connectingTarget.value = ''
    }
  }
}

function cancelConnection(): void {
  const requestId = activeCreateRequestId
  if (!requestId) return
  activeCreateRequestId = ''
  connecting.value = false
  connectingTarget.value = ''
  launchError.value = t('common.terminal.connectionCancelled')
  void window.ipcRenderer.invoke('terminal-session-create-cancel', requestId)
}

function launchLocal(kind: LocalShellKind, label: string): void {
  const launch: TerminalLaunchSpec = {
    kind: 'local',
    localShell: kind,
    cwd: cwd.value || undefined,
    label,
  }
  void createSession(launch, label, launch)
}

async function launchWsl(): Promise<void> {
  const launch: TerminalLaunchSpec = {
    kind: 'wsl',
    wslDistro: selectedWsl.value,
    cwd: cwd.value || undefined,
    label: `WSL · ${selectedWsl.value}`,
  }
  const connected = await createSession(launch, launch.label || 'WSL', launch)
  if (connected) wslDialogVisible.value = false
}

async function launchSsh(
  profile: SshConnectionProfile,
  secrets: SshConnectionSecrets,
  save: boolean,
  remember: boolean,
): Promise<void> {
  if (save) emit('save-profile', profile)
  const launch: TerminalLaunchSpec = { kind: 'ssh', sshProfile: profile, label: profile.name }
  const connected = await createSession(
    { kind: 'ssh', sshProfile: profile, sshSecrets: secrets },
    `${profile.username}@${profile.host}:${profile.port}`,
    launch,
  )
  if (!connected) return
  try {
    if (remember) {
      await window.ipcRenderer.invoke('terminal-credential-save', {
        profileId: profile.id,
        secrets,
      })
    } else {
      await window.ipcRenderer.invoke('terminal-credential-remove', profile.id)
    }
  } catch {
    // The live SSH session is still valid when secure credential storage is unavailable.
  }
  sshDialogVisible.value = false
}

function openSshDialog(): void {
  launchError.value = ''
  sshDialogVisible.value = true
}

function inferredLaunch(): TerminalLaunchSpec | undefined {
  if (props.pane.launch) return props.pane.launch
  if (props.sessionInfo?.kind === 'ssh') {
    return {
      kind: 'ssh',
      sshProfile: connectionProfiles.value.find(
        (profile) => profile.id === props.sessionInfo?.profileId,
      ),
      label: props.sessionInfo.title,
    }
  }
  if (props.sessionInfo?.kind === 'wsl') {
    const distro = props.capabilities.wslDistros[0]
    return distro ? { kind: 'wsl', wslDistro: distro, label: props.sessionInfo.title } : undefined
  }
  const preferredShell =
    props.capabilities.localShells.find((shell) => shell.label === props.sessionInfo?.title) ||
    props.capabilities.localShells[0]
  return preferredShell
    ? { kind: 'local', localShell: preferredShell.kind, label: preferredShell.label }
    : undefined
}

async function reconnectSession(): Promise<void> {
  if (connecting.value) return
  const launch = inferredLaunch()
  if (!launch) {
    launchError.value = t('common.terminal.reconnectTypeUnavailable')
    return
  }
  if (launch.kind === 'ssh') {
    // 优先用当前 profile + 安全存储里的凭据直接重连,不再弹出连接对话框;
    // 仅当凭据缺失(如密码未保存)时才回退到对话框
    if (launch.sshProfile && (await silentSshReconnect(launch))) return
    openSshDialog()
    return
  }
  if (props.pane.sessionId) {
    await window.ipcRenderer
      .invoke('terminal-session-close', props.pane.sessionId)
      .catch(() => undefined)
  }
  if (launch.kind === 'wsl') {
    await createSession(launch, launch.label || `WSL · ${launch.wslDistro}`, launch)
    return
  }
  await createSession(launch, launch.label || launch.localShell, launch)
}

/**
 * 同 tab 内另一个相同连接参数的 SSH pane 上线后,本 pane 若处于断开/未连接状态,
 * 用 safeStorage 里保存的凭据静默重连;没有可用凭据(如密码未保存)时保持原状,
 * 用户仍可通过断开横幅/恢复卡片手动重连。
 */
function handleSshRecovered(raw: unknown): void {
  const payload = raw as TerminalSshRecoveredEvent | undefined
  if (!payload || payload.sourcePaneId === props.pane.id) return
  const launch = props.pane.launch
  if (launch?.kind !== 'ssh' || !launch.sshProfile) return
  if (sshConnectionKey(launch.sshProfile) !== payload.key) return
  const status = props.sessionInfo?.status
  const disconnected = !props.pane.sessionId || status === 'closed' || status === 'error'
  if (!disconnected || connecting.value) return
  void silentSshReconnect(launch)
}

async function silentSshReconnect(
  launch: Extract<TerminalLaunchSpec, { kind: 'ssh' }>,
): Promise<boolean> {
  const profile = launch.sshProfile
  if (!profile) return false
  const secrets = await window.ipcRenderer
    .invoke('terminal-credential-load', profile.id)
    .catch(() => undefined)
  if (profile.authMethod === 'password' && !secrets?.password) return false
  if (props.pane.sessionId) {
    await window.ipcRenderer
      .invoke('terminal-session-close', props.pane.sessionId)
      .catch(() => undefined)
  }
  // launch 里的 profile 是 Vue 响应式代理,直接过 IPC 会报 "An object could not be cloned",
  // 序列化一次去掉代理
  const plainProfile = JSON.parse(JSON.stringify(profile)) as SshConnectionProfile
  await createSession(
    { kind: 'ssh', sshProfile: plainProfile, sshSecrets: secrets ?? {} },
    `${profile.username}@${profile.host}:${profile.port}`,
    launch,
  )
  return true
}

function emitSplit(direction: TerminalSplitDirection, inherit: boolean): void {
  emit('split', props.pane.id, direction, inherit)
}

function focusPane(): void {
  emit('focus', props.pane.id)
}

/**
 * 恢复 scrollback 前剥离终端查询/应答序列(DSR `\x1b[5n`/`\x1b[6n`、DA `\x1b[c`、
 * 光标位置报告 `\x1b[{row};{col}R` 等)。这些序列在重放时既没有显示意义,
 * 又可能被 xterm 重新应答或回显成乱码(恢复终端出现奇怪打印的来源之一)。
 * 着色(SGR)与光标移动等正常序列保留。
 */
// eslint-disable-next-line no-control-regex -- 终端转义序列净化必须匹配控制字符
const RESTORED_QUERY_PATTERN = /\x1b\[[\d;?]*[cnR]/g

function sanitizeRestoredScrollback(data: string): string {
  return data.replace(RESTORED_QUERY_PATTERN, '')
}

async function attachSession(sessionId: string | undefined): Promise<void> {
  if (!terminal || !sessionId || sessionId === attachedSessionId) return
  attachedSessionId = sessionId
  terminalInputEnabled = false
  terminal.reset()
  commandBlockAssembler.reset()
  commandBlocks.value = []
  guiCwd.value = ''
  const session = await window.ipcRenderer.invoke('terminal-session-attach', sessionId)
  if (sessionId !== props.pane.sessionId) return
  if (!session) return
  if (session.scrollback) {
    const restored = sanitizeRestoredScrollback(session.scrollback)
    feedCommandBlocks(restored)
    await writeTerminalData(restored)
  }
  if (sessionId !== props.pane.sessionId) return
  terminalInputEnabled = true
  await nextTick()
  fitTerminal()
}

function writeTerminalData(data: string): Promise<void> {
  return new Promise((resolve) => {
    if (!terminal) {
      resolve()
      return
    }
    terminal.write(data, resolve)
  })
}

function fitTerminal(): void {
  const sessionId = props.pane.sessionId
  if (!terminal || !fitAddon || !sessionId || !terminalElement.value?.clientWidth) return
  try {
    fitAddon.fit()
    termCols.value = terminal.cols
    void window.ipcRenderer
      .invoke('terminal-session-resize', {
        sessionId,
        cols: terminal.cols,
        rows: terminal.rows,
      })
      .catch(() => undefined)
  } catch {
    // A pane can be temporarily zero-sized while its split tree is changing.
  }
}

function handleOutput(_event: unknown, event: { sessionId: string; data: string }): void {
  if (event.sessionId !== props.pane.sessionId) return
  feedCommandBlocks(event.data)
  terminal?.write(event.data)
}

async function readClipboardText(): Promise<string> {
  try {
    const text = await window.ipcRenderer.invoke('clipboard-read-text')
    if (typeof text === 'string') return text
  } catch {
    // Fall back to the browser clipboard API when the Electron bridge is unavailable.
  }
  try {
    return (await navigator.clipboard?.readText()) || ''
  } catch {
    return ''
  }
}

async function writeClipboardText(text: string): Promise<void> {
  try {
    await window.ipcRenderer.invoke('clipboard-write-text', text)
    return
  } catch {
    // Fall back to the browser clipboard API when the Electron bridge is unavailable.
  }
  await navigator.clipboard?.writeText(text).catch(() => undefined)
}

function pasteClipboardText(): void {
  void readClipboardText().then((text) => {
    if (text) terminal?.paste(text)
  })
}

function handleTerminalContextMenu(): void {
  const selection = terminal?.getSelection() || ''
  if (selection) {
    void writeClipboardText(selection)
    return
  }
  pasteClipboardText()
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
// 切回终端视图后 xterm 刚从 display:none 恢复,需要重新适配尺寸并夺回焦点
watch(isGui, async (gui) => {
  if (gui) return
  await nextTick()
  fitTerminal()
  if (props.focused) terminal?.focus()
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
      ...ORCA_TERMINAL_THEME,
      background:
        rootStyle.getPropertyValue('--terminal-bg').trim() || ORCA_TERMINAL_THEME.background,
      foreground:
        rootStyle.getPropertyValue('--terminal-fg').trim() || ORCA_TERMINAL_THEME.foreground,
    },
  })
  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  if (terminalElement.value) terminal.open(terminalElement.value)
  termCols.value = terminal.cols
  terminal.onData((data) => {
    if (terminalInputEnabled && props.pane.sessionId)
      void window.ipcRenderer.invoke('terminal-session-write', {
        sessionId: props.pane.sessionId,
        data,
      })
  })
  terminal.attachCustomKeyEventHandler((event) => {
    if (event.type !== 'keydown') return true
    const primaryPasteModifier =
      props.capabilities.platform === 'darwin'
        ? event.metaKey && !event.ctrlKey
        : event.ctrlKey && !event.metaKey
    const isPasteShortcut =
      primaryPasteModifier &&
      !event.altKey &&
      !event.shiftKey &&
      (event.code === 'KeyV' || event.key.toLowerCase() === 'v')
    if (isPasteShortcut) {
      // Returning false stops xterm from sending ^V; preventDefault also suppresses the
      // browser paste event so the explicit Electron clipboard path runs exactly once.
      event.preventDefault()
      event.stopPropagation()
      pasteClipboardText()
      return false
    }
    return true
  })
  resizeObserver = new ResizeObserver(() => fitTerminal())
  if (terminalElement.value) resizeObserver.observe(terminalElement.value)
  window.ipcRenderer?.on('terminal-output', handleOutput)
  emitter.on(TERMINAL_SSH_RECOVERED_EVENT, handleSshRecovered)
  void attachSession(props.pane.sessionId)
  if (props.autoOpenSsh) {
    openSshDialog()
    emit('ssh-dialog-opened', props.pane.id)
  }
  if (props.focused) void nextTick(() => terminal?.focus())
})

onUnmounted(() => {
  window.ipcRenderer?.off('terminal-output', handleOutput)
  emitter.off(TERMINAL_SSH_RECOVERED_EVENT, handleSshRecovered)
  cancelConnection()
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
  onTimeout?: () => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timeout = window.setTimeout(() => {
      settled = true
      onTimeout?.()
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
.pane-action--split-right :deep(svg) {
  transform: rotate(90deg);
}
.pane-actions :deep(.pane-action--danger:hover),
.pane-actions :deep(.pane-action--danger:focus-visible) {
  color: var(--el-color-danger);
}
.session-body {
  position: relative;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--terminal-bg);
}
.session-disconnected {
  min-height: 44px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 6px 10px;
  border-top: 1px solid color-mix(in srgb, var(--terminal-fg) 14%, var(--terminal-bg));
  color: var(--terminal-fg);
  background: color-mix(in srgb, var(--terminal-bg) 92%, var(--el-color-warning));
}
.session-disconnected__icon {
  display: grid;
  width: 26px;
  height: 26px;
  flex: none;
  border-radius: 7px;
  color: var(--el-color-warning);
  background: color-mix(in srgb, var(--el-color-warning) 15%, var(--terminal-bg));
  place-items: center;
}
.launcher-restore__icon {
  display: grid;
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 9px;
  color: var(--el-color-warning);
  background: color-mix(in srgb, var(--el-color-warning) 13%, var(--app-surface));
  place-items: center;
}
.session-disconnected__copy,
.launcher-restore__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}
.session-disconnected__copy strong,
.launcher-restore__copy strong {
  font-size: 13px;
  font-weight: 650;
}
.session-disconnected__copy small,
.launcher-restore__copy small {
  color: var(--app-text-muted);
  font-size: 11px;
}
.session-reconnect {
  flex: none;
  margin-left: 8px;
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
.gui-degraded {
  min-height: 40px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 5px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--terminal-fg) 14%, var(--terminal-bg));
  color: var(--terminal-fg);
  background: color-mix(in srgb, var(--terminal-bg) 92%, var(--el-color-warning));
}
.gui-degraded__hint {
  flex: 1;
  min-width: 0;
  font-size: 12px;
}
.gui-degraded__action {
  flex: none;
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
.launcher-restore {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 12px;
  border: 1px solid color-mix(in srgb, var(--el-color-warning) 30%, var(--app-border));
  border-radius: 10px;
  background: color-mix(in srgb, var(--el-color-warning) 7%, var(--app-surface-raised));
}
.launcher-restore__action {
  margin-left: auto;
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
@media (max-width: 560px) {
  .launcher-grid {
    grid-template-columns: 1fr;
  }
}
</style>
