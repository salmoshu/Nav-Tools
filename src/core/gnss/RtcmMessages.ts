import { crc24q } from '../gnssraw/RtcmFileAccess'

export interface RtcmConsoleMessage {
  hex: string
  valid: boolean
}

export type RtcmMessageRoute = 'spp' | RtcmConsoleMessage[]

const HEX = Array.from({ length: 256 }, (_, byte) =>
  byte.toString(16).padStart(2, '0').toUpperCase(),
)

/** Decode message boundaries for the monitor without changing any input bytes. */
export class RtcmMessageStream {
  private pending: Uint8Array = new Uint8Array()

  push(chunk: Uint8Array): RtcmConsoleMessage[] {
    let bytes = chunk
    if (this.pending.length > 0) {
      bytes = new Uint8Array(this.pending.length + chunk.length)
      bytes.set(this.pending)
      bytes.set(chunk, this.pending.length)
    }

    const messages: RtcmConsoleMessage[] = []
    let start = 0
    let cursor = 0
    while (cursor < bytes.length) {
      if (bytes[cursor] !== 0xd3 || (bytes[cursor + 1] & 0xfc) !== 0) {
        cursor++
        continue
      }
      if (cursor + 3 > bytes.length) break
      const length = ((bytes[cursor + 1] & 3) << 8) | bytes[cursor + 2]
      const end = cursor + 3 + length + 3
      if (end > bytes.length) break
      const checksum = (bytes[end - 3] << 16) | (bytes[end - 2] << 8) | bytes[end - 1]
      if (crc24q(bytes, cursor, 3 + length) !== checksum) {
        cursor++
        continue
      }
      appendInvalid(messages, bytes, start, cursor)
      messages.push({ hex: hex(bytes, cursor, end), valid: true })
      start = cursor = end
    }

    appendInvalid(messages, bytes, start, cursor)
    this.pending = bytes.slice(cursor)
    return messages
  }

  finish(): RtcmConsoleMessage[] {
    const messages: RtcmConsoleMessage[] = []
    appendInvalid(messages, this.pending, 0, this.pending.length)
    this.pending = new Uint8Array()
    return messages
  }
}

function appendInvalid(
  messages: RtcmConsoleMessage[],
  bytes: Uint8Array,
  start: number,
  end: number,
): void {
  for (let offset = start; offset < end; offset += 32) {
    messages.push({ hex: hex(bytes, offset, Math.min(end, offset + 32)), valid: false })
  }
}

function hex(bytes: Uint8Array, offset: number, end: number): string {
  let text = HEX[bytes[offset]]
  for (let i = offset + 1; i < end; i++) text += ' ' + HEX[bytes[i]]
  return text
}
