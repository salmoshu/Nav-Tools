<template>
  <div class="lidar-scores">
    <template v-if="scores">
      <div class="scores-summary">
        <span class="chip" :class="scores.success ? 'ok' : 'blocked'">
          {{ scores.success ? t('lidar.scores.success') : t('lidar.scores.blocked') }}
        </span>
        <span class="chip">#{{ scores.frame }} / seq {{ scores.plan_seq }}</span>
        <span class="chip">{{ t('lidar.scores.best') }}: {{ scores.best >= 0 ? '#' + scores.best : t('lidar.scores.none') }}</span>
        <span class="chip" :class="{ warn: scores.plan_ms > 8 }">plan {{ scores.plan_ms.toFixed(2) }} ms</span>
        <span class="chip" :class="{ warn: scores.early_terminated }" v-if="scores.early_terminated">{{ t('lidar.scores.earlyTerminated') }}</span>
        <span class="chip">{{ t('lidar.scores.samples') }} {{ scores.evaluated }}/{{ scores.samples }}</span>
        <span class="chip" v-if="scores.cache_hits">cache {{ scores.cache_hits }}</span>
        <span class="chip cmd">cmd v={{ scores.cmd.v.toFixed(2) }} w={{ scores.cmd.w.toFixed(2) }}</span>
        <span class="chip window">window [{{ scores.window.join(', ') }}]</span>
      </div>
      <el-table
        :data="tableRows"
        size="small"
        height="100%"
        :row-class-name="rowClass"
        class="scores-table"
      >
        <el-table-column prop="i" label="#" width="46" />
        <el-table-column prop="v" :label="t('lidar.scores.colV')" width="76">
          <template #default="{ row }">{{ fmt(row.v) }}</template>
        </el-table-column>
        <el-table-column prop="w" :label="t('lidar.scores.colW')" width="76">
          <template #default="{ row }">{{ fmt(row.w) }}</template>
        </el-table-column>
        <el-table-column prop="h" :label="t('lidar.scores.colHeading')" width="76">
          <template #default="{ row }">{{ fmt(row.h) }}</template>
        </el-table-column>
        <el-table-column prop="obs" :label="t('lidar.scores.colObstacle')" width="76">
          <template #default="{ row }">{{ fmt(row.obs) }}</template>
        </el-table-column>
        <el-table-column prop="vel" :label="t('lidar.scores.colVelocity')" width="76">
          <template #default="{ row }">{{ fmt(row.vel) }}</template>
        </el-table-column>
        <el-table-column prop="cm" :label="t('lidar.scores.colCostmap')" width="76">
          <template #default="{ row }">{{ fmt(row.cm) }}</template>
        </el-table-column>
        <el-table-column prop="bonus" :label="t('lidar.scores.colBonus')" width="76">
          <template #default="{ row }">{{ fmt(row.bonus) }}</template>
        </el-table-column>
        <el-table-column prop="tot" :label="t('lidar.scores.colTotal')" width="86" sortable>
          <template #default="{ row }">{{ fmt(row.tot) }}</template>
        </el-table-column>
        <el-table-column :label="t('lidar.scores.colReason')" min-width="110">
          <template #default="{ row }">
            <el-tag v-if="row.collision" type="danger" size="small">{{ t('lidar.scores.collision') }}</el-tag>
            <el-tag v-else-if="row.cached" type="info" size="small">{{ t('lidar.scores.cached') }}</el-tag>
            <el-tag v-else-if="row.isBest" type="success" size="small">{{ t('lidar.scores.chosen') }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </template>
    <div class="scores-empty" v-else>
      <el-icon :size="36"><TrendCharts /></el-icon>
      <p>{{ t('lidar.scores.noScores') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { TrendCharts } from '@element-plus/icons-vue'
import { t } from '@/i18n'
import { useLidarPanelPresence, useMcapPlayer } from '@/composables/useMcapPlayer'
import { bestCandidate } from '@/core/lidar/DwaScores'

const player = useMcapPlayer()
useLidarPanelPresence()
const scores = computed(() => player.currentScores.value)

interface ScoreRow {
  i: number
  v: number
  w: number
  h?: number
  obs?: number
  vel?: number
  cm?: number
  bonus?: number
  tot?: number
  collision?: boolean
  cached?: boolean
  isBest: boolean
}

const tableRows = computed<ScoreRow[]>(() => {
  const value = scores.value
  if (!value) return []
  const best = bestCandidate(value)
  return value.candidates.map((candidate) => ({
    ...candidate,
    isBest: best !== undefined && candidate.i === best.i && !candidate.collision,
  }))
})

function fmt(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '-'
  return Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(3)
}

function rowClass({ row }: { row: ScoreRow }): string {
  if (row.collision) return 'row-collision'
  if (row.isBest) return 'row-best'
  return ''
}
</script>

<style scoped>
.lidar-scores {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--app-surface);
  color: var(--app-text);
  overflow: hidden;
}

.scores-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-surface-muted);
}

.chip {
  font-size: 12px;
  font-family: monospace;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
}

.chip.ok {
  color: #22c55e;
  border-color: #22c55e66;
}

.chip.blocked {
  color: #ef4444;
  border-color: #ef444466;
}

.chip.warn {
  color: #f59e0b;
  border-color: #f59e0b66;
}

.chip.cmd {
  color: #22d3ee;
}

.scores-table {
  flex: 1;
  min-height: 0;
}

.scores-table :deep(.row-collision) {
  --el-table-tr-bg-color: color-mix(in srgb, #ef4444 8%, var(--app-surface));
}

.scores-table :deep(.row-best) {
  --el-table-tr-bg-color: color-mix(in srgb, #22c55e 10%, var(--app-surface));
}

.scores-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--app-text-secondary);
  font-size: 13px;
}
</style>
