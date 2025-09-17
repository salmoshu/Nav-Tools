import { reactive } from 'vue'
import { toolBarIcon } from './icons'

const appConfig: any = {
  robot: {
    flow: createModuleItem({
      title: 'Flow',
      icon: toolBarIcon.default,
      action: ['data', 'console', 'deviation'],
      props: {}
    }),
    follow: createModuleItem({
      title: 'Follow',
      icon: toolBarIcon.follow,
      action: ['data', 'console'],
      props: {}
    }),
  },
  perc: {
    ultrasonic: createModuleItem({
      title: 'Ultrasonic',
      icon: toolBarIcon.ultrasonic,
      action: ['data',],
      props: {}
    }),
  },
  pos: {
    gnss: createModuleItem({
      title: 'Gnss',
      icon: toolBarIcon.gnss,
      action: ['console', 'deviation', 'signal', 'sky'],
      props: {}
    }),
  },
  pnc: {
    followsim: createModuleItem({
      title: 'FollowSim',
      icon: toolBarIcon.follow,
      action: ['dashboard', 'motion', 'config'],
      props: {}
    }),
  },
  // example: {
  //   demo1: createModuleItem({
  //     title: 'Demo1',
  //     icon: toolBarIcon.default,
  //     // demo1/Demo1Draw.vue
  //     // demo1/Demo1Data.vue
  //     // demo1/Demo1Config.vue
  //     action: ['draw', 'data', 'config'],
  //     props: {
  //       status: {
  //         str: 'Nav-Tools',
  //         num: 2,
  //       },
  //       config: {
  //         'Shirt': 5,
  //         'Wool Sweater': 20,
  //         'Pants': 10,
  //         'High Hells': 10,
  //         'Socks': 20,
  //       },
  //     }
  //   }),
  // },
} as const

interface ModuleItem {
  title: string
  icon: string
  action: readonly string[]
  props: Record<string, any> // status or config
  readonly funcMode: string
  readonly template: string[]
  readonly templateNames: string[]
  readonly actionButtons: ButtonItem[]
}

interface ButtonItem {
  title: string
  msg: string
  template: string
  icon: string
  text: string
  [key: string]: any
}

// 创建模块的工厂函数
function createModuleItem(config: Omit<ModuleItem, 'funcMode' | 'template' | 'templateNames' | 'actionButtons'>): ModuleItem {
  return {
    ...config,
    get funcMode() {
      return config.title.toLowerCase()
    },
    get template() {
      return getTemplatePaths(this.title, [...this.action])
    },
    get templateNames() {
      return getTemplateNames(this.title, [...this.action])
    },
    get actionButtons() {
      return getActionButtons(this.title, [...this.action])
    },
  }
}

function getTemplateNames (title: string, actions: string[]) {
  const name = title
  const templateList: string[] = []

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]
    templateList.push(
      name.charAt(0).toUpperCase() + name.slice(1) +
      action.charAt(0).toUpperCase() + action.slice(1)
    )
  }
  return templateList
}

function getTemplatePaths (title: string, actions: string[]) {
  const name = title
  const templateList: string[] = []
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]
    templateList.push(
      '@/components/' +
      name.toLowerCase() + '/' +
      name +
      action.charAt(0).toUpperCase() + action.slice(1) +
      '.vue'
    )
  }
  return templateList
}

function getActionButtons (title: string, actions: string[]) {
  // for example:
  // {
  //   title: 'Draw',
  //   msg: 'follow-draw',
  //   icon: toolBarIcon.draw,
  //   text: '&nbsp;Draw', 
  // },
  const buttonList: ButtonItem[] = []
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]
    buttonList.push(
      {
        title: action.charAt(0).toUpperCase() + action.slice(1),
        msg: (title + '-' + action).toLowerCase(),
        template: title + action.charAt(0).toUpperCase() + action.slice(1),
        icon: toolBarIcon[action as keyof typeof toolBarIcon] || toolBarIcon.default,
        text: '&nbsp;' + action.charAt(0).toUpperCase() + action.slice(1),
      }
    )
  }
  return buttonList
}

// 自动初始化逻辑，自动获取第一个app的第一个module
function getInitialModeFromAppMap() {
  const appKeys = Object.keys(appConfig) as Array<keyof typeof appConfig>
  if (appKeys.length === 0) {
    console.error('Current appConfig is empty; an error occurred while Electron was loading the application!!!');
    return {
      appMode: 'none',
      funcMode: 'none',
    }
  }

  const firstAppKey = appKeys[0]
  const firstApp = appConfig[firstAppKey]
  
  const moduleKeys = Object.keys(firstApp) as Array<keyof typeof firstApp>
  if (moduleKeys.length === 0) {
    console.error('Current appConfig is empty; an error occurred while Electron was loading the application!!!');
    return {
      appMode: String(firstAppKey).toLowerCase(),
      funcMode: 'none',
    }
  }

  const firstModuleKey = moduleKeys[0]
  const firstModule = firstApp[firstModuleKey]
  
  return {
    appMode: String(firstAppKey).toLowerCase(),
    funcMode: (firstModule as any).funcMode,
  }
}

// 修改NavMode类，使用自动获取的初始值
class NavMode {
  private currMode = reactive(getInitialModeFromAppMap())

  get appMode()  { 
    return this.currMode.appMode 
  }
  set appMode(m: string)  { 
    this.currMode.appMode = m
  }
  get funcMode() { 
    return this.currMode.funcMode
  }
  set funcMode(m: string) { 
    this.currMode.funcMode = m
  }
  get currentMode() { 
    return this.currMode 
  }
}

export const navMode = new NavMode()
export { 
  type ButtonItem,
  NavMode,
  appConfig,
}
