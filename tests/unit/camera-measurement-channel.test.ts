import { describe, expect, it } from 'vitest'
import { StraceFrameExtractor } from '@/core/camera/StraceFrameExtractor'
import { InssegParser } from '@/core/camera/InssegParser'
import {
  parseReadParamsResponse,
  paramsMatch,
  ReadParamsSniffer,
  type CameraParamSnapshot,
} from '@/core/camera/CameraParamReadback'

// 2026-09-10 在 192.168.3.14 上 strace 实采的真实报文
const REAL_FRAME = '$ESTAR,INSSEG,240618.055416.674,245625,245625,1,0,390,1038,0,1425,603,1.215,16.901*49'

function straceLine(payload: string): string {
  return `[pid  761] write(13</dev/ttyS6>, "${payload}", 84) = 84`
}

describe('StraceFrameExtractor', () => {
  it('从单帧 strace 行还原 INSSEG 报文', () => {
    const extractor = new StraceFrameExtractor()
    const text = extractor.push(`${straceLine(REAL_FRAME + '\\r\\n')}\n`)
    expect(text).toBe(REAL_FRAME + '\r\n')
  })

  it('剥除 [pid] 前缀且忽略非 ttyS6 写入', () => {
    const extractor = new StraceFrameExtractor()
    const noise = '[pid  761] write(5</tmp/log>, "ESTAR,INSSEG,fake*00\\n", 18) = 18\n'
    const text = extractor.push(noise + straceLine(REAL_FRAME + '\\r\\n') + '\n')
    expect(text).toBe(REAL_FRAME + '\r\n')
  })

  it('单次 write 多帧全部还原', () => {
    const extractor = new StraceFrameExtractor()
    const second = '$ESTAR,INSSEG,240618.055416.695,245626,245626,1,0,390,1037,0,1422,602,1.217,16.784*4e'
    const text = extractor.push(straceLine(`${REAL_FRAME}\\r\\n${second}\\r\\n`) + '\n')
    expect(text.split('\r\n').filter(Boolean)).toEqual([REAL_FRAME, second])
  })

  it('跨块断开的记录在补齐后才输出', () => {
    const extractor = new StraceFrameExtractor()
    const full = straceLine(REAL_FRAME + '\\r\\n') + '\n'
    const head = extractor.push(full.slice(0, 40))
    expect(head).toBe('')
    const tail = extractor.push(full.slice(40))
    expect(tail).toBe(REAL_FRAME + '\r\n')
  })

  it('还原后的报文可通过 InssegParser 校验', () => {
    const extractor = new StraceFrameExtractor()
    const parser = new InssegParser()
    const results = parser.push(extractor.push(straceLine(REAL_FRAME + '\\r\\n') + '\n'))
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('frame')
    if (results[0].type === 'frame') {
      expect(results[0].frame.targets).toHaveLength(1)
      expect(results[0].frame.targets[0].distance).toBeCloseTo(1.215, 3)
    }
  })
})

describe('read_params 应答解析', () => {
  // 2026-09-10 实测应答：'2.1.0.250930seg15, 0.550,1.087,-21.500'
  const SAMPLE = '2.1.0.250930seg15, 0.550,1.087,-21.500'

  it('解析版本与三个参数', () => {
    const parsed = parseReadParamsResponse(SAMPLE)
    expect(parsed).toBeDefined()
    expect(parsed!.version).toBe('2.1.0.250930seg15')
    expect(parsed!.height).toBeCloseTo(0.55, 3)
    expect(parsed!.fov).toBeCloseTo(1.087, 3)
    expect(parsed!.thetaOffset).toBeCloseTo(-21.5, 3)
  })

  it('拒绝非参数应答文本', () => {
    expect(parseReadParamsResponse('Unknown command')).toBeUndefined()
    expect(parseReadParamsResponse('')).toBeUndefined()
  })

  it('嗅探器支持带换行与裸文本两种到达方式', () => {
    const lined = new ReadParamsSniffer()
    expect(lined.push(`noise\n${SAMPLE}\n`)?.thetaOffset).toBeCloseTo(-21.5, 3)
    const bare = new ReadParamsSniffer()
    expect(bare.push(SAMPLE.slice(0, 10))).toBeUndefined()
    expect(bare.push(SAMPLE.slice(10))?.raw).toBe(SAMPLE)
  })

  it('paramsMatch 在三位舍入容差内判同', () => {
    const base = parseReadParamsResponse(SAMPLE)!
    const rounded: CameraParamSnapshot = { ...base, thetaOffset: base.thetaOffset + 0.0009 }
    expect(paramsMatch(base, rounded)).toBe(true)
    const drifted: CameraParamSnapshot = { ...base, thetaOffset: base.thetaOffset + 0.01 }
    expect(paramsMatch(base, drifted)).toBe(false)
  })
})
