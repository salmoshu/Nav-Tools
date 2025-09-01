import { NavMode, appConfig, ButtonItem } from '@/settings/config'
import { toolBarIcon } from '@/settings/icons'
import emitter from '@/hooks/useMitt'
import { ElMessage } from 'element-plus'

type AppName = keyof typeof appConfig

function createButtonList(appName: string, funcModeName: string) {
  const appCfg = appConfig[appName as AppName]
  if (!appCfg) return []

  const moduleCfg = (appCfg.module as any)[funcModeName]
  if (!moduleCfg) return []

  // 直接使用AppMap中的actionButtons
  return moduleCfg.actionButtons || []
}

const getButtonList = (navMode: NavMode) => {
  return createButtonList(navMode.appModeStr, navMode.funcModeStr)
}

function upAndDown(position: string): boolean {
  if (position === 'top' || position === 'bottom') {
    return true
  } else {
    return false
  }
}

function getButtonText(msg: string, position: string): string {
  if (upAndDown(position)) {
    return '&nbsp;'+msg
  } else {
    return ''
  }
}

const getIoList = (position: string) => {
  return [
    {
      title: 'Input',
      msg: 'input',
      template: '',
      icon: toolBarIcon.input,
      text: upAndDown(position) ? '&nbsp;Input' : '',
    },
    {
      title: 'Log',
      msg: 'log',
      template: '',
      icon: toolBarIcon.log,
      text: upAndDown(position) ? '&nbsp;Log' : '',
    }
  ]
}

const getLayoutList = (position: string): ButtonItem[] => {
  return [
    {
      title: 'Edit',
      msg: 'edit',
      template: '',
      icon: toolBarIcon.edit,
      text: upAndDown(position) ? '&nbsp;Edit' : '',
    },
    {
      title: 'Save',
      msg: 'save',
      template: '',
      icon: toolBarIcon.save,
      text: upAndDown(position) ? '&nbsp;Save' : '',
    },
    {
      title: 'Auto',
      msg: 'auto',
      template: '',
      icon: toolBarIcon.auto,
      text: upAndDown(position) ? '&nbsp;Auto' : '',
    },
    {
      title: 'Reset',
      msg: 'reset',
      template: '',
      icon: toolBarIcon.reset,
      text: upAndDown(position) ? '&nbsp;Reset' : '',
    },
  ]
}

// const deviceConnected = ref(false)
const handleIo = (action: string) => {
  if (action === 'input') {
    emitter.emit('input-event')
  } else if (action === 'log') {
    emitter.emit('log-event')
    ElMessage({
      message: 'Log功能暂未实现',
      type: 'info',
    })
  }
}

export {
    getButtonList,
    upAndDown,
    getButtonText,
    getLayoutList,
    getIoList,
    handleIo,
}
