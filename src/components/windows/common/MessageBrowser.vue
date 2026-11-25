<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { ArrowRight, Folder, Search } from '@element-plus/icons-vue'
import { t } from '@/i18n'
import type { ConsoleMessage } from '@/composables/flow/useConsole'
import {
  recordMessageFormat,
  updateMessageCatalog,
  type CatalogFormat,
  type MessageCatalog,
  type MessageCatalogEntry,
} from '@/core/data/MessageCatalog'
import { inspectMessage, messageText } from '@/core/data/MessageViewModel'
import MessageInspectionPanel from './MessageInspectionPanel.vue'

const props = defineProps<{
  records: readonly ConsoleMessage[]
  format: CatalogFormat
  encoding: 'ascii' | 'hex'
  validOnly: boolean
  csvHeaderKey?: string
  csvColumns: readonly string[]
  regex: string
  positionHeaders: readonly string[]
  showTimestamp: boolean
}>()

type Entry = MessageCatalogEntry<ConsoleMessage>
const entries = shallowRef<Entry[]>([])
const indexing = ref(false)
const query = ref('')
const selectedId = ref('')
const fieldLayout = ref<'table' | 'tree'>('table')
const followLatest = ref(true)
const pinned = shallowRef<{ id: string; latest: ConsoleMessage }>()
let catalog: MessageCatalog<ConsoleMessage> | undefined

watch(
  () => [props.records, props.format, props.encoding, props.validOnly, props.csvHeaderKey] as const,
  async ([records, format, encoding, validOnly, csvHeaderKey], _previous, onCleanup) => {
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })
    if (!records.length) {
      catalog = undefined
      entries.value = []
      indexing.value = false
      pinned.value = undefined
      return
    }
    indexing.value = true
    const next = await updateMessageCatalog(
      catalog,
      { records, format, encoding, validOnly, csvHeaderKey },
      () => !cancelled,
    )
    if (!next) return
    catalog = next
    entries.value = Array.from(catalog.entries.values())
    indexing.value = false
  },
  { immediate: true },
)

const protocols = computed(() => {
  const words = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const groups = new Map<string, Map<string, Entry[]>>()
  for (const entry of entries.value) {
    const groupName = t(`common.rawMessages.catalogGroups.${entry.group}`)
    const text = `${entry.protocol} ${groupName} ${entry.code} ${entry.title}`.toLowerCase()
    if (!words.every((word) => text.includes(word))) continue
    let protocol = groups.get(entry.protocol)
    if (!protocol) groups.set(entry.protocol, (protocol = new Map()))
    const group = protocol.get(entry.group)
    if (group) group.push(entry)
    else protocol.set(entry.group, [entry])
  }
  return Array.from(groups, ([name, groups]) => ({
    name,
    groups: Array.from(groups, ([id, members]) => ({
      id,
      label: t(`common.rawMessages.catalogGroups.${id}`),
      members: members.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    })),
  }))
})

const activeEntry = computed(
  () => entries.value.find(({ id }) => id === selectedId.value) ?? entries.value[0],
)
const record = computed(() => {
  const entry = activeEntry.value
  return (
    entry &&
    (!followLatest.value && pinned.value?.id === entry.id ? pinned.value.latest : entry.latest)
  )
})
const inspection = computed(() => {
  const current = record.value
  if (!current) return null
  const format = recordMessageFormat(current, props.format)
  return inspectMessage(messageText(current.raw, format, props.encoding), format, {
    csvColumns: props.csvColumns,
    regex: props.regex,
    positionHeaders: props.positionHeaders,
  })
})

function selectEntry(entry: Entry): void {
  selectedId.value = entry.id
  if (!followLatest.value) pinned.value = { id: entry.id, latest: entry.latest }
}

function setFollowLatest(): void {
  if (followLatest.value && activeEntry.value) {
    const { id, latest } = activeEntry.value
    pinned.value = { id, latest }
  } else {
    pinned.value = undefined
  }
  followLatest.value = !followLatest.value
}
</script>

<template>
  <div class="message-browser">
    <aside class="message-browser-sidebar" :aria-label="t('common.rawMessages.messageView')">
      <el-input
        v-model="query"
        class="message-type-filter"
        clearable
        size="small"
        :prefix-icon="Search"
        :aria-label="t('common.rawMessages.filterTypes')"
        :placeholder="t('common.rawMessages.filterTypes')"
      />
      <div class="message-type-list" :aria-busy="indexing">
        <p v-if="!protocols.length" class="message-browser-empty">
          {{
            t(
              indexing && !entries.length
                ? 'common.rawMessages.catalogBuilding'
                : query.trim()
                  ? 'common.rawMessages.noMatchingTypes'
                  : 'common.rawMessages.noMessageTypes',
            )
          }}
        </p>
        <details
          v-for="protocol in protocols"
          :key="protocol.name"
          class="message-type-folder"
          open
        >
          <summary>
            <el-icon><ArrowRight /></el-icon><el-icon><Folder /></el-icon>{{ protocol.name }}
          </summary>
          <details
            v-for="group in protocol.groups"
            :key="group.id"
            class="message-type-folder message-type-group"
            open
          >
            <summary>
              <el-icon><ArrowRight /></el-icon>{{ group.label }}
            </summary>
            <button
              v-for="entry in group.members"
              :key="entry.id"
              class="message-type-entry"
              type="button"
              :aria-current="activeEntry?.id === entry.id ? 'true' : undefined"
              :title="`${entry.code} · ${entry.title}`"
              @click="selectEntry(entry)"
            >
              <strong>{{ entry.code }}</strong>
              <span class="message-type-title">{{ entry.title }}</span>
              <span class="message-type-count">{{ entry.count }}</span>
            </button>
          </details>
        </details>
      </div>
    </aside>

    <section class="message-browser-main">
      <header class="message-field-toolbar">
        <div
          class="message-field-tabs"
          role="tablist"
          :aria-label="t('common.rawMessages.fieldLayout')"
        >
          <button
            type="button"
            role="tab"
            :aria-selected="fieldLayout === 'table'"
            @click="fieldLayout = 'table'"
          >
            {{ t('common.rawMessages.tableLayout') }}
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="fieldLayout === 'tree'"
            @click="fieldLayout = 'tree'"
          >
            {{ t('common.rawMessages.treeLayout') }}
          </button>
        </div>
        <button
          v-if="activeEntry"
          type="button"
          class="message-follow-latest"
          :aria-pressed="followLatest"
          @click="setFollowLatest"
        >
          {{ t('common.rawMessages.followLatest') }}
        </button>
      </header>
      <div v-if="activeEntry && record" class="message-selected-meta">
        <strong>{{ activeEntry.protocol }} / {{ activeEntry.code }}</strong>
        <span>{{ t('common.rawMessages.occurrences', { count: activeEntry.count }) }}</span>
        <span v-if="showTimestamp && record.timestamp" class="message-selected-time">{{
          record.timestamp.split(' [', 1)[0]
        }}</span>
      </div>
      <MessageInspectionPanel
        v-if="activeEntry && record"
        :key="activeEntry.id"
        :inspection="inspection"
        :raw="record.raw"
        :layout="fieldLayout"
      />
    </section>
  </div>
</template>

<style scoped>
.message-browser {
  display: grid;
  grid-template-columns: minmax(145px, 34%) minmax(0, 1fr);
  height: 100%;
  min-width: 0;
  min-height: 0;
  color: var(--app-text);
  font-size: 12px;
}

.message-browser-sidebar,
.message-browser-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.message-browser-sidebar {
  border-inline-end: 1px solid var(--app-border-strong);
  background: var(--app-surface-muted);
}

.message-type-filter {
  flex: none;
  padding: 6px 7px;
}
.message-type-list {
  flex: 1;
  overflow: auto;
  padding: 0 5px 6px;
}
.message-browser-empty {
  padding: 4px 6px;
  color: var(--app-text-muted);
}

.message-type-folder summary {
  display: flex;
  align-items: center;
  gap: var(--ui-space-xs);
  padding: 4px 5px;
  list-style: none;
  cursor: pointer;
  font-weight: 600;
}

.message-type-folder summary::-webkit-details-marker {
  display: none;
}
.message-type-folder[open] > summary > .el-icon:first-child {
  transform: rotate(90deg);
}
.message-type-group {
  margin-inline-start: 10px;
}
.message-type-group summary {
  color: var(--app-text-secondary);
  font-size: 11px;
}

.message-type-entry {
  display: flex;
  align-items: center;
  gap: var(--ui-space-xs);
  width: 100%;
  min-height: 23px;
  padding: 2px 5px 2px 12px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}

.message-type-entry:hover {
  background: var(--app-hover);
}
.message-type-entry[aria-current='true'] {
  background: color-mix(in srgb, var(--el-color-primary) 14%, var(--app-surface));
  color: var(--el-color-primary);
}

.message-type-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.message-type-count,
.message-selected-time {
  margin-inline-start: auto;
  font-variant-numeric: tabular-nums;
}
.message-type-count {
  flex: none;
  color: var(--app-text-muted);
}

.message-field-toolbar,
.message-selected-meta {
  display: flex;
  align-items: center;
  flex: none;
  flex-wrap: wrap;
  gap: var(--ui-space-xs) var(--ui-space-md);
  padding: 0 8px;
  border-bottom: 1px solid var(--app-border);
}

.message-field-tabs {
  display: flex;
  gap: var(--ui-space-tight);
  min-height: 32px;
}
.message-field-tabs button,
.message-follow-latest {
  border: 0;
  background: transparent;
  color: var(--app-text-secondary);
  font: inherit;
  cursor: pointer;
}

.message-field-tabs button {
  border-bottom: 2px solid transparent;
  padding: 3px 6px;
}
.message-field-tabs button[aria-selected='true'] {
  color: var(--el-color-primary);
  border-bottom-color: var(--el-color-primary);
}

.message-follow-latest {
  margin-inline-start: auto;
  padding: 3px;
  font-size: 11px;
}
.message-follow-latest[aria-pressed='true'] {
  color: var(--el-color-success);
}
.message-selected-meta {
  min-height: 25px;
  color: var(--app-text-muted);
  font-size: 11px;
}
.message-selected-meta strong {
  color: var(--app-text);
}

@container console-input (max-width: 410px) {
  .message-browser {
    grid-template-columns: minmax(108px, 35%) minmax(0, 1fr);
  }
  .message-type-group {
    margin-inline-start: 5px;
  }
  .message-type-title {
    display: none;
  }
}
</style>
