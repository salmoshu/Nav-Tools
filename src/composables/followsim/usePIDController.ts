import { ref } from 'vue'

export interface PIDParams {
  kp: number
  ki: number
  kd: number
}

export class PIDController {
  private params: PIDParams
  private lastError: number = 0
  private integral: number = 0
  private readonly integralLimit: number = 5

  constructor(params: PIDParams) {
    this.params = { ...params }
  }

  update(error: number, dt: number): number {
    this.integral = Math.max(-this.integralLimit, Math.min(this.integralLimit, this.integral + error * dt))
    const derivative = dt > 0 ? (error - this.lastError) / dt : 0
    this.lastError = error
    return this.params.kp * error + this.params.ki * this.integral + this.params.kd * derivative
  }

  reset(): void {
    this.lastError = 0
    this.integral = 0
  }

  updateParams(params: Partial<PIDParams>): void {
    Object.assign(this.params, params)
  }
}

export function usePIDController(initialParams: PIDParams) {
  const controller = ref(new PIDController(initialParams))
  
  const updateParams = (params: Partial<PIDParams>) => {
    controller.value.updateParams(params)
  }

  const reset = () => {
    controller.value.reset()
  }

  return {
    controller: controller.value,
    updateParams,
    reset
  }
}