import { ref } from 'vue'

const MESSAGE_DIVIDERS_KEY = 'nav-tools:messages:show-row-dividers'

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

function setShowMessageDividers(value: boolean): void {
  showMessageDividers.value = value
  try {
    localStorage.setItem(MESSAGE_DIVIDERS_KEY, JSON.stringify(value))
  } catch {
    // The live setting still applies when persistent storage is unavailable.
  }
}

window.addEventListener('storage', (event) => {
  if (event.key !== MESSAGE_DIVIDERS_KEY) return
  showMessageDividers.value = readMessageDividers()
})

export function useMessageSettings() {
  return { showMessageDividers, setShowMessageDividers }
}
