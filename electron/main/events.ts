import fs from 'node:fs'
import { dialog, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { SerialPortService, type SerialPortOptions } from './services/SerialPortService'
import {
  NetworkConnectionService,
  type NetworkConnectionOptions,
} from './services/NetworkConnectionService'

const serialService = new SerialPortService()
const networkService = new NetworkConnectionService()

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
  'send-data-chunk': sendDataChunk,
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
    onData: data => event.sender.send('serial-data-to-renderer', data),
    onDisconnected: path => event.sender.send('serial-disconnected', { path }),
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
  return networkService.open(options, {
    onData: data => event.sender.send('network-data-to-renderer', data),
    onDisconnected: (connection, reason) => {
      event.sender.send('network-disconnected', { ...connection, reason })
    },
  })
}

function closeNetworkConnection() {
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
    await networkService.send(data, format)
    event.sender.send('network-send-success', { data })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    event.sender.send('network-send-error', { error: message })
  }
}

async function sendDataChunk(_event: IpcMainInvokeEvent, request: SendDataChunkRequest): Promise<void> {
  const { data, format, transport } = request
  if (transport === 'network') {
    await networkService.send(data, format)
    return
  }
  await serialService.send(data, format)
}

function openFileDialog() {
  return dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: '所有文件', extensions: ['*'] }],
  })
}

async function readFileEvent(event: IpcMainEvent, filePath: string) {
  try {
    const fileContent = await fs.promises.readFile(filePath, 'utf8')
    event.sender.send('read-file-success', fileContent)
  } catch (error) {
    event.sender.send('read-file-error', error instanceof Error ? error.message : String(error))
  }
}

export { eventsMap }
