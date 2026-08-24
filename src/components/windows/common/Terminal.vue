<template>
  <div ref="workbenchElement" class="terminal-workbench">
    <div class="terminal-tabs">
      <div class="terminal-tabs__strip" role="tablist">
        <div
          v-for="tab in tabs"
          :key="tab.id"
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
          <span class="tab-leading" :class="tabStatus(tab)">
            <el-icon><Monitor /></el-icon>
            <i></i>
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
      </div>
      <div class="terminal-tabs__actions">
        <el-tooltip :content="t('common.terminal.newTabShortcut')" placement="bottom">
          <el-button text class="tab-action" @click="addTab">
            <el-icon><Plus /></el-icon>
          </el-button>
        </el-tooltip>
        <el-popover
          placement="bottom-end"
          :width="360"
          trigger="click"
          popper-class="terminal-shortcuts-popover"
        >
          <template #reference>
            <el-button text class="tab-action" :aria-label="t('common.terminal.keyboardShortcuts')">
              <el-icon><Operation /></el-icon>
            </el-button>
          </template>
          <div class="shortcut-sheet">
            <header>
              <strong>{{ t('common.terminal.keyboardShortcuts') }}</strong>
              <small>{{ t('common.terminal.keyboardShortcutsHint') }}</small>
            </header>
            <div v-for="shortcut in shortcutItems" :key="shortcut.label" class="shortcut-row">
              <span>{{ shortcut.label }}</span>
              <kbd>{{ shortcut.keys }}</kbd>
            </div>
          </div>
        </el-popover>
        <el-tooltip :content="t('common.terminal.refreshSshConfig')" placement="bottom">
          <el-button text class="tab-action" @click="loadSshConfig">
            <el-icon><Refresh /></el-icon>
          </el-button>
        </el-tooltip>
      </div>
    </div>

    <div v-if="activeTab && activeLayoutNode" class="terminal-tab-content">
      <TerminalLayoutNodeComponent
        :node="activeLayoutNode"
        :focused-pane-id="activeFocusedPaneId"
        :pane-count="activePaneCount"
        :expanded-pane-id="activeExpandedPaneId"
        :capabilities="capabilities"
        :profiles="allProfiles"
        :session-infos="sessionInfos"
        @session="setPaneSession"
        @focus="focusPane"
        @expand="toggleExpandPane"
        @resize="resizeSplit"
        @split="splitPane"
        @close="closePane"
        @save-profile="saveProfile"
        @remove-profile="removeProfile"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Close, Monitor, Operation, Plus, Refresh } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
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
  resolveTerminalShortcut,
  type TerminalShortcutAction,
} from '@/core/terminal/TerminalShortcuts'
import {
  type HostKeyMismatchEvent,
  type HostKeyPromptEvent,
  type SshConnectionProfile,
  type TerminalCapabilities,
  type TerminalSessionInfo,
  type TerminalStatusEvent,
} from '@/core/terminal/TerminalTypes'
import { TerminalProfileStorage } from '@/core/terminal/TerminalProfileStorage'
import TerminalLayoutNodeComponent from './TerminalLayoutNode.vue'

const STORAGE_KEY = 'nav-tools:terminal-layout:v2'
const LEGACY_STORAGE_KEY = 'nav-tools:terminal-layout:v1'
const profileStorage = new TerminalProfileStorage(localStorage)
const tabs = ref<TerminalTabLayout[]>(loadTabs())
const activeTabId = ref(tabs.value[0]?.id || '')
const workbenchElement = ref<HTMLDivElement | null>(null)
const expandedPaneByTabId = ref<Record<string, string | undefined>>({})
const renamingTabId = ref('')
const renameValue = ref('')
const renameInput = ref<HTMLInputElement[]>([])
const capabilities = ref<TerminalCapabilities>({
  platform: 'linux',
  localShells: [],
  wslDistros: [],
  sshAvailable: true,
})
const savedProfiles = ref<SshConnectionProfile[]>(profileStorage.list())
const sshConfigProfiles = ref<SshConnectionProfile[]>([])
const sessionInfos = ref<Record<string, TerminalSessionInfo>>({})
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
const shortcutPlatform = computed(() => capabilities.value.platform || 'win32')
const primaryKey = computed(() => (shortcutPlatform.value === 'darwin' ? '⌘' : 'Ctrl'))
const shortcutItems = computed(() => [
  { label: t('common.terminal.shortcutNewTab'), keys: `${primaryKey.value}+T` },
  { label: t('common.terminal.shortcutClose'), keys: `${primaryKey.value}+W` },
  { label: t('common.terminal.shortcutSwitchTab'), keys: 'Ctrl+Tab / Ctrl+PageUp·PageDown' },
  {
    label: t('common.terminal.shortcutSelectTab'),
    keys: shortcutPlatform.value === 'darwin' ? 'Ctrl+1…9' : 'Alt+1…9',
  },
  { label: t('common.terminal.shortcutFocusPane'), keys: `${primaryKey.value}+[ / ]` },
  {
    label: t('common.terminal.splitRight'),
    keys: shortcutPlatform.value === 'darwin' ? '⌘+D' : 'Ctrl+Shift+D',
  },
  {
    label: t('common.terminal.splitDown'),
    keys: shortcutPlatform.value === 'darwin' ? '⌘+Shift+D' : 'Alt+Shift+D',
  },
  {
    label: t('common.terminal.shortcutExpandPane'),
    keys: `${primaryKey.value}+Shift+Enter`,
  },
])
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

function tabStatus(tab: TerminalTabLayout): 'empty' | 'connecting' | 'ready' | 'error' {
  const sessions = listTerminalPanes(tab.root).flatMap((pane) =>
    pane.sessionId && sessionInfos.value[pane.sessionId]
      ? [sessionInfos.value[pane.sessionId]]
      : [],
  )
  if (sessions.some((session) => session.status === 'error')) return 'error'
  if (sessions.some((session) => session.status === 'connecting')) return 'connecting'
  if (sessions.some((session) => session.status === 'ready')) return 'ready'
  return 'empty'
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

function setPaneSession(paneId: string, session: TerminalSessionInfo): void {
  const tab = tabs.value.find((entry) => findTerminalPane(entry.root, paneId))
  if (!tab) return
  tab.root = updateTerminalPane(tab.root, paneId, { sessionId: session.id, title: session.title })
  tab.focusedPaneId = paneId
  activeTabId.value = tab.id
  sessionInfos.value = { ...sessionInfos.value, [session.id]: session }
}

function focusPane(paneId: string): void {
  const tab = tabs.value.find((entry) => findTerminalPane(entry.root, paneId))
  if (!tab) return
  tab.focusedPaneId = paneId
  activeTabId.value = tab.id
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

function handleTerminalShortcut(event: KeyboardEvent): void {
  const target = event.target
  if (!(target instanceof Node) || !workbenchElement.value?.contains(target)) return
  const element = target instanceof HTMLElement ? target : undefined
  const isTerminalInput = element?.classList.contains('xterm-helper-textarea')
  const isEditable =
    element?.isContentEditable ||
    element?.matches('input, textarea, select, [contenteditable="true"]')
  if (isEditable && !isTerminalInput) return
  if (document.querySelector('.el-overlay')) return
  const action = resolveTerminalShortcut(event, shortcutPlatform.value)
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
}

async function loadSshConfig(): Promise<void> {
  try {
    sshConfigProfiles.value = await window.ipcRenderer.invoke('terminal-ssh-config-list')
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function reconcileSessions(): Promise<void> {
  const sessions: TerminalSessionInfo[] = await window.ipcRenderer.invoke('terminal-session-list')
  const byId = new Map(sessions.map((session) => [session.id, session]))
  sessionInfos.value = Object.fromEntries(sessions.map((session) => [session.id, session]))
  const reconcile = (node: TerminalLayoutNode): TerminalLayoutNode => {
    if (node.kind === 'pane') {
      if (!node.sessionId || byId.has(node.sessionId)) return node
      return { ...node, sessionId: undefined, title: t('common.terminal.emptyTerminal') }
    }
    return { ...node, first: reconcile(node.first), second: reconcile(node.second) }
  }
  tabs.value = tabs.value.map((tab) => ({ ...tab, root: reconcile(tab.root) }))
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
  tabs,
  (value) => localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, tabs: value })),
  { deep: true },
)

onMounted(async () => {
  window.addEventListener('keydown', handleTerminalShortcut, true)
  window.ipcRenderer?.on('terminal-host-key-prompt', handleHostKeyPrompt)
  window.ipcRenderer?.on('terminal-host-key-mismatch', handleHostKeyMismatch)
  window.ipcRenderer?.on('terminal-status', handleStatus)
  try {
    capabilities.value = await window.ipcRenderer.invoke('terminal-capabilities')
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
})

function loadTabs(): TerminalTabLayout[] {
  for (const key of [STORAGE_KEY, LEGACY_STORAGE_KEY]) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '') as {
        version?: number
        tabs?: unknown[]
      }
      if (![1, 2].includes(parsed.version || 0) || !Array.isArray(parsed.tabs)) continue
      const restored = parsed.tabs.flatMap((value) => {
        const tab = normalizeTab(value)
        return tab ? [tab] : []
      })
      if (restored.length > 0) return restored
    } catch {
      // Try the previous storage version, then fall back to a fresh tab.
    }
  }
  return [createTerminalTab('Terminal')]
}

function normalizeTab(value: unknown): TerminalTabLayout | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<TerminalTabLayout>
  const root = normalizeLayoutNode(record.root)
  if (!root || typeof record.id !== 'string') return null
  const panes = listTerminalPanes(root)
  return {
    id: record.id,
    title: typeof record.title === 'string' && record.title ? record.title : 'Terminal',
    root,
    focusedPaneId:
      typeof record.focusedPaneId === 'string' && findTerminalPane(root, record.focusedPaneId)
        ? record.focusedPaneId
        : panes[0]?.id,
  }
}

function normalizeLayoutNode(value: unknown): TerminalLayoutNode | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (record.kind === 'pane') {
    if (typeof record.id !== 'string') return null
    return {
      kind: 'pane',
      id: record.id,
      title: typeof record.title === 'string' ? record.title : 'Terminal',
      sessionId: typeof record.sessionId === 'string' ? record.sessionId : undefined,
    }
  }
  if (record.kind !== 'split' || typeof record.id !== 'string') return null
  const first = normalizeLayoutNode(record.first)
  const second = normalizeLayoutNode(record.second)
  if (!first || !second) return null
  const ratio =
    typeof record.ratio === 'number' && Number.isFinite(record.ratio) ? record.ratio : 0.5
  return {
    kind: 'split',
    id: record.id,
    direction: record.direction === 'vertical' ? 'vertical' : 'horizontal',
    ratio: Math.min(0.95, Math.max(0.05, ratio)),
    first,
    second,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
</script>

<style scoped>
.terminal-workbench {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--app-bg);
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
.tab-leading {
  position: relative;
  flex: none;
  display: grid;
  width: 16px;
  height: 16px;
  color: var(--app-text-muted);
  place-items: center;
}
.terminal-tab.active .tab-leading {
  color: var(--app-text-secondary);
}
.tab-leading > i {
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 6px;
  height: 6px;
  border: 1.5px solid var(--app-surface-muted);
  border-radius: 50%;
  background: #8b949e;
}
.terminal-tab.active .tab-leading > i {
  border-color: color-mix(in srgb, var(--app-text) 6%, var(--app-surface-muted));
}
.tab-leading.ready > i {
  background: #3fb950;
}
.tab-leading.connecting > i {
  background: #d29922;
}
.tab-leading.error > i {
  background: #f85149;
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
.terminal-tab-content {
  flex: 1;
  min-height: 0;
  display: flex;
}
:global(.terminal-shortcuts-popover) {
  border-color: var(--app-border) !important;
  background: var(--app-surface-raised) !important;
}
.shortcut-sheet {
  display: flex;
  flex-direction: column;
}
.shortcut-sheet > header {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 2px 2px 9px;
  border-bottom: 1px solid var(--app-border);
}
.shortcut-sheet > header strong {
  color: var(--app-text);
  font-size: 13px;
}
.shortcut-sheet > header small {
  color: var(--app-text-muted);
  font-size: 11px;
}
.shortcut-row {
  min-height: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--app-border) 65%, transparent);
  color: var(--app-text-secondary);
  font-size: 11px;
}
.shortcut-row:last-child {
  border-bottom: 0;
}
.shortcut-row kbd {
  padding: 2px 6px;
  border: 1px solid var(--app-border-strong);
  border-bottom-width: 2px;
  border-radius: 4px;
  color: var(--app-text-muted);
  background: var(--app-surface-muted);
  font-family: inherit;
  font-size: 10px;
  white-space: nowrap;
}
</style>
