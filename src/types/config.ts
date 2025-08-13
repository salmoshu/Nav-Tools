import { reactive } from 'vue'
import { toolBarIcon } from './icon'

// enum key: AppMode[AppMode.Pnc]
enum AppMode {
  None = 0,
  Example = 1,
  Pnc  = 2,
  Pos  = 3,
}

enum FuncMode {
  None         =  0,
  // 示例模块
  Demo1        = 10,
  Demo2        = 11,
  // 导航模块
  Follow       = 20,
  Tree         = 21,
  // 定位模块
  Gnss         = 30,
  Imu          = 31,
  Vision       = 32,
}

const appConfig: any = {
  pnc: createAppItem({
    module: {
      follow: createModuleItem({
        title: 'Follow',
        icon: toolBarIcon.follow,
        action: ['draw', 'config'],
        props: {}
      }),
      tree: createModuleItem({
        title: 'Tree',
        icon: toolBarIcon.tree,
        action: ['draw', 'data', 'config'],
        props: {}
      }),
    },
  }),
  pos: createAppItem({
    module: {
      gnss: createModuleItem({
        title: 'Gnss',
        icon: toolBarIcon.gnss,
        action: ['draw', 'data', 'config'],
        props: {}
      }),
      imu: createModuleItem({
        title: 'Imu',
        icon: toolBarIcon.imu,
        action: ['draw', 'data', 'config'],
        props: {}
      }),
      vision: createModuleItem({
        title: 'Vision',
        icon: toolBarIcon.vision,
        action: ['draw', 'data', 'config'],
        props: {}
      }),
    }
  }),
  example: createAppItem({
    module: {
      demo1: createModuleItem({
        title: 'Demo1',
        icon: toolBarIcon.default,
        action: ['draw', 'data', 'config'],
        props: {
          status: {
            str: 'Nav-Tools',
            num: 2,
          },
          config: {
            'Shirt': 5,
            'Wool Sweater': 20,
            'Pants': 10,
            'High Hells': 10,
            'Socks': 20,
          },
        }
      }),
      demo2: createModuleItem({
        title: 'Demo2',
        icon: toolBarIcon.default,
        action: ['draw', 'data', 'config'],
        props: {}
      }),
    }
  }),
} as const

interface ModuleItem {
  title: string
  icon: string
  action: readonly string[]
  props: Record<string, any>
  readonly funcMode: FuncMode
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

type AppMapType = typeof appConfig
type AppName    = keyof AppMapType
type ModuleMap<K extends AppName> = AppMapType[K]['module']
type ModuleKey<K extends AppName> = keyof ModuleMap<K>

// 创建模块的工厂函数
function createModuleItem(config: Omit<ModuleItem, 'funcMode' | 'template' | 'templateNames' | 'actionButtons'>): ModuleItem {
  return {
    ...config,
    get funcMode() {
      return FuncMode[config.title as keyof typeof FuncMode]
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

function createAppItem(config: Omit<AppMapType[AppName], 'currMode'>) {
  return {
    ...config,
    // 设置currMode 为第一个，不然为None
    currMode: Object.values(config.module as Record<string, ModuleItem>)[0]?.funcMode || FuncMode.None,
  }
}

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

function getTemplatePropsPaths (name: string) {
  // example:
  // @/components/follow/useFollowProps.vue

  const propsPath = '@/composables/' +
    name.charAt(0).toLocaleLowerCase() + name.slice(1) + '/' +
    'use' + name.charAt(0).toUpperCase() + name.slice(1) +
    'Props.vue'

  return propsPath
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

// 在AppMap定义之后，NavMode类之前添加自动初始化逻辑
// 自动获取第一个app的第一个module
function getInitialModeFromAppMap() {
  const appKeys = Object.keys(appConfig) as Array<keyof typeof appConfig>
  if (appKeys.length === 0) {
    console.error('Current appConfig is empty; an error occurred while Electron was loading the application!!!');
    // 仍然返回默认的初始模式
    return {
      appMode: AppMode.None,
      appModeStr: 'none',
      funcMode: FuncMode.None,
      funcModeStr: 'none',
    }
  }

  const firstAppKey = appKeys[0]
  const firstApp = appConfig[firstAppKey]
  
  const moduleKeys = Object.keys(firstApp.module) as Array<keyof typeof firstApp.module>
  if (moduleKeys.length === 0) {
    // 如果没有module，使用app的currMode
    const funcMode = firstApp.currMode
    return {
      appMode: AppMode[firstAppKey.toString().charAt(0).toUpperCase() + firstAppKey.toString().slice(1) as keyof typeof AppMode],
      appModeStr: String(firstAppKey).toLowerCase(),
      funcMode: funcMode,
      funcModeStr: FuncMode[funcMode].charAt(0).toLowerCase() + FuncMode[funcMode].slice(1),
    }
  }

  const firstModuleKey = moduleKeys[0]
  const firstModule = firstApp.module[firstModuleKey]
  
  return {
    appMode: AppMode[String(firstAppKey).charAt(0).toUpperCase() + String(firstAppKey).slice(1) as keyof typeof AppMode],
    appModeStr: String(firstAppKey).toLowerCase(),
    funcMode: firstModule ? (firstModule as any).funcMode : firstApp.currMode,
    funcModeStr: String(firstModuleKey).toLowerCase(),
  }
}

// 修改NavMode类，使用自动获取的初始值
class NavMode {
  private currMode = reactive(getInitialModeFromAppMap())

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

  appConfig,
}
