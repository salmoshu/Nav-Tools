import type { TextDataParser } from './TextRecordParser'
import type { SppObservations } from '@/core/gnss/RtcmSppSession'

export type DataMode = 'general' | 'flow' | 'gnss' | 'motor' | string
export type DisplayFormat = 'ascii' | 'hex'

export interface IncomingDataContext {
  activeDataModes: readonly DataMode[]
  activeWindowIds: readonly string[]
  displayFormat: DisplayFormat
  dataParser: TextDataParser
  gnssData?: string
  observations?: SppObservations
  suppressRawMessages?: boolean
}

export interface IncomingDataTargets {
  appendGnss(data: string, observations?: SppObservations): void
  appendRaw(data: string): void
  appendPlot(data: string): void
  decodeMotorHex(data: string): string
}

export class IncomingDataRouter {
  public constructor(private readonly targets: IncomingDataTargets) {}

  public route(data: string, context: IncomingDataContext): void {
    const modes = new Set(context.activeDataModes)
    const windows = new Set(context.activeWindowIds)
    const isHexMotor = modes.has('motor') && context.displayFormat === 'hex'
    const decodedData = isHexMotor ? this.targets.decodeMotorHex(data) : data

    if (modes.has('gnss') || context.dataParser === 'nmea' || context.dataParser === 'rtklib-pos') {
      const gnssData = context.gnssData ?? data
      if (context.observations) this.targets.appendGnss(gnssData, context.observations)
      else this.targets.appendGnss(gnssData)
    }

    if (windows.has('raw-messages') && !context.suppressRawMessages) {
      if (isHexMotor) this.targets.appendRaw(`${data}\n${decodedData}`)
      else this.targets.appendRaw(data)
    }

    if (windows.has('plot') || modes.has('flow') || modes.has('motor')) {
      this.targets.appendPlot(decodedData)
    }
  }
}
