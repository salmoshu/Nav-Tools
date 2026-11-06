import type { DataInjectionSettings } from './DataInjection'

export type NtripCasterOptions = Pick<
  DataInjectionSettings['network'],
  'host' | 'port' | 'username' | 'password'
>

export interface NtripMountpoint {
  mountpoint: string
  identifier: string
  format: string
  navigationSystem: string
}

/** STR fields may contain quoted semicolons; CAS and NET records are not streams. */
export function parseNtripSourceTable(table: string): NtripMountpoint[] {
  const streams = new Map<string, NtripMountpoint>()
  for (const line of table.split(/\r?\n/)) {
    if (!line.startsWith('STR;')) continue
    const fields: string[] = []
    let field = ''
    let quoted = false
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index]
      if (character === '"') {
        if (quoted && line[index + 1] === '"') {
          field += '"'
          index += 1
        } else quoted = !quoted
      } else if (character === ';' && !quoted) {
        fields.push(field.trim())
        field = ''
      } else field += character
    }
    fields.push(field.trim())
    const mountpoint = fields[1]
    if (quoted || fields.length < 4 || !mountpoint || mountpoint.length > 100) continue
    if (
      [...mountpoint].some(
        (character) => character.charCodeAt(0) < 33 || character.charCodeAt(0) === 127,
      )
    )
      continue
    if (!streams.has(mountpoint))
      streams.set(mountpoint, {
        mountpoint,
        identifier: fields[2],
        format: fields[3],
        navigationSystem: fields[6] ?? '',
      })
  }
  return [...streams.values()].sort((a, b) => a.mountpoint.localeCompare(b.mountpoint))
}
