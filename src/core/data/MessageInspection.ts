export interface MessageField {
  label: string
  value: string
  unit?: string
  children?: MessageField[]
}

export interface MessageTable {
  label: string
  columns: string[]
  rows: string[][]
}

export interface MessageInspection {
  code: string
  title: string
  summary: string
  fields: MessageField[]
  tables?: MessageTable[]
  integrity?: 'valid' | 'invalid' | 'unchecked'
  note?: 'unknown' | 'header-only' | 'truncated' | 'unframed'
}
