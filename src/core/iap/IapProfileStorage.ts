import {
  cloneIapConfig,
  IGK_IAP_TEMPLATE,
  validateIapProtocolConfig,
  type IapProtocolTemplate,
} from './IapProtocol'

const STORAGE_KEY = 'nav-tools:iap-protocol-templates:v1'
const EXPORT_SCHEMA = 'nav-tools/iap-protocol-templates'

interface StoredDocument {
  version: 1
  profiles: IapProtocolTemplate[]
}

interface ExportDocument extends StoredDocument {
  schema: typeof EXPORT_SCHEMA
  exportedAt: string
}

export class IapProfileStorage {
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'>) {}

  list(): IapProtocolTemplate[] {
    return [cloneTemplate(IGK_IAP_TEMPLATE), ...this.loadCustom()]
  }

  save(profile: IapProtocolTemplate): IapProtocolTemplate {
    const normalized = normalizeTemplate(profile)
    if (normalized.id === IGK_IAP_TEMPLATE.id || normalized.builtin) {
      throw new Error('The built-in IGK IAP template cannot be overwritten')
    }
    const profiles = this.loadCustom()
    const index = profiles.findIndex((entry) => entry.id === normalized.id)
    if (index >= 0) profiles[index] = normalized
    else profiles.push(normalized)
    this.persist(profiles)
    return cloneTemplate(normalized)
  }

  remove(id: string): void {
    if (id === IGK_IAP_TEMPLATE.id) throw new Error('The built-in template cannot be removed')
    this.persist(this.loadCustom().filter((entry) => entry.id !== id))
  }

  exportJson(): string {
    const document: ExportDocument = {
      schema: EXPORT_SCHEMA,
      version: 1,
      exportedAt: new Date().toISOString(),
      profiles: this.loadCustom(),
    }
    return JSON.stringify(document, null, 2)
  }

  importJson(source: string): IapProtocolTemplate[] {
    const parsed = JSON.parse(source) as Partial<ExportDocument>
    if (
      parsed.schema !== EXPORT_SCHEMA ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.profiles)
    ) {
      throw new Error('Unsupported IAP template file')
    }
    const existing = this.loadCustom()
    const byId = new Map(existing.map((entry) => [entry.id, entry]))
    const imported: IapProtocolTemplate[] = []
    for (const candidate of parsed.profiles) {
      const normalized = normalizeTemplate({ ...candidate, builtin: false })
      if (normalized.id === IGK_IAP_TEMPLATE.id) normalized.id = createProfileId()
      byId.set(normalized.id, normalized)
      imported.push(normalized)
    }
    this.persist([...byId.values()])
    return imported.map(cloneTemplate)
  }

  private loadCustom(): IapProtocolTemplate[] {
    try {
      const raw = this.storage.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as StoredDocument
      if (parsed.version !== 1 || !Array.isArray(parsed.profiles)) return []
      return parsed.profiles
        .map((profile) => normalizeTemplate(profile))
        .filter((profile) => !profile.builtin)
    } catch {
      return []
    }
  }

  private persist(profiles: IapProtocolTemplate[]): void {
    this.storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, profiles } satisfies StoredDocument),
    )
  }
}

export function createProfileId(): string {
  return `iap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

function normalizeTemplate(profile: IapProtocolTemplate): IapProtocolTemplate {
  if (!profile || typeof profile !== 'object' || typeof profile.config !== 'object') {
    throw new Error('Invalid IAP template')
  }
  const name = String(profile.name ?? '').trim()
  if (!name || name.length > 80) throw new Error('Template name must contain 1-80 characters')
  const config = cloneIapConfig(profile.config)
  const errors = validateIapProtocolConfig(config)
  if (errors.length > 0) throw new Error(errors.join('; '))
  return {
    id: String(profile.id || createProfileId()),
    name,
    builtin: profile.id === IGK_IAP_TEMPLATE.id,
    config,
  }
}

function cloneTemplate(profile: Readonly<IapProtocolTemplate>): IapProtocolTemplate {
  return {
    id: profile.id,
    name: profile.name,
    builtin: profile.builtin,
    config: cloneIapConfig(profile.config),
  }
}
