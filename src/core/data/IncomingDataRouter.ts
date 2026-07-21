export type DataMode = 'general' | 'flow' | 'gnss' | 'motor' | string
export type DisplayFormat = 'ascii' | 'hex'

export interface IncomingDataContext {
  activeDataModes: readonly DataMode[]
  activeWindowIds: readonly string[]
  displayFormat: DisplayFormat
}

export interface IncomingDataTargets {
  appendGnss(data: string): void
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

    if (modes.has('gnss')) this.targets.appendGnss(data)

    if (windows.has('raw-messages')) {
      if (isHexMotor) this.targets.appendRaw(`${data}\n${decodedData}`)
      else this.targets.appendRaw(data)
    }

    if (windows.has('plot')) this.targets.appendPlot(decodedData)
  }
}
