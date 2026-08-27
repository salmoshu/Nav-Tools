export const SATELLITE_EPOCH_CONSTELLATIONS = [
  'GPS',
  'GLONASS',
  'BEIDOU',
  'GALILEO',
  'QZSS',
  'OTHER',
] as const

export type SatelliteEpochConstellation = (typeof SATELLITE_EPOCH_CONSTELLATIONS)[number]

export interface SatelliteEpochSample {
  key: string
  time: string
  counts: Record<SatelliteEpochConstellation, number>
  total: number
  complete: boolean
}

export interface GsvEpochFragment {
  source: string
  constellation: string
  totalMessages: number
  messageNumber: number
  satelliteIds: readonly (string | number)[]
}

interface PendingGsvCycle {
  constellation: SatelliteEpochConstellation
  totalMessages: number
  receivedMessages: Set<number>
  satelliteIds: Set<string>
}

export class SatelliteEpochAssembler {
  private readonly cycles = new Map<string, PendingGsvCycle>()

  public addGsv(fragment: GsvEpochFragment): void {
    const totalMessages = Math.trunc(fragment.totalMessages)
    const messageNumber = Math.trunc(fragment.messageNumber)
    if (totalMessages < 1 || messageNumber < 1 || messageNumber > totalMessages) return

    const source = fragment.source || fragment.constellation || 'UNKNOWN'
    let cycle = this.cycles.get(source)
    if (
      messageNumber === 1 ||
      !cycle ||
      cycle.totalMessages !== totalMessages ||
      cycle.receivedMessages.has(messageNumber)
    ) {
      cycle = {
        constellation: normalizeConstellation(fragment.constellation),
        totalMessages,
        receivedMessages: new Set<number>(),
        satelliteIds: new Set<string>(),
      }
      this.cycles.set(source, cycle)
    }

    cycle.receivedMessages.add(messageNumber)
    for (const satelliteId of fragment.satelliteIds) {
      const normalized = String(satelliteId).trim()
      if (normalized) cycle.satelliteIds.add(normalized)
    }
  }

  public commit(rawGgaTime: string): SatelliteEpochSample {
    const counts = createEmptyCounts()
    const allCycles = [...this.cycles.values()]

    // The epoch is complete only when at least one GSV cycle was received
    // during this epoch AND every received cycle fully covers 1..totalMessages.
    // A complete constellation alongside a missing one must not be treated as a
    // complete epoch, otherwise the chart would mistake partial data for a full one.
    const complete = allCycles.length > 0 && allCycles.every(isComplete)
    if (complete) {
      for (const cycle of allCycles) {
        counts[cycle.constellation] += cycle.satelliteIds.size
      }
    }
    this.cycles.clear()

    const time = formatNmeaEpochTime(rawGgaTime)
    const total = complete
      ? SATELLITE_EPOCH_CONSTELLATIONS.reduce((sum, name) => sum + counts[name], 0)
      : 0
    return {
      key: rawGgaTime.trim() || time,
      time,
      counts,
      total,
      complete,
    }
  }

  public clear(): void {
    this.cycles.clear()
  }
}

export function formatNmeaEpochTime(raw: string): string {
  const match = raw.trim().match(/^(\d{2})(\d{2})(\d{2})(\.\d+)?$/)
  if (!match) return raw.trim()
  return `${match[1]}:${match[2]}:${match[3]}${match[4] ?? ''}`
}

function createEmptyCounts(): Record<SatelliteEpochConstellation, number> {
  return {
    GPS: 0,
    GLONASS: 0,
    BEIDOU: 0,
    GALILEO: 0,
    QZSS: 0,
    OTHER: 0,
  }
}

function normalizeConstellation(value: string): SatelliteEpochConstellation {
  return SATELLITE_EPOCH_CONSTELLATIONS.includes(value as SatelliteEpochConstellation)
    ? (value as SatelliteEpochConstellation)
    : 'OTHER'
}

function isComplete(cycle: PendingGsvCycle): boolean {
  if (cycle.receivedMessages.size !== cycle.totalMessages) return false
  for (let index = 1; index <= cycle.totalMessages; index += 1) {
    if (!cycle.receivedMessages.has(index)) return false
  }
  return true
}
