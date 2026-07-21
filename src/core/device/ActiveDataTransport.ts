export type ActiveDataTransportType = 'serial' | 'network'
export type DataTransferFormat = 'ascii' | 'hex'

export class ActiveDataTransport {
  private activeType: ActiveDataTransportType | undefined

  public get current(): ActiveDataTransportType | undefined {
    return this.activeType
  }

  public activate(type: ActiveDataTransportType): void {
    this.activeType = type
  }

  public clear(type?: ActiveDataTransportType): void {
    if (!type || this.activeType === type) this.activeType = undefined
  }

  public sendChannel(format: DataTransferFormat): string | undefined {
    return this.activeType ? `send-${this.activeType}-${format}-data` : undefined
  }
}

export const activeDataTransport = new ActiveDataTransport()
