import { reactive } from 'vue'
import { toolBarIcon } from './icon'

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

const FuncModeMap = [
  [FuncMode.Follow, 'follow'],
  [FuncMode.Tree,   'tree'],
  [FuncMode.Gnss,   'gnss'],
  [FuncMode.Imu,    'imu'],
  [FuncMode.Vision, 'vision'],
] as const

const ActionMap = {
  'follow': ['draw', 'status', 'config'],
  'tree':   ['draw', 'data', 'status', 'config'],
  'gnss':   ['draw', 'data', 'status', 'config'],
  'imu':    ['draw', 'data', 'status', 'config'],
  'vision': ['draw', 'data', 'status', 'config'],
} as const

const TemplateMap = {
  'follow': getTemplateList('follow'),
  'tree':   getTemplateList('tree'),
  'gnss':   getTemplateList('gnss'),
  'imu':    getTemplateList('imu'),
  'vision': getTemplateList('vision'),
} as const

function getTemplateList(funcModeName: string) {
  let templateList = []
  for (let i = 0; i < ActionMap[funcModeName as keyof typeof ActionMap].length; i++) {
    let action = ActionMap[funcModeName as keyof typeof ActionMap][i]
    // funcModeName 首字母大写
    let f = funcModeName.charAt(0).toUpperCase() + funcModeName.slice(1)
    let a = action.charAt(0).toUpperCase() + action.slice(1)
    templateList.push(f + a + '.vue')
  }
  return templateList
}

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

class NavMode {
  private currMode = reactive({
    appMode: AppMode.Pnc as AppMode,
    funcMode: FuncMode.Follow as FuncMode,
  })

  get appMode()  { return this.currMode.appMode }
  set appMode(m: AppMode)  { this.currMode.appMode = m }

  get funcMode() { return this.currMode.funcMode }
  set funcMode(m: FuncMode) { this.currMode.funcMode = m }

  get currentMode() { return this.currMode }
}

export type AppModeType  = AppMode
export type FuncModeType = FuncMode
export const navMode = new NavMode()
export { AppMode, FuncMode, FuncModeMap, Buttons, ActionMap }
