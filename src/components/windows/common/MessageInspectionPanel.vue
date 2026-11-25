<script setup lang="ts">
import { computed } from 'vue'
import { Close } from '@element-plus/icons-vue'
import { t } from '@/i18n'
import type { MessageField, MessageInspection } from '@/core/data/MessageInspection'

const props = withDefaults(
  defineProps<{
    inspection: MessageInspection | null
    raw: string
    layout?: 'packet' | 'table' | 'tree'
  }>(),
  { layout: 'packet' },
)
defineEmits<{ close: [] }>()

interface FieldNode {
  id: string
  label: string
  value?: string
  children?: FieldNode[]
}

function fieldNodes(fields: readonly MessageField[], parent: string): FieldNode[] {
  return fields.map((field, index) => {
    const id = `${parent}/${index}`
    return {
      id,
      label: field.label,
      value: field.children?.length
        ? undefined
        : [field.value || '—', field.unit].filter(Boolean).join(' '),
      children: field.children?.length ? fieldNodes(field.children, id) : undefined,
    }
  })
}

const tree = computed<FieldNode[]>(() => {
  const inspection = props.inspection
  if (!inspection) return []
  return [
    ...(inspection.fields.length
      ? [
          {
            id: 'fields',
            label: t('common.rawMessages.fields'),
            children: fieldNodes(inspection.fields, 'fields'),
          },
        ]
      : []),
    ...(inspection.tables ?? []).map((table, i) => ({
      id: `table/${i}`,
      label: `${table.label} (${table.rows.length})`,
      children: table.rows.map((row, j) => {
        const id = `table/${i}/${j}`
        const code = table.columns[1] === 'Signal' ? row.slice(0, 2).join(' / ') : row[0]
        return {
          id,
          label: code || String(j + 1),
          children: fieldNodes(
            row.map((value, column) => ({ label: table.columns[column], value })),
            id,
          ),
        }
      }),
    })),
  ]
})
</script>

<template>
  <section
    class="message-inspection"
    :class="{ 'is-embedded': layout !== 'packet' }"
    :aria-label="t('common.rawMessages.inspect')"
  >
    <div class="inspection-heading">
      <span v-if="inspection" class="inspection-code">{{ inspection.code }}</span>
      <h3>{{ inspection?.title ?? t('common.rawMessages.inspect') }}</h3>
      <span
        v-if="inspection?.integrity"
        class="inspection-integrity"
        :class="`is-${inspection.integrity}`"
      >
        {{
          t(
            inspection.integrity === 'valid'
              ? 'common.rawMessages.checkPassed'
              : inspection.integrity === 'invalid'
                ? 'common.rawMessages.checkFailed'
                : 'common.rawMessages.checkMissing',
          )
        }}
      </span>
      <button
        v-if="layout === 'packet'"
        class="inspection-close"
        type="button"
        :aria-label="t('common.rawMessages.closeDetails')"
        :title="t('common.rawMessages.closeDetails')"
        @click="$emit('close')"
      >
        <el-icon><Close /></el-icon>
      </button>
    </div>
    <div class="inspection-body">
      <p v-if="!inspection" class="inspection-note">{{ t('common.rawMessages.noDecoder') }}</p>
      <p v-else-if="inspection.note" class="inspection-note">
        {{ t(`common.rawMessages.decodeNotes.${inspection.note}`) }}
      </p>
      <el-tree
        v-if="layout === 'tree' && tree.length"
        class="inspection-tree"
        :data="tree"
        node-key="id"
        :default-expanded-keys="['fields']"
        :expand-on-click-node="true"
      >
        <template #default="{ data }">
          <span class="inspection-tree-label" :title="data.label">{{ data.label }}</span>
          <span v-if="data.value" class="inspection-tree-value" :title="data.value">{{
            data.value
          }}</span>
        </template>
      </el-tree>
      <div v-else-if="layout === 'table' && inspection?.fields.length" class="inspection-table">
        <table :aria-label="t('common.rawMessages.fields')">
          <thead>
            <tr>
              <th scope="col">{{ t('common.rawMessages.fieldName') }}</th>
              <th scope="col">{{ t('common.rawMessages.fieldValue') }}</th>
              <th scope="col">{{ t('common.rawMessages.fieldUnit') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(field, index) in inspection.fields" :key="index">
              <th scope="row">{{ field.label }}</th>
              <td class="inspection-table-value">{{ field.value || '—' }}</td>
              <td>{{ field.unit ?? '' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <dl v-else-if="layout === 'packet' && inspection?.fields.length" class="inspection-fields">
        <div v-for="(field, index) in inspection.fields" :key="index">
          <dt>{{ field.label }}</dt>
          <dd>
            {{ field.value || '—'
            }}<span v-if="field.unit && field.value" class="inspection-unit">
              {{ field.unit }}</span
            >
          </dd>
        </div>
      </dl>
      <div
        v-for="table in layout === 'tree' ? [] : inspection?.tables"
        :key="table.label"
        class="inspection-table"
      >
        <table>
          <caption>
            {{
              table.label
            }}
          </caption>
          <thead>
            <tr>
              <th v-for="column in table.columns" :key="column" scope="col">{{ column }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in table.rows" :key="index">
              <td v-for="(cell, column) in row" :key="column">{{ cell || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <details :open="!inspection || !inspection.fields.length" class="inspection-original">
        <summary>{{ t('common.rawMessages.originalRecord') }}</summary>
        <code>{{ raw }}</code>
      </details>
    </div>
  </section>
</template>

<style scoped>
.message-inspection {
  flex: 0 1 auto;
  display: flex;
  flex-direction: column;
  max-height: min(50%, 290px);
  min-height: 0;
  border-top: 1px solid var(--app-border-strong);
  background-color: var(--app-surface);
  color: var(--app-text);
  font-size: 12px;
}

.message-inspection.is-embedded {
  flex: 1 1 auto;
  max-height: none;
  border-top: 0;
}

.inspection-heading {
  display: flex;
  align-items: center;
  gap: var(--ui-space-md);
  flex: none;
  min-width: 0;
  padding: 5px 10px;
  border-bottom: 1px solid var(--app-border);
  background-color: var(--app-surface-muted);
}

.inspection-heading h3 {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: 12px;
  font-weight: 620;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inspection-code,
.inspection-integrity {
  flex: none;
  font-size: 10px;
  font-weight: 650;
  white-space: nowrap;
}

.inspection-code {
  padding: 2px 5px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  color: var(--el-color-primary);
  background-color: var(--app-surface);
  font-family: monospace;
}

.inspection-integrity {
  color: var(--app-text-muted);
}
.inspection-integrity.is-valid {
  color: var(--el-color-success);
}
.inspection-integrity.is-invalid {
  color: var(--el-color-danger);
}

.inspection-close {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 23px;
  height: 23px;
  margin-inline-start: auto;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--app-text-muted);
  cursor: pointer;
}

.inspection-close:hover {
  background-color: var(--app-hover);
}

.inspection-body {
  min-height: 0;
  overflow: auto;
  padding: 7px 10px 10px;
}

.inspection-note {
  margin: 0 0 8px;
  color: var(--app-text-muted);
  font-size: 11px;
}

.inspection-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 152px), 1fr));
  gap: 1px;
  margin: 0 0 7px;
  background-color: var(--app-border);
  border: 1px solid var(--app-border);
  border-radius: 4px;
  overflow: hidden;
}

.inspection-fields > div {
  min-width: 0;
  padding: 5px 7px;
  background-color: var(--app-surface);
}

.inspection-fields dt {
  color: var(--app-text-muted);
  font-size: 10px;
  line-height: 1.2;
}

.inspection-fields dd {
  margin: 3px 0 0;
  font-family: 'Consolas', monospace;
  font-size: 12px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.inspection-unit {
  color: var(--app-text-muted);
}

.inspection-table {
  overflow-x: auto;
  margin-bottom: 8px;
}
.inspection-table table {
  width: 100%;
  border-collapse: collapse;
}
.inspection-table caption {
  padding-bottom: 4px;
  font-weight: 650;
  text-align: left;
}
.inspection-table th,
.inspection-table td {
  padding: 4px 7px;
  border: 1px solid var(--app-border);
  white-space: nowrap;
  text-align: left;
}

.inspection-table .inspection-table-value {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.inspection-tree {
  margin-bottom: 8px;
  font-size: 12px;
  --el-tree-node-content-height: 25px;
}

.inspection-tree-label,
.inspection-tree-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inspection-tree-value {
  margin-inline-start: auto;
  padding-inline: 12px 5px;
  color: var(--app-text-secondary);
  font-family: monospace;
}
.inspection-table th {
  background-color: var(--app-surface-muted);
  font-weight: 600;
}
.inspection-table td {
  font-family: 'Consolas', monospace;
  font-variant-numeric: tabular-nums;
}

.inspection-original summary {
  color: var(--app-text-muted);
  cursor: pointer;
}
.inspection-original code {
  display: block;
  margin-top: 4px;
  padding: 5px 7px;
  background-color: var(--app-surface-muted);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
