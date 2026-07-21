const NMEA_SENTENCE = /\$(?:[^*]*)\*[0-9A-F]{2}/gi

export function calculateNmeaChecksum(sentence: string): string {
  const end = sentence.indexOf('*') === -1 ? sentence.length : sentence.indexOf('*')
  let checksum = 0
  for (let index = 1; index < end; index += 1) checksum ^= sentence.charCodeAt(index)
  return checksum.toString(16).toUpperCase().padStart(2, '0')
}

export function validateNmeaChecksum(sentence: string): boolean {
  if (!sentence.startsWith('$')) return false
  const asterisk = sentence.indexOf('*')
  if (asterisk === -1) return false
  const expected = sentence.slice(asterisk + 1, asterisk + 3).toUpperCase()
  return /^[0-9A-F]{2}$/.test(expected) && calculateNmeaChecksum(sentence) === expected
}

export class NmeaStreamParser {
  private buffer = ''

  public constructor(
    private readonly maxBufferLength = 50_000,
    private readonly retainedLength = 10_000,
  ) {}

  public push(chunk: string): string[] {
    this.buffer += chunk
    if (this.buffer.length > this.maxBufferLength) {
      this.buffer = this.buffer.slice(-this.retainedLength)
    }

    const firstStart = this.buffer.indexOf('$')
    if (firstStart === -1) {
      this.buffer = ''
      return []
    }
    if (firstStart > 0) this.buffer = this.buffer.slice(firstStart)

    const matches = Array.from(this.buffer.matchAll(NMEA_SENTENCE))
    if (matches.length === 0) {
      const lastStart = this.buffer.lastIndexOf('$')
      if (lastStart > 0) this.buffer = this.buffer.slice(lastStart)
      return []
    }

    const last = matches[matches.length - 1]
    this.buffer = this.buffer.slice((last.index ?? 0) + last[0].length)
    return matches.map((match) => match[0])
  }

  public clear(): void {
    this.buffer = ''
  }
}
