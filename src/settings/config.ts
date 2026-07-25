import { reactive } from 'vue'
import {
  getPanelById,
  normalizePanelId,
  normalizePanelIds,
  panelRegistry,
  type ApplicationIcon,
  type PanelDefinition,
  type UserApplication,
} from '@/core/panels/registry'
import { toolBarIcon } from './icons'

interface ButtonItem {
  title: string
  msg: string
  template: string
  icon: string
  text: string
  action?: string
  [key: string]: unknown
}

export interface WindowDefinition extends PanelDefinition {
  button: ButtonItem
}

function createButton(panel: PanelDefinition): ButtonItem {
  return {
    title: panel.title,
    msg: `panel-${panel.action}`,
    template: panel.componentName,
    icon: toolBarIcon[panel.action as keyof typeof toolBarIcon] || toolBarIcon.default,
    text: `&nbsp;${panel.title}`,
    action: panel.action,
  }
}

const windowCatalog: readonly WindowDefinition[] = panelRegistry.map((panel) => ({
  ...panel,
  button: createButton(panel),
}))

function normalizeWindowId(id: string): string {
  return normalizePanelId(id)
}

function normalizeWindowIds(ids: readonly string[]): string[] {
  return normalizePanelIds(ids)
}

function getWindowById(id: string): WindowDefinition | undefined {
  const panel = getPanelById(id)
  return panel ? windowCatalog.find((item) => item.id === panel.id) : undefined
}

function getWindowsByIds(ids: readonly string[]): WindowDefinition[] {
  const result: WindowDefinition[] = []
  for (const id of normalizeWindowIds(ids)) {
    const window = getWindowById(id)
    if (window) result.push(window)
  }
  return result
}

class NavMode {
  private currMode = reactive({ appMode: 'workspace', funcMode: 'general' })

  get appMode() {
    return this.currMode.appMode
  }

  set appMode(mode: string) {
    this.currMode.appMode = mode
  }

  get funcMode() {
    return this.currMode.funcMode
  }

  set funcMode(mode: string) {
    this.currMode.funcMode = mode
  }

  get currentMode() {
    return this.currMode
  }
}

export const navMode = new NavMode()
export {
  type ApplicationIcon,
  type ButtonItem,
  type UserApplication,
  NavMode,
  windowCatalog,
  normalizeWindowId,
  normalizeWindowIds,
  getWindowById,
  getWindowsByIds,
}
