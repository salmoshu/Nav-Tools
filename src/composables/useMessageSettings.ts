import { ref } from 'vue'

const MESSAGE_DIVIDERS_KEY = 'nav-tools:messages:show-row-dividers'
const MESSAGE_VIEW_KEY = 'nav-tools:messages:view-mode'
export type MessageViewMode = 'raw' | 'packet' | 'message'

function readMessageDividers(): boolean {
  try {
    const raw = localStorage.getItem(MESSAGE_DIVIDERS_KEY)
    if (raw === null) return true
    const value: unknown = JSON.parse(raw)
    return typeof value === 'boolean' ? value : true
  } catch {
    return true
  }
}

const showMessageDividers = ref(readMessageDividers())
const messageViewMode = ref<MessageViewMode>(readViewMode())

function readViewMode(): MessageViewMode {
  try {
    const value = localStorage.getItem(MESSAGE_VIEW_KEY)
    if (value === 'formatted' || value === 'packet') return 'packet'
    return value === 'message' ? 'message' : 'raw'
  } catch {
    return 'raw'
  }
}

function setMessageViewMode(value: MessageViewMode): void {
  messageViewMode.value = value
  try {
    localStorage.setItem(MESSAGE_VIEW_KEY, value)
  } catch {
    // Keep the live preference if local storage is unavailable.
  }
}

function setShowMessageDividers(value: boolean): void {
  showMessageDividers.value = value
  try {
    localStorage.setItem(MESSAGE_DIVIDERS_KEY, JSON.stringify(value))
  } catch {
    // The live setting still applies when persistent storage is unavailable.
  }
}

window.addEventListener('storage', (event) => {
  if (event.key === MESSAGE_DIVIDERS_KEY) showMessageDividers.value = readMessageDividers()
  if (event.key === MESSAGE_VIEW_KEY) messageViewMode.value = readViewMode()
})

export function useMessageSettings() {
  return { showMessageDividers, setShowMessageDividers, messageViewMode, setMessageViewMode }
}
