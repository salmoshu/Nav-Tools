// @vitest-environment node

import net from 'node:net'
import { describe, expect, it } from 'vitest'
import {
  CAMERA_COMMAND_PREFIX,
  CAMERA_LOGIN_COMMAND,
  CameraCommandService,
  encodeCameraCommand,
} from '../../electron/main/services/CameraCommandService'

describe('CameraCommandService', () => {
  it('encodes the Python client protocol with a padded 16-byte sub-command', () => {
    const encoded = encodeCameraCommand({
      host: '192.168.3.14',
      port: 8080,
      subCommand: 'bbox_draw',
      content: '06 04 02',
      contentFormat: 'hex',
    })

    expect(encoded.packet.readUInt32LE(0)).toBe(CAMERA_COMMAND_PREFIX)
    expect(encoded.packet.readUInt32LE(4)).toBe(CAMERA_LOGIN_COMMAND)
    expect(encoded.packet.readUInt16LE(8)).toBe(19)
    expect(encoded.packet.subarray(10, 26).toString('hex')).toBe('62626f785f6472617700000000000000')
    expect(encoded.packet.subarray(26)).toEqual(Buffer.from([0x06, 0x04, 0x02]))
  })

  it('sends one TCP command and returns the first server response', async () => {
    let resolvePacket: (packet: Buffer) => void = () => undefined
    const receivedPacket = new Promise<Buffer>((resolve) => {
      resolvePacket = resolve
    })
    const server = net.createServer((socket) => {
      socket.once('data', (packet) => {
        resolvePacket(packet)
        socket.end('camera-ok')
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('TCP test server did not bind')

    const result = await new CameraCommandService().send({
      host: '127.0.0.1',
      port: address.port,
      subCommand: 'read_params',
      content: 'request',
      contentFormat: 'text',
    })

    expect(result.response).toBe('camera-ok')
    expect(result.responseHex).toBe(Buffer.from('camera-ok').toString('hex').toUpperCase())
    expect((await receivedPacket).toString('hex').toUpperCase()).toBe(result.packetHex)
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('rejects incomplete hexadecimal bytes before opening a connection', () => {
    expect(() =>
      encodeCameraCommand({
        host: '127.0.0.1',
        port: 8080,
        subCommand: 'bbox_draw',
        content: 'ABC',
        contentFormat: 'hex',
      }),
    ).toThrow('十六进制内容必须由完整的字节组成')
  })
})
