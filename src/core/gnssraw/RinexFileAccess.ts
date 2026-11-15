export type RinexFileType = 'observation' | 'navigation' | 'unknown'

/** RINEX 首行第 21 列是权威类型；扩展名只用于没有完整文件头的路径元数据。 */
export function classifyRinexFile(name: string, headBytes?: Uint8Array): RinexFileType {
  if (headBytes && headBytes.length >= 80) {
    const header = Array.from(headBytes.subarray(0, 80), (byte) => String.fromCharCode(byte)).join(
      '',
    )
    if (header.slice(60, 80) === 'RINEX VERSION / TYPE') {
      const type = header.charAt(20).toUpperCase()
      if (type === 'O') return 'observation'
      if (['N', 'G', 'H', 'Q', 'J', 'L', 'C', 'P'].includes(type)) return 'navigation'
      return 'unknown'
    }
  }
  const lower = name.toLowerCase()
  if (/\.\d{2}o$/.test(lower) || /\.(obs|gps|gal|glo)$/.test(lower)) return 'observation'
  if (/\.\d{2}[nghqlp]$/.test(lower) || /\.(nav|gnav|hnav|qnav|lnav|cnav)$/.test(lower)) {
    return 'navigation'
  }
  return 'unknown'
}
