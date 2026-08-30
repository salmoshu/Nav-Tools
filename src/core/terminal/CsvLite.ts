/** 极简 CSV 解析:支持引号包裹、引号内逗号/换行与 "" 转义;首行由渲染方决定是否作表头 */
export function parseCsv(source: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let fieldStarted = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"' && !fieldStarted) {
      inQuotes = true
      fieldStarted = true
      continue
    }
    if (char === ',') {
      row.push(field)
      field = ''
      fieldStarted = false
      continue
    }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      fieldStarted = false
      continue
    }
    field += char
    fieldStarted = true
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  // 丢弃完全空的尾行
  return rows.filter((cells) => cells.length > 1 || cells[0] !== '')
}
