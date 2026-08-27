import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CanvasTrajectoryRenderer } from '../../src/core/render/CanvasTrajectoryRenderer'
import { createTrajectoryRenderer } from '../../src/core/render/createTrajectoryRenderer'
import {
  TrajectoryRenderer,
  WebGLTrajectoryRenderer,
} from '../../src/core/render/TrajectoryRenderer'

function createMockWebGLContext() {
  return {
    ARRAY_BUFFER: 34962,
    COLOR_BUFFER_BIT: 16384,
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    POINTS: 0,
    FLOAT: 5126,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    DYNAMIC_DRAW: 35048,

    createBuffer: vi.fn(() => ({ __id: 'buffer' })),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    bufferSubData: vi.fn(),

    createShader: vi.fn((type: number) => ({ __id: `shader-${type}` })),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
    deleteShader: vi.fn(),

    createProgram: vi.fn(() => ({ __id: 'program' })),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ''),
    useProgram: vi.fn(),
    deleteProgram: vi.fn(),

    getAttribLocation: vi.fn((_, name: string) => (name === 'a_position' ? 0 : 1)),
    getUniformLocation: vi.fn((_, name: string) => ({ __name: name })),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),

    uniformMatrix3fv: vi.fn(),
    uniform1f: vi.fn(),

    viewport: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    drawArrays: vi.fn(),
    enable: vi.fn(),
    blendFunc: vi.fn(),

    BLEND: 3042,
    SRC_ALPHA: 770,
    ONE_MINUS_SRC_ALPHA: 771,

    deleteBuffer: vi.fn(),
    getExtension: vi.fn(() => null),

    // WebGL2-only marker used by the renderer to choose the shader version.
    drawArraysInstanced: vi.fn(),
  }
}

function createMockCanvasWebGL(gl: ReturnType<typeof createMockWebGLContext>) {
  const canvas = document.createElement('canvas')
  canvas.getContext = vi.fn((type: string) => {
    if (type === 'webgl2') return gl
    return null
  }) as unknown as HTMLCanvasElement['getContext']
  return canvas
}

function createMockCanvas2DContext() {
  return {
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    fillStyle: '',
    canvas: { width: 300, height: 150 },
  }
}

function createMockCanvas2D(ctx: ReturnType<typeof createMockCanvas2DContext>) {
  const canvas = document.createElement('canvas')
  canvas.getContext = vi.fn((type: string) => {
    if (type === '2d') return ctx
    return null
  }) as unknown as HTMLCanvasElement['getContext']
  return canvas
}

describe('WebGLTrajectoryRenderer', () => {
  it('returns false when WebGL is unavailable', () => {
    const canvas = document.createElement('canvas')
    canvas.getContext = vi.fn(() => null) as unknown as HTMLCanvasElement['getContext']
    const renderer = new WebGLTrajectoryRenderer()
    expect(renderer.init(canvas)).toBe(false)
  })

  it('draws 100k points with a single drawArrays after fitToData', () => {
    const gl = createMockWebGLContext()
    const canvas = createMockCanvasWebGL(gl)
    const renderer = new WebGLTrajectoryRenderer()
    expect(renderer.init(canvas)).toBe(true)

    const points: Array<[number, number, number]> = []
    for (let i = 0; i < 100_000; i++) {
      points.push([Math.random() * 100, Math.random() * 100, Math.random()])
    }

    gl.bufferData.mockClear()
    gl.bufferSubData.mockClear()
    gl.drawArrays.mockClear()

    renderer.addPointsBatch(points)

    // Batch upload: exactly one bufferSubData covering the whole new range.
    expect(gl.bufferSubData).toHaveBeenCalledTimes(1)
    const [, offset, uploaded] = gl.bufferSubData.mock.calls[0]
    expect(offset).toBe(0)
    expect(uploaded.length).toBe(100_000 * 6)

    // No draw during batch insertion.
    expect(gl.drawArrays).not.toHaveBeenCalled()

    renderer.fitToData()
    expect(gl.drawArrays).toHaveBeenCalledTimes(1)
    expect(gl.drawArrays).toHaveBeenLastCalledWith(gl.POINTS, 0, 100_000)
  })

  it('uses incremental bufferSubData for single-point adds', () => {
    const gl = createMockWebGLContext()
    const canvas = createMockCanvasWebGL(gl)
    const renderer = new WebGLTrajectoryRenderer()
    renderer.init(canvas)

    gl.bufferSubData.mockClear()
    renderer.addPoint(1, 2, 0.5)
    renderer.addPoint(3, 4, 0.6)
    renderer.addPoint(5, 6, 0.7)

    expect(gl.bufferSubData).toHaveBeenCalledTimes(3)
  })

  it('setViewport only changes the transform uniform, not the buffer', () => {
    const gl = createMockWebGLContext()
    const canvas = createMockCanvasWebGL(gl)
    const renderer = new WebGLTrajectoryRenderer()
    renderer.init(canvas)

    renderer.addPointsBatch([
      [0, 0, 1],
      [10, 10, 0.5],
    ])
    renderer.fitToData()

    gl.bufferData.mockClear()
    gl.bufferSubData.mockClear()
    gl.uniformMatrix3fv.mockClear()

    renderer.setViewport(-5, 15, -5, 15)

    expect(gl.uniformMatrix3fv).toHaveBeenCalledTimes(1)
    expect(gl.bufferData).not.toHaveBeenCalled()
    expect(gl.bufferSubData).not.toHaveBeenCalled()
  })

  it('recomputes color buffer when color mapper changes', () => {
    const gl = createMockWebGLContext()
    const canvas = createMockCanvasWebGL(gl)
    const renderer = new WebGLTrajectoryRenderer()
    renderer.init(canvas)
    renderer.addPointsBatch([
      [0, 0, 0.2],
      [10, 10, 0.8],
    ])

    gl.bufferSubData.mockClear()
    renderer.setColorMapper((q) => [q, q, q, 1])
    expect(gl.bufferSubData).toHaveBeenCalled()
  })

  it('pickPoint locates nearest point among 100k points in under 1ms', () => {
    const gl = createMockWebGLContext()
    const canvas = createMockCanvasWebGL(gl)
    const renderer = new WebGLTrajectoryRenderer()
    renderer.init(canvas)

    const points: Array<[number, number, number]> = []
    for (let i = 0; i < 100_000; i++) {
      points.push([Math.random() * 1000, Math.random() * 1000, i / 100_000])
    }
    renderer.addPointsBatch(points)
    renderer.fitToData()

    // 多次采样取最小值，消除共享机器上的调度抖动（单次计时易受并行测试干扰）
    let result: unknown = null
    let elapsed = Infinity
    for (let i = 0; i < 100; i++) {
      const start = performance.now()
      result = renderer.pickPoint(150, 75)
      elapsed = Math.min(elapsed, performance.now() - start)
    }

    expect(result).not.toBeNull()
    expect(elapsed).toBeLessThan(1)
  })

  it('returns null from pickPoint when no points exist', () => {
    const gl = createMockWebGLContext()
    const canvas = createMockCanvasWebGL(gl)
    const renderer = new WebGLTrajectoryRenderer()
    renderer.init(canvas)
    expect(renderer.pickPoint(150, 75)).toBeNull()
  })

  it('render triggers a drawArrays call', () => {
    const gl = createMockWebGLContext()
    const canvas = createMockCanvasWebGL(gl)
    const renderer = new WebGLTrajectoryRenderer()
    renderer.init(canvas)
    renderer.addPointsBatch([
      [0, 0, 1],
      [10, 10, 0.5],
    ])
    renderer.fitToData()

    gl.drawArrays.mockClear()
    renderer.render()
    expect(gl.drawArrays).toHaveBeenCalledTimes(1)
  })
})

describe('CanvasTrajectoryRenderer', () => {
  let ctx: ReturnType<typeof createMockCanvas2DContext>
  let canvas: HTMLCanvasElement
  let renderer: CanvasTrajectoryRenderer

  beforeEach(() => {
    ctx = createMockCanvas2DContext()
    canvas = createMockCanvas2D(ctx)
    renderer = new CanvasTrajectoryRenderer()
    renderer.init(canvas)
    // Reset spies so init/setup calls do not leak into assertions.
    ctx.clearRect.mockClear()
    ctx.beginPath.mockClear()
    ctx.arc.mockClear()
    ctx.fill.mockClear()
    ctx.setTransform.mockClear()
  })

  it('init always returns true', () => {
    expect(renderer.init(canvas)).toBe(true)
  })

  it('addPoint appends without clearing the canvas', () => {
    renderer.addPoint(10, 20, 0.5)
    expect(ctx.clearRect).not.toHaveBeenCalled()
    expect(ctx.beginPath).toHaveBeenCalled()
    expect(ctx.arc).toHaveBeenCalledWith(10, 20, 1, 0, Math.PI * 2)
    expect(ctx.fill).toHaveBeenCalled()
  })

  it('setViewport triggers a full redraw with clearRect', () => {
    renderer.addPoint(10, 20, 0.5)
    ctx.clearRect.mockClear()
    ctx.arc.mockClear()

    renderer.setViewport(0, 100, 0, 100)
    expect(ctx.clearRect).toHaveBeenCalled()
    expect(ctx.arc).toHaveBeenCalledWith(10, 20, 1, 0, Math.PI * 2)
  })

  it('pickPoint returns the nearest point', () => {
    renderer.addPoint(50, 50, 0.9)
    renderer.addPoint(10, 10, 0.1)
    renderer.setViewport(0, 100, 0, 100)

    // Canvas 300x150, viewport [0,100]x[0,100].
    // Screen center maps to data (50, 50).
    const result = renderer.pickPoint(150, 75)
    expect(result).not.toBeNull()
    expect(result!.x).toBe(50)
    expect(result!.y).toBe(50)
    expect(result!.quality).toBe(0.9)
  })

  it('clear removes all points', () => {
    renderer.addPoint(1, 2, 0.5)
    renderer.clear()
    renderer.setViewport(0, 100, 0, 100)
    expect(renderer.pickPoint(150, 75)).toBeNull()
  })

  it('render triggers a full redraw', () => {
    renderer.addPoint(1, 2, 0.5)
    ctx.clearRect.mockClear()
    renderer.render()
    expect(ctx.clearRect).toHaveBeenCalled()
  })
})

describe('createTrajectoryRenderer factory', () => {
  it('returns a WebGL renderer when WebGL2 context is available', () => {
    const gl = createMockWebGLContext()
    const canvas = createMockCanvasWebGL(gl)
    const renderer = createTrajectoryRenderer(canvas)
    expect(renderer).toBeInstanceOf(WebGLTrajectoryRenderer)
  })

  it('returns a Canvas renderer when no WebGL context is available', () => {
    const ctx = createMockCanvas2DContext()
    const canvas = document.createElement('canvas')
    canvas.getContext = vi.fn((type: string) => {
      if (type === 'webgl2' || type === 'webgl') return null
      if (type === '2d') return ctx
      return null
    }) as unknown as HTMLCanvasElement['getContext']

    const renderer = createTrajectoryRenderer(canvas)
    expect(renderer).toBeInstanceOf(CanvasTrajectoryRenderer)
  })
})
