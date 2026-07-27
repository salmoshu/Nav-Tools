export type SatelliteRendererKind = 'webgl2' | 'webgl1' | 'canvas'
export type SatelliteSeriesColor = readonly [number, number, number, number]
export type SatelliteSeriesPoint = readonly [number, number] | null | undefined
export type SatelliteSeriesInput = Float32Array | ReadonlyArray<SatelliteSeriesPoint>

export interface SatelliteLineSegment {
  /** First vertex in the packed XY buffer. */
  start: number
  /** Number of connected vertices. */
  count: number
}

/** Either objects or a compact [start, count, start, count, ...] list. */
export type SatelliteSeriesSegments =
  ReadonlyArray<SatelliteLineSegment> | ReadonlyArray<number> | Uint32Array

export interface SatelliteSeriesGeometry {
  xy: Float32Array
  segments: SatelliteLineSegment[]
  sourcePointCount: number
  startsWithValidPoint: boolean
  endsWithValidPoint: boolean
}

export interface SatelliteTimeSeriesRenderer {
  readonly kind: SatelliteRendererKind
  init(canvas: HTMLCanvasElement): boolean
  addSeries(id: string, color?: SatelliteSeriesColor): void
  removeSeries(id: string): void
  setSeriesData(id: string, xy: SatelliteSeriesInput, segments?: SatelliteSeriesSegments): void
  appendSeriesData(id: string, xy: SatelliteSeriesInput, segments?: SatelliteSeriesSegments): void
  setSeriesVisible(id: string, visible: boolean): void
  setSeriesColor(id: string, color: SatelliteSeriesColor): void
  clearSeries(id: string): void
  clear(): void
  setViewport(xMin: number, xMax: number, yMin: number, yMax: number): void
  fitToData(): void
  setLineWidth(px: number): void
  resize(width: number, height: number): void
  /** Compatibility alias for the other renderers in this directory. */
  onResize(width: number, height: number): void
  /** Data mutation is deliberately render-free; callers render once after a multi-series batch. */
  render(): void
  dispose(): void
}

interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

interface SeriesBase {
  id: string
  color: [number, number, number, number]
  visible: boolean
  vertexData: Float32Array
  vertexCount: number
  capacity: number
  segments: SatelliteLineSegment[]
  endsWithValidPoint: boolean
  bounds: Bounds | null
}

interface WebGLSeriesState extends SeriesBase {
  buffer: WebGLBuffer | null
}

const FLOATS_PER_VERTEX = 2
const BYTES_PER_FLOAT = 4
const INITIAL_CAPACITY = 1024
const DEFAULT_COLOR: SatelliteSeriesColor = [1, 1, 1, 1]

const WEBGL1_VERTEX_SHADER = `
attribute vec2 a_position;
uniform mat3 u_transform;
void main() {
  vec3 position = u_transform * vec3(a_position, 1.0);
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const WEBGL1_FRAGMENT_SHADER = `
precision mediump float;
uniform vec4 u_color;
void main() {
  gl_FragColor = u_color;
}
`

const WEBGL2_VERTEX_SHADER = `#version 300 es
in vec2 a_position;
uniform mat3 u_transform;
void main() {
  vec3 position = u_transform * vec3(a_position, 1.0);
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const WEBGL2_FRAGMENT_SHADER = `#version 300 es
precision mediump float;
uniform vec4 u_color;
out vec4 fragColor;
void main() {
  fragColor = u_color;
}
`

function inputPointCount(input: SatelliteSeriesInput): number {
  return input instanceof Float32Array ? Math.floor(input.length / FLOATS_PER_VERTEX) : input.length
}

function readPoint(input: SatelliteSeriesInput, index: number): readonly [number, number] | null {
  if (input instanceof Float32Array) {
    return [input[index * FLOATS_PER_VERTEX], input[index * FLOATS_PER_VERTEX + 1]]
  }
  return input[index] ?? null
}

function normalizeSegments(
  segments: SatelliteSeriesSegments,
  pointCount: number,
): SatelliteLineSegment[] {
  const normalized: SatelliteLineSegment[] = []
  if (segments.length === 0) return normalized

  if (typeof segments[0] === 'number') {
    const flat = segments as ReadonlyArray<number> | Uint32Array
    for (let i = 0; i + 1 < flat.length; i += 2) {
      const start = Math.max(0, Math.min(pointCount, Math.floor(flat[i])))
      const count = Math.max(0, Math.min(pointCount - start, Math.floor(flat[i + 1])))
      if (count > 0) normalized.push({ start, count })
    }
  } else {
    for (const item of segments as ReadonlyArray<SatelliteLineSegment>) {
      const start = Math.max(0, Math.min(pointCount, Math.floor(item.start)))
      const count = Math.max(0, Math.min(pointCount - start, Math.floor(item.count)))
      if (count > 0) normalized.push({ start, count })
    }
  }

  normalized.sort((a, b) => a.start - b.start)
  return normalized
}

/**
 * Packs finite XY pairs and derives LINE_STRIP ranges. Invalid points split a
 * line, so missing epochs never get connected. Explicit ranges are useful for
 * LOD output that has already identified its discontinuities.
 */
export function buildSatelliteSeriesGeometry(
  input: SatelliteSeriesInput,
  explicitSegments?: SatelliteSeriesSegments,
): SatelliteSeriesGeometry {
  const sourcePointCount = inputPointCount(input)
  const ranges = explicitSegments
    ? normalizeSegments(explicitSegments, sourcePointCount)
    : sourcePointCount > 0
      ? [{ start: 0, count: sourcePointCount }]
      : []
  const packed: number[] = []
  const segments: SatelliteLineSegment[] = []

  let firstSourceIndex = -1
  let lastSourceIndex = -1
  let active: SatelliteLineSegment | null = null

  for (const range of ranges) {
    active = null
    const end = range.start + range.count
    for (let sourceIndex = range.start; sourceIndex < end; sourceIndex++) {
      const point = readPoint(input, sourceIndex)
      const x = point?.[0] ?? Number.NaN
      const y = point?.[1] ?? Number.NaN
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        active = null
        continue
      }

      const packedIndex = packed.length / FLOATS_PER_VERTEX
      packed.push(x, y)
      if (!active) {
        active = { start: packedIndex, count: 0 }
        segments.push(active)
      }
      active.count++
      if (firstSourceIndex < 0) firstSourceIndex = sourceIndex
      lastSourceIndex = sourceIndex
    }
  }

  return {
    xy: new Float32Array(packed),
    segments,
    sourcePointCount,
    startsWithValidPoint: firstSourceIndex === 0,
    endsWithValidPoint: sourcePointCount > 0 && lastSourceIndex === sourcePointCount - 1,
  }
}

function copyColor(color: SatelliteSeriesColor): [number, number, number, number] {
  return [color[0], color[1], color[2], color[3]]
}

function updateBounds(bounds: Bounds | null, xy: Float32Array): Bounds | null {
  let next = bounds
  for (let i = 0; i < xy.length; i += FLOATS_PER_VERTEX) {
    const x = xy[i]
    const y = xy[i + 1]
    if (!next) {
      next = { minX: x, maxX: x, minY: y, maxY: y }
    } else {
      next.minX = Math.min(next.minX, x)
      next.maxX = Math.max(next.maxX, x)
      next.minY = Math.min(next.minY, y)
      next.maxY = Math.max(next.maxY, y)
    }
  }
  return next
}

function appendGeometry(state: SeriesBase, geometry: SatelliteSeriesGeometry): number {
  const startVertex = state.vertexCount
  const addedVertices = geometry.xy.length / FLOATS_PER_VERTEX
  if (addedVertices > 0) {
    state.vertexData.set(geometry.xy, startVertex * FLOATS_PER_VERTEX)

    let firstSegmentIndex = 0
    if (
      state.endsWithValidPoint &&
      geometry.startsWithValidPoint &&
      state.segments.length > 0 &&
      geometry.segments.length > 0 &&
      geometry.segments[0].start === 0
    ) {
      state.segments[state.segments.length - 1].count += geometry.segments[0].count
      firstSegmentIndex = 1
    }
    for (let i = firstSegmentIndex; i < geometry.segments.length; i++) {
      const segment = geometry.segments[i]
      state.segments.push({ start: startVertex + segment.start, count: segment.count })
    }
    state.bounds = updateBounds(state.bounds, geometry.xy)
    state.vertexCount += addedVertices
  }

  if (geometry.sourcePointCount > 0) {
    state.endsWithValidPoint = geometry.endsWithValidPoint
  }
  return addedVertices
}

abstract class SatelliteRendererBase {
  protected viewport: Bounds = { minX: 0, maxX: 1, minY: 0, maxY: 1 }
  protected transform = new Float32Array([2, 0, 0, 0, 2, 0, -1, -1, 1])
  protected lineWidth = 1
  protected dpr = 1
  protected cssWidth = 0
  protected cssHeight = 0
  protected canvasWidth = 0
  protected canvasHeight = 0

  setViewport(xMin: number, xMax: number, yMin: number, yMax: number): void {
    if (![xMin, xMax, yMin, yMax].every(Number.isFinite) || xMin === xMax || yMin === yMax) return
    this.viewport = { minX: xMin, maxX: xMax, minY: yMin, maxY: yMax }
    this.transform[0] = 2 / (xMax - xMin)
    this.transform[1] = 0
    this.transform[2] = 0
    this.transform[3] = 0
    this.transform[4] = 2 / (yMax - yMin)
    this.transform[5] = 0
    this.transform[6] = -(xMax + xMin) / (xMax - xMin)
    this.transform[7] = -(yMax + yMin) / (yMax - yMin)
    this.transform[8] = 1
  }

  setLineWidth(px: number): void {
    if (Number.isFinite(px)) this.lineWidth = Math.max(0.1, px)
  }

  abstract fitToData(): void
}

/**
 * Time-series renderer optimized for a handful of long, monotonic satellite
 * count series. Each series has one XY-only GPU buffer and one uniform color.
 */
export class WebGLSatelliteTimeSeriesRenderer
  extends SatelliteRendererBase
  implements SatelliteTimeSeriesRenderer
{
  private canvas: HTMLCanvasElement | null = null
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vertexShader: WebGLShader | null = null
  private fragmentShader: WebGLShader | null = null
  private positionLoc = -1
  private transformLoc: WebGLUniformLocation | null = null
  private colorLoc: WebGLUniformLocation | null = null
  private series = new Map<string, WebGLSeriesState>()
  private seriesOrder: string[] = []
  private backendKind: 'webgl2' | 'webgl1' = 'webgl1'

  get kind(): 'webgl2' | 'webgl1' {
    return this.backendKind
  }

  init(canvas: HTMLCanvasElement): boolean {
    this.dispose()
    this.canvas = canvas

    let gl: WebGLRenderingContext | WebGL2RenderingContext | null = canvas.getContext(
      'webgl2',
    ) as WebGL2RenderingContext | null
    const isWebGL2 = Boolean(gl)
    if (!gl) gl = canvas.getContext('webgl') as WebGLRenderingContext | null
    if (!gl) {
      this.canvas = null
      return false
    }
    this.gl = gl
    this.backendKind = isWebGL2 ? 'webgl2' : 'webgl1'

    const vertexShader = this.compileShader(
      gl.VERTEX_SHADER,
      isWebGL2 ? WEBGL2_VERTEX_SHADER : WEBGL1_VERTEX_SHADER,
    )
    const fragmentShader = this.compileShader(
      gl.FRAGMENT_SHADER,
      isWebGL2 ? WEBGL2_FRAGMENT_SHADER : WEBGL1_FRAGMENT_SHADER,
    )
    if (!vertexShader || !fragmentShader) {
      this.dispose()
      return false
    }

    const program = gl.createProgram()
    if (!program) {
      this.dispose()
      return false
    }
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program)
      this.dispose()
      return false
    }

    this.program = program
    this.vertexShader = vertexShader
    this.fragmentShader = fragmentShader
    this.positionLoc = gl.getAttribLocation(program, 'a_position')
    this.transformLoc = gl.getUniformLocation(program, 'u_transform')
    this.colorLoc = gl.getUniformLocation(program, 'u_color')
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    this.resize(canvas.width || 300, canvas.height || 150)
    return true
  }

  addSeries(id: string, color: SatelliteSeriesColor = DEFAULT_COLOR): void {
    this.removeSeries(id)
    const state: WebGLSeriesState = {
      id,
      color: copyColor(color),
      visible: true,
      vertexData: new Float32Array(0),
      vertexCount: 0,
      capacity: 0,
      segments: [],
      endsWithValidPoint: false,
      bounds: null,
      buffer: this.gl?.createBuffer() ?? null,
    }
    this.series.set(id, state)
    this.seriesOrder.push(id)
  }

  removeSeries(id: string): void {
    const state = this.series.get(id)
    if (!state) return
    if (this.gl && state.buffer) this.gl.deleteBuffer(state.buffer)
    this.series.delete(id)
    const index = this.seriesOrder.indexOf(id)
    if (index >= 0) this.seriesOrder.splice(index, 1)
  }

  setSeriesData(id: string, input: SatelliteSeriesInput, segments?: SatelliteSeriesSegments): void {
    const state = this.getOrCreateSeries(id)
    const geometry = buildSatelliteSeriesGeometry(input, segments)
    state.vertexCount = 0
    state.segments = []
    state.endsWithValidPoint = false
    state.bounds = null
    const vertexCount = geometry.xy.length / FLOATS_PER_VERTEX
    this.ensureCapacity(state, vertexCount)
    appendGeometry(state, geometry)
    this.uploadRange(state, 0, vertexCount)
  }

  appendSeriesData(
    id: string,
    input: SatelliteSeriesInput,
    segments?: SatelliteSeriesSegments,
  ): void {
    const state = this.getOrCreateSeries(id)
    const geometry = buildSatelliteSeriesGeometry(input, segments)
    const start = state.vertexCount
    const added = geometry.xy.length / FLOATS_PER_VERTEX
    this.ensureCapacity(state, start + added)
    appendGeometry(state, geometry)
    this.uploadRange(state, start, added)
  }

  setSeriesVisible(id: string, visible: boolean): void {
    const state = this.series.get(id)
    if (state) state.visible = visible
  }

  setSeriesColor(id: string, color: SatelliteSeriesColor): void {
    const state = this.series.get(id)
    if (state) state.color = copyColor(color)
  }

  clearSeries(id: string): void {
    const state = this.series.get(id)
    if (!state) return
    state.vertexCount = 0
    state.segments = []
    state.endsWithValidPoint = false
    state.bounds = null
  }

  clear(): void {
    for (const state of this.series.values()) this.clearSeries(state.id)
  }

  fitToData(): void {
    const bounds = this.combinedBounds()
    if (!bounds) return
    const padX = Math.max(1e-9, (bounds.maxX - bounds.minX) * 0.05)
    const padY = Math.max(1e-9, (bounds.maxY - bounds.minY) * 0.05)
    this.setViewport(bounds.minX - padX, bounds.maxX + padX, bounds.minY - padY, bounds.maxY + padY)
  }

  resize(width: number, height: number): void {
    this.cssWidth = Math.max(0, width)
    this.cssHeight = Math.max(0, height)
    this.dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
    this.canvasWidth = Math.max(0, Math.round(this.cssWidth * this.dpr))
    this.canvasHeight = Math.max(0, Math.round(this.cssHeight * this.dpr))
    if (this.canvas) {
      this.canvas.width = this.canvasWidth
      this.canvas.height = this.canvasHeight
      this.canvas.style.width = `${this.cssWidth}px`
      this.canvas.style.height = `${this.cssHeight}px`
    }
    this.gl?.viewport(0, 0, this.canvasWidth, this.canvasHeight)
  }

  onResize(width: number, height: number): void {
    this.resize(width, height)
  }

  render(): void {
    if (!this.gl || !this.program) return
    const gl = this.gl
    gl.viewport(0, 0, this.canvasWidth, this.canvasHeight)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(this.program)
    if (this.transformLoc) gl.uniformMatrix3fv(this.transformLoc, false, this.transform)
    gl.lineWidth(this.lineWidth * this.dpr)

    for (const id of this.seriesOrder) {
      const state = this.series.get(id)
      if (!state || !state.visible || !state.buffer || state.vertexCount === 0) continue
      gl.bindBuffer(gl.ARRAY_BUFFER, state.buffer)
      if (this.positionLoc >= 0) {
        gl.enableVertexAttribArray(this.positionLoc)
        gl.vertexAttribPointer(this.positionLoc, FLOATS_PER_VERTEX, gl.FLOAT, false, 0, 0)
      }
      if (this.colorLoc) gl.uniform4fv(this.colorLoc, state.color)
      for (const segment of state.segments) {
        if (segment.count >= 2) gl.drawArrays(gl.LINE_STRIP, segment.start, segment.count)
      }
    }
  }

  dispose(): void {
    if (this.gl) {
      for (const state of this.series.values()) {
        if (state.buffer) this.gl.deleteBuffer(state.buffer)
      }
      if (this.program) this.gl.deleteProgram(this.program)
      if (this.vertexShader) this.gl.deleteShader(this.vertexShader)
      if (this.fragmentShader) this.gl.deleteShader(this.fragmentShader)
    }
    this.series.clear()
    this.seriesOrder = []
    this.gl = null
    this.program = null
    this.vertexShader = null
    this.fragmentShader = null
    this.canvas = null
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null
    const shader = this.gl.createShader(type)
    if (!shader) return null
    this.gl.shaderSource(shader, source)
    this.gl.compileShader(shader)
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      this.gl.deleteShader(shader)
      return null
    }
    return shader
  }

  private getOrCreateSeries(id: string): WebGLSeriesState {
    let state = this.series.get(id)
    if (!state) {
      this.addSeries(id)
      state = this.series.get(id)!
    }
    return state
  }

  private ensureCapacity(state: WebGLSeriesState, needed: number): void {
    if (needed <= state.capacity) return
    let capacity = Math.max(INITIAL_CAPACITY, state.capacity || INITIAL_CAPACITY)
    while (capacity < needed) capacity *= 2
    const vertexData = new Float32Array(capacity * FLOATS_PER_VERTEX)
    vertexData.set(state.vertexData.subarray(0, state.vertexCount * FLOATS_PER_VERTEX))
    state.vertexData = vertexData
    state.capacity = capacity
    if (this.gl && state.buffer) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, state.buffer)
      this.gl.bufferData(this.gl.ARRAY_BUFFER, vertexData.byteLength, this.gl.DYNAMIC_DRAW)
      if (state.vertexCount > 0) this.uploadRange(state, 0, state.vertexCount)
    }
  }

  private uploadRange(state: WebGLSeriesState, start: number, count: number): void {
    if (!this.gl || !state.buffer || count <= 0) return
    const first = start * FLOATS_PER_VERTEX
    const last = (start + count) * FLOATS_PER_VERTEX
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, state.buffer)
    this.gl.bufferSubData(
      this.gl.ARRAY_BUFFER,
      first * BYTES_PER_FLOAT,
      state.vertexData.subarray(first, last),
    )
  }

  private combinedBounds(): Bounds | null {
    let combined: Bounds | null = null
    for (const state of this.series.values()) {
      if (!state.bounds) continue
      if (!combined) {
        combined = { ...state.bounds }
      } else {
        combined.minX = Math.min(combined.minX, state.bounds.minX)
        combined.maxX = Math.max(combined.maxX, state.bounds.maxX)
        combined.minY = Math.min(combined.minY, state.bounds.minY)
        combined.maxY = Math.max(combined.maxY, state.bounds.maxY)
      }
    }
    return combined
  }
}

/** Canvas 2D fallback with the same packed geometry and explicit-render API. */
export class CanvasSatelliteTimeSeriesRenderer
  extends SatelliteRendererBase
  implements SatelliteTimeSeriesRenderer
{
  readonly kind = 'canvas' as const
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private series = new Map<string, SeriesBase>()
  private seriesOrder: string[] = []

  init(canvas: HTMLCanvasElement): boolean {
    this.dispose()
    const ctx = canvas.getContext('2d')
    if (!ctx) return false
    this.canvas = canvas
    this.ctx = ctx
    this.resize(canvas.width || 300, canvas.height || 150)
    return true
  }

  addSeries(id: string, color: SatelliteSeriesColor = DEFAULT_COLOR): void {
    this.removeSeries(id)
    this.series.set(id, {
      id,
      color: copyColor(color),
      visible: true,
      vertexData: new Float32Array(0),
      vertexCount: 0,
      capacity: 0,
      segments: [],
      endsWithValidPoint: false,
      bounds: null,
    })
    this.seriesOrder.push(id)
  }

  removeSeries(id: string): void {
    if (!this.series.delete(id)) return
    const index = this.seriesOrder.indexOf(id)
    if (index >= 0) this.seriesOrder.splice(index, 1)
  }

  setSeriesData(id: string, input: SatelliteSeriesInput, segments?: SatelliteSeriesSegments): void {
    const state = this.getOrCreateSeries(id)
    const geometry = buildSatelliteSeriesGeometry(input, segments)
    state.vertexCount = 0
    state.segments = []
    state.endsWithValidPoint = false
    state.bounds = null
    this.ensureCapacity(state, geometry.xy.length / FLOATS_PER_VERTEX)
    appendGeometry(state, geometry)
  }

  appendSeriesData(
    id: string,
    input: SatelliteSeriesInput,
    segments?: SatelliteSeriesSegments,
  ): void {
    const state = this.getOrCreateSeries(id)
    const geometry = buildSatelliteSeriesGeometry(input, segments)
    this.ensureCapacity(state, state.vertexCount + geometry.xy.length / FLOATS_PER_VERTEX)
    appendGeometry(state, geometry)
  }

  setSeriesVisible(id: string, visible: boolean): void {
    const state = this.series.get(id)
    if (state) state.visible = visible
  }

  setSeriesColor(id: string, color: SatelliteSeriesColor): void {
    const state = this.series.get(id)
    if (state) state.color = copyColor(color)
  }

  clearSeries(id: string): void {
    const state = this.series.get(id)
    if (!state) return
    state.vertexCount = 0
    state.segments = []
    state.endsWithValidPoint = false
    state.bounds = null
  }

  clear(): void {
    for (const state of this.series.values()) this.clearSeries(state.id)
  }

  fitToData(): void {
    let bounds: Bounds | null = null
    for (const state of this.series.values()) {
      if (!state.bounds) continue
      if (!bounds) bounds = { ...state.bounds }
      else {
        bounds.minX = Math.min(bounds.minX, state.bounds.minX)
        bounds.maxX = Math.max(bounds.maxX, state.bounds.maxX)
        bounds.minY = Math.min(bounds.minY, state.bounds.minY)
        bounds.maxY = Math.max(bounds.maxY, state.bounds.maxY)
      }
    }
    if (!bounds) return
    const padX = Math.max(1e-9, (bounds.maxX - bounds.minX) * 0.05)
    const padY = Math.max(1e-9, (bounds.maxY - bounds.minY) * 0.05)
    this.setViewport(bounds.minX - padX, bounds.maxX + padX, bounds.minY - padY, bounds.maxY + padY)
  }

  resize(width: number, height: number): void {
    this.cssWidth = Math.max(0, width)
    this.cssHeight = Math.max(0, height)
    this.dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
    this.canvasWidth = Math.max(0, Math.round(this.cssWidth * this.dpr))
    this.canvasHeight = Math.max(0, Math.round(this.cssHeight * this.dpr))
    if (this.canvas) {
      this.canvas.width = this.canvasWidth
      this.canvas.height = this.canvasHeight
      this.canvas.style.width = `${this.cssWidth}px`
      this.canvas.style.height = `${this.cssHeight}px`
    }
  }

  onResize(width: number, height: number): void {
    this.resize(width, height)
  }

  render(): void {
    if (!this.ctx) return
    const ctx = this.ctx
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight)
    ctx.lineWidth = this.lineWidth
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    const xSpan = this.viewport.maxX - this.viewport.minX
    const ySpan = this.viewport.maxY - this.viewport.minY
    if (xSpan === 0 || ySpan === 0) return

    for (const id of this.seriesOrder) {
      const state = this.series.get(id)
      if (!state || !state.visible) continue
      const [r, g, b, a] = state.color
      ctx.strokeStyle = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(
        b * 255,
      )}, ${a})`
      for (const segment of state.segments) {
        if (segment.count < 2) continue
        ctx.beginPath()
        for (let i = 0; i < segment.count; i++) {
          const offset = (segment.start + i) * FLOATS_PER_VERTEX
          const x = ((state.vertexData[offset] - this.viewport.minX) / xSpan) * this.cssWidth
          const y =
            this.cssHeight -
            ((state.vertexData[offset + 1] - this.viewport.minY) / ySpan) * this.cssHeight
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
    }
  }

  dispose(): void {
    this.series.clear()
    this.seriesOrder = []
    this.ctx = null
    this.canvas = null
  }

  private getOrCreateSeries(id: string): SeriesBase {
    let state = this.series.get(id)
    if (!state) {
      this.addSeries(id)
      state = this.series.get(id)!
    }
    return state
  }

  private ensureCapacity(state: SeriesBase, needed: number): void {
    if (needed <= state.capacity) return
    let capacity = Math.max(INITIAL_CAPACITY, state.capacity || INITIAL_CAPACITY)
    while (capacity < needed) capacity *= 2
    const vertexData = new Float32Array(capacity * FLOATS_PER_VERTEX)
    vertexData.set(state.vertexData.subarray(0, state.vertexCount * FLOATS_PER_VERTEX))
    state.vertexData = vertexData
    state.capacity = capacity
  }
}
