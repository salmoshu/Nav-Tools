<template>
  <div class="gnssraw-snr">
    <div v-if="store.status.value === 'loading'" class="state-row">
      {{ t('gnssRaw.common.loading') }}…
    </div>
    <div v-else-if="store.status.value === 'error'" class="state-row error">
      {{ t('gnssRaw.common.loadError') }}: {{ store.errorText.value }}
    </div>
    <template v-else-if="store.dataset.value">
      <div class="toolbar">
        <el-select v-model="sysFilter" size="small" style="width: 130px">
          <el-option :value="0" :label="t('gnssRaw.snr.allSys')" />
          <el-option
            v-for="sys in presentSys"
            :key="sys"
            :value="sys"
            :label="GNSS_SYS_NAME[sys]"
          />
        </el-select>
        <el-button size="small" :disabled="selectedKeys.length === 0" @click="clearSelection">
          {{ t('gnssRaw.snr.overview') }}
        </el-button>
        <span v-if="selectedKeys.length > 0" class="hint">
          {{ t('gnssRaw.snr.selectedCount', { n: selectedKeys.length }) }}
        </span>
        <span v-else class="hint">{{ t('gnssRaw.snr.clickRowHint') }}</span>
      </div>
      <div ref="chartRef" class="chart"></div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th class="sortable" @click="toggleSort('sat')">
                {{ t('gnssRaw.snr.satellite') }}{{ sortMark('sat') }}
              </th>
              <th class="sortable" @click="toggleSort('freq')">
                {{ t('gnssRaw.snr.band') }}{{ sortMark('freq') }}
              </th>
              <th class="num sortable" @click="toggleSort('samples')">
                {{ t('gnssRaw.snr.samples') }}{{ sortMark('samples') }}
              </th>
              <th class="num sortable" @click="toggleSort('mean')">
                {{ t('gnssRaw.snr.mean') }}{{ sortMark('mean') }}
              </th>
              <th class="num sortable" @click="toggleSort('range')">
                {{ t('gnssRaw.snr.range') }}{{ sortMark('range') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in sortedRows"
              :key="row.key"
              :class="{ selected: selectedKeys.includes(row.key) }"
              @click="toggleRow(row.key)"
            >
              <td>
                <span class="dot" :style="{ background: rowColor(row) }"></span>
                {{ satLabel(row.sys, row.prn, GNSS_SYS_NAME) }}
              </td>
              <td>L{{ row.slot + 1 }}</td>
              <td class="num">{{ row.samples.toLocaleString() }}</td>
              <td class="num" :class="{ bad: row.mean < 35 }">{{ row.mean.toFixed(1) }}</td>
              <td class="num">{{ row.min.toFixed(0) }}–{{ row.max.toFixed(0) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    <div v-else class="state-row">
      <div class="empty">{{ t('gnssRaw.common.noData') }}</div>
      <div class="empty-sub">{{ t('gnssRaw.common.emptyHint') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { t } from '@/i18n'
import { useGnssRawChart, satLabel, relativeTimes, type ChartColors } from './useGnssRawChart'
import {
  computeSnrStats,
  computeSnrPerSat,
  type SnrBand,
  type SnrSatRow,
} from '@/core/gnssraw/analysis'
import { GNSS_SYS_NAME, GNSS_SYS_COLOR, type GnssRawDataset } from '@/core/gnssraw/types'

const SLOT_LIGHTEN = ['', '66', '99']

type SortCol = 'sat' | 'freq' | 'samples' | 'mean' | 'range'

/** 0 = 全部星座 */
const sysFilter = ref(0)
const selectedKeys = ref<string[]>([])
const sortCol = ref<SortCol>('sat')
const sortAsc = ref(true)

const { chartRef, store, rebuild } = useGnssRawChart(({ colors, dataset }) => {
  return selectedKeys.value.length > 0
    ? buildTimeSeries(colors, dataset)
    : buildHistogram(colors, dataset)
})

/** 总览态:沿用原频带聚合直方图 */
function buildHistogram(colors: ChartColors, dataset: GnssRawDataset) {
  const list = computeSnrStats(dataset)
  if (list.length === 0) return null
  return {
    backgroundColor: colors.background,
    textStyle: { color: colors.text },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      textStyle: { color: colors.text },
    },
    legend: { top: 2, textStyle: { color: colors.text, fontSize: 11 } },
    grid: { left: 44, right: 12, top: 26, bottom: 24 },
    xAxis: {
      type: 'value' as const,
      name: 'dBHz',
      nameLocation: 'middle' as const,
      nameGap: 18,
      nameTextStyle: { color: colors.textMuted, fontSize: 10 },
      min: (value: { min: number }) => Math.floor(value.min - 1),
      max: (value: { max: number }) => Math.ceil(value.max + 1),
      axisLabel: { color: colors.textMuted },
      axisLine: { lineStyle: { color: colors.border } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      name: t('gnssRaw.snr.histogram'),
      nameTextStyle: { color: colors.textMuted, fontSize: 10 },
      axisLabel: { color: colors.textMuted },
      axisLine: { lineStyle: { color: colors.border } },
      splitLine: { lineStyle: { color: colors.grid } },
    },
    series: list.map((band) => ({
      name: bandLabel(band),
      type: 'line' as const,
      color: bandColor(band),
      showSymbol: false,
      step: 'middle' as const,
      lineWidth: 1.6,
      areaStyle: { opacity: 0.12 },
      data: band.histogram.map((bin) => [bin.binStart + 0.5, bin.count]),
    })),
  }
}

/** 逐星态:每个选中行一条 SNR-时间序列,可多条叠加对比 */
function buildTimeSeries(colors: ChartColors, dataset: GnssRawDataset) {
  const rows = rowsByKey.value
  const series = []
  for (const key of selectedKeys.value) {
    const row = rows.get(key)
    if (!row) continue
    const sat = dataset.sats[`${row.sys}:${row.prn}`]
    const slotSeries = sat?.slots[row.slot]
    if (!sat || !slotSeries) continue
    const rel = relativeTimes(sat.times)
    series.push({
      name: `${satLabel(row.sys, row.prn, GNSS_SYS_NAME)} L${row.slot + 1}`,
      type: 'line' as const,
      color: rowColor(row),
      showSymbol: false,
      lineWidth: 1.4,
      connectNulls: false,
      data: rel.map((x, i) => {
        const v = slotSeries.snr[i]
        return [x, Number.isFinite(v) && v > 0 ? v : null] as [number, number | null]
      }),
    })
  }
  if (series.length === 0) return null
  return {
    backgroundColor: colors.background,
    textStyle: { color: colors.text },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      textStyle: { color: colors.text },
      valueFormatter: (v: unknown) =>
        typeof v === 'number' ? `${v.toFixed(1)} dBHz` : '—',
    },
    legend: { top: 2, textStyle: { color: colors.text, fontSize: 11 } },
    grid: { left: 44, right: 12, top: 26, bottom: 24 },
    xAxis: {
      type: 'value' as const,
      name: t('gnssRaw.common.relativeTime'),
      nameLocation: 'middle' as const,
      nameGap: 18,
      nameTextStyle: { color: colors.textMuted, fontSize: 10 },
      axisLabel: { color: colors.textMuted },
      axisLine: { lineStyle: { color: colors.border } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      name: 'dBHz',
      scale: true,
      nameTextStyle: { color: colors.textMuted, fontSize: 10 },
      axisLabel: { color: colors.textMuted },
      axisLine: { lineStyle: { color: colors.border } },
      splitLine: { lineStyle: { color: colors.grid } },
    },
    series,
    dataZoom: [{ type: 'inside' as const, xAxisIndex: 0, filterMode: 'none' as const }],
  }
}

const rows = computed(() => (store.dataset.value ? computeSnrPerSat(store.dataset.value) : []))

const rowsByKey = computed(() => new Map(rows.value.map((row) => [row.key, row])))

/** 数据中出现的星座(筛选下拉只列这些) */
const presentSys = computed(() => [...new Set(rows.value.map((row) => row.sys))].sort())

const filteredRows = computed(() =>
  sysFilter.value === 0 ? rows.value : rows.value.filter((row) => row.sys === sysFilter.value),
)

const sortedRows = computed(() => {
  const list = [...filteredRows.value]
  const sign = sortAsc.value ? 1 : -1
  const cmp: Record<SortCol, (a: SnrSatRow, b: SnrSatRow) => number> = {
    sat: (a, b) => a.sys - b.sys || a.prn - b.prn || a.slot - b.slot,
    freq: (a, b) => a.slot - b.slot || a.sys - b.sys || a.prn - b.prn,
    samples: (a, b) => a.samples - b.samples,
    mean: (a, b) => a.mean - b.mean,
    range: (a, b) => a.max - a.min - (b.max - b.min),
  }
  list.sort((a, b) => sign * cmp[sortCol.value](a, b))
  return list
})

function toggleSort(col: SortCol) {
  if (sortCol.value === col) sortAsc.value = !sortAsc.value
  else {
    sortCol.value = col
    sortAsc.value = true
  }
}

function sortMark(col: SortCol): string {
  if (sortCol.value !== col) return ''
  return sortAsc.value ? ' ▲' : ' ▼'
}

function toggleRow(key: string) {
  selectedKeys.value = selectedKeys.value.includes(key)
    ? selectedKeys.value.filter((k) => k !== key)
    : [...selectedKeys.value, key]
}

function clearSelection() {
  selectedKeys.value = []
}

function bandLabel(band: SnrBand): string {
  return `${GNSS_SYS_NAME[band.sys]} L${band.slot + 1}`
}

/** 星座色 + 槽位透明度后缀区分同星座不同频点 */
function bandColor(band: { sys: number; slot: number }): string {
  const base = GNSS_SYS_COLOR[band.sys] ?? '#9ca3af'
  return band.slot === 0 ? base : `${base}${SLOT_LIGHTEN[Math.min(band.slot, 2)]}`
}

/** hex 亮度错开(多选同星座同频点的不同卫星时分色;step 为相对偏移步数) */
function shiftLightness(hex: string, step: number): string {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex)
  if (!m || step === 0) return hex
  const [r8, g8, b8] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16))
  const r = r8 / 255
  const g = g8 / 255
  const b = b8 / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  let l = (max + min) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6)
    else if (max === g) h = 60 * ((b - r) / d + 2)
    else h = 60 * ((r - g) / d + 4)
  }
  if (h < 0) h += 360
  l = Math.min(0.85, Math.max(0.2, l + step * 0.16))
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m0 = l - c / 2
  let rr = 0
  let gg = 0
  let bb = 0
  if (h < 60) [rr, gg, bb] = [c, x, 0]
  else if (h < 120) [rr, gg, bb] = [x, c, 0]
  else if (h < 180) [rr, gg, bb] = [0, c, x]
  else if (h < 240) [rr, gg, bb] = [0, x, c]
  else if (h < 300) [rr, gg, bb] = [x, 0, c]
  else [rr, gg, bb] = [c, 0, x]
  const to = (v: number) =>
    Math.round((v + m0) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to(rr)}${to(gg)}${to(bb)}${m[2] ?? ''}`
}

/** 选中行的最终线条色:默认星座色,同色冲突时按亮度错开 */
const seriesColors = computed(() => {
  const sel = selectedKeys.value
    .map((k) => rowsByKey.value.get(k))
    .filter((row): row is SnrSatRow => Boolean(row))
  const byBase = new Map<string, SnrSatRow[]>()
  for (const row of sel) {
    const base = bandColor(row)
    const list = byBase.get(base) ?? []
    list.push(row)
    byBase.set(base, list)
  }
  const out = new Map<string, string>()
  for (const [base, list] of byBase) {
    list.forEach((row, i) => {
      out.set(row.key, shiftLightness(base, i - (list.length - 1) / 2))
    })
  }
  return out
})

function rowColor(row: SnrSatRow): string {
  return seriesColors.value.get(row.key) ?? bandColor(row)
}

// 数据集切换时清空选中,避免残留不存在卫星的选中态
watch(rowsByKey, (map) => {
  const kept = selectedKeys.value.filter((k) => map.has(k))
  if (kept.length !== selectedKeys.value.length) selectedKeys.value = kept
})
watch(selectedKeys, rebuild)
</script>

<style scoped>
.gnssraw-snr {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding: 8px;
  font-size: 12px;
  color: var(--el-text-color-primary);
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.chart {
  flex: 0 0 50%;
  min-height: 140px;
}
.table-wrap {
  flex: 1;
  overflow: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  margin-top: 6px;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th,
td {
  padding: 3px 10px;
  text-align: left;
  border-bottom: 1px solid var(--el-border-color-lighter);
  white-space: nowrap;
}
th {
  position: sticky;
  top: 0;
  background: var(--el-fill-color-light);
  z-index: 1;
}
th.sortable {
  cursor: pointer;
  user-select: none;
}
th.sortable:hover {
  color: var(--el-color-primary);
}
tbody tr {
  cursor: pointer;
}
tbody tr:hover {
  background: var(--el-fill-color-light);
}
tbody tr.selected {
  background: var(--el-color-primary-light-8);
}
.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 5px;
}
.bad {
  color: var(--el-color-warning);
  font-weight: 600;
}
.state-row {
  padding: 12px;
  color: var(--el-text-color-secondary);
}
.state-row.error {
  color: var(--el-color-error);
}
.empty {
  font-size: 13px;
  margin-bottom: 4px;
}
.empty-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
