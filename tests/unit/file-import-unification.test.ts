import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('unified file import pipeline', () => {
  const device = readFileSync('src/hooks/useDevice.ts', 'utf8')
  const main = readFileSync('electron/main/index.ts', 'utf8')

  it('routes dropped GNSS files through full timeline indexing', () => {
    expect(device).toContain("await loadGnssTimelineFile(file, 'loaded')")
    expect(device).toContain('prepareTimelineProjection(timelineMode)')
    expect(device).toContain('filePath.value = droppedPath')
    expect(device).toContain('saveDataSourceSettings()')
  })

  it('reopens a persisted desktop path without requiring a File object', () => {
    expect(device).toContain("loadGnssTimelinePath(fileCmd, 'loaded')")
    expect(device).toContain("loadGnssTimelinePath(path, 'replay')")
    expect(device).toContain('new TextFileStreamService(ipc)')
    expect(main).toContain("'text-file-stream-open'")
    expect(main).toContain("'text-file-stream-read'")
    expect(main).toContain("'text-file-stream-close'")
  })

  it('indexes raw messages for replay instead of exposing the full file immediately', () => {
    expect(device).toContain('addFileReplayData(text)')
    expect(device).toContain('beginFileReplayMessages()')
    expect(device).toContain('endFileReplayMessages()')
  })
})
