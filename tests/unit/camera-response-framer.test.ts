import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CameraResponseFramer } from '../../src/core/camera/CameraResponseFramer'

describe('CameraResponseFramer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('read_params 无换行应答在空闲后独立输出并补换行', () => {
    const output: string[] = []
    const framer = new CameraResponseFramer((text) => output.push(text))
    framer.request('read_params')

    framer.push('2.1.0.250930seg16, 0.555,1.128,-20.448')
    expect(output).toEqual([])
    vi.advanceTimersByTime(49)
    expect(output).toEqual([])
    vi.advanceTimersByTime(1)

    expect(output).toEqual(['2.1.0.250930seg16, 0.555,1.128,-20.448\n'])
  })

  it('同一 TCP 块中的两条粘连应答按请求拆成两条', () => {
    const output: string[] = []
    const framer = new CameraResponseFramer((text) => output.push(text))
    framer.request('read_params')
    framer.request('set_calibParam')

    framer.push('2.1.0.250930seg16, 0.555,1.128,-20.448set calibParam successful')

    expect(output).toEqual([
      '2.1.0.250930seg16, 0.555,1.128,-20.448\n',
      'set calibParam successful\n',
    ])
  })

  it('set calibParam successful 跨多个分片时只输出一条', () => {
    const output: string[] = []
    const framer = new CameraResponseFramer((text) => output.push(text))
    framer.request('set_calibParam')

    framer.push('set calib')
    vi.advanceTimersByTime(20)
    framer.push('Param success')
    vi.advanceTimersByTime(20)
    framer.push('ful')

    expect(output).toEqual(['set calibParam successful\n'])
    vi.advanceTimersByTime(100)
    expect(output).toHaveLength(1)
  })

  it('没有登记请求时保持原始数据透传', () => {
    const output: string[] = []
    const framer = new CameraResponseFramer((text) => output.push(text))

    framer.push('2.1.0.250930seg13, 0.550,1.087,-19.700')
    framer.push('set calibParam successful')
    vi.advanceTimersByTime(100)

    expect(output).toEqual([
      '2.1.0.250930seg13, 0.550,1.087,-19.700',
      'set calibParam successful',
    ])
  })

  it('写入失败撤销请求后，后续无请求数据不被缓存或补换行', () => {
    const output: string[] = []
    const framer = new CameraResponseFramer((text) => output.push(text))
    framer.request('set_calibParam')
    framer.cancelRequest('set_calibParam')

    framer.push('unsolicited')
    vi.advanceTimersByTime(100)

    expect(output).toEqual(['unsolicited'])
  })

  it('reset 清除待应答请求和旧空闲计时器', () => {
    const output: string[] = []
    const framer = new CameraResponseFramer((text) => output.push(text))
    framer.request('read_params')
    framer.push('stale response')

    framer.reset()
    vi.advanceTimersByTime(100)
    expect(output).toEqual([])

    framer.push('new connection data')
    expect(output).toEqual(['new connection data'])
  })
})
