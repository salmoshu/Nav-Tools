import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/core/device/ActiveDataTransport', () => ({
  activeDataTransport: {
    current: 'serial' as string | undefined,
    activate: vi.fn(),
    clear: vi.fn(),
    sendChannel: vi.fn(),
  },
}))

import { useConsole } from '@/composables/flow/useConsole'

describe('csv messages', () => {
  const consoleState = useConsole(true)

  beforeEach(() => {
    vi.useFakeTimers()
    consoleState.clearMessages()
    consoleState.dataFormat.value = 'csv'
    consoleState.dataFilter.value = false
  })

  afterEach(() => {
    consoleState.clearMessages()
    vi.useRealTimers()
  })

  it('marks matching messages as valid csv records', () => {
    consoleState.addMessage('12.5,-3,OK,true\n')
    vi.advanceTimersByTime(250)

    expect(consoleState.messages.value).toHaveLength(1)
    expect(consoleState.messages.value[0]).toMatchObject({
      dataType: 'csv',
      isValid: true,
    })
  })

  it('counts valid csv records and supports filtering', () => {
    consoleState.dataFilter.value = true
    consoleState.addMessage('a,,c\n,,\n')
    vi.advanceTimersByTime(250)

    expect(consoleState.messages.value.map((message) => message.isValid)).toEqual([true, false])
    expect(consoleState.filteredMessages.value.map((message) => message.raw)).toEqual(['a,,c'])
    expect(consoleState.validMsgCount.value).toBe(1)
  })
})
