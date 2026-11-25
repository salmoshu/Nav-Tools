import type { SppSatellite } from 'open-gnss-wasm'

export type SppCommand =
  | { type: 'start'; captureTimeS?: number; scan?: boolean }
  | { type: 'push' | 'navigation'; bytes: ArrayBuffer }
  | { type: 'replay' | 'finish' }

/** Observation arrays in the same order as the complete NMEA epochs in a batch. */
export type SppObservations = readonly (readonly SppSatellite[])[]

export interface SppBatch {
  nmea: string
  observations: SppSatellite[][]
  epochs: number
  fixes: number
  captureTimeS: number
  status?: 'fix' | 'waiting-ephemeris' | 'no-fix'
}

interface PendingRequest {
  resolve: (batch: SppBatch) => void
  reject: (error: Error) => void
  bytes: number
}

export class RtcmSppSession {
  private readonly worker = new Worker(new URL('./rtcmSpp.worker.ts', import.meta.url), {
    type: 'module',
  })
  private readonly pending = new Map<number, PendingRequest>()
  private sequence = 0
  private queuedBytes = 0
  private closed = false

  constructor() {
    this.worker.onmessage = ({ data }: MessageEvent<{ id: number; batch?: SppBatch; error?: string }>) => {
      const request = this.pending.get(data.id)
      if (!request) return
      this.pending.delete(data.id)
      this.queuedBytes -= request.bytes
      if (data.batch) request.resolve(data.batch)
      else request.reject(new Error(data.error ?? 'RTCM3 SPP failed'))
    }
    this.worker.onerror = (event) => this.close(new Error(event.message || 'RTCM3 worker failed'))
  }

  request(command: SppCommand): Promise<SppBatch> {
    if (this.closed) return Promise.reject(new Error('RTCM3 session closed'))
    const bytes = 'bytes' in command ? command.bytes.byteLength : 0
    if (command.type === 'push' && this.queuedBytes + bytes > 16 * 1024 * 1024)
      return Promise.reject(new Error('RTCM3 data arrived faster than the solver could process it'))
    const id = ++this.sequence
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, bytes })
      this.queuedBytes += bytes
      try {
        this.worker.postMessage({ id, command }, 'bytes' in command ? [command.bytes] : [])
      } catch (error) {
        this.pending.delete(id)
        this.queuedBytes -= bytes
        reject(error)
      }
    })
  }

  close(error = new Error('RTCM3 session closed')): void {
    if (this.closed) return
    this.closed = true
    this.worker.terminate()
    for (const request of this.pending.values()) request.reject(error)
    this.pending.clear()
    this.queuedBytes = 0
  }
}
