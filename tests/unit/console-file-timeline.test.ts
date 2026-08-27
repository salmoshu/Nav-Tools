import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/core/device/ActiveDataTransport', () => ({
  activeDataTransport: {
    current: 'serial' as string | undefined,
    activate: vi.fn(),
    clear: vi.fn(),
    sendChannel: vi.fn(),
  },
}))

import {
  findTimelineMessageIndex,
  useConsole,
  type ConsoleMessage,
} from '@/composables/flow/useConsole'
import { useFileTimeline } from '@/composables/useFileTimeline'

describe('file replay message projection', () => {
  const consoleState = useConsole(true)
  const timeline = useFileTimeline()

  beforeEach(() => {
    consoleState.clearMessages()
    consoleState.dataFormat.value = 'none'
    consoleState.dataFilter.value = false
    timeline.clearTimeline()
    timeline.beginIndexing()
  })

  afterEach(() => {
    consoleState.clearMessages()
    timeline.clearTimeline()
  })

  it('only exposes messages at or before the replay cursor', () => {
    consoleState.beginFileReplayMessages()
    consoleState.addFileReplayData(
      [
        '$GPGGA,120000.000,first',
        '$GPGSV,1,1,01,auxiliary-at-first-epoch',
        '$GPGGA,120001.000,second',
        '$GPGSA,A,3,auxiliary-at-second-epoch',
        '$GPGGA,120002.000,third',
        '',
      ].join('\n'),
    )
    consoleState.endFileReplayMessages()

    expect(consoleState.filteredMessages.value.map((message) => message.raw)).toEqual([
      '$GPGGA,120000.000,first',
      '$GPGSV,1,1,01,auxiliary-at-first-epoch',
    ])

    timeline.indexing.value = false
    timeline.mode.value = 'replay'
    timeline.elapsedMilliseconds.value = 1000
    expect(consoleState.filteredMessages.value.map((message) => message.raw)).toEqual([
      '$GPGGA,120000.000,first',
      '$GPGSV,1,1,01,auxiliary-at-first-epoch',
      '$GPGGA,120001.000,second',
      '$GPGSA,A,3,auxiliary-at-second-epoch',
    ])

    timeline.elapsedMilliseconds.value = 0
    expect(consoleState.totalCount.value).toBe(2)
  })

  it('keeps the full list outside replay mode', () => {
    consoleState.beginFileReplayMessages()
    consoleState.addFileReplayData('$GPGGA,120000.000,first\n$GPGGA,120001.000,second\n')
    consoleState.endFileReplayMessages()

    timeline.indexing.value = false
    timeline.mode.value = 'loaded'
    expect(consoleState.filteredMessages.value).toHaveLength(2)
  })

  it('keeps elapsed time monotonic when the file crosses midnight', () => {
    consoleState.beginFileReplayMessages()
    consoleState.addFileReplayData(
      '$GPGGA,235959.500,before-midnight\n$GPGGA,000000.500,after-midnight\n',
    )
    consoleState.endFileReplayMessages()

    expect(consoleState.messages.value.map((message) => message.fileElapsedMilliseconds)).toEqual([
      0, 1000,
    ])
  })

  it('indexes NMEA messages even before the Messages panel selects its parser', () => {
    consoleState.dataFormat.value = 'none'
    consoleState.dataFilter.value = true
    consoleState.beginFileReplayMessages()
    consoleState.addFileReplayData(
      '$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47\n',
    )
    consoleState.endFileReplayMessages()

    consoleState.dataFormat.value = 'nmea'
    expect(consoleState.messages.value[0].dataType).toBe('nmea')
    expect(consoleState.filteredMessages.value).toHaveLength(1)
  })

  it('finds the corresponding message when a loaded timeline slider moves', () => {
    const messages = [0, 0, 1000, 1000, 2000].map(
      (fileElapsedMilliseconds, index): ConsoleMessage => ({
        timestamp: '',
        raw: `message-${index}`,
        dataType: 'none',
        isValid: false,
        key: String(index),
        fileElapsedMilliseconds,
      }),
    )

    expect(findTimelineMessageIndex(messages, 0)).toBe(1)
    expect(findTimelineMessageIndex(messages, 1500)).toBe(3)
    expect(findTimelineMessageIndex(messages, 2000)).toBe(4)
  })

  it('keeps the beginning of large files available when replay starts at zero', () => {
    consoleState.beginFileReplayMessages()
    const lines = Array.from({ length: consoleState.maxMessages + 2 }, (_, index) => {
      const totalSeconds = 12 * 60 * 60 + index
      const hours = Math.floor(totalSeconds / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      const seconds = totalSeconds % 60
      const time = [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join('')
      return `$GPGGA,${time},message-${index}`
    })
    consoleState.addFileReplayData(`${lines.join('\n')}\n`)
    consoleState.endFileReplayMessages()

    expect(consoleState.filteredMessages.value).not.toHaveLength(0)
    expect(consoleState.filteredMessages.value[0].raw).toContain('message-0')
    expect(consoleState.messages.value).toHaveLength(consoleState.maxMessages + 2)
  })
})
