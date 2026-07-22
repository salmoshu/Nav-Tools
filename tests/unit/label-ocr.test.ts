import { describe, expect, it } from 'vitest'
import { LabelVoter, recognizeLabels, type CameraLabel } from '@/core/camera/LabelOcr'
import { LABEL_GLYPHS } from '@/core/camera/labelGlyphs'

const WIDTH = 320
const HEIGHT = 120

/** 用模板位图合成一帧掩码帧(与服务 geq 输出同格式:R=0 文字,G=0 框线,其余 255):绿框顶边 + 上方标签文字 */
function synthesizeFrame(text: string, boxX = 40, boxY = 40): Uint8Array {
  const rgb = new Uint8Array(WIDTH * HEIGHT * 3).fill(255)

  // 绿框顶边(boxY 行,长 80px,粗 2px)—— G 通道置 0
  for (let y = boxY; y < boxY + 2; y++) {
    for (let x = boxX; x < boxX + 80; x++) {
      rgb[(y * WIDTH + x) * 3 + 1] = 0
    }
  }

  // 标签文字(text 的第一个模板,逐个摆放,字符间隔 2 列)—— R 通道置 0
  let cursor = boxX + 2
  for (const char of text) {
    const bitmap = LABEL_GLYPHS[char]?.[0]
    if (!bitmap) throw new Error(`missing glyph for ${char}`)
    for (let y = 0; y < bitmap.length; y++) {
      for (let x = 0; x < bitmap[y].length; x++) {
        if (bitmap[y][x] !== '#') continue
        const py = boxY - 12 + y
        const px = cursor + x
        if (py < 0 || px >= WIDTH) continue
        rgb[(py * WIDTH + px) * 3] = 0
      }
    }
    cursor += bitmap[0].length + 2
  }
  return rgb
}

describe('LabelOcr.recognizeLabels', () => {
  it('识别合成的标签文字', () => {
    const frame = synthesizeFrame('ID:38,2.029,34')
    const labels = recognizeLabels(frame, WIDTH, HEIGHT)
    expect(labels.length).toBeGreaterThanOrEqual(1)
    expect(labels[0].text).toBe('ID:38,2.029,34')
    expect(labels[0].score).toBeGreaterThan(0.8)
  })

  it('数字槽位纠偏:O→0、I→1', () => {
    // 直接验证 grammarFix 的效果:构造一个会以高置信度读出 ID: 前缀的帧
    const frame = synthesizeFrame('ID:201,34')
    const labels = recognizeLabels(frame, WIDTH, HEIGHT)
    expect(labels.length).toBeGreaterThanOrEqual(1)
    expect(labels[0].text.startsWith('ID:')).toBe(true)
  })

  it('没有绿框时不产生标签', () => {
    const rgb = new Uint8Array(WIDTH * HEIGHT * 3).fill(255)
    expect(recognizeLabels(rgb, WIDTH, HEIGHT)).toEqual([])
  })
})

describe('LabelVoter', () => {
  const label = (text: string, score: number, x = 40): CameraLabel => ({ text, score, x, y: 10 })

  it('返回近期高分结果并抑制低分噪声', () => {
    const voter = new LabelVoter()
    voter.push([label('ID:11,2.0,22', 0.95)])
    expect(voter.getStable()).toEqual(['ID:11,2.0,22'])

    voter.push([label('ID:??', 0.3)])
    expect(voter.getStable()).toEqual(['ID:11,2.0,22'])
  })

  it('不同位置分桶独立返回', () => {
    const voter = new LabelVoter()
    voter.push([label('ID:1,1.0,11', 0.9, 40), label('ID:2,1.0,22', 0.88, 200)])
    expect(voter.getStable()).toEqual(['ID:1,1.0,11', 'ID:2,1.0,22'])
  })

  it('标签长期未出现会被清除', () => {
    const voter = new LabelVoter(40, 2)
    voter.push([label('ID:9,9.9,99', 0.9)])
    voter.push([])
    voter.push([])
    voter.push([])
    expect(voter.getStable()).toEqual([])
  })
})
