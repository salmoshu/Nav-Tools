import { reactive } from 'vue'
import { toolBarIcon } from './icon'

// console.log(AppMode[AppMode.Pnc])
enum AppMode {
  None = 0,
  Pnc  = 1,
  Pos  = 2,
}

enum FuncMode {
  None         =  0,
  Follow       = 10,
  Tree         = 11,
  Gnss         = 20,
  Imu          = 21,
  Vision       = 22,
}

type ModuleItem = {
  title: string
  msg: string
  icon: string
  text: string
  funcMode: FuncMode
  action: readonly string[]
  readonly template: string[]
}

type AppMapType = typeof AppMap
type AppName    = keyof AppMapType
type ModuleMap<K extends AppName> = AppMapType[K]['module']
type ModuleKey<K extends AppName> = keyof ModuleMap<K>

const AppMap = {
  pnc: {
    title: 'PNC',
    currMode: FuncMode.Follow,
    module: {
      follow: {
        title: 'Follow',
        msg: 'follow',
        icon: toolBarIcon.follow,
        text: '&nbsp;Follow',
        funcMode: FuncMode.Follow,
        action: ['draw', 'status', 'config'],
        get template() { // 会根据'action'自动生成
          return getTemplateList(this.title, [...this.action])
        }
      } as ModuleItem,
      tree: {
        title: 'Tree',
        msg: 'tree',
        icon: toolBarIcon.tree,
        text: '&nbsp;Tree',
        funcMode: FuncMode.Tree,
        action: ['draw', 'data', 'status', 'config'],
        get template() { // 会根据'action'自动生成
          return getTemplateList(this.title, [...this.action])
        }
      } as ModuleItem,
    },
  },
  pos: {
    title: 'POS',
    currMode: FuncMode.Gnss,
    module: {
      gnss: {
        title: 'Gnss',
        msg: 'gnss',  
        icon: toolBarIcon.gnss,
        text: '&nbsp;Gnss',
        funcMode: FuncMode.Gnss,
        action: ['draw', 'data', 'status', 'config'],
        get template() { // 会根据'action'自动生成
          return getTemplateList(this.title, [...this.action])
        }
      } as ModuleItem,
      imu: {
        title: 'Imu',
        msg: 'imu',
        icon: toolBarIcon.imu,
        text: '&nbsp;Imu',
        funcMode: FuncMode.Imu,
        action: ['draw', 'data', 'status', 'config'],
        get template() { // 会根据'action'自动生成
          return getTemplateList(this.title, [...this.action])
        }
      } as ModuleItem,
      vision: {
        title: 'Vision',
        msg: 'vision',
        icon: toolBarIcon.vision,
        text: '&nbsp;Vision',
        funcMode: FuncMode.Vision,
        action: ['draw', 'data', 'status', 'config'],
        get template() { // 会根据'action'自动生成
          return getTemplateList(this.title, [...this.action])
        }
      } as ModuleItem,
    }
  },
} as const

const Buttons = {
  'draw': {
      title: 'Draw',
      msg: 'draw',
      icon: toolBarIcon.draw,
      text: '&nbsp;Draw', 
  },
  'data': {
      title: 'Data',
      msg: 'data',
      icon: toolBarIcon.data,
      text: '&nbsp;Data',
  },
  'status': {
      title: 'Status',
      msg: 'status',
      icon: toolBarIcon.status,
      text: '&nbsp;Status',
  },
  'config': {
      title: 'Config',
      msg: 'config',
      icon: toolBarIcon.config,
      text: '&nbsp;Config',

  },
} as const

function getTemplateList (name: string, actions: string[]) {
  let templateList = []
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

  AppMap,
  Buttons,
}
