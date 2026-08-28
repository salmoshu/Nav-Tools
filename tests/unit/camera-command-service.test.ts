// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import {
  CAMERA_COMMAND_PREFIX,
  CAMERA_LOGIN_COMMAND,
  CameraCommandService,
  encodeCameraCommand,
} from '../../electron/main/services/CameraCommandService'

describe('CameraCommandService', () => {
  it('encodes the Python client protocol with a padded 16-byte sub-command', () => {
    const encoded = encodeCameraCommand({
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

  it('writes the encoded packet through the toolbar-owned TCP transport', async () => {
    const write = vi.fn(async (_packet: Uint8Array) => undefined)
    const result = await new CameraCommandService({ write }).send({
      subCommand: 'read_params',
      content: 'request',
      contentFormat: 'text',
    })

    expect(write).toHaveBeenCalledOnce()
    expect(Buffer.from(write.mock.calls[0][0]).toString('hex').toUpperCase()).toBe(result.packetHex)
    expect(result).not.toHaveProperty('response')
    expect(result).not.toHaveProperty('responseHex')
  })

  it('reports a disconnected toolbar TCP transport instead of opening another connection', async () => {
    const service = new CameraCommandService({
      write: vi.fn(async () => {
        throw new Error('工具栏 TCP 连接不可用')
      }),
    })

    await expect(
      service.send({
        subCommand: 'set_params',
        content: '0.55,62.292,-20',
        contentFormat: 'text',
      }),
    ).rejects.toThrow('工具栏 TCP 连接不可用')
  })

  it('rejects incomplete hexadecimal bytes before opening a connection', () => {
    expect(() =>
      encodeCameraCommand({
        subCommand: 'bbox_draw',
        content: 'ABC',
        contentFormat: 'hex',
      }),
    ).toThrow('十六进制内容必须由完整的字节组成')
  })
})
