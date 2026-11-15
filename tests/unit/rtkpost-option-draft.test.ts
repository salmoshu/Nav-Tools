import { describe, expect, it } from 'vitest'
import { createDefaultRtkPostSettings } from '@/core/gnsslib/RtkPost'
import {
  copyPostOptions,
  restorePostManualBaselines,
  updatePostOptionDraft,
  type PostManualBaselines,
} from '@/core/gnsslib/RtkPostOptionDraft'

describe('post-processing option draft', () => {
  it('marks explicit edits relative to imported values, even when edited back to app defaults', () => {
    const options = createDefaultRtkPostSettings().options
    options.ratioThreshold = 6 // Loaded from a config; it does not create a marker.
    const markers: PostManualBaselines = {}
    expect(Object.keys(markers)).toHaveLength(0)
    updatePostOptionDraft(options, markers, 'ratioThreshold', 3)
    expect(options.ratioThreshold).toBe(3)
    expect(markers).toEqual({ ratioThreshold: 6 })
    updatePostOptionDraft(options, markers, 'ratioThreshold', 6)
    expect(markers).toEqual({})
  })

  it('keeps the saved baseline across reloads and ignores malformed marker data', () => {
    const options = createDefaultRtkPostSettings().options
    const draft = copyPostOptions(options)
    const markers: PostManualBaselines = {}
    updatePostOptionDraft(draft, markers, 'ratioMin', 2.2)
    updatePostOptionDraft(draft, markers, 'constellations', ['G', 'E'])
    expect(options.constellations).toEqual(['G', 'R'])
    expect(restorePostManualBaselines({ ...markers, unknown: 5, ratioMax: 'bad' }, draft)).toEqual(
      markers,
    )
    updatePostOptionDraft(draft, markers, 'constellations', ['R', 'G'])
    expect(markers).toEqual({ ratioMin: 1 })
  })
})
