import { RtcmDecoder, type GnssEvent } from 'open-gnss-wasm'
import type { SppBatch, SppCommand } from './RtcmSppSession'

let decoder: RtcmDecoder | undefined
let pending = Promise.resolve()

async function process(command: SppCommand): Promise<SppBatch> {
  let events: GnssEvent[] = []
  if (command.type === 'start') {
    if (decoder) decoder.reset()
    else decoder = await RtcmDecoder.create()
    decoder.startSpp({ captureTimeS: command.captureTimeS, scan: command.scan, ekf: true })
  } else {
    if (!decoder) throw new Error('RTCM3 SPP session has not started')
    switch (command.type) {
      case 'push':
        events = decoder.push(new Uint8Array(command.bytes))
        break
      case 'navigation':
        decoder.pushSppNav(new Uint8Array(command.bytes))
        break
      case 'replay':
        decoder.replaySpp()
        break
      case 'finish':
        events = decoder.flush()
        break
    }
  }
  const batch: SppBatch = {
    nmea: '', observations: [], epochs: 0, fixes: 0, captureTimeS: decoder.captureTimeS(),
  }
  for (const event of events) {
    if (event.kind !== 'spp') continue
    batch.nmea += event.nmea
    batch.observations.push(event.satellites)
    batch.epochs++
    if (event.status === 'fix') batch.fixes++
    batch.status = event.status
  }
  return batch
}

self.onmessage = ({ data }: MessageEvent<{ id: number; command: SppCommand }>) => {
  const { id, command } = data
  pending = pending.then(async () => {
    try {
      self.postMessage({ id, batch: await process(command) })
    } catch (error) {
      self.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
    }
  })
}
