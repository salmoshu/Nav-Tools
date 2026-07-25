import { CanvasTrajectoryRenderer } from './CanvasTrajectoryRenderer'
import { TrajectoryRenderer, WebGLTrajectoryRenderer } from './TrajectoryRenderer'

/**
 * Create the best available trajectory renderer for the given canvas.
 *
 * Tries WebGL2 first, then WebGL1, and falls back to Canvas 2D when neither
 * context can be created.
 */
export function createTrajectoryRenderer(canvas: HTMLCanvasElement): TrajectoryRenderer {
  const webgl = new WebGLTrajectoryRenderer()
  if (webgl.init(canvas)) {
    return webgl
  }
  const canvasRenderer = new CanvasTrajectoryRenderer()
  canvasRenderer.init(canvas)
  return canvasRenderer
}
