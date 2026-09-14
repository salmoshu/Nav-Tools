// 回放时钟：playhead 推进、速度、循环、边界。
// 时间单位一律为纳秒（板上 CLOCK_MONOTONIC，非 epoch；数值上远小于 2^53，可用 number 精确表示）。

export interface PlayerClockTick {
  /** 本 tick 是否到达过末端 */
  endReached: boolean
  /** loop 开启时是否发生了回卷 */
  wrapped: boolean
}

export class PlayerClock {
  private playheadValue: number
  private playingValue = false
  private speedValue = 1
  private loopValue = false

  public constructor(
    private readonly startNs: number,
    private readonly endNs: number,
  ) {
    this.playheadValue = startNs
  }

  public get playheadNs(): number {
    return this.playheadValue
  }

  public get playing(): boolean {
    return this.playingValue
  }

  public get speed(): number {
    return this.speedValue
  }

  public get loop(): boolean {
    return this.loopValue
  }

  public play(): void {
    if (this.startNs === this.endNs) return
    if (!this.playingValue && this.playheadValue >= this.endNs) {
      this.playheadValue = this.startNs
    }
    this.playingValue = true
  }

  public pause(): void {
    this.playingValue = false
  }

  public toggle(): void {
    if (this.playingValue) this.pause()
    else this.play()
  }

  /** 速度倍率（0.1~16 之外的值收敛到边界）。 */
  public setSpeed(speed: number): void {
    this.speedValue = Math.min(16, Math.max(0.1, Number.isFinite(speed) ? speed : 1))
  }

  public setLoop(loop: boolean): void {
    this.loopValue = loop
  }

  /** seek 到任意时刻（自动夹在 [start,end] 内）。 */
  public seek(timeNs: number): void {
    this.playheadValue = clamp(timeNs, this.startNs, this.endNs)
  }

  /**
   * 推进 playhead。dtMs 为真实流逝毫秒；speed 决定推进倍率。
   * 末尾行为：loop=false 时停在末端并返回 endReached；loop=true 时回卷到起点。
   */
  public tick(dtMs: number): PlayerClockTick {
    const result: PlayerClockTick = { endReached: false, wrapped: false }
    if (!this.playingValue || dtMs <= 0) return result
    const next = this.playheadValue + dtMs * 1e6 * this.speedValue
    if (next >= this.endNs) {
      result.endReached = true
      if (this.loopValue) {
        this.playheadValue = this.startNs
        result.wrapped = true
      } else {
        this.playheadValue = this.endNs
        this.playingValue = false
      }
    } else {
      this.playheadValue = next
    }
    return result
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}
