<template>
  <div class="gnssraw-gf">
    <GnssRawLoading v-if="store.status.value === 'loading'" />
    <div v-else-if="store.status.value === 'error'" class="state-row error">
      {{ t('gnssRaw.common.loadError') }}: {{ store.errorText.value }}
    </div>
    <template v-else-if="store.dataset.value">
      <div class="toolbar">
        <el-select
          v-model="selectedKey"
          size="small"
          style="width: 150px"
          :placeholder="t('gnssRaw.gf.selectSat')"
        >
          <el-option
            v-for="item in candidates"
            :key="item.key"
            :value="item.key"
            :label="item.label"
          />
        </el-select>
        <span v-if="gf" class="drift" :class="{ bad: Math.abs(gf.driftMps) > 0.05 }">
          {{ t('gnssRaw.gf.drift') }}: {{ (gf.driftMps * 100).toFixed(2) }} cm/s
        </span>
        <span v-if="!gf && candidates.length === 0" class="hint">
          {{ t('gnssRaw.gf.noDualFreq') }}
        </span>
      </div>
      <div ref="chartRef" class="chart"></div>
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
import { useGnssRawChart, satLabel, relativeTimes } from './useGnssRawChart'
import GnssRawLoading from './GnssRawLoading.vue'
import { computeGfSeries } from '@/core/gnssraw/analysis'
import { GNSS_SYS_NAME, GNSS_SYS_COLOR } from '@/core/gnssraw/types'

const selectedKey = ref('')

const { chartRef, store, rebuild } = useGnssRawChart(({ colors }) => {
  const current = gf.value
  if (!current) return null
  const rel = relativeTimes(current.times)
  return {
    backgroundColor: colors.background,
    textStyle: { color: colors.text },
    tooltip: {
      trigger: 'axis',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      textStyle: { color: colors.text },
      valueFormatter: (value: unknown) =>
        typeof value === 'number' ? `${value.toFixed(3)} m` : String(value),
    },
    grid: { left: 56, right: 16, top: 14, bottom: 24 },
    xAxis: {
      type: 'value',
      min: 0,
      max: rel.length > 0 ? rel[rel.length - 1] : 1,
      name: t('gnssRaw.common.relativeTime'),
      nameLocation: 'middle',
      nameGap: 18,
      nameTextStyle: { color: colors.textMuted, fontSize: 10 },
      axisLabel: { color: colors.textMuted },
      axisLine: { lineStyle: { color: colors.border } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: t('gnssRaw.gf.series'),
      nameTextStyle: { color: colors.textMuted, fontSize: 10 },
      scale: true,
      axisLabel: { color: colors.textMuted, formatter: (v: number) => v.toFixed(2) },
      axisLine: { lineStyle: { color: colors.border } },
      splitLine: { lineStyle: { color: colors.grid } },
    },
    series: [
      {
        name: satLabel(current.sys, current.prn, GNSS_SYS_NAME),
        type: 'line',
        color: GNSS_SYS_COLOR[current.sys],
        showSymbol: false,
        lineWidth: 1.4,
        sampling: 'lttb',
        data: rel.map((time, i) => [time, current.gf[i]]),
      },
    ],
    dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'none' }],
  }
})

/** 具备双频载波条件的卫星候选 */
const candidates = computed(() => {
  const dataset = store.dataset.value
  if (!dataset) return []
  const list: { key: string; label: string }[] = []
  for (const key of Object.keys(dataset.sats)) {
    const series = dataset.sats[key]
    if (series.slots.length >= 2 && series.slots[0]?.freqHz > 0 && series.slots[1]?.freqHz > 0) {
      list.push({ key, label: satLabel(series.sys, series.prn, GNSS_SYS_NAME) })
    }
  }
  return list
})

const gf = computed(() => {
  const dataset = store.dataset.value
  if (!dataset || !selectedKey.value) return null
  const series = dataset.sats[selectedKey.value]
  return series ? computeGfSeries(series) : null
})

// 数据集就绪后默认选第一颗可算 GF 的星
watch(
  candidates,
  (list) => {
    if (!selectedKey.value && list.length > 0) selectedKey.value = list[0].key
    else if (selectedKey.value && !list.some((item) => item.key === selectedKey.value)) {
      selectedKey.value = list[0]?.key ?? ''
    }
  },
  { immediate: true },
)
watch(selectedKey, rebuild)
</script>

<style scoped>
.gnssraw-gf {
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
  gap: 12px;
  padding-bottom: 6px;
}
.drift {
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-secondary);
}
.drift.bad {
  color: var(--el-color-error);
  font-weight: 600;
}
.hint {
  color: var(--el-text-color-secondary);
}
.chart {
  flex: 1;
  min-height: 0;
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
