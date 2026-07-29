import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_KEY_VALUE_REGEX } from '@/core/data/TextRecordParser'

vi.mock('@/core/device/ActiveDataTransport', () => ({
  activeDataTransport: {
    current: 'serial' as string | undefined,
    activate: vi.fn(),
    clear: vi.fn(),
    sendChannel: vi.fn(),
  },
}))

import { useConsole } from '@/composables/flow/useConsole'

describe('regex messages', () => {
  const consoleState = useConsole(true)

  beforeEach(() => {
    vi.useFakeTimers()
    consoleState.clearMessages()
    consoleState.dataFormat.value = 'regex'
    consoleState.regexPattern.value = DEFAULT_KEY_VALUE_REGEX
    consoleState.dataFilter.value = false
  })

  afterEach(() => {
    consoleState.clearMessages()
    vi.useRealTimers()
  })

  it('marks matching messages as valid regex records', () => {
    consoleState.addMessage('[ctl] speed=LOW(3) ult=0.658m\n')
    vi.advanceTimersByTime(250)

    expect(consoleState.messages.value).toHaveLength(1)
    expect(consoleState.messages.value[0]).toMatchObject({
      dataType: 'regex',
      isValid: true,
    })
  })

  it('uses the configured custom expression for validity and filtering', () => {
    consoleState.regexPattern.value = String.raw`x:(?<x>\S+)\s+y:(?<y>\S+)`
    consoleState.dataFilter.value = true
    consoleState.addMessage('not-a-record\nx:1 y:2\n')
    vi.advanceTimersByTime(250)

    expect(consoleState.messages.value.map((message) => message.isValid)).toEqual([false, true])
    expect(consoleState.filteredMessages.value.map((message) => message.raw)).toEqual(['x:1 y:2'])
    expect(consoleState.validMsgCount.value).toBe(1)
  })
})
