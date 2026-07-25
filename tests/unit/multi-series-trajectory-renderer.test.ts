import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MultiSeriesCanvasTrajectoryRenderer,
  MultiSeriesWebGLTrajectoryRenderer,
} from '../../src/core/render/MultiSeriesTrajectoryRenderer'
import { createMultiSeriesTrajectoryRenderer } from '../../src/core/render/createMultiSeriesTrajectoryRenderer'

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

describe('MultiSeriesWebGLTrajectoryRenderer', () => {
  it('returns false when WebGL is unavailable', () => {
    const canvas = document.createElement('canvas')
    canvas.getContext = vi.fn(() => null) as unknown as HTMLCanvasElement['getContext']
    const renderer = new MultiSeriesWebGLTrajectoryRenderer()
    expect(renderer.init(canvas)).toBe(false)
  })

  it('draws multiple series after setViewport', () => {
    const gl = createMockWebGLContext()
    const canvas = createMockCanvasWebGL(gl)
    const renderer = new MultiSeriesWebGLTrajectoryRenderer()
    expect(renderer.init(canvas)).toBe(true)

    renderer.onResize(300, 150)
    renderer.addSeries('track1', [1, 0, 0, 0.65])
    renderer.addSeries('track2', [0, 1, 0, 0.65])
    renderer.setSeriesData('track1', [
      [0, 0, 0],
      [10, 10, 0],
    ])
    renderer.setSeriesData('track2', [
      [20, 20, 0],
      [30, 30, 0],
    ])

    gl.drawArrays.mockClear()
    renderer.setViewport(0, 40, 0, 40)

    expect(gl.drawArrays).toHaveBeenCalledTimes(2)
    expect(gl.drawArrays).toHaveBeenNthCalledWith(1, gl.POINTS, 0, 2)
    expect(gl.drawArrays).toHaveBeenNthCalledWith(2, gl.POINTS, 0, 2)
  })

  it('supports batch append', () => {
    const gl = createMockWebGLContext()
    const canvas = createMockCanvasWebGL(gl)
    const renderer = new MultiSeriesWebGLTrajectoryRenderer()
    renderer.init(canvas)
    renderer.addSeries('track1')

    gl.bufferSubData.mockClear()
    renderer.appendSeriesDataBatch('track1', [
      [1, 2, 0],
      [3, 4, 0],
      [5, 6, 0],
    ])

    expect(gl.bufferSubData).toHaveBeenCalledTimes(1)
  })

  it('toggles series visibility', () => {
    const gl = createMockWebGLContext()
    const canvas = createMockCanvasWebGL(gl)
    const renderer = new MultiSeriesWebGLTrajectoryRenderer()
    renderer.init(canvas)
    renderer.onResize(300, 150)
    renderer.addSeries('track1', [1, 0, 0, 0.65])
    renderer.addSeries('track2', [0, 1, 0, 0.65])
    renderer.setSeriesData('track1', [[0, 0, 0]])
    renderer.setSeriesData('track2', [[10, 10, 0]])

    renderer.setViewport(0, 20, 0, 20)
    gl.drawArrays.mockClear()

    renderer.setSeriesVisible('track1', false)
    expect(gl.drawArrays).toHaveBeenCalledTimes(1)
    expect(gl.drawArrays).toHaveBeenLastCalledWith(gl.POINTS, 0, 1)
  })

  it('recomputes color buffer when series color changes', () => {
    const gl = createMockWebGLContext()
    const canvas = createMockCanvasWebGL(gl)
    const renderer = new MultiSeriesWebGLTrajectoryRenderer()
    renderer.init(canvas)
    renderer.addSeries('track1')
    renderer.setSeriesData('track1', [
      [0, 0, 0],
      [10, 10, 0],
    ])

    gl.bufferSubData.mockClear()
    renderer.setSeriesColor('track1', [0.5, 0.5, 0.5, 1])
    expect(gl.bufferSubData).toHaveBeenCalled()
  })

  it('pickPoint returns nearest point across series', () => {
    const gl = createMockWebGLContext()
    const canvas = createMockCanvasWebGL(gl)
    const renderer = new MultiSeriesWebGLTrajectoryRenderer()
    renderer.init(canvas)
    renderer.onResize(300, 150)
    renderer.addSeries('track1', [1, 0, 0, 0.65])
    renderer.addSeries('track2', [0, 1, 0, 0.65])
    renderer.setSeriesData('track1', [[10, 10, 0]])
    renderer.setSeriesData('track2', [[20, 20, 0]])
    renderer.setViewport(0, 100, 0, 100)

    // data (10, 10) maps to screen (30, 135)
    const result = renderer.pickPoint(30, 135)
    expect(result).not.toBeNull()
    expect(result!.seriesId).toBe('track1')
    expect(result!.x).toBe(10)
    expect(result!.y).toBe(10)
  })

  it('clear removes all series data', () => {
    const gl = createMockWebGLContext()
    const canvas = createMockCanvasWebGL(gl)
    const renderer = new MultiSeriesWebGLTrajectoryRenderer()
    renderer.init(canvas)
    renderer.onResize(300, 150)
    renderer.addSeries('track1')
    renderer.setSeriesData('track1', [[10, 10, 0]])
    renderer.setViewport(0, 100, 0, 100)

    renderer.clear()
    expect(renderer.pickPoint(30, 135)).toBeNull()
  })
})

describe('MultiSeriesCanvasTrajectoryRenderer', () => {
  let ctx: ReturnType<typeof createMockCanvas2DContext>
  let canvas: HTMLCanvasElement
  let renderer: MultiSeriesCanvasTrajectoryRenderer

  beforeEach(() => {
    ctx = createMockCanvas2DContext()
    canvas = createMockCanvas2D(ctx)
    renderer = new MultiSeriesCanvasTrajectoryRenderer()
    renderer.init(canvas)
    renderer.onResize(300, 150)
    ctx.clearRect.mockClear()
    ctx.beginPath.mockClear()
    ctx.arc.mockClear()
    ctx.fill.mockClear()
    ctx.setTransform.mockClear()
  })

  it('init always returns true', () => {
    expect(renderer.init(canvas)).toBe(true)
  })

  it('draws multiple series with full redraw', () => {
    renderer.addSeries('track1', [1, 0, 0, 0.65])
    renderer.addSeries('track2', [0, 1, 0, 0.65])
    renderer.setSeriesData('track1', [[0, 0, 0]])
    renderer.setSeriesData('track2', [[10, 10, 0]])
    renderer.setViewport(0, 20, 0, 20)

    ctx.arc.mockClear()
    renderer.render()

    expect(ctx.clearRect).toHaveBeenCalled()
    expect(ctx.arc).toHaveBeenCalledTimes(2)
  })

  it('pickPoint returns nearest point', () => {
    renderer.addSeries('track1', [1, 0, 0, 0.65])
    renderer.setSeriesData('track1', [
      [10, 10, 0],
      [50, 50, 0],
    ])
    renderer.setViewport(0, 100, 0, 100)

    const result = renderer.pickPoint(30, 135)
    expect(result).not.toBeNull()
    expect(result!.x).toBe(10)
    expect(result!.y).toBe(10)
  })

  it('toggles series visibility', () => {
    renderer.addSeries('track1', [1, 0, 0, 0.65])
    renderer.addSeries('track2', [0, 1, 0, 0.65])
    renderer.setSeriesData('track1', [[0, 0, 0]])
    renderer.setSeriesData('track2', [[10, 10, 0]])
    renderer.setViewport(0, 20, 0, 20)

    ctx.arc.mockClear()
    renderer.setSeriesVisible('track1', false)
    expect(ctx.arc).toHaveBeenCalledTimes(1)
  })
})

describe('createMultiSeriesTrajectoryRenderer factory', () => {
  it('returns a WebGL renderer when WebGL2 context is available', () => {
    const gl = createMockWebGLContext()
    const canvas = createMockCanvasWebGL(gl)
    const renderer = createMultiSeriesTrajectoryRenderer(canvas)
    expect(renderer).toBeInstanceOf(MultiSeriesWebGLTrajectoryRenderer)
  })

  it('returns a Canvas renderer when no WebGL context is available', () => {
    const ctx = createMockCanvas2DContext()
    const canvas = document.createElement('canvas')
    canvas.getContext = vi.fn((type: string) => {
      if (type === 'webgl2' || type === 'webgl') return null
      if (type === '2d') return ctx
      return null
    }) as unknown as HTMLCanvasElement['getContext']

    const renderer = createMultiSeriesTrajectoryRenderer(canvas)
    expect(renderer).toBeInstanceOf(MultiSeriesCanvasTrajectoryRenderer)
  })
})
