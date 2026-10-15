/**
 * Terminal 组件独立窗口的关闭确认决策。
 * 关闭不再弹主进程原生对话框:拦截 close 后通知渲染进程弹应用内确认框(见 CardWindow.vue),
 * 这里的纯函数把「放行 / 请求确认 / 吞掉重复关闭」的判断从事件接线中抽出以便单测。
 */

export interface CardWindowCloseState {
  componentName?: string
  closeInProgress?: boolean
  closeConfirmed?: boolean
}

export type CardWindowCloseAction = 'allow' | 'confirm' | 'wait'

/** 是否存在等待渲染进程回报的关闭确认(类型谓词同时收窄出已定义的面板记录) */
export function isCloseConfirmPending<T extends CardWindowCloseState>(
  panel: T | undefined,
): panel is T {
  return panel?.componentName === 'Terminal' && !!panel.closeInProgress && !panel.closeConfirmed
}

/**
 * 关闭组件独立窗口时:
 * - allow:非 Terminal 面板、已确认过、或无存活终端会话,直接放行;
 * - confirm:Terminal 面板仍有存活会话,拦截并请求渲染进程弹确认框;
 * - wait:确认框已在展示,吞掉这次重复关闭。
 */
export function decideCardWindowClose(
  panel: CardWindowCloseState | undefined,
  liveSessionCount: number,
): CardWindowCloseAction {
  if (panel?.componentName !== 'Terminal' || panel.closeConfirmed || liveSessionCount === 0) {
    return 'allow'
  }
  return panel.closeInProgress ? 'wait' : 'confirm'
}
