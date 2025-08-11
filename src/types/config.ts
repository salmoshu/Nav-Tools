import { reactive } from 'vue'
import { toolBarIcon } from './icon'

// console.log(AppMode[AppMode.Pnc])
enum AppMode {
  None = 0,
  Example = 1,
  Pnc  = 2,
  Pos  = 3,
}

enum FuncMode {
  None         =  0,
  // 示例模块
  Example1     = 10,
  Example2     = 11,
  // 导航模块
  Follow       = 20,
  Tree         = 21,
  // 定位模块
  Gnss         = 30,
  Imu          = 31,
  Vision       = 32,
}

interface ModuleItem {
  title: string
  icon: string
  text: string
  funcMode: FuncMode
  action: readonly string[]
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

type AppMapType = typeof AppMap
type AppName    = keyof AppMapType
type ModuleMap<K extends AppName> = AppMapType[K]['module']
type ModuleKey<K extends AppName> = keyof ModuleMap<K>

// 创建模块的工厂函数
function createModuleItem(config: Omit<ModuleItem, 'template' | 'templateNames' | 'actionButtons'>): ModuleItem {
  return {
    ...config,
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

const AppMap = {
  pnc: {
    title: 'PNC',
    currMode: FuncMode.Follow,
    module: {
      follow: createModuleItem({
        title: 'Follow',
        icon: toolBarIcon.follow,
        text: '&nbsp;Follow',
        funcMode: FuncMode.Follow,
        action: ['draw', 'config'],
      }),
      tree: createModuleItem({
        title: 'Tree',
        icon: toolBarIcon.tree,
        text: '&nbsp;Tree',
        funcMode: FuncMode.Tree,
        action: ['draw', 'data', 'config'],
      }),
    },
  },
  pos: {
    title: 'POS',
    currMode: FuncMode.Gnss,
    module: {
      gnss: createModuleItem({
        title: 'Gnss',
        icon: toolBarIcon.gnss,
        text: '&nbsp;Gnss',
        funcMode: FuncMode.Gnss,
        action: ['draw', 'data', 'config'],
      }),
      imu: createModuleItem({
        title: 'Imu',
        icon: toolBarIcon.imu,
        text: '&nbsp;Imu',
        funcMode: FuncMode.Imu,
        action: ['draw', 'data', 'config'],
      }),
      vision: createModuleItem({
        title: 'Vision',
        icon: toolBarIcon.vision,
        text: '&nbsp;Vision',
        funcMode: FuncMode.Vision,
        action: ['draw', 'data', 'config'],
      }),
    }
  },
  example: {
    title: 'Example',
    currMode: FuncMode.Example1,
    module: {
      example1: createModuleItem({
        title: 'Example1',
        icon: toolBarIcon.example,
        text: '&nbsp;Example1',
        funcMode: FuncMode.Example1,
        action: ['draw', 'data', 'config'],
      }),
      example2: createModuleItem({
        title: 'Example2',
        icon: toolBarIcon.example,
        text: '&nbsp;Example2',
        funcMode: FuncMode.Example2,
        action: ['draw', 'data', 'config'],
      }),
    }
  }
} as const

function getTemplateNames (name: string, actions: string[]) {
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

function getTemplatePaths (name: string, actions: string[]) {
  const templateList: string[] = []
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]
    templateList.push(
      '@/components/' +
      name.charAt(0).toLocaleLowerCase() + name.slice(1) + '/' +
      name.charAt(0).toUpperCase() + name.slice(1) +
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
        icon: toolBarIcon[action as keyof typeof toolBarIcon],
        text: '&nbsp;' + action.charAt(0).toUpperCase() + action.slice(1),
      }
    )
  }
  return buttonList
}

class NavMode {
  private currMode = reactive({
    appMode: AppMode.Pnc as AppMode,
    appModeStr: 'pnc',
    funcMode: FuncMode.Follow as FuncMode,
    funcModeStr: 'follow',
  })

  get appMode()  { 
    return this.currMode.appMode 
  }
  get appModeStr() { 
    return this.currMode.appModeStr
  }
  set appMode(m: AppMode)  { 
    this.currMode.appMode = m
    this.currMode.appModeStr = AppMode[m].charAt(0).toLocaleLowerCase() + AppMode[m].slice(1)
  }

  get funcMode() { 
    return this.currMode.funcMode
  }
  get funcModeStr() { 
    return this.currMode.funcModeStr
  }
  set funcMode(m: FuncMode) { 
    this.currMode.funcMode = m
    this.currMode.funcModeStr = FuncMode[m].charAt(0).toLocaleLowerCase() + FuncMode[m].slice(1)
  }

  get currentMode() { 
    return this.currMode 
  }
}

export type AppModeType  = AppMode
export type FuncModeType = FuncMode
export const navMode = new NavMode()
export { 
  NavMode,
  AppMode,
  FuncMode,
  type ButtonItem,

  AppMap,
}
