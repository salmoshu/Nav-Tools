import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useNmea } from '@/composables/gnss/useNmea'
import { useGnssStore } from '@/stores/gnss'
import { useConsole } from '@/composables/flow/useConsole'
import { createFileTimeline } from '@/composables/useFileTimeline'
import { createGnssLiveHistory } from '@/composables/gnss/useGnssLiveHistory'

function sentence(body: string): string {
  const checksum = [...body].reduce((value, char) => value ^ char.charCodeAt(0), 0)
  return `$${body}*${checksum.toString(16).toUpperCase().padStart(2, '0')}\r\n`
}

function packet(second: number): string {
  return (
    sentence(`GPGSV,1,1,01,${second + 1},40,083,${40 + second}`) +
    sentence(
      `GPGGA,12350${second}.00,4807.038${second},N,01131.000${second},E,${second % 2 ? 5 : 4},01,1.0,10.0,M,20.0,M,,`,
    )
  )
}

describe('stopped GNSS live history', () => {
  const data = useNmea()
  let timeline: ReturnType<typeof createFileTimeline>
  let messages: ReturnType<typeof useConsole>
  let history: ReturnType<typeof createGnssLiveHistory>

  function ingest(text: string): void {
    history.append(text)
    data.processRawData(text)
    messages.addMessage(text)
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    data.clearData()
    timeline = createFileTimeline()
    messages = useConsole(false, timeline)
    messages.dataFormat.value = 'nmea'
    history = createGnssLiveHistory({
      data,
      messages,
      timeline,
      generation: () => useGnssStore().trackResetToken,
    })
  })

  afterEach(() => {
    timeline.clearTimeline()
    messages.clearMessages()
    history.discard()
  })

  it('rebuilds all received messages even when live message display was paused', async () => {
    history.start('serial:COM1', 'nmea')
    messages.isPaused.value = true
    ingest(packet(0) + packet(1) + packet(2))
    expect(timeline.active.value).toBe(false)
    expect(messages.totalCount.value).toBe(0)
    expect(await history.stop()).toBe(true)
    expect(messages.totalCount.value).toBe(6)
    expect(timeline.totalEpochs.value).toBe(3)
    expect(timeline.cursorIndex.value).toBe(2)
    timeline.seekElapsedTime(1000)
    expect(useGnssStore().status.quality).toBe(5)
    expect(data.satelliteSnrData.value.map((item) => item.prn)).toEqual(['2'])
    expect(messages.filteredMessages.value[3].fileElapsedMilliseconds).toBe(1000)
  })

  it('leaves historical selection on reconnect, keeps the same source history and flushes a split packet', async () => {
    history.start('serial:COM1', 'nmea')
    ingest(packet(0) + packet(1))
    await history.stop()
    timeline.seekElapsedTime(0)
    expect(useGnssStore().status.quality).toBe(4)
    history.start('serial:COM1', 'nmea')
    expect(timeline.active.value).toBe(false)
    expect(useGnssStore().status.quality).toBe(5)
    const next = packet(2)
    ingest(next.slice(0, 35))
    ingest(next.slice(35))
    await history.stop()
    expect(timeline.totalEpochs.value).toBe(3)
    expect(messages.totalCount.value).toBe(6)
    expect(data.positionEpochHistory.value.length).toBe(3)
  })

  it('starts a separate dataset when the source changes', async () => {
    history.start('serial:COM1', 'nmea')
    ingest(packet(0) + packet(1))
    await history.stop()
    history.start('network:tcp:other', 'nmea')
    expect(data.positionEpochHistory.value.length).toBe(0)
    expect(timeline.active.value).toBe(false)
    ingest(packet(2))
    await history.stop()
    expect(timeline.totalEpochs.value).toBe(1)
    expect(messages.totalCount.value).toBe(2)
    expect(data.deviationPoints.value[0]).toEqual([0, 0, 4])
  })

  it('does not resurrect positions or messages cleared during reception', async () => {
    history.start('serial:COM1', 'nmea')
    ingest(packet(0))
    data.clearData()
    ingest(packet(1))
    await history.stop()
    expect(timeline.totalEpochs.value).toBe(1)
    expect(messages.totalCount.value).toBe(2)
    expect(messages.filteredMessages.value[1].raw).toContain('123501.00')
  })

  it('keeps corrupt sentences visible without letting their clocks displace valid messages', async () => {
    history.start('serial:COM1', 'nmea')
    const corrupt = sentence(
      'GPGGA,133500.00,4807.0380,N,01131.0000,E,4,01,1.0,10.0,M,20.0,M,,',
    ).replace(/\*[0-9A-F]{2}/, '*ZZ')
    ingest(packet(0) + corrupt + packet(1))
    await history.stop()
    expect(timeline.totalEpochs.value).toBe(2)
    expect(messages.totalCount.value).toBe(5)
    expect(messages.filteredMessages.value[4].fileElapsedMilliseconds).toBe(1000)
  })

  it('keeps POS headers across reconnects and accepts a final epoch without a newline', async () => {
    const feed = (text: string) => {
      history.append(text)
      data.processRtkLibPosData(text)
      messages.addMessage(text)
    }
    history.start('network:pos', 'rtklib-pos')
    feed(
      '% GPST x-ecef(m) y-ecef(m) z-ecef(m) Q ns\n2024/07/30 00:00:00.000 -2700000 4200000 3300000 1 12\n',
    )
    await history.stop()
    expect(timeline.totalEpochs.value).toBe(1)
    history.start('network:pos', 'rtklib-pos')
    feed('2024/07/30 00:00:01.000 -2700001 4200001 3300001 2 12')
    await history.stop()
    expect(timeline.totalEpochs.value).toBe(2)
    expect(messages.totalCount.value).toBe(3)
    expect(messages.filteredMessages.value[2].fileElapsedMilliseconds).toBe(1000)
  })

  it('cancels a large message-index build if the source reconnects while it yields', async () => {
    let resume!: () => void
    let calls = 0
    const blocked = new Promise<void>((resolve) => {
      resume = resolve
    })
    history = createGnssLiveHistory({
      data,
      messages,
      timeline,
      generation: () => useGnssStore().trackResetToken,
      yieldToUi: () => (calls++ === 0 ? blocked : Promise.resolve()),
    })
    history.start('serial:COM1', 'nmea')
    ingest('% receiver diagnostic\n'.repeat(30000) + packet(0))
    const stopping = history.stop()
    expect(timeline.indexing.value).toBe(true)
    history.start('serial:COM1', 'nmea')
    ingest(packet(1))
    resume()
    expect(await stopping).toBe(false)
    expect(timeline.active.value).toBe(false)
    await history.stop()
    expect(timeline.totalEpochs.value).toBe(2)
    expect(messages.totalCount.value).toBe(30004)
    expect(timeline.cursorIndex.value).toBe(1)
  })
})
