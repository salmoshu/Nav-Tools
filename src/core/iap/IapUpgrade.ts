import type { IapProtocolConfig } from './IapProtocol'

export type IapUpgradePhase =
  'idle' | 'preparing' | 'asking' | 'sending' | 'success' | 'error' | 'cancelled'

export interface IapUpgradeRequest {
  filePath: string
  fileName: string
  protocolName: string
  config: IapProtocolConfig
}

export interface IapUpgradeSnapshot {
  phase: IapUpgradePhase
  fileName: string
  fileSize: number
  protocolName: string
  progress: number
  totalPackets: number
  acknowledgedPackets: number
  sentPackets: number
  retryCount: number
  ackErrorCount: number
  timeoutRetryCount: number
  elapsedMs: number
  error: string | null
}

export type IapUpgradeEvent =
  | { type: 'state'; snapshot: IapUpgradeSnapshot }
  | { type: 'log'; message: string; timestamp: number }

export const EMPTY_IAP_SNAPSHOT: IapUpgradeSnapshot = {
  phase: 'idle',
  fileName: '',
  fileSize: 0,
  protocolName: '',
  progress: 0,
  totalPackets: 0,
  acknowledgedPackets: 0,
  sentPackets: 0,
  retryCount: 0,
  ackErrorCount: 0,
  timeoutRetryCount: 0,
  elapsedMs: 0,
  error: null,
}
