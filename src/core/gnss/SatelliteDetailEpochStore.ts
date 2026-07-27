import { NumericEpochStore } from './NumericEpochStore'

export interface SatelliteDetailSample {
  prn: string
  elevation: number
  azimuth: number
  snr: number
  constellation: string
  timestamp: string
}

interface DetailChunk {
  prnIds: Uint16Array
  constellationIds: Uint16Array
  elevations: Float32Array
  azimuths: Float32Array
  snrs: Float32Array
}

const DETAIL_CHUNK_SIZE = 4096

/**
 * Compact timeline for per-satellite details.
 *
 * Epochs only store a numeric snapshot id in a chunked typed-array store.
 * Satellite arrays are added to the snapshot pool only when their observable
 * content changes, so a 10 Hz file does not duplicate an object graph 432,000
 * times when GSV data changes at a much lower rate.
 */
export class SatelliteDetailEpochStore {
  private readonly epochs = new NumericEpochStore(['SNAPSHOT_ID'])
  private readonly snapshotOffsets: number[] = []
  private readonly snapshotLengths: number[] = []
  private readonly snapshotTimestamps: string[] = []
  private readonly detailChunks: DetailChunk[] = []
  private readonly stringIds = new Map<string, number>()
  private readonly strings: string[] = []
  private detailCount = 0
  private lastSignature = ''
  private lastSnapshotId = -1

  public get length(): number {
    return this.epochs.length
  }

  public get duration(): number {
    return this.epochs.duration
  }

  public get snapshotCount(): number {
    return this.snapshotOffsets.length
  }

  public append(time: string, details?: readonly SatelliteDetailSample[]): void {
    if (!time) return

    if (details) {
      // GSV fragments arrive in receiver order and the staging Map preserves it.
      // Avoid sorting every one-second snapshot: over 12 hours that would add
      // millions of locale-aware comparisons without changing the chart.
      const normalized = details
      let signature = ''
      for (const detail of normalized) {
        signature += `${detail.constellation}:${detail.prn}:${Number(detail.elevation) || 0}:${Number(detail.azimuth) || 0}:${Number(detail.snr) || 0}|`
      }

      if (this.lastSnapshotId < 0 || signature !== this.lastSignature) {
        this.lastSignature = signature
        this.lastSnapshotId = this.snapshotOffsets.length
        this.snapshotOffsets.push(this.detailCount)
        this.snapshotLengths.push(normalized.length)
        this.snapshotTimestamps.push(String(normalized[0]?.timestamp ?? ''))
        for (const detail of normalized) this.appendDetail(detail)
      }
    }

    this.epochs.append(
      time,
      { SNAPSHOT_ID: this.lastSnapshotId },
      { replaceLast: true },
    )
  }

  public clear(): void {
    this.epochs.clear()
    this.snapshotOffsets.length = 0
    this.snapshotLengths.length = 0
    this.snapshotTimestamps.length = 0
    this.detailChunks.length = 0
    this.stringIds.clear()
    this.strings.length = 0
    this.detailCount = 0
    this.lastSignature = ''
    this.lastSnapshotId = -1
  }

  public getElapsedTime(index: number): number {
    return this.epochs.getElapsedTime(index)
  }

  public findNearestElapsedTime(elapsedMilliseconds: number): number {
    return this.epochs.findNearestElapsedTime(elapsedMilliseconds)
  }

  public getSnapshot(index: number): SatelliteDetailSample[] {
    const snapshotId = this.epochs.getValue('SNAPSHOT_ID', index)
    if (snapshotId === null || snapshotId < 0) return []
    const id = Math.trunc(snapshotId)
    const offset = this.snapshotOffsets[id]
    const length = this.snapshotLengths[id]
    if (offset === undefined || length === undefined) return []
    const timestamp = this.snapshotTimestamps[id]
    const snapshot: SatelliteDetailSample[] = []
    for (let index = offset; index < offset + length; index += 1) {
      const chunk = this.detailChunks[Math.floor(index / DETAIL_CHUNK_SIZE)]
      const local = index % DETAIL_CHUNK_SIZE
      snapshot.push({
        prn: this.strings[chunk.prnIds[local]] ?? '',
        constellation: this.strings[chunk.constellationIds[local]] ?? 'OTHER',
        elevation: chunk.elevations[local],
        azimuth: chunk.azimuths[local],
        snr: chunk.snrs[local],
        timestamp,
      })
    }
    return snapshot
  }

  private appendDetail(detail: SatelliteDetailSample): void {
    const chunkIndex = Math.floor(this.detailCount / DETAIL_CHUNK_SIZE)
    if (!this.detailChunks[chunkIndex]) {
      this.detailChunks.push({
        prnIds: new Uint16Array(DETAIL_CHUNK_SIZE),
        constellationIds: new Uint16Array(DETAIL_CHUNK_SIZE),
        elevations: new Float32Array(DETAIL_CHUNK_SIZE),
        azimuths: new Float32Array(DETAIL_CHUNK_SIZE),
        snrs: new Float32Array(DETAIL_CHUNK_SIZE),
      })
    }
    const chunk = this.detailChunks[chunkIndex]
    const local = this.detailCount % DETAIL_CHUNK_SIZE
    chunk.prnIds[local] = this.intern(String(detail.prn))
    chunk.constellationIds[local] = this.intern(String(detail.constellation))
    chunk.elevations[local] = Number(detail.elevation) || 0
    chunk.azimuths[local] = Number(detail.azimuth) || 0
    chunk.snrs[local] = Number(detail.snr) || 0
    this.detailCount += 1
  }

  private intern(value: string): number {
    const existing = this.stringIds.get(value)
    if (existing !== undefined) return existing
    const id = this.strings.length
    if (id > 0xffff) throw new RangeError('satellite detail string table exhausted')
    this.strings.push(value)
    this.stringIds.set(value, id)
    return id
  }
}
