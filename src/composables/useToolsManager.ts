import { FuncMode, FuncModeMap, Buttons, ActionMap } from '@/types/mode'

function createButtonList(funcModeName: string) {
  let buttonList: any[] = []

  const modeActions = ActionMap[funcModeName as keyof typeof ActionMap];
  for (let i = 0; i < modeActions.length; i++) {
    buttonList.push(Buttons[modeActions[i]])
  }
  return buttonList
}

const getButtonList = (funcMode: FuncMode) => {
  for (let i = 0; i < FuncModeMap.length; i++) {
    if (FuncModeMap[i][0] === funcMode) {
      const funcModeName = FuncModeMap[i][1]
      const buttonList = createButtonList(funcModeName)
      return buttonList
    }
  }
}

export {
    getButtonList,
}
