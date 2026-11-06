export type MessageDisplayFormat = 'ascii' | 'hex'

export function formatMessageContent(
  content: string,
  source: MessageDisplayFormat,
  target: MessageDisplayFormat,
): string {
  if (source === target) return content
  if (target === 'hex') {
    return Array.from(new TextEncoder().encode(content), (byte) =>
      byte.toString(16).padStart(2, '0').toUpperCase(),
    ).join('')
  }

  const compact = content.replace(/\s+/g, '')
  if (compact.length % 2 !== 0 || !/^[0-9A-Fa-f]*$/.test(compact)) return content
  const bytes = new Uint8Array(compact.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(compact.slice(index * 2, index * 2 + 2), 16)
  }
  return new TextDecoder().decode(bytes)
}
