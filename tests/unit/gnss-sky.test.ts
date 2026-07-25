import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('GNSS sky plot label stacking', () => {
  it('hides covered labels and restores them on hover emphasis', () => {
    const source = readFileSync('src/components/windows/gnss/GnssSky.vue', 'utf8')

    expect(source).toMatch(/labelLayout:\s*\{\s*hideOverlap:\s*true/)
    expect(source).toMatch(/emphasis:\s*\{[\s\S]*?label:\s*\{\s*show:\s*true/)
    expect(source).not.toContain("focus: 'self'")
    expect(source).toContain('width: satelliteSize.value')
    expect(source).toContain('height: satelliteSize.value')
  })
})
