// @vitest-environment node
import { describe, expect, it } from 'vitest'
import ffmpegStatic from 'ffmpeg-static'
import { spawnSync } from 'node:child_process'
import { LabelVoter, recognizeLabels, type CameraLabel } from '@/core/camera/LabelOcr'
import { initRec } from '@/core/camera/PaddleRec'

function loadFrame(jpg: string): Uint8Array {
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    jpg,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    'pipe:1',
  ]
  const result = spawnSync((ffmpegStatic as unknown as string) || 'ffmpeg', args, {
    maxBuffer: 64 * 1024 * 1024,
  })
  return new Uint8Array(result.stdout)
}

describe('recognizeLabels(PP-OCR)', () => {
  it('识别真实帧中的检测框标签', async () => {
    const ok = await initRec(
      'resources/ocr/ch_PP-OCRv3_rec_infer.onnx',
      'resources/ocr/ppocr_keys_v1.txt',
    )
    expect(ok).toBe(true)

    const rgb = loadFrame('tmp/ocr-assets/local-live.jpg')
    const labels = await recognizeLabels(rgb, 640, 368)
    console.log('labels:', JSON.stringify(labels))
    expect(labels.length).toBeGreaterThanOrEqual(1)
    // 左标签数字部分应与实际内容一致(形如 10.78,2023,66)
    expect(labels[0].text).toMatch(/10\.78/)
    expect(labels[0].score).toBeGreaterThan(0.6)
  }, 120000)

  it('没有绿框时不产生标签', async () => {
    const rgb = new Uint8Array(320 * 120 * 3).fill(200)
    const labels = await recognizeLabels(rgb, 320, 120)
    expect(labels).toEqual([])
  }, 120000)
})

describe('LabelVoter', () => {
  const label = (text: string, score: number, x = 40): CameraLabel => ({ text, score, x, y: 10 })

  it('逐字符多数投票修正单帧随机错误', () => {
    const voter = new LabelVoter()
    voter.push([label('10.68,2023,66', 0.9)])
    voter.push([label('10.78,2023,66', 0.9)])
    voter.push([label('10.78,2023,66', 0.9)])
    expect(voter.getStable()).toEqual(['10.78,2023,66'])
  })

  it('过短/噪声条目不参与投票', () => {
    const voter = new LabelVoter()
    voter.push([label('10.78,2023,66', 0.95)])
    voter.push([label('???', 0.3)])
    expect(voter.getStable()).toEqual(['10.78,2023,66'])
  })

  it('不同位置分桶独立返回', () => {
    const voter = new LabelVoter()
    voter.push([label('10.11,1.0,11', 0.9, 40), label('20.22,1.0,22', 0.88, 200)])
    expect(voter.getStable()).toEqual(['10.11,1.0,11', '20.22,1.0,22'])
  })

  it('标签长期未出现会被清除', () => {
    const voter = new LabelVoter(40, 6, 2)
    voter.push([label('10.99,9.9,99', 0.9)])
    voter.push([])
    voter.push([])
    voter.push([])
    expect(voter.getStable()).toEqual([])
  })
})
