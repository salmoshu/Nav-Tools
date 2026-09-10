import { describe, expect, it } from 'vitest'
import { CameraCalibrationService } from '../../electron/main/services/CameraCalibrationService'
import type {
  CameraMeasurementAccess,
  CameraMeasurementTeardown,
} from '../../electron/main/services/CameraSshMeasurementChannel'
import type { CameraCalibrationHost } from '../../electron/main/services/CameraCalibrationService'
import type { CameraCalibrationConfig } from '../../src/core/camera/CameraCalibrationTypes'

class FakeHost implements Partial<CameraCalibrationHost> {
  public channelOpen = false
  public startCalls = 0
  public stopCalls = 0
  public writes: string[] = []
  public failWrites = false
  public device = { version: 'test', height: 0.55, fov: 1.087, thetaOffset: -21.5, raw: 'test' }
  private ticks = 0

  public now(): number {
    this.ticks += 100
    return this.ticks
  }

  public tcpTarget(): { host: string; port: number } | undefined {
    return { host: '192.168.3.14', port: 8080 }
  }

  /** 模拟设备：set_params 后内存参数随之更新（fov 在设备侧为弧度） */
  public async writeParams(content: string): Promise<void> {
    if (this.failWrites) throw new Error('模拟写入失败')
    this.writes.push(content)
    const [height, fovDeg, offset] = content.split(',').map(Number)
    this.device = {
      ...this.device, height, thetaOffset: offset,
      fov: (fovDeg * Math.PI) / 180,
      raw: `test, ${height},${(fovDeg * Math.PI) / 180},${offset}`,
    }
  }

  public async readbackParams() {
    return { ...this.device }
  }

  public async startMeasurement(_access: CameraMeasurementAccess): Promise<void> {
    if (this.channelOpen) throw new Error('测量通道已存在，请先停止')
    this.channelOpen = true
    this.startCalls++
  }

  public async stopMeasurement(): Promise<CameraMeasurementTeardown> {
    this.channelOpen = false
    this.stopCalls++
    return { straceCleared: true, tracerPidZero: true, tracerPid: '0', detail: '' }
  }
}

const ACCESS: CameraMeasurementAccess = {
  host: '192.168.3.14', port: 22, username: 'root', password: 'x',
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('CameraCalibrationService 观测生命周期', () => {
  it('停止观测后可以立即重新观测(纯观测路径必须拆除测量通道)', async () => {
    const host = new FakeHost()
    const service = new CameraCalibrationService(host as unknown as CameraCalibrationHost)

    await service.observe(1, ACCESS)
    expect(host.channelOpen).toBe(true)

    service.close(1)
    await flushMicrotasks()
    expect(host.channelOpen).toBe(false)

    await expect(service.observe(1, ACCESS)).resolves.toBeDefined()
    expect(host.startCalls).toBe(2)
  })

  it('观测前置拆除能清理陈旧通道(即使上一轮未正常关闭)', async () => {
    const host = new FakeHost()
    const service = new CameraCalibrationService(host as unknown as CameraCalibrationHost)
    host.channelOpen = true // 模拟遗留的陈旧通道

    await expect(service.observe(1, ACCESS)).resolves.toBeDefined()
    expect(host.startCalls).toBe(1)
    expect(host.channelOpen).toBe(true)
  })

  it('窗口关闭会释放观测权, 其他窗口随后可观测', async () => {
    const host = new FakeHost()
    const service = new CameraCalibrationService(host as unknown as CameraCalibrationHost)

    await service.observe(1, ACCESS)
    service.close(1)
    await flushMicrotasks()

    await expect(service.observe(2, ACCESS)).resolves.toBeDefined()
  })
})

// ---- 启动门控与 OFFSET 基线自动同步 ----
function sentence(payload: string): string {
  let checksum = 0
  for (const char of payload) checksum ^= char.charCodeAt(0)
  return `$${payload}*${checksum.toString(16).padStart(2, '0')}\r\n`
}

const TWO_PEOPLE = sentence(
  'ESTAR,INSSEG,240601.120000.123,1,42,2,0,10,10,20,100,200,1.260,-5.000,0,11,200,20,300,200,2.030,5.000',
)

function calConfig(overrides: Partial<CameraCalibrationConfig> = {}): CameraCalibrationConfig {
  return {
    height: 0.55, fov: 62.292, initialOffset: -21.5,
    minOffset: -25, maxOffset: -18, step: 1, minStep: 0.2,
    targets: [
      { distance: 1.2, biasMinCm: 2, biasMaxCm: 6 },
      { distance: 2, biasMinCm: 2, biasMaxCm: 6 },
    ],
    nearSide: 'left', personClassId: 0, sampleCount: 3, windowMs: 200, maxSpreadM: 0.04,
    settleMs: 500, staleMs: 1000, maxWrites: 12, maxDurationMs: 120000,
    ...overrides,
  }
}

describe('CameraCalibrationService 启动门控与 OFFSET 自动同步', () => {
  async function readyToStart(host: FakeHost): Promise<CameraCalibrationService> {
    const service = new CameraCalibrationService(host as unknown as CameraCalibrationHost)
    await service.observe(1, ACCESS)
    service.receive(TWO_PEOPLE)
    return service
  }

  it('三项参数全部一致时不写参数直接启动', async () => {
    const host = new FakeHost()
    const service = await readyToStart(host)
    const state = await service.start(1, calConfig())
    expect(state.phase).toBe('sampling')
    expect(host.writes).toEqual([])
    expect(state.originalParams).toBe('0.55,62.292,-21.5')
  })

  it('设备 height 与表单不一致时拒绝启动且不写参数', async () => {
    const host = new FakeHost()
    host.device.height = 0.6
    const service = await readyToStart(host)
    await expect(service.start(1, calConfig())).rejects.toThrow(/几何参数/)
    expect(host.writes).toEqual([])
  })

  it('设备 FOV 与表单不一致时拒绝启动且不写参数', async () => {
    const host = new FakeHost()
    host.device.fov = 1.2
    const service = await readyToStart(host)
    await expect(service.start(1, calConfig())).rejects.toThrow(/几何参数/)
    expect(host.writes).toEqual([])
  })

  it('OFFSET 基线不一致时自动下发表单值同步再启动, 恢复基准保留设备原值', async () => {
    const host = new FakeHost()
    host.device.thetaOffset = -20
    const service = await readyToStart(host)
    const state = await service.start(1, calConfig())
    expect(state.phase).toBe('sampling')
    expect(host.writes).toEqual(['0.55,62.292,-21.5'])
    expect(host.device.thetaOffset).toBe(-21.5)
    expect(state.originalParams).toBe('0.55,62.292,-20')
    expect(state.lastSentParams).toBe('0.55,62.292,-21.5')
  })

  it('OFFSET 基线同步写入失败时拒绝启动并保留恢复基准', async () => {
    const host = new FakeHost()
    host.device.thetaOffset = -20
    host.failWrites = true
    const service = await readyToStart(host)
    await expect(service.start(1, calConfig())).rejects.toThrow(/基线同步失败/)
    expect(service.snapshot().phase).not.toBe('sampling')
    expect(service.snapshot().originalParams).toBe('0.55,62.292,-20')
  })
})
