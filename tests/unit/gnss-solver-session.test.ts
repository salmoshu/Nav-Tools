import { describe, expect, it, vi } from 'vitest'
import { createGnssSolverSession } from '@/composables/useGnssSolverSession'
import { useFileTimeline } from '@/composables/useFileTimeline'

const line = (index: number, quality = 1) => {
  const time = new Date(Date.UTC(2024, 6, 30) + index * 1000)
    .toISOString()
    .replaceAll('-', '/')
    .replace('T', ' ')
    .replace('Z', '')
  return `${time} ${(31 + index / 1e7).toFixed(9)} ${(121 + index / 1e7).toFixed(9)} ${(10 + index / 1000).toFixed(3)} ${quality} 12\n`
}

describe('GNSS solver session', () => {
  it('retains every epoch across split chunks and keeps the coordinate origin per session', async () => {
    const session = createGnssSolverSession()
    session.begin('post-1', 'post')
    const text = Array.from({ length: 1205 }, (_, index) => line(index, (index % 2) + 1)).join('')
    for (let index = 0; index < text.length; index += 1337)
      session.append(text.slice(index, index + 1337))
    expect(session.epochs.value).toBe(1205)
    expect(session.display.data.positionEpochHistory.value.length).toBe(1205)
    expect(session.display.data.deviationPoints.value).toHaveLength(1205)
    expect(session.display.data.deviationPoints.value[0]).toEqual([0, 0, 4])
    expect(session.display.data.deviationPoints.value[1][2]).toBe(5)
    expect(session.display.data.positionEpochHistory.value.getValue('U', 1204)).toBeCloseTo(
      1.204,
      3,
    )
    await vi.waitFor(() => expect(session.solutionConsole.totalCount.value).toBe(1205))
    expect(session.attachTimeline()).toBe(true)
    expect(session.display.timeline.cursorIndex.value).toBe(1204)
    session.display.timeline.seekElapsedTime(10000)
    expect(session.currentSolution.value?.time).toBe('2024/07/30 00:00:10.000')
    expect(session.display.data.currentData.value.latitude).toBeCloseTo(31.000001, 8)
    expect(session.display.mapState.status.latitude).toBeCloseTo(31.000001, 8)
    expect(session.solutionConsole.filteredMessages.value[10].fileElapsedMilliseconds).toBe(10000)
    expect(session.latest.value?.time).toBe('2024/07/30 00:20:04.000')
    expect(session.display.data.mapTrackPoints.value).toHaveLength(1205)
    expect(session.epochs.value).toBe(1205)
  })

  it('does not mix two sessions, a stale task event, logs or the ordinary file timeline', async () => {
    const first = createGnssSolverSession()
    const second = createGnssSolverSession()
    first.begin('first', 'post')
    second.begin('second', 'realtime')
    first.append(line(0))
    first.appendLog('error : no nav data\n')
    await vi.waitFor(() => expect(first.displayConsole.totalCount.value).toBe(1))
    first.channel.value = 'log'
    expect(first.displayConsole.filteredMessages.value[0].raw).toBe('error : no nav data')
    expect(first.display.data.positionEpochHistory.value.length).toBe(1)
    second.append(line(1), 'first')
    expect(second.epochs.value).toBe(0)
    first.begin('next', 'realtime')
    first.append(line(10))
    expect(first.epochs.value).toBe(1)
    expect(first.display.data.deviationPoints.value[0]).toEqual([0, 0, 4])
    expect(first.logConsole.totalCount.value).toBe(0)
    expect(second.epochs.value).toBe(0)
    expect(first.display.timeline).not.toBe(useFileTimeline())
  })

  it('uses the first valid position as origin and counts invalid solution qualities separately', () => {
    const session = createGnssSolverSession()
    session.begin('one', 'realtime')
    session.append(line(0, 0) + line(1, 1))
    expect(session.epochs.value).toBe(2)
    expect(session.qualityCounts.value).toEqual({ 0: 1, 1: 1 })
    expect(session.display.data.deviationPoints.value).toEqual([[0, 0, 4]])
  })

  it('keeps solution and log display settings independent without changing the receiver format', () => {
    const send = vi.fn()
    vi.stubGlobal('ipcRenderer', { send })
    try {
      const session = createGnssSolverSession()
      session.begin('display', 'realtime')
      session.displayConsole.toggleDisplayFormat()
      expect(session.solutionConsole.displayFormat.value).toBe('hex')
      session.channel.value = 'log'
      expect(session.displayConsole.displayFormat.value).toBe('ascii')
      session.displayConsole.toggleDisplayFormat()
      expect(session.logConsole.displayFormat.value).toBe('hex')
      expect(send).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it.each([true, false])(
    'parses NMEA dates, quality and heights when the NMEA hint is %s',
    (nmea) => {
      const sentence = (body: string) => {
        let checksum = 0
        for (const char of body) checksum ^= char.charCodeAt(0)
        return `$${body}*${checksum.toString(16).toUpperCase().padStart(2, '0')}\r\n`
      }
      const session = createGnssSolverSession()
      session.begin('nmea', 'post', { format: 'llh', nmea })
      session.append(sentence('GNRMC,000000.00,A,3100.0000,N,12100.0000,E,0,0,300724,,,A'))
      const gga = sentence('GNGGA,000000.00,3100.0000,N,12100.0000,E,4,12,1.0,10.0,M,20.0,M,,')
      session.append(gga.slice(0, 35))
      session.append(gga.slice(35))
      expect(session.epochs.value).toBe(1)
      expect(session.latest.value).toMatchObject({
        latitude: 31,
        longitude: 121,
        height: 30,
        quality: 1,
        time: '2024/07/30 00:00:00.000',
      })
    },
  )
})
