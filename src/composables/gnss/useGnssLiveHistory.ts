import { NumericEpochStore } from '@/core/gnss/NumericEpochStore'
import { recordingClockDifference } from '@/core/gnss/EpochSelection'
import { RtkSolutionParser } from '@/core/gnsslib/RtkSolution'
import { validateNmeaChecksum } from '@/core/data/NmeaStreamParser'
import type { ConsoleState } from '@/composables/flow/useConsole'
import type { FileTimeline } from '@/composables/useFileTimeline'
import type { useNmea } from './useNmea'

type GnssParser = 'nmea' | 'rtklib-pos'

interface LiveHistoryOptions {
  data: ReturnType<typeof useNmea>
  messages: ConsoleState
  timeline: FileTimeline
  generation(): number
  yieldToUi?: () => Promise<void>
}

/** Keep incoming text compact while live; build the full message index only after stopping. */
export function createGnssLiveHistory(options: LiveHistoryOptions) {
  const { data, messages, timeline } = options
  const yieldToUi =
    options.yieldToUi ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)))
  let sourceKey = ''
  let parser: GnssParser = 'nmea'
  let generation = -1
  let receiving = false
  let revision = 0
  let chunks: string[] = []
  let tail = ''
  let length = 0
  let stopping: Promise<boolean> | undefined

  function resetText(): void {
    chunks = []
    tail = ''
    length = 0
  }

  function observeClear(): void {
    const current = options.generation()
    if (current === generation) return
    resetText()
    generation = current
  }

  function matches(key: string): boolean {
    return sourceKey === key
  }

  function discard(): void {
    revision++
    receiving = false
    stopping = undefined
    sourceKey = ''
    resetText()
  }

  function start(key: string, nextParser: GnssParser): void {
    const fresh = sourceKey !== key || generation !== options.generation()
    revision++
    stopping = undefined
    receiving = true
    sourceKey = key
    parser = nextParser
    timeline.clearTimeline()
    if (fresh) {
      resetText()
      data.clearData()
      generation = options.generation()
    } else if (data.statusEpochHistory.value.length) {
      // A historical cursor must not remain the current live position after reconnecting.
      data.prepareTimelineProjection('loaded')
      data.applyTimelineEpoch(data.statusEpochHistory.value.length - 1)
    }
    data.clearBuffer(fresh)
    messages.clearMessages()
  }

  function append(text: string): void {
    if (!receiving || !text) return
    observeClear()
    length += text.length
    if (tail.length + text.length <= 64 * 1024) {
      tail += text
    } else {
      if (tail) chunks.push(tail)
      tail = ''
      let offset = 0
      for (; offset + 64 * 1024 <= text.length; offset += 64 * 1024) {
        chunks.push(text.slice(offset, offset + 64 * 1024))
      }
      tail = text.slice(offset)
    }
  }

  function stop(): Promise<boolean> {
    if (stopping) return stopping
    if (!receiving) return Promise.resolve(false)
    observeClear()
    append('\n')
    receiving = false
    const token = ++revision
    const runGeneration = generation
    if (parser === 'rtklib-pos') data.processRtkLibPosData('\n')
    else data.processRawData('\n')
    if (!length || !data.statusEpochHistory.value.length) return Promise.resolve(false)

    const source = [...chunks, tail]
    const total = length
    const valid = () => token === revision && runGeneration === options.generation()
    const freeze = async (): Promise<boolean> => {
      timeline.beginIndexing()
      messages.clearMessages()
      messages.beginFileReplayMessages()
      const clock = new NumericEpochStore(['ROW'])
      const positionParser = new RtkSolutionParser()
      const startTimestamp = data.statusEpochHistory.value.getTimestamp(0)
      let lastElapsed = 0
      messages.setFileReplayElapsedResolver((line) => {
        const nmea = line.match(/^\s*\$..(?:GGA|RMC|GST|ZDA),(\d{6}(?:\.\d+)?),/)
        const position = nmea ? null : positionParser.addLine(line)
        const clockText = nmea?.[1]
        const validClock =
          clockText !== undefined &&
          Number(clockText.slice(0, 2)) < 24 &&
          Number(clockText.slice(2, 4)) < 60 &&
          Number(clockText.slice(4)) < 60 &&
          validateNmeaChecksum(line.trim())
        const time = validClock ? clockText : position?.time
        if (time) {
          const index = clock.append(time, { ROW: 0 }, { replaceLast: true })
          lastElapsed = Math.max(
            lastElapsed,
            recordingClockDifference(clock.getTimestamp(0), startTimestamp) +
              clock.getElapsedTime(index),
          )
        }
        return lastElapsed
      })
      let processed = 0
      let pendingBytes = 0
      for (const chunk of source) {
        if (!valid()) return false
        messages.addFileReplayData(chunk)
        processed += chunk.length
        pendingBytes += chunk.length
        timeline.updateIndexingProgress((processed / total) * 100)
        if (pendingBytes >= 512 * 1024) {
          pendingBytes = 0
          await yieldToUi()
        }
      }
      if (!valid()) return false
      messages.endFileReplayMessages()
      data.prepareTimelineProjection('loaded')
      data.rebuildMapTrackFromPositionHistory()
      data.rebuildDeviationFromPositionHistory()
      return timeline.attachTimeline(data.statusEpochHistory.value, {
        mode: 'loaded',
        speed: 1,
        applyEpoch: data.applyTimelineEpoch,
      })
    }
    const task = freeze().catch((error) => {
      if (valid()) timeline.clearTimeline()
      throw error
    })
    stopping = task
    void task
      .finally(() => {
        if (stopping === task) stopping = undefined
      })
      .catch(() => undefined)
    return task
  }

  return {
    start,
    append,
    stop,
    matches,
    discard,
    get receiving() {
      return receiving
    },
  }
}
