import { RtcmSppSession, type SppBatch, type SppObservations } from './RtcmSppSession'

interface BinarySource {
  size: number
  lastModified: number
  tag?: ArrayBuffer
  read(offset: number, length: number): Promise<ArrayBuffer>
}

export interface SppFileInput {
  data: File | string
  navigation?: Array<File | string>
  tag?: File | string
  captureTimeS?: number
}

const CHUNK_BYTES = 256 * 1024
const TAG_HEADER_BYTES = 76

function captureTimeFromTag(tag?: ArrayBuffer): number | undefined {
  if (!tag || tag.byteLength < TAG_HEADER_BYTES) return undefined
  if (new TextDecoder().decode(new Uint8Array(tag, 0, 7)) !== 'TIMETAG') return undefined
  const view = new DataView(tag)
  const seconds = view.getUint32(64, true)
  const fraction = view.getFloat64(68, true)
  // The RTKLIB tag stores GPST. Its approximate time is used to recover the week/day.
  if (seconds > 315964800 && Number.isFinite(fraction) && fraction >= 0 && fraction < 1)
    return seconds + fraction
  return undefined
}

async function binarySource(file: File | string): Promise<BinarySource> {
  if (typeof file !== 'string') {
    return {
      size: file.size,
      lastModified: file.lastModified,
      read: (offset, length) => file.slice(offset, offset + length).arrayBuffer(),
    }
  }
  const api = window.electronAPI
  const info = await api.gnssSppFileInfo(file)
  return { ...info, read: (offset, length) => api.gnssSppFileRead(file, offset, length) }
}

export async function solveRtcmSppFile(
  input: SppFileInput,
  onNmea: (text: string, observations: SppObservations) => void,
  onProgress: (percent: number) => void,
  onRtcmBytes?: (bytes: Uint8Array) => void,
): Promise<Pick<SppBatch, 'epochs' | 'fixes'> & { sizeBytes: number }> {
  const source = await binarySource(input.data)
  let session: RtcmSppSession | undefined
  let monitoredBytes = 0
  let epochs = 0
  let fixes = 0

  async function readChunk(offset: number): Promise<ArrayBuffer> {
    const bytes = await source.read(offset, Math.min(CHUNK_BYTES, source.size - offset))
    if (!bytes.byteLength) throw new Error('RTCM3 file changed during import')
    return bytes
  }

  async function scanOrSolve(
    worker: RtcmSppSession,
    solve: boolean,
    collectRawMessages = false,
  ): Promise<number> {
    let embeddedTime = 0
    for (let offset = 0; offset < source.size;) {
      const bytes = await readChunk(offset)
      offset += bytes.byteLength
      if (collectRawMessages && onRtcmBytes) {
        onRtcmBytes(new Uint8Array(bytes))
        monitoredBytes = offset
      }
      const batch = await worker.request({ type: 'push', bytes })
      embeddedTime ||= batch.captureTimeS
      if (solve) append(batch)
      const fraction = offset / source.size
      onProgress(solve ? 40 + 60 * fraction : 40 * fraction)
    }
    return embeddedTime
  }

  function append(batch: SppBatch): void {
    epochs += batch.epochs
    fixes += batch.fixes
    if (batch.nmea) onNmea(batch.nmea, batch.observations)
  }

  try {
    const companionTag = input.tag ? await binarySource(input.tag) : undefined
    const taggedTime = captureTimeFromTag(
      companionTag ? await companionTag.read(0, TAG_HEADER_BYTES) : source.tag,
    )
    const referenceTime = input.captureTimeS || taggedTime || source.lastModified / 1000
    session = new RtcmSppSession()
    await session.request({ type: 'start', captureTimeS: referenceTime, scan: true })
    const embeddedTime = await scanOrSolve(session, false, true)
    if (!input.captureTimeS && !taggedTime && embeddedTime &&
        Math.abs(embeddedTime - referenceTime) > 12 * 60 * 60) {
      await session.request({ type: 'start', captureTimeS: embeddedTime, scan: true })
      await scanOrSolve(session, false)
    }
    for (const navigation of input.navigation ?? []) {
      const bytes = typeof navigation === 'string'
        ? (await window.electronAPI.gnssRawReadFile(navigation)).data
        : await navigation.arrayBuffer()
      await session.request({ type: 'navigation', bytes })
    }
    await session.request({ type: 'replay' })
    await scanOrSolve(session, true)
    append(await session.request({ type: 'finish' }))
    return { epochs, fixes, sizeBytes: source.size }
  } catch (error) {
    // An unavailable solver or bad companion file must not prevent the
    // Messages panel from reading the original file. Continue without SPP.
    try {
      while (onRtcmBytes && monitoredBytes < source.size) {
        const bytes = await readChunk(monitoredBytes)
        onRtcmBytes(new Uint8Array(bytes))
        monitoredBytes += bytes.byteLength
        onProgress((monitoredBytes / source.size) * 100)
      }
    } catch {
      // Report the original import error if the source cannot be read either.
    }
    throw error
  } finally {
    session?.close()
  }
}
