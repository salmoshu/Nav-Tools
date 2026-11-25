// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { solveRtcmSppFile } from '@/core/gnss/RtcmSppFile'

const worker = vi.hoisted(() => ({ request: vi.fn(), close: vi.fn() }))
vi.mock('@/core/gnss/RtcmSppSession', () => ({
  RtcmSppSession: class {
    request = worker.request
    close = worker.close
  },
}))

describe('RTCM3 file messages without a working SPP solver', () => {
  it('continues reading original bytes from the failure point without duplicating a chunk', async () => {
    const source = new Uint8Array(256 * 1024 + 12).fill(0x25)
    source.set([0xd3, 0x00, 0x02], source.length - 12)
    const file = new File([source], 'raw.rtcm3')
    worker.request.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Solver unavailable'))
    const monitored: Buffer[] = []
    const onNmea = vi.fn()

    await expect(
      solveRtcmSppFile(
        { data: file },
        onNmea,
        () => {},
        (chunk) => {
          monitored.push(Buffer.from(chunk))
        },
      ),
    ).rejects.toThrow('Solver unavailable')
    expect(Buffer.concat(monitored)).toEqual(Buffer.from(source))
    expect(onNmea).not.toHaveBeenCalled()
    expect(worker.close).toHaveBeenCalledOnce()
  })
})
