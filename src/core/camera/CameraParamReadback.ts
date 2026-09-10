/**
 * 8080 `read_params` 应答解析与参数回读核对。
 *
 * 实测应答为裸文本（无包头）：`2.1.0.250930seg15, 0.550,1.087,-21.500`
 * 即 `版本, height(m), fov(rad), thetaOffset(°)`。注意 FOV 在设备内存中为弧度，
 * 而 set_params 内容与界面单位为角度——核对只做同通道前后对比，不做跨通道换算。
 */

export interface CameraParamSnapshot {
  version: string
  height: number
  fov: number
  thetaOffset: number
  /** 原始应答文本 */
  raw: string
}

export const READ_PARAMS_PATTERN =
  /^(\S+),\s*([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)\s*$/;

export function parseReadParamsResponse(text: string): CameraParamSnapshot | undefined {
  const match = READ_PARAMS_PATTERN.exec(text.trim())
  if (!match) return undefined
  const height = Number(match[2])
  const fov = Number(match[3])
  const thetaOffset = Number(match[4])
  if (![height, fov, thetaOffset].every((value) => Number.isFinite(value))) return undefined
  return { version: match[1], height, fov, thetaOffset, raw: text.trim() }
}

/** read_params 流式应答缓冲：从原始字节文本中嗅探参数应答行 */
export class ReadParamsSniffer {
  private buffer = ''

  public push(chunk: string): CameraParamSnapshot | undefined {
    this.buffer = (this.buffer + chunk).slice(-2048)
    for (const line of this.buffer.split(/\r?\n/)) {
      const parsed = parseReadParamsResponse(line)
      if (parsed) {
        this.buffer = ''
        return parsed
      }
    }
    // 无换行的裸应答：整段缓冲尝试一次
    const parsed = parseReadParamsResponse(this.buffer)
    if (parsed) this.buffer = ''
    return parsed
  }
}

const EPSILON = 0.002;

/** 三个数值项在浮点三位舍入容差内一致 */
export function paramsMatch(a: CameraParamSnapshot, b: CameraParamSnapshot): boolean {
  return (
    Math.abs(a.height - b.height) <= EPSILON &&
    Math.abs(a.fov - b.fov) <= EPSILON &&
    Math.abs(a.thetaOffset - b.thetaOffset) <= EPSILON
  )
}
