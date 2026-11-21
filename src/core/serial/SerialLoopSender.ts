export const SERIAL_LOOP_SEND_MIN_HZ = 0.1
export const SERIAL_LOOP_SEND_MAX_HZ = 100

export function validateSerialLoopFrequency(value: number): number {
  if (
    !Number.isFinite(value) ||
    value < SERIAL_LOOP_SEND_MIN_HZ ||
    value > SERIAL_LOOP_SEND_MAX_HZ
  ) {
    throw new RangeError(
      `Frequency must be between ${SERIAL_LOOP_SEND_MIN_HZ} and ${SERIAL_LOOP_SEND_MAX_HZ} Hz`,
    )
  }
  return value
}

export class SerialLoopSender {
  private timer: ReturnType<typeof setInterval> | undefined

  get running(): boolean {
    return this.timer !== undefined
  }

  start(frequencyHz: number, send: () => void): void {
    const frequency = validateSerialLoopFrequency(frequencyHz)
    this.stop()
    const tick = () => {
      try {
        send()
      } catch {
        this.stop()
      }
    }
    this.timer = setInterval(tick, Math.max(1, Math.round(1000 / frequency)))
    tick()
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer)
    this.timer = undefined
  }
}
