<template>
  <div ref="workbenchElement" class="terminal-workbench">
    <TerminalSftpPanel v-if="activeSftpSessionId" :session-id="activeSftpSessionId" />
    <div class="terminal-workbench__main">
      <div class="terminal-tabs">
        <draggable
          v-model="tabs"
          item-key="id"
          tag="div"
          class="terminal-tabs__strip"
          role="tablist"
          :animation="180"
          :delay="100"
          :delay-on-touch-only="true"
          :disabled="Boolean(renamingTabId)"
          filter=".tab-close, .tab-rename-input, .terminal-tab-add"
          :prevent-on-filter="false"
          ghost-class="terminal-tab--ghost"
          drag-class="terminal-tab--dragging"
        >
          <template #item="{ element: tab }">
            <div
              class="terminal-tab"
              :class="{ active: tab.id === activeTabId }"
              role="tab"
              :aria-selected="tab.id === activeTabId"
              :tabindex="tab.id === activeTabId ? 0 : -1"
              @click="activateTab(tab.id)"
              @dblclick="beginRenameTab(tab)"
              @mousedown.middle.prevent
              @auxclick="closeTabWithMiddleClick($event, tab.id)"
              @keydown.enter="activateTab(tab.id)"
            >
              <span
                class="tab-leading"
                :class="[tabStatus(tab), { busy: tabBusy(tab) }]"
                aria-hidden="true"
              >
                <i class="tab-status-dot"></i>
              </span>
              <input
                v-if="renamingTabId === tab.id"
                ref="renameInput"
                v-model="renameValue"
                class="tab-rename-input"
                :aria-label="t('common.terminal.renameTab')"
                @click.stop
                @dblclick.stop
                @blur="commitRenameTab(tab)"
                @keydown="handleRenameKeydown($event, tab)"
              />
              <span v-else class="tab-label" :title="tabDisplayTitle(tab)">{{
                tabDisplayTitle(tab)
              }}</span>
              <button
                v-if="renamingTabId !== tab.id"
                type="button"
                class="tab-close"
                :aria-label="t('common.terminal.closeTabShortcut')"
                @click.stop="closeTab(tab.id)"
              >
                <el-icon><Close /></el-icon>
              </button>
            </div>
          </template>
          <template #footer>
            <el-dropdown
              trigger="click"
              placement="bottom-start"
              popper-class="terminal-new-session-menu"
              @command="addTerminalTab"
            >
              <el-button
                text
                class="terminal-tab-add"
                :aria-label="t('common.terminal.newTabShortcut')"
                :title="t('common.terminal.newTabShortcut')"
              >
                <el-icon><Plus /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-for="shell in capabilities.localShells"
                    :key="`local-${shell.kind}`"
                    :command="`local:${shell.kind}`"
                  >
                    <el-icon><Monitor /></el-icon>
                    <span>{{ shell.label }}</span>
                  </el-dropdown-item>
                  <el-dropdown-item
                    v-for="distro in capabilities.wslDistros"
                    :key="`wsl-${distro}`"
                    :command="`wsl:${encodeURIComponent(distro)}`"
                  >
                    <el-icon><Platform /></el-icon>
                    <span>WSL · {{ distro }}</span>
                  </el-dropdown-item>
                  <el-dropdown-item v-if="capabilities.sshAvailable" command="ssh" divided>
                    <el-icon><Connection /></el-icon>
                    <span>SSH</span>
                  </el-dropdown-item>
                  <el-dropdown-item command="empty">
                    <el-icon><Plus /></el-icon>
                    <span>{{ t('common.terminal.emptyTerminal') }}</span>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </draggable>
        <div class="terminal-tabs__actions">
          <el-tooltip
            v-if="activeSftpTargetSessionId"
            :content="t('common.terminal.openSftp')"
            placement="bottom"
          >
            <el-button
              text
              class="tab-action tab-action--sftp"
              :class="{ active: Boolean(activeSftpSessionId) }"
              :aria-label="t('common.terminal.openSftp')"
              :aria-pressed="Boolean(activeSftpSessionId)"
              @click="toggleActiveTabSftp"
            >
              <el-icon><FolderOpened /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip :content="t('common.terminal.refreshSshConfig')" placement="bottom">
            <el-button text class="tab-action" @click="loadSshConfig">
              <el-icon><Refresh /></el-icon>
            </el-button>
          </el-tooltip>
        </div>
      </div>

      <div v-if="activeTab && activeLayoutNode" class="terminal-tab-content">
        <div class="terminal-tab-content__layout">
          <TerminalLayoutNodeComponent
            :node="activeLayoutNode"
            :focused-pane-id="activeFocusedPaneId"
            :pane-count="activePaneCount"
            :expanded-pane-id="activeExpandedPaneId"
            :capabilities="capabilities"
            :profiles="allProfiles"
            :session-infos="sessionInfos"
            :auto-open-ssh-pane-id="autoOpenSshPaneId"
            @session="setPaneSession"
            @focus="focusPane"
            @expand="toggleExpandPane"
            @resize="resizeSplit"
            @split="splitPane"
            @close="closePane"
            @save-profile="saveProfile"
            @remove-profile="removeProfile"
            @ssh-dialog-opened="autoOpenSshPaneId = ''"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  Close,
  Connection,
  FolderOpened,
  Monitor,
  Platform,
  Plus,
  Refresh,
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import draggable from 'vuedraggable'
import { t } from '@/i18n'
import {
  createEmptyPane,
  createTerminalTab,
  findTerminalPane,
  listTerminalPanes,
  removeTerminalPane,
  splitTerminalPane,
  updateTerminalPane,
  updateTerminalSplitRatio,
  type TerminalLayoutNode,
  type TerminalSplitDirection,
  type TerminalTabLayout,
} from '@/core/terminal/TerminalLayout'
import {
  TerminalShortcutSettings,
  terminalShortcutInputFromKeyboardEvent,
  type TerminalShortcutAction,
} from '@/core/terminal/TerminalShortcuts'
import {
  planTerminalRecovery,
  TerminalWorkspaceStorage,
} from '@/core/terminal/TerminalWorkspaceStorage'
import {
  TERMINAL_SSH_RECOVERED_EVENT,
  sshConnectionKey,
  type HostKeyMismatchEvent,
  type HostKeyPromptEvent,
  type SshConnectionProfile,
  type TerminalCapabilities,
  type TerminalCwdEvent,
  type TerminalLaunchSpec,
  type TerminalSessionInfo,
  type TerminalStatusEvent,
} from '@/core/terminal/TerminalTypes'
import { TerminalProfileStorage } from '@/core/terminal/TerminalProfileStorage'
import emitter from '@/hooks/useMitt'
import TerminalLayoutNodeComponent from './TerminalLayoutNode.vue'
import TerminalSftpPanel from './TerminalSftpPanel.vue'

const SESSION_CREATE_TIMEOUT_MS = 20_000
/** 输出后保持「忙」状态的时长;指示环比输出本身多停留一会儿,避免闪烁 */
const TERMINAL_BUSY_HOLD_MS = 800
/** 单个会话上报忙状态的最小间隔,防止高频输出引发频繁重渲染 */
const TERMINAL_BUSY_THROTTLE_MS = 300
const TERMINAL_BUSY_SWEEP_MS = 400
const profileStorage = new TerminalProfileStorage(localStorage)
const workspaceStorage = new TerminalWorkspaceStorage(localStorage)
const initialWorkspace = workspaceStorage.load()
const tabs = ref<TerminalTabLayout[]>(initialWorkspace.tabs)
const activeTabId = ref(initialWorkspace.activeTabId)
const workbenchElement = ref<HTMLDivElement | null>(null)
const autoOpenSshPaneId = ref('')
const expandedPaneByTabId = ref<Record<string, string | undefined>>({})
const sftpSessionByTabId = ref<Record<string, string | undefined>>({})
const renamingTabId = ref('')
const renameValue = ref('')
const renameInput = ref<HTMLInputElement[]>([])
const capabilities = ref<TerminalCapabilities>({
  platform: 'linux',
  localShells: [],
  wslDistros: [],
  sshAvailable: true,
})
let shortcutSettings = new TerminalShortcutSettings(localStorage, capabilities.value.platform)
const savedProfiles = ref<SshConnectionProfile[]>(profileStorage.list())
const sshConfigProfiles = ref<SshConnectionProfile[]>([])
const sessionInfos = ref<Record<string, TerminalSessionInfo>>({})
/** sessionId → 忙状态截止时间戳;由 'terminal-output' 节流更新,sweep 定时清除过期项 */
const busyUntilBySession = ref<Record<string, number>>({})
let busySweepTimer: number | undefined
const activeTab = computed(
  () => tabs.value.find((tab) => tab.id === activeTabId.value) || tabs.value[0],
)
const activePanes = computed(() => (activeTab.value ? listTerminalPanes(activeTab.value.root) : []))
const activePaneCount = computed(() => activePanes.value.length)
const activeFocusedPaneId = computed(() => {
  const tab = activeTab.value
  if (!tab) return undefined
  return findTerminalPane(tab.root, tab.focusedPaneId || '')?.id ?? activePanes.value[0]?.id
})
const activeExpandedPaneId = computed(() => {
  const tab = activeTab.value
  const paneId = tab ? expandedPaneByTabId.value[tab.id] : undefined
  return tab && paneId && findTerminalPane(tab.root, paneId) ? paneId : undefined
})
const activeLayoutNode = computed<TerminalLayoutNode | undefined>(() => {
  const tab = activeTab.value
  if (!tab) return undefined
  return activeExpandedPaneId.value
    ? findTerminalPane(tab.root, activeExpandedPaneId.value) || tab.root
    : tab.root
})
const activeSftpSessionId = computed(() => {
  const tabId = activeTab.value?.id
  const sessionId = tabId ? sftpSessionByTabId.value[tabId] : undefined
  const session = sessionId ? sessionInfos.value[sessionId] : undefined
  return session?.kind === 'ssh' && session.status === 'ready' ? sessionId : undefined
})
const activeSftpTargetSessionId = computed(() => {
  const focusedPane = activeFocusedPaneId.value
    ? findTerminalPane(activeTab.value?.root, activeFocusedPaneId.value)
    : undefined
  const focusedSession = focusedPane?.sessionId
    ? sessionInfos.value[focusedPane.sessionId]
    : undefined
  if (focusedSession?.kind === 'ssh' && focusedSession.status === 'ready') {
    return focusedSession.id
  }
  return activePanes.value.find((pane) => {
    const session = pane.sessionId ? sessionInfos.value[pane.sessionId] : undefined
    return session?.kind === 'ssh' && session.status === 'ready'
  })?.sessionId
})
const shortcutPlatform = computed(() => capabilities.value.platform || 'win32')
const allProfiles = computed(() => {
  const savedIds = new Set(savedProfiles.value.map((profile) => profile.id))
  return [
    ...savedProfiles.value,
    ...sshConfigProfiles.value.filter((profile) => !savedIds.has(profile.id)),
  ]
})

function addTab(): void {
  const tab = createTerminalTab(t('common.terminal.terminal'))
  tabs.value.push(tab)
  activeTabId.value = tab.id
}

function createLaunchedTab(launch: TerminalLaunchSpec): { tab: TerminalTabLayout; paneId: string } {
  const title = launchTitle(launch)
  const tab = createTerminalTab(title)
  const pane = listTerminalPanes(tab.root)[0]
  tab.root = updateTerminalPane(tab.root, pane.id, { launch, title })
  tabs.value.push(tab)
  activeTabId.value = tab.id
  return { tab, paneId: pane.id }
}

async function addTerminalTab(command: string): Promise<void> {
  if (command === 'empty') {
    addTab()
    return
  }
  if (command === 'ssh') {
    const { paneId } = createLaunchedTab({ kind: 'ssh', label: 'SSH' })
    autoOpenSshPaneId.value = paneId
    return
  }
  const [kind, encodedValue] = command.split(':', 2)
  if (kind === 'local') {
    const shell = capabilities.value.localShells.find((entry) => entry.kind === encodedValue)
    if (!shell) return
    const launch: TerminalLaunchSpec = {
      kind: 'local',
      localShell: shell.kind,
      label: shell.label,
    }
    const { paneId } = createLaunchedTab(launch)
    await createPaneSession(paneId, launch)
    return
  }
  if (kind === 'wsl') {
    const distro = decodeURIComponent(encodedValue || '')
    if (!capabilities.value.wslDistros.includes(distro)) return
    const launch: TerminalLaunchSpec = {
      kind: 'wsl',
      wslDistro: distro,
      label: `WSL · ${distro}`,
    }
    const { paneId } = createLaunchedTab(launch)
    await createPaneSession(paneId, launch)
  }
}

function launchTitle(launch: TerminalLaunchSpec): string {
  if (launch.label) return launch.label
  if (launch.kind === 'local') return launch.localShell
  if (launch.kind === 'wsl') return `WSL · ${launch.wslDistro}`
  return launch.sshProfile?.name || 'SSH'
}

function activateTab(tabId: string): void {
  if (tabs.value.some((tab) => tab.id === tabId)) activeTabId.value = tabId
}

async function closeTab(tabId: string): Promise<void> {
  const tabIndex = tabs.value.findIndex((entry) => entry.id === tabId)
  const tab = tabs.value.find((entry) => entry.id === tabId)
  if (!tab) return
  const sessionIds = listTerminalPanes(tab.root).flatMap((pane) =>
    pane.sessionId ? [pane.sessionId] : [],
  )
  if (sessionIds.length > 0) {
    try {
      await ElMessageBox.confirm(
        t('common.terminal.closeTabConfirm'),
        t('common.terminal.closeSession'),
        { type: 'warning', customClass: 'app-message-box' },
      )
    } catch {
      return
    }
    await Promise.all(
      sessionIds.map((id) => window.ipcRenderer.invoke('terminal-session-close', id)),
    )
  }
  tabs.value = tabs.value.filter((entry) => entry.id !== tabId)
  const expanded = { ...expandedPaneByTabId.value }
  delete expanded[tabId]
  expandedPaneByTabId.value = expanded
  const sftpSessions = { ...sftpSessionByTabId.value }
  delete sftpSessions[tabId]
  sftpSessionByTabId.value = sftpSessions
  if (tabs.value.length === 0) tabs.value = [createTerminalTab(t('common.terminal.terminal'))]
  if (activeTabId.value === tabId) {
    activeTabId.value = tabs.value[Math.min(tabIndex, tabs.value.length - 1)].id
  }
}

function closeTabWithMiddleClick(event: MouseEvent, tabId: string): void {
  if (event.button !== 1) return
  event.preventDefault()
  void closeTab(tabId)
}

function beginRenameTab(tab: TerminalTabLayout): void {
  renamingTabId.value = tab.id
  renameValue.value = tabDisplayTitle(tab)
  void nextTick(() => {
    const input = renameInput.value[0]
    input?.focus()
    input?.select()
  })
}

function commitRenameTab(tab: TerminalTabLayout): void {
  if (renamingTabId.value !== tab.id) return
  const value = renameValue.value.trim()
  if (value) tab.title = value
  renamingTabId.value = ''
}

function cancelRenameTab(): void {
  renamingTabId.value = ''
  renameValue.value = ''
}

function handleRenameKeydown(event: KeyboardEvent, tab: TerminalTabLayout): void {
  if (event.isComposing) return
  if (event.key === 'Enter') {
    event.preventDefault()
    commitRenameTab(tab)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    cancelRenameTab()
  }
}

function tabStatus(tab: TerminalTabLayout): 'empty' | 'connecting' | 'ready' | 'closed' | 'error' {
  const panes = listTerminalPanes(tab.root)
  const sessions = panes.flatMap((pane) =>
    pane.sessionId && sessionInfos.value[pane.sessionId]
      ? [sessionInfos.value[pane.sessionId]]
      : [],
  )
  if (sessions.some((session) => session.status === 'error')) return 'error'
  if (sessions.some((session) => session.status === 'connecting')) return 'connecting'
  if (sessions.some((session) => session.status === 'ready')) return 'ready'
  if (
    sessions.some((session) => session.status === 'closed') ||
    panes.some((pane) => pane.launch)
  ) {
    return 'closed'
  }
  return 'empty'
}

/** tab 下任一会话在近期有输出即视为忙,状态点变为旋转的残缺环 */
function tabBusy(tab: TerminalTabLayout): boolean {
  const busy = busyUntilBySession.value
  const now = Date.now()
  return listTerminalPanes(tab.root).some((pane) => {
    const until = pane.sessionId ? busy[pane.sessionId] : undefined
    return until !== undefined && until > now
  })
}

function handleOutputActivity(
  _event: unknown,
  value: { sessionId?: string; activity?: boolean },
): void {
  if (value.activity === false) return
  const sessionId = value?.sessionId
  if (!sessionId) return
  const until = Date.now() + TERMINAL_BUSY_HOLD_MS
  const existing = busyUntilBySession.value[sessionId]
  if (existing && existing > until - TERMINAL_BUSY_THROTTLE_MS) return
  busyUntilBySession.value = { ...busyUntilBySession.value, [sessionId]: until }
}

function sweepBusySessions(): void {
  const entries = Object.entries(busyUntilBySession.value)
  if (entries.length === 0) return
  const now = Date.now()
  const alive = entries.filter(([, until]) => until > now)
  if (alive.length === entries.length) return
  busyUntilBySession.value = Object.fromEntries(alive)
}

/** 主进程上报的运行时 cwd:写回 launch,随工作区持久化,供重连/重启恢复 */
function handleCwdUpdate(_event: unknown, value: TerminalCwdEvent): void {
  if (!value?.sessionId || typeof value.cwd !== 'string' || !value.cwd) return
  for (const tab of tabs.value) {
    const pane = listTerminalPanes(tab.root).find((entry) => entry.sessionId === value.sessionId)
    if (!pane?.launch || pane.launch.kind === 'ssh' || pane.launch.cwd === value.cwd) continue
    tab.root = updateTerminalPane(tab.root, pane.id, {
      launch: { ...pane.launch, cwd: value.cwd },
    })
    return
  }
}

function tabDisplayTitle(tab: TerminalTabLayout): string {
  const storedTitle = tab.title.trim()
  if (storedTitle && !isDefaultTerminalTitle(storedTitle)) return storedTitle
  const panes = listTerminalPanes(tab.root)
  const focusedPane = findTerminalPane(tab.root, tab.focusedPaneId || '') ?? panes[0]
  if (focusedPane?.sessionId) {
    return sessionInfos.value[focusedPane.sessionId]?.title || focusedPane.title || storedTitle
  }
  return storedTitle || t('common.terminal.terminal')
}

function isDefaultTerminalTitle(title: string): boolean {
  const normalized = title.trim().toLocaleLowerCase()
  return normalized === 'terminal' || normalized === '终端'
}

function setPaneSession(
  paneId: string,
  session: TerminalSessionInfo,
  launch?: TerminalLaunchSpec,
): void {
  const tab = tabs.value.find((entry) => findTerminalPane(entry.root, paneId))
  if (!tab) return
  const previousSessionId = findTerminalPane(tab.root, paneId)?.sessionId
  tab.root = updateTerminalPane(tab.root, paneId, {
    sessionId: session.id,
    title: session.title,
    ...(launch ? { launch } : {}),
  })
  tab.focusedPaneId = paneId
  activeTabId.value = tab.id
  sessionInfos.value = { ...sessionInfos.value, [session.id]: session }
  if (previousSessionId && sftpSessionByTabId.value[tab.id] === previousSessionId) {
    sftpSessionByTabId.value = { ...sftpSessionByTabId.value, [tab.id]: session.id }
  }
  if (launch?.kind === 'ssh' && session.status === 'ready') {
    notifySshSessionReady(tab.id, paneId, launch)
  }
}

/**
 * 某个 SSH pane 上线后,若同一 tab 内还有使用相同连接参数的断开/未连接 pane,
 * 广播事件让它们静默重连(凭据来自 safeStorage,缺失时对应 pane 保持原状)。
 */
function notifySshSessionReady(
  tabId: string,
  sourcePaneId: string,
  launch: Extract<TerminalLaunchSpec, { kind: 'ssh' }>,
): void {
  const key = launch.sshProfile ? sshConnectionKey(launch.sshProfile) : ''
  if (!key) return
  const tab = tabs.value.find((entry) => entry.id === tabId)
  if (!tab) return
  const hasDisconnectedSibling = listTerminalPanes(tab.root).some((pane) => {
    if (pane.id === sourcePaneId || pane.launch?.kind !== 'ssh') return false
    const profile = pane.launch.sshProfile
    if (!profile || sshConnectionKey(profile) !== key) return false
    if (!pane.sessionId) return true
    const status = sessionInfos.value[pane.sessionId]?.status
    return status === 'closed' || status === 'error'
  })
  if (hasDisconnectedSibling) {
    emitter.emit(TERMINAL_SSH_RECOVERED_EVENT, { key, sourcePaneId })
  }
}

function focusPane(paneId: string): void {
  const tab = tabs.value.find((entry) => findTerminalPane(entry.root, paneId))
  if (!tab) return
  tab.focusedPaneId = paneId
  activeTabId.value = tab.id
}

function toggleActiveTabSftp(): void {
  const tab = activeTab.value
  const sessionId = activeSftpTargetSessionId.value
  if (!tab || !sessionId) return
  sftpSessionByTabId.value = {
    ...sftpSessionByTabId.value,
    [tab.id]: activeSftpSessionId.value ? undefined : sessionId,
  }
}

function toggleExpandPane(paneId: string): void {
  const tab = tabs.value.find((entry) => findTerminalPane(entry.root, paneId))
  if (!tab || listTerminalPanes(tab.root).length < 2) return
  focusPane(paneId)
  expandedPaneByTabId.value = {
    ...expandedPaneByTabId.value,
    [tab.id]: expandedPaneByTabId.value[tab.id] === paneId ? undefined : paneId,
  }
}

function resizeSplit(splitId: string, ratio: number): void {
  if (activeTab.value) {
    activeTab.value.root = updateTerminalSplitRatio(activeTab.value.root, splitId, ratio)
  }
}

async function splitPane(
  paneId: string,
  direction: TerminalSplitDirection,
  inherit: boolean,
): Promise<void> {
  const tab = tabs.value.find((entry) => findTerminalPane(entry.root, paneId))
  const source = tab ? findTerminalPane(tab.root, paneId) : undefined
  if (!tab || !source) return
  const newPane = createEmptyPane(t('common.terminal.emptyTerminal'))
  tab.root = splitTerminalPane(tab.root, paneId, direction, newPane)
  tab.focusedPaneId = newPane.id
  expandedPaneByTabId.value = { ...expandedPaneByTabId.value, [tab.id]: undefined }
  if (inherit && source.sessionId) {
    try {
      const session = await window.ipcRenderer.invoke('terminal-session-clone', {
        sessionId: source.sessionId,
        cols: 80,
        rows: 24,
      })
      tab.root = updateTerminalPane(tab.root, newPane.id, {
        sessionId: session.id,
        title: session.title,
        launch: source.launch,
      })
      sessionInfos.value = { ...sessionInfos.value, [session.id]: session }
    } catch (error) {
      ElMessage.error(errorMessage(error))
    }
  }
}

async function closePane(paneId: string): Promise<void> {
  const tab = tabs.value.find((entry) => findTerminalPane(entry.root, paneId))
  const pane = tab ? findTerminalPane(tab.root, paneId) : undefined
  if (!tab || !pane) return
  if (pane.sessionId) {
    try {
      await ElMessageBox.confirm(
        t('common.terminal.closePaneConfirm'),
        t('common.terminal.closeSession'),
        { type: 'warning', customClass: 'app-message-box' },
      )
    } catch {
      return
    }
    await window.ipcRenderer.invoke('terminal-session-close', pane.sessionId)
    const infos = { ...sessionInfos.value }
    delete infos[pane.sessionId]
    sessionInfos.value = infos
    if (sftpSessionByTabId.value[tab.id] === pane.sessionId) {
      sftpSessionByTabId.value = { ...sftpSessionByTabId.value, [tab.id]: undefined }
    }
  }
  const result = removeTerminalPane(tab.root, paneId)
  tab.root = result || createEmptyPane(t('common.terminal.emptyTerminal'))
  tab.focusedPaneId = listTerminalPanes(tab.root)[0]?.id
  if (expandedPaneByTabId.value[tab.id] === paneId) {
    expandedPaneByTabId.value = { ...expandedPaneByTabId.value, [tab.id]: undefined }
  }
}

function cycleTab(delta: number): void {
  const current = tabs.value.findIndex((tab) => tab.id === activeTabId.value)
  if (current < 0 || tabs.value.length < 2) return
  activeTabId.value = tabs.value[(current + delta + tabs.value.length) % tabs.value.length].id
}

function cyclePane(delta: number): void {
  const panes = activePanes.value
  if (!activeTab.value || panes.length < 2) return
  const current = panes.findIndex((pane) => pane.id === activeFocusedPaneId.value)
  const next = panes[(Math.max(current, 0) + delta + panes.length) % panes.length]
  focusPane(next.id)
}

function runShortcut(action: TerminalShortcutAction): void {
  const focusedPaneId = activeFocusedPaneId.value
  switch (action.type) {
    case 'new-tab':
      addTab()
      break
    case 'close-active':
      if (focusedPaneId && activePaneCount.value > 1) void closePane(focusedPaneId)
      else if (activeTab.value) void closeTab(activeTab.value.id)
      break
    case 'next-tab':
      cycleTab(1)
      break
    case 'previous-tab':
      cycleTab(-1)
      break
    case 'select-tab':
      if (tabs.value[action.index]) activateTab(tabs.value[action.index].id)
      break
    case 'focus-next-pane':
      cyclePane(1)
      break
    case 'focus-previous-pane':
      cyclePane(-1)
      break
    case 'split-right':
    case 'split-down':
      if (focusedPaneId && activeTab.value) {
        const pane = findTerminalPane(activeTab.value.root, focusedPaneId)
        void splitPane(
          focusedPaneId,
          action.type === 'split-right' ? 'horizontal' : 'vertical',
          Boolean(pane?.sessionId),
        )
      }
      break
    case 'toggle-expand-pane':
      if (focusedPaneId) toggleExpandPane(focusedPaneId)
      break
  }
}

/** 仅拦截真实可见的模态遮罩(display:none 的隐藏层不算),避免快捷键被残留 overlay 误杀 */
function hasVisibleTerminalOverlay(): boolean {
  return Array.from(document.querySelectorAll('.el-overlay')).some(
    (overlay) => overlay instanceof HTMLElement && overlay.checkVisibility(),
  )
}

function handleTerminalShortcut(event: KeyboardEvent): void {
  const target = event.target
  if (!(target instanceof Node) || !workbenchElement.value?.contains(target)) return
  const element = target instanceof HTMLElement ? target : undefined
  const isTerminalInput = element?.classList.contains('xterm-helper-textarea')
  const isEditable =
    element?.isContentEditable ||
    element?.matches('input, textarea, select, [contenteditable="true"]')
  if (isEditable && !isTerminalInput) return
  if (hasVisibleTerminalOverlay()) return
  shortcutSettings.reload()
  const action = shortcutSettings.resolve(terminalShortcutInputFromKeyboardEvent(event))
  if (!action) return
  event.preventDefault()
  event.stopPropagation()
  runShortcut(action)
}

function saveProfile(profile: SshConnectionProfile): void {
  try {
    profileStorage.save(profile)
    savedProfiles.value = profileStorage.list()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

function removeProfile(id: string): void {
  profileStorage.remove(id)
  savedProfiles.value = profileStorage.list()
  void window.ipcRenderer.invoke('terminal-credential-remove', id).catch(() => undefined)
}

async function loadSshConfig(): Promise<void> {
  try {
    sshConfigProfiles.value = await window.ipcRenderer.invoke('terminal-ssh-config-list')
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function createPaneSession(paneId: string, launch: TerminalLaunchSpec): Promise<boolean> {
  if (launch.kind === 'ssh') return false
  const request =
    launch.kind === 'local'
      ? {
          kind: 'local' as const,
          localShell: launch.localShell,
          cwd: launch.cwd,
          cols: 80,
          rows: 24,
        }
      : {
          kind: 'wsl' as const,
          wslDistro: launch.wslDistro,
          cwd: launch.cwd,
          cols: 80,
          rows: 24,
        }
  try {
    const session = await withTimeout(
      window.ipcRenderer.invoke('terminal-session-create', request),
      SESSION_CREATE_TIMEOUT_MS,
      t('common.terminal.connectionRequestTimeout'),
      (lateSession: TerminalSessionInfo) =>
        void window.ipcRenderer.invoke('terminal-session-close', lateSession.id),
    )
    setPaneSession(paneId, session, launch)
    return true
  } catch (error) {
    ElMessage.error(errorMessage(error))
    return false
  }
}

async function reconcileSessions(): Promise<void> {
  const sessions: TerminalSessionInfo[] = await window.ipcRenderer.invoke('terminal-session-list')
  sessionInfos.value = Object.fromEntries(sessions.map((session) => [session.id, session]))
  const recovery = planTerminalRecovery(tabs.value, new Set(sessions.map((session) => session.id)))
  tabs.value = recovery.tabs
  await Promise.all(
    recovery.targets.map((target) => createPaneSession(target.paneId, target.launch)),
  )
}

async function handleHostKeyPrompt(_event: unknown, prompt: HostKeyPromptEvent): Promise<void> {
  let accepted = false
  try {
    await ElMessageBox.confirm(
      t('common.terminal.hostKeyPrompt', {
        host: prompt.host,
        port: prompt.port,
        fingerprint: prompt.fingerprint,
      }),
      t('common.terminal.unknownHost'),
      {
        type: 'warning',
        confirmButtonText: t('common.terminal.trustAndConnect'),
        customClass: 'app-message-box',
      },
    )
    accepted = true
  } catch {
    accepted = false
  }
  try {
    await window.ipcRenderer.invoke('terminal-host-key-response', {
      requestId: prompt.requestId,
      accepted,
    })
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

function handleHostKeyMismatch(_event: unknown, event: HostKeyMismatchEvent): void {
  void ElMessageBox.alert(
    t('common.terminal.hostKeyMismatchMessage', {
      host: event.host,
      port: event.port,
      expected: event.expected,
      actual: event.actual,
    }),
    t('common.terminal.hostKeyMismatch'),
    { type: 'error', customClass: 'app-message-box' },
  )
}

function handleStatus(_event: unknown, event: TerminalStatusEvent): void {
  sessionInfos.value = { ...sessionInfos.value, [event.session.id]: event.session }
}

watch(
  [tabs, activeTabId],
  () => workspaceStorage.save({ tabs: tabs.value, activeTabId: activeTabId.value }),
  { deep: true },
)

onMounted(async () => {
  window.addEventListener('keydown', handleTerminalShortcut, true)
  window.ipcRenderer?.on('terminal-host-key-prompt', handleHostKeyPrompt)
  window.ipcRenderer?.on('terminal-host-key-mismatch', handleHostKeyMismatch)
  window.ipcRenderer?.on('terminal-status', handleStatus)
  window.ipcRenderer?.on('terminal-output', handleOutputActivity)
  window.ipcRenderer?.on('terminal-cwd', handleCwdUpdate)
  busySweepTimer = window.setInterval(sweepBusySessions, TERMINAL_BUSY_SWEEP_MS)
  try {
    capabilities.value = await window.ipcRenderer.invoke('terminal-capabilities')
    shortcutSettings = new TerminalShortcutSettings(localStorage, shortcutPlatform.value)
    await Promise.all([loadSshConfig(), reconcileSessions()])
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleTerminalShortcut, true)
  window.ipcRenderer?.off('terminal-host-key-prompt', handleHostKeyPrompt)
  window.ipcRenderer?.off('terminal-host-key-mismatch', handleHostKeyMismatch)
  window.ipcRenderer?.off('terminal-status', handleStatus)
  window.ipcRenderer?.off('terminal-output', handleOutputActivity)
  window.ipcRenderer?.off('terminal-cwd', handleCwdUpdate)
  window.clearInterval(busySweepTimer)
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
.terminal-workbench {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
  background: var(--app-bg);
}
.terminal-workbench__main {
  min-width: 0;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}
.terminal-tabs {
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: stretch;
  color: var(--app-text);
  background: var(--app-surface-muted);
  border-bottom: 1px solid var(--app-border);
}
.terminal-tabs__strip {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: stretch;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-color: var(--app-border-strong) transparent;
  scrollbar-width: thin;
}
.terminal-tabs__strip::-webkit-scrollbar {
  height: 3px;
}
.terminal-tabs__strip::-webkit-scrollbar-thumb {
  border-radius: 3px;
  background: var(--app-border-strong);
}
.terminal-tab {
  position: relative;
  min-width: 88px;
  max-width: 280px;
  flex: 1 1 180px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 7px 0 9px;
  border-right: 1px solid var(--app-border);
  outline: none;
  color: var(--app-text-muted);
  background: transparent;
  cursor: pointer;
  user-select: none;
  transition:
    color 0.12s ease,
    background 0.12s ease;
}
.terminal-tab::after {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 2px;
  background: transparent;
  content: '';
}
.terminal-tab:hover,
.terminal-tab:focus-visible {
  color: var(--app-text-secondary);
}
.terminal-tab:focus-visible {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--el-color-primary) 45%, transparent);
}
.terminal-tab.active {
  color: var(--app-text);
  background: color-mix(in srgb, var(--app-text) 6%, var(--app-surface-muted));
}
.terminal-tab.active::after {
  background: color-mix(in srgb, var(--app-text) 60%, var(--app-surface));
}
.terminal-tab--ghost {
  opacity: 0.36;
  background: color-mix(in srgb, var(--el-color-primary) 12%, var(--app-surface-muted));
}
.terminal-tab--dragging {
  border-radius: 7px;
  background: var(--app-surface-raised);
  box-shadow: 0 7px 20px var(--app-shadow);
}
.tab-leading {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 10px;
  height: 16px;
  flex: none;
  color: var(--app-text-muted);
}
.terminal-tab.active .tab-leading {
  color: var(--app-text-secondary);
}
.tab-status-dot {
  width: 7px;
  height: 7px;
  border: 1.5px solid var(--app-surface-muted);
  border-radius: 50%;
  background: #8b949e;
}
.terminal-tab.active .tab-status-dot {
  border-color: color-mix(in srgb, var(--app-text) 6%, var(--app-surface-muted));
}
.tab-leading.ready .tab-status-dot {
  background: #3fb950;
}
.tab-leading.connecting .tab-status-dot {
  background: #d29922;
}
.tab-leading.error .tab-status-dot {
  background: #f85149;
}
.tab-leading.closed .tab-status-dot {
  background: #f0883e;
}
/* 忙状态:与原状态点同盒尺寸(7px + 1.5px 边框)的橙色残缺环,旋转指示输出/刷新 */
.tab-leading.busy .tab-status-dot {
  border-color: #f0883e;
  border-top-color: transparent;
  background: transparent;
  animation: tab-status-spin 0.8s linear infinite;
}
@keyframes tab-status-spin {
  to {
    transform: rotate(360deg);
  }
}
.tab-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tab-rename-input {
  min-width: 0;
  height: 22px;
  flex: 1;
  padding: 0 4px;
  border: 1px solid var(--el-color-primary);
  border-radius: 4px;
  outline: none;
  color: var(--app-text);
  background: var(--app-surface-raised);
  font: inherit;
}
.tab-close {
  width: 19px;
  height: 19px;
  flex: none;
  display: grid;
  padding: 0;
  border: 0;
  border-radius: 4px;
  color: inherit;
  background: transparent;
  cursor: pointer;
  opacity: 0;
  place-items: center;
  transition:
    color 0.12s ease,
    background 0.12s ease,
    opacity 0.12s ease;
}
.terminal-tab.active .tab-close,
.terminal-tab:hover .tab-close,
.terminal-tab:focus-visible .tab-close,
.tab-close:focus-visible {
  opacity: 1;
}
.tab-close:hover,
.tab-close:focus-visible {
  color: var(--el-color-danger);
  background: color-mix(in srgb, var(--el-color-danger) 10%, transparent);
  outline: none;
}
.terminal-tabs__actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 1px;
  padding: 0 4px;
  border-left: 1px solid var(--app-border);
  background: var(--app-surface-muted);
}
.terminal-tab-add {
  width: 29px;
  height: 27px;
  flex: 0 0 29px;
  margin: 0 2px;
  padding: 0;
  border-radius: 6px;
  color: var(--app-text-muted);
}
.terminal-tab-add:hover,
.terminal-tab-add:focus-visible {
  color: var(--app-text);
  background: var(--app-hover);
}
.terminal-tabs__actions :deep(.tab-action) {
  width: 27px;
  height: 27px;
  margin: 0;
  padding: 0;
  border-radius: 6px;
  color: var(--app-text-muted);
}
.terminal-tabs__actions :deep(.tab-action:hover),
.terminal-tabs__actions :deep(.tab-action:focus-visible) {
  color: var(--app-text);
  background: var(--app-hover);
}
.terminal-tabs__actions :deep(.tab-action--sftp.active) {
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 12%, transparent);
}
.terminal-tab-content {
  flex: 1;
  min-height: 0;
  display: flex;
}
.terminal-tab-content__layout {
  min-width: 0;
  min-height: 0;
  flex: 1;
  display: flex;
}
:global(.terminal-new-session-menu .el-dropdown-menu__item) {
  min-width: 180px;
  gap: 8px;
}
</style>
