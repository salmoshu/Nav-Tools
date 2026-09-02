import { inject, type InjectionKey } from 'vue'
import { TERMINAL_SSH_RECOVERED_EVENT, type TerminalSshRecoveredEvent } from './TerminalTypes'

/** 终端渲染层使用的事件总线协议；具体实现由应用组合根注入。 */
export interface TerminalEventBus {
  on(
    event: typeof TERMINAL_SSH_RECOVERED_EVENT,
    handler: (payload: TerminalSshRecoveredEvent) => void,
  ): void
  off(
    event: typeof TERMINAL_SSH_RECOVERED_EVENT,
    handler: (payload: TerminalSshRecoveredEvent) => void,
  ): void
  emit(event: typeof TERMINAL_SSH_RECOVERED_EVENT, payload: TerminalSshRecoveredEvent): void
}

export const TERMINAL_EVENT_BUS_KEY: InjectionKey<TerminalEventBus> = Symbol('TerminalEventBus')

export function useTerminalEventBus(): TerminalEventBus {
  const eventBus = inject(TERMINAL_EVENT_BUS_KEY)
  if (!eventBus) throw new Error('未注入终端事件总线')
  return eventBus
}
