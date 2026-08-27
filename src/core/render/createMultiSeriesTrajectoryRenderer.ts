import {
  MultiSeriesCanvasTrajectoryRenderer,
  MultiSeriesTrajectoryRenderer,
  MultiSeriesWebGLTrajectoryRenderer,
} from './MultiSeriesTrajectoryRenderer'

/**
 * 创建最佳可用的多序列轨迹渲染器。
 *
 * 优先尝试 WebGL（WebGL2 -> WebGL1），不可用时降级为 Canvas 2D。
 */
export function createMultiSeriesTrajectoryRenderer(
  canvas: HTMLCanvasElement,
): MultiSeriesTrajectoryRenderer {
  const webgl = new MultiSeriesWebGLTrajectoryRenderer()
  if (webgl.init(canvas)) {
    return webgl
  }
  const canvasRenderer = new MultiSeriesCanvasTrajectoryRenderer()
  canvasRenderer.init(canvas)
  return canvasRenderer
}
