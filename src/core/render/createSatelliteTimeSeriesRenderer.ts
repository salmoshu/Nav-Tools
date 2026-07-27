import {
  CanvasSatelliteTimeSeriesRenderer,
  SatelliteTimeSeriesRenderer,
  WebGLSatelliteTimeSeriesRenderer,
} from './SatelliteTimeSeriesRenderer'

/**
 * Selects WebGL2, then WebGL1, and finally Canvas 2D. The selected backend is
 * exposed through renderer.kind for diagnostics.
 */
export function createSatelliteTimeSeriesRenderer(
  canvas: HTMLCanvasElement,
): SatelliteTimeSeriesRenderer {
  const webgl = new WebGLSatelliteTimeSeriesRenderer()
  if (webgl.init(canvas)) return webgl

  const fallback = new CanvasSatelliteTimeSeriesRenderer()
  fallback.init(canvas)
  return fallback
}
