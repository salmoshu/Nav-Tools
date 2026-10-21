import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('LiDAR scene renderer initial visibility', () => {
  const source = readFileSync('src/components/windows/lidar/scene/LidarSceneRenderer.ts', 'utf8')

  it('hides the heading arrow until a real frame drives it (no yellow arrow on empty canvas)', () => {
    const addIndex = source.indexOf('this.scene.add(this.headingArrow)')
    expect(addIndex).toBeGreaterThan(-1)
    const setupBlock = source.slice(Math.max(0, addIndex - 400), addIndex)
    expect(setupBlock).toContain('this.headingArrow.visible = false')
  })

  it('keeps goal point and helper primitives hidden by default', () => {
    expect(source).toContain('points.visible = false')
    expect(source).toContain('line.visible = false')
  })

  it('renders the person independently and hides it when this frame has no target', () => {
    expect(source).toContain('this.targetPoint = this.makePoints(COLORS.target, 14)')
    expect(source).toContain('options.showTarget && frame.targetXY')
    expect(source).toContain('this.targetPoint.visible = false')
    expect(source).toContain('if (frame.targetXY) absorb(')
  })
})
