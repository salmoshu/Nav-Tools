const JPEG_START = Buffer.from([0xff, 0xd8])
const JPEG_END = Buffer.from([0xff, 0xd9])

/** Extracts complete JPEG images from FFmpeg's image2pipe byte stream. */
export class JpegStreamParser {
  private buffered = Buffer.alloc(0)

  public constructor(private readonly maxBufferedBytes = 12 * 1024 * 1024) {}

  public push(chunk: Uint8Array): Uint8Array[] {
    this.buffered = Buffer.concat([this.buffered, Buffer.from(chunk)])
    const frames: Uint8Array[] = []

    while (this.buffered.length > 0) {
      const start = this.buffered.indexOf(JPEG_START)
      if (start === -1) {
        this.buffered = this.buffered.subarray(Math.max(0, this.buffered.length - 1))
        break
      }

      if (start > 0) this.buffered = this.buffered.subarray(start)
      const end = this.buffered.indexOf(JPEG_END, JPEG_START.length)
      if (end === -1) break

      const frameEnd = end + JPEG_END.length
      frames.push(Uint8Array.from(this.buffered.subarray(0, frameEnd)))
      this.buffered = this.buffered.subarray(frameEnd)
    }

    if (this.buffered.length > this.maxBufferedBytes) {
      const latestStart = this.buffered.lastIndexOf(JPEG_START)
      this.buffered = latestStart >= 0 ? this.buffered.subarray(latestStart) : Buffer.alloc(0)
    }

    return frames
  }

  public reset(): void {
    this.buffered = Buffer.alloc(0)
  }
}
