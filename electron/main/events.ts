import fs from 'node:fs'
import { dialog, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { SerialPortService, type SerialPortOptions } from './services/SerialPortService'
import { IapUpgradeService } from './services/IapUpgradeService'
import type { IapUpgradeRequest } from '../../src/core/iap/IapUpgrade'
import {
  NetworkConnectionService,
  type NetworkConnectionOptions,
} from './services/NetworkConnectionService'
import {
  CameraCommandService,
  encodeCameraCommand,
  type CameraCommandRequest,
} from './services/CameraCommandService'
import { CameraCalibrationService } from './services/CameraCalibrationService'
import { CameraSshMeasurementChannel } from './services/CameraSshMeasurementChannel'
import { ReadParamsSniffer, type CameraParamSnapshot } from '../../src/core/camera/CameraParamReadback'

const serialService = new SerialPortService()
const networkService = new NetworkConnectionService()
const cameraCommandService = new CameraCommandService({
  write: (packet) => networkService.sendTcp(packet),
})
const measurementChannel = new CameraSshMeasurementChannel()
const cameraCalibrationService = new CameraCalibrationService({
  now: () => performance.now(),
  tcpTarget: () => networkService.getTcpTarget(),
  writeParams: async (content) => {
    await cameraCommandService.send({ subCommand: 'set_params', content, contentFormat: 'text' })
  },
  readbackParams: () => readbackParams(),
  startMeasurement: async (access) => {
    await measurementChannel.start(access, {
      onText: (text) => cameraCalibrationService.receive(text),
      onStatus: (state, detail) => cameraCalibrationService.measurementState(state, detail),
      onError: (message) => cameraCalibrationService.measurementFailed(message),
    })
  },
  stopMeasurement: () => measurementChannel.stopAndVerify(),
})

// ---- read_params 回读：8080 连接上的应答嗅探（标定期间控制通道独占，无并发竞争） ----
const controlDecoder = new TextDecoder('utf-8')
let readbackSniffer: ReadParamsSniffer | undefined
let readbackSettled: ((snapshot: CameraParamSnapshot) => void) | undefined
let readbackFailed: ((error: Error) => void) | undefined
let readbackTimer: ReturnType<typeof setTimeout> | undefined

function settleReadback(snapshot?: CameraParamSnapshot, error?: Error): void {
  const resolve = readbackSettled
  const reject = readbackFailed
  readbackSniffer = undefined
  readbackSettled = undefined
  readbackFailed = undefined
  if (readbackTimer) clearTimeout(readbackTimer)
  readbackTimer = undefined
  if (error) reject?.(error)
  else if (snapshot) resolve?.(snapshot)
  else reject?.(new Error('read_params 应答为空'))
}

async function readbackParams(): Promise<CameraParamSnapshot> {
  if (readbackSniffer) throw new Error('已有 read_params 回读请求进行中')
  if (!networkService.getTcpTarget()) throw new Error('相机控制连接不可用，无法回读参数')
  const packet = encodeCameraCommand({
    subCommand: 'read_params',
    content: '1',
    contentFormat: 'text',
  }).packet
  return new Promise<CameraParamSnapshot>((resolve, reject) => {
    readbackSniffer = new ReadParamsSniffer()
    readbackSettled = resolve
    readbackFailed = reject
    readbackTimer = setTimeout(() => settleReadback(undefined, new Error('回读超时：设备未响应 read_params')), 2500)
    networkService.sendTcp(packet).catch((error) =>
      settleReadback(undefined, error instanceof Error ? error : new Error(String(error))))
  })
}

networkService.onRawData((chunk) => {
  const text = controlDecoder.decode(chunk, { stream: true })
  if (readbackSniffer) {
    const parsed = readbackSniffer.push(text)
    if (parsed) settleReadback(parsed)
  }
})
const iapUpgradeService = new IapUpgradeService(serialService)

export interface SendDataChunkRequest {
  data: string
  format: 'hex' | 'ascii'
  transport: 'serial' | 'network'
}

const eventsMap = {
  'console-to-node': consoleToNode,
  'search-serial-ports': searchSerialPorts,
  'open-serial-port': openSerialPort,
  'close-serial-port': closeSerialPort,
  'send-serial-hex-data': sendSerialHexData,
  'send-serial-ascii-data': sendSerialAsciiData,
  'serial-data-format': changeSerialDataFormat,
  'open-network-connection': openNetworkConnection,
  'close-network-connection': closeNetworkConnection,
  'send-network-hex-data': sendNetworkHexData,
  'send-network-ascii-data': sendNetworkAsciiData,
  'camera-command-send': sendCameraCommand,
  'camera-calibration-read-params': readCameraParams,
  'send-data-chunk': sendDataChunk,
  'iap-upgrade-start': startIapUpgrade,
  'iap-upgrade-cancel': cancelIapUpgrade,
  'iap-upgrade-snapshot': getIapUpgradeSnapshot,
  'open-file-dialog': openFileDialog,
  'read-file-event': readFileEvent,
}

function consoleToNode(_event: IpcMainEvent, message: string) {
  console.log('From Renderer:', message)
}

function searchSerialPorts() {
  return serialService.listPorts()
}

function openSerialPort(event: IpcMainInvokeEvent, options: SerialPortOptions) {
  return serialService.open(options, {
    onData: (data) => event.sender.send('serial-data-to-renderer', data),
    onDisconnected: (path) => event.sender.send('serial-disconnected', { path }),
  })
}

function closeSerialPort(_event: IpcMainInvokeEvent, options: SerialPortOptions) {
  return serialService.close(options)
}

function sendSerialHexData(event: IpcMainEvent, data: string) {
  void sendSerialData(event, data, 'hex')
}

function sendSerialAsciiData(event: IpcMainEvent, data: string) {
  void sendSerialData(event, data, 'ascii')
}

async function sendSerialData(event: IpcMainEvent, data: string, format: 'hex' | 'ascii') {
  try {
    await serialService.send(data, format)
    event.sender.send('serial-send-success', { data })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    event.sender.send('serial-send-error', { error: message })
  }
}

function changeSerialDataFormat(_event: IpcMainEvent, format: string) {
  serialService.setDataFormat(format)
  networkService.setDataFormat(format)
}

function openNetworkConnection(event: IpcMainInvokeEvent, options: NetworkConnectionOptions) {
  cameraCalibrationService.stopForControlLinkChange('控制连接正在改变，已停止自动标定（观测保持运行）')
  return networkService.open(options, {
    onData: (data) => event.sender.send('network-data-to-renderer', data),
    onDisconnected: (connection, reason) => {
      cameraCalibrationService.stopForControlLinkChange('控制连接已断开，设备参数需人工核实')
      event.sender.send('network-disconnected', { ...connection, reason })
    },
  })
}

function closeNetworkConnection() {
  cameraCalibrationService.stopForControlLinkChange('控制连接已关闭，已停止自动标定（观测保持运行）')
  return networkService.close()
}

function sendNetworkHexData(event: IpcMainEvent, data: string) {
  void sendNetworkData(event, data, 'hex')
}

function sendNetworkAsciiData(event: IpcMainEvent, data: string) {
  void sendNetworkData(event, data, 'ascii')
}

async function sendNetworkData(event: IpcMainEvent, data: string, format: 'hex' | 'ascii') {
  try {
    await cameraCalibrationService.manual(() => networkService.send(data, format))
    event.sender.send('network-send-success', { data })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    event.sender.send('network-send-error', { error: message })
  }
}

function sendCameraCommand(_event: IpcMainInvokeEvent, request: CameraCommandRequest) {
  return cameraCalibrationService.manual(() => cameraCommandService.send(request))
}

/** 渲染端主动 read_params（进入相机参数窗口/数据接入连上时自动读取一次） */
function readCameraParams() {
  return cameraCalibrationService.manual(() => readbackParams())
}

async function sendDataChunk(
  _event: IpcMainInvokeEvent,
  request: SendDataChunkRequest,
): Promise<void> {
  const { data, format, transport } = request
  if (transport === 'network') {
    await cameraCalibrationService.manual(() => networkService.send(data, format))
    return
  }
  await serialService.send(data, format)
}

function startIapUpgrade(event: IpcMainInvokeEvent, request: IapUpgradeRequest) {
  return iapUpgradeService.start(event.sender, request)
}

function cancelIapUpgrade() {
  iapUpgradeService.cancel()
}

function getIapUpgradeSnapshot() {
  return iapUpgradeService.getSnapshot()
}

function openFileDialog() {
  return dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: '所有文件', extensions: ['*'] }],
  })
}

async function readFileEvent(event: IpcMainInvokeEvent, filePath: string) {
  try {
    const fileContent = await fs.promises.readFile(filePath, 'utf8')
    event.sender.send('read-file-success', fileContent)
  } catch (error) {
    event.sender.send('read-file-error', error instanceof Error ? error.message : String(error))
  }
}

export { eventsMap, iapUpgradeService, cameraCalibrationService }
