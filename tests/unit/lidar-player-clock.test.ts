// 回放时钟单元测试。
import { describe, expect, it } from 'vitest'
import { PlayerClock } from '../../src/core/lidar/PlayerClock'
import { bestCandidate, parseDwaScores } from '../../src/core/lidar/DwaScores'

describe('PlayerClock', () => {
  const START = 0
  const END = 10_000_000_000 // 10s

  it('tick 按速度推进', () => {
    const clock = new PlayerClock(START, END)
    clock.play()
    expect(clock.tick(100).endReached).toBe(false)
    expect(clock.playheadNs).toBe(100_000_000) // 100ms × 1x = 0.1s
    clock.setSpeed(2)
    clock.tick(100)
    expect(clock.playheadNs).toBe(300_000_000)
  })

  it('暂停时 tick 不推进', () => {
    const clock = new PlayerClock(START, END)
    clock.play()
    clock.pause()
    clock.tick(100)
    expect(clock.playheadNs).toBe(START)
  })

  it('到末端停止并报告 endReached', () => {
    const clock = new PlayerClock(START, END)
    clock.play()
    clock.seek(END - 50_000_000)
    const result = clock.tick(100)
    expect(result.endReached).toBe(true)
    expect(clock.playing).toBe(false)
    expect(clock.playheadNs).toBe(END)
  })

  it('循环模式回卷到起点', () => {
    const clock = new PlayerClock(START, END)
    clock.setLoop(true)
    clock.play()
    clock.seek(END - 50_000_000)
    const result = clock.tick(100)
    expect(result.wrapped).toBe(true)
    expect(clock.playing).toBe(true)
    expect(clock.playheadNs).toBe(START)
  })

  it('seek 夹在边界内；末端 play 重新从起点开始', () => {
    const clock = new PlayerClock(START, END)
    clock.seek(99_000_000_000)
    expect(clock.playheadNs).toBe(END)
    clock.play()
    expect(clock.playheadNs).toBe(START)
  })

  it('速度倍率收敛到 [0.1, 16]', () => {
    const clock = new PlayerClock(START, END)
    clock.setSpeed(0)
    expect(clock.speed).toBe(0.1)
    clock.setSpeed(999)
    expect(clock.speed).toBe(16)
    clock.setSpeed(Number.NaN)
    expect(clock.speed).toBe(1)
  })
})

describe('parseDwaScores', () => {
  it('解析板上真实样例', () => {
    const text =
      '{"frame":1,"plan_seq":1,"success":true,"best":0,"samples":12,"evaluated":9,' +
      '"early_terminated":true,"cache_hits":0,"plan_ms":3.823671,' +
      '"window":[0,0.1,-0.1,0.1],"cmd":{"v":0.1,"w":0},' +
      '"candidates":[' +
      '{"i":0,"v":0.1,"w":0,"h":0.8,"obs":6,"vel":0.29,"cm":0,"bonus":0.3,"tot":7.39},' +
      '{"i":1,"v":0.1,"w":-0.05,"collision":true}' +
      ']}'
    const scores = parseDwaScores(text)
    expect(scores).toBeDefined()
    expect(scores!.success).toBe(true)
    expect(scores!.best).toBe(0)
    expect(scores!.window).toEqual([0, 0.1, -0.1, 0.1])
    expect(scores!.candidates).toHaveLength(2)
    expect(scores!.candidates[0].tot).toBeCloseTo(7.39)
    expect(scores!.candidates[1].collision).toBe(true)
    expect(scores!.candidates[1].h).toBeUndefined()
    expect(bestCandidate(scores!)?.i).toBe(0)
  })

  it('坏输入返回 undefined', () => {
    expect(parseDwaScores('not json')).toBeUndefined()
    expect(parseDwaScores('{"no":"candidates"}')).toBeUndefined()
    expect(parseDwaScores('123')).toBeUndefined()
  })

  it('无解帧：best=-1', () => {
    const scores = parseDwaScores(
      '{"frame":109,"plan_seq":109,"success":false,"best":-1,"samples":12,"evaluated":12,' +
        '"early_terminated":false,"cache_hits":0,"plan_ms":2.5,"window":[0,0,-0.1,0.1],' +
        '"cmd":{"v":0,"w":0},"candidates":[{"i":0,"v":0,"w":0,"collision":true}]}',
    )
    expect(scores!.success).toBe(false)
    expect(bestCandidate(scores!)).toBeUndefined()
  })
})
