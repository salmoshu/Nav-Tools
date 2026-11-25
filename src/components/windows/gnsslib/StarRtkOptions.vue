<template>
  <div class="star-options solver-option-editor">
    <div class="options-toolbar">
      <div class="star-config-actions solver-config-actions">
        <el-button
          size="small"
          :icon="FolderOpened"
          class="keep-action-label"
          :disabled="disabled || busy"
          @click="loadConfig"
        >
          {{ t('gnssLib.starRtk.loadYaml') }}
        </el-button>
        <el-button
          size="small"
          :icon="Download"
          class="keep-action-label"
          :disabled="disabled || busy"
          @click="saveConfig"
        >
          {{ t('gnssLib.starRtk.saveYaml') }}
        </el-button>
      </div>
      <el-input
        v-model="query"
        size="small"
        class="options-search"
        :prefix-icon="Search"
        :placeholder="t('gnssRaw.solverOptions.search')"
        :aria-label="t('gnssRaw.solverOptions.search')"
        spellcheck="false"
        clearable
      />
    </div>

    <div class="options-layout">
      <nav class="options-categories" role="tablist" aria-orientation="vertical">
        <button
          v-for="category in categories"
          :id="`${viewId}-${category}-tab`"
          :key="category"
          :data-category="category"
          class="options-category"
          :class="{ 'is-active': activeCategory === category && !searching }"
          type="button"
          role="tab"
          :aria-selected="activeCategory === category && !searching"
          :aria-controls="`${viewId}-panel`"
          @click="selectCategory(category)"
        >
          {{ categoryLabel(category) }}
        </button>
      </nav>
      <div class="options-category-picker">
        <el-select
          :model-value="activeCategory"
          :aria-label="t('gnssRaw.solverOptions.categoriesLabel')"
          @update:model-value="selectCategory($event as StarCategory)"
        >
          <el-option
            v-for="category in categories"
            :key="category"
            :value="category"
            :label="categoryLabel(category)"
          />
        </el-select>
      </div>

      <div :id="`${viewId}-panel`" class="options-form" role="tabpanel" :aria-label="heading">
        <div class="options-heading">
          <h3>{{ heading }}</h3>
          <button v-if="searching" class="options-clear" type="button" @click="clearSearch">
            {{ t('gnssRaw.solverOptions.back') }}
          </button>
        </div>
        <p v-if="searching && visibleFieldCount === 0" class="options-empty" role="status">
          {{ t('gnssRaw.solverOptions.noMatches') }}
        </p>

        <section v-if="groupVisible('positioning-mode')" class="options-group">
          <button
            class="options-group-toggle"
            type="button"
            :aria-expanded="isGroupOpen('positioning-mode')"
            @click="toggleGroup('positioning-mode')"
          >
            <el-icon :class="{ expanded: isGroupOpen('positioning-mode') }"><ArrowRight /></el-icon>
            <span>{{ t('gnssLib.starRtk.positioningSetup') }}</span>
          </button>
          <div v-if="isGroupOpen('positioning-mode')" class="options-field-grid">
            <label v-show="matches('positioning_mode')">
              <span>{{ t('gnssLib.starRtk.positioning_mode') }}</span>
              <el-select
                v-model="processing.positioning_mode"
                :disabled="disabled"
                data-testid="starrtk-positioning-mode"
              >
                <el-option
                  v-for="mode in STAR_RTK_POSITIONING_MODES"
                  :key="mode"
                  :value="mode"
                  :label="t(`gnssLib.starRtk.positioningModes.${mode}`)"
                />
              </el-select>
            </label>
            <label v-for="key in positioningSwitches" v-show="matches(key)" :key="key">
              <span>{{ t(`gnssLib.starRtk.${key}`) }}</span>
              <el-switch
                v-model="processing[key]"
                :disabled="disabled"
                :data-testid="`starrtk-${key}`"
              />
            </label>
          </div>
        </section>

        <section v-if="timing && groupVisible('realtime-timing')" class="options-group">
          <button
            class="options-group-toggle"
            type="button"
            :aria-expanded="isGroupOpen('realtime-timing')"
            @click="toggleGroup('realtime-timing')"
          >
            <el-icon :class="{ expanded: isGroupOpen('realtime-timing') }"><ArrowRight /></el-icon>
            <span>{{ t('gnssLib.starRtk.realtimeTiming') }}</span>
          </button>
          <div v-if="isGroupOpen('realtime-timing')" class="options-field-grid">
            <label v-show="matches('cycle_ms')">
              <span>{{ t('gnssLib.starRtk.cycle_ms') }}</span>
              <el-input-number
                v-model="timing.cycle_ms"
                :disabled="disabled"
                :min="1"
                :max="1000"
              />
            </label>
            <label v-if="!isSpp" v-show="matches('max_base_age_s')">
              <span>{{ t('gnssLib.starRtk.max_base_age_s') }}</span>
              <el-input-number
                v-model="timing.max_base_age_s"
                :disabled="disabled"
                :min="0"
                :max="120"
                :step="0.1"
              />
            </label>
          </div>
        </section>

        <section v-if="groupVisible('observation-frequencies')" class="options-group">
          <button
            class="options-group-toggle"
            type="button"
            :aria-expanded="isGroupOpen('observation-frequencies')"
            @click="toggleGroup('observation-frequencies')"
          >
            <el-icon :class="{ expanded: isGroupOpen('observation-frequencies') }"
              ><ArrowRight
            /></el-icon>
            <span>{{ t('gnssRaw.rtkpost.constellations') }}</span>
          </button>
          <div v-if="isGroupOpen('observation-frequencies')">
            <table class="star-frequency-table">
              <thead>
                <tr>
                  <th scope="col">{{ t('gnssRaw.rtkpost.constellations') }}</th>
                  <th v-for="slot in isRtk ? 3 : 1" :key="slot" scope="col">
                    {{ t('gnssLib.starRtk.frequency', { slot }) }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="system in STAR_RTK_SYSTEMS" :key="system">
                  <th scope="row">{{ satellites[system] }}</th>
                  <td v-for="slot in isRtk ? 3 : 1" :key="slot">
                    <el-checkbox
                      v-model="processing.frequencies[system][slot - 1]"
                      :aria-label="`${satellites[system]} ${t('gnssLib.starRtk.frequency', { slot })}`"
                      :disabled="disabled"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-if="isRtk" class="star-frequency-hint">
              {{ t('gnssLib.starRtk.frequencyHint') }}
              {{ t('gnssLib.starRtk.qzssFrequencyHint') }}
            </p>
            <p
              v-if="isRtk && (processing.combine_frequencies || processing.widelane_assist)"
              class="star-frequency-hint"
            >
              {{ t('gnssLib.starRtk.widelaneHint') }}
            </p>
          </div>
        </section>

        <section v-if="groupVisible('observation-model')" class="options-group">
          <button
            class="options-group-toggle"
            type="button"
            :aria-expanded="isGroupOpen('observation-model')"
            @click="toggleGroup('observation-model')"
          >
            <el-icon :class="{ expanded: isGroupOpen('observation-model') }"
              ><ArrowRight
            /></el-icon>
            <span>{{ t('gnssLib.starRtk.observationModel') }}</span>
          </button>
          <div v-if="isGroupOpen('observation-model')" class="options-field-grid">
            <label v-show="matches('weighting')">
              <span>{{ t('gnssLib.starRtk.weighting') }}</span>
              <el-select v-model="processing.weighting" :disabled="disabled">
                <el-option value="elevation" :label="t('gnssLib.starRtk.elevation')" />
                <el-option value="signal_strength" :label="t('gnssLib.starRtk.signal_strength')" />
              </el-select>
            </label>
            <label v-show="matches('min_snr_dbhz')">
              <span>{{ t('gnssLib.starRtk.min_snr_dbhz') }}</span>
              <el-input-number
                v-model="processing.min_snr_dbhz"
                :disabled="disabled"
                :min="STAR_RTK_SNR_LIMIT.min"
                :max="STAR_RTK_SNR_LIMIT.max"
                :precision="0"
                data-testid="starrtk-min-snr"
              />
            </label>
            <label v-for="key in observationSwitches" v-show="matches(key)" :key="key">
              <span>{{ t(`gnssLib.starRtk.${key}`) }}</span>
              <el-switch
                v-model="processing[key]"
                :disabled="disabled"
                :data-testid="`starrtk-${key}`"
              />
            </label>
          </div>
        </section>

        <section v-if="groupVisible('ambiguity-resolution')" class="options-group">
          <button
            class="options-group-toggle"
            type="button"
            :aria-expanded="isGroupOpen('ambiguity-resolution')"
            @click="toggleGroup('ambiguity-resolution')"
          >
            <el-icon :class="{ expanded: isGroupOpen('ambiguity-resolution') }"
              ><ArrowRight
            /></el-icon>
            <span>{{ t('gnssLib.starRtk.ambiguityResolution') }}</span>
          </button>
          <div v-if="isGroupOpen('ambiguity-resolution')" class="options-field-grid">
            <label v-show="matches('ambiguity_mode')">
              <span>{{ t('gnssLib.starRtk.ambiguity_mode') }}</span>
              <el-select
                v-model="processing.ambiguity_mode"
                :disabled="disabled"
                data-testid="starrtk-ambiguity-mode"
              >
                <el-option value="continuous" :label="t('gnssLib.starRtk.continuous')" />
                <el-option value="instantaneous" :label="t('gnssLib.starRtk.instantaneous')" />
                <el-option value="fix_and_hold" :label="t('gnssLib.starRtk.fixAndHold')" />
              </el-select>
            </label>
            <label v-show="matches('partial_ambiguity')">
              <span>{{ t('gnssLib.starRtk.partial_ambiguity') }}</span>
              <el-switch
                v-model="processing.partial_ambiguity"
                :disabled="disabled"
                data-testid="starrtk-partial_ambiguity"
              />
            </label>
            <template v-if="processing.ambiguity_mode === 'fix_and_hold'">
              <label v-show="matches('min_fixed_epochs')">
                <span>{{ t('gnssLib.starRtk.min_fixed_epochs') }}</span>
                <el-input-number
                  v-model="processing.fix_hold.min_fixed_epochs"
                  :disabled="disabled"
                  :min="1"
                  :step="1"
                  :precision="0"
                  data-testid="starrtk-min-fixed-epochs"
                />
              </label>
              <label v-show="matches('min_satellites')">
                <span>{{ t('gnssLib.starRtk.min_satellites') }}</span>
                <el-input-number
                  v-model="processing.fix_hold.min_satellites"
                  :disabled="disabled"
                  :min="3"
                  :step="1"
                  :precision="0"
                  data-testid="starrtk-min-satellites"
                />
              </label>
              <label v-show="matches('min_elevation_deg')">
                <span>{{ t('gnssLib.starRtk.min_elevation_deg') }}</span>
                <el-input-number
                  v-model="processing.fix_hold.min_elevation_deg"
                  :disabled="disabled"
                  :min="0"
                  :max="90"
                  :step="1"
                  data-testid="starrtk-min-elevation"
                />
              </label>
              <label v-show="matches('variance_cycles')">
                <span>{{ t('gnssLib.starRtk.variance_cycles') }}</span>
                <el-input-number
                  v-model="processing.fix_hold.variance_cycles"
                  :disabled="disabled"
                  :min="Number.MIN_VALUE"
                  :step="0.001"
                  data-testid="starrtk-variance-cycles"
                />
              </label>
            </template>
          </div>
        </section>

        <section v-if="groupVisible('ambiguity-ratio')" class="options-group">
          <button
            class="options-group-toggle"
            type="button"
            :aria-expanded="isGroupOpen('ambiguity-ratio')"
            @click="toggleGroup('ambiguity-ratio')"
          >
            <el-icon :class="{ expanded: isGroupOpen('ambiguity-ratio') }"><ArrowRight /></el-icon>
            <span>{{ t('gnssLib.starRtk.ratioOptions') }}</span>
          </button>
          <div v-if="isGroupOpen('ambiguity-ratio')" class="options-field-grid">
            <label v-show="matches('adaptiveRatio')">
              <span>{{ t('gnssLib.starRtk.adaptiveRatio') }}</span>
              <el-switch
                v-model="processing.ratio.adaptive"
                :disabled="disabled"
                data-testid="starrtk-adaptive-ratio"
              />
            </label>
            <label v-show="matches('ratioNominal')">
              <span>{{ t('gnssLib.starRtk.ratioNominal') }}</span>
              <el-input-number
                v-model="processing.ratio.nominal"
                :disabled="disabled"
                :min="1 + Number.EPSILON"
                :step="0.1"
                data-testid="starrtk-ratio-nominal"
              />
            </label>
            <label v-show="matches('ratioMinimum')">
              <span>{{ t('gnssLib.starRtk.ratioMinimum') }}</span>
              <el-input-number
                v-model="processing.ratio.minimum"
                :disabled="disabled || !processing.ratio.adaptive"
                :min="1"
                :step="0.1"
                data-testid="starrtk-ratio-minimum"
              />
            </label>
            <label v-show="matches('ratioMaximum')">
              <span>{{ t('gnssLib.starRtk.ratioMaximum') }}</span>
              <el-input-number
                v-model="processing.ratio.maximum"
                :disabled="disabled || !processing.ratio.adaptive"
                :min="1"
                :step="0.1"
                data-testid="starrtk-ratio-maximum"
              />
            </label>
          </div>
        </section>

        <section v-if="groupVisible('ar-retry')" class="options-group">
          <button
            class="options-group-toggle"
            type="button"
            :aria-expanded="isGroupOpen('ar-retry')"
            @click="toggleGroup('ar-retry')"
          >
            <el-icon :class="{ expanded: isGroupOpen('ar-retry') }"><ArrowRight /></el-icon>
            <span>{{ t('gnssLib.starRtk.arRetry') }}</span>
          </button>
          <div v-if="isGroupOpen('ar-retry')" class="options-field-grid">
            <label v-show="matches('ar_retry')">
              <span>{{ t('gnssLib.starRtk.ar_retry') }}</span>
              <el-switch
                v-model="processing.ar_retry.enabled"
                :disabled="disabled"
                data-testid="starrtk-ar-retry"
              />
            </label>
            <label v-show="matches('max_trials')">
              <span>{{ t('gnssLib.starRtk.max_trials') }}</span>
              <el-input-number
                v-model="processing.ar_retry.max_trials"
                :disabled="disabled || !processing.ar_retry.enabled"
                :min="1"
                :max="64"
                :step="1"
                :precision="0"
                data-testid="starrtk-ar-retry-max-trials"
              />
            </label>
            <label v-show="matches('max_correction_m')">
              <span>{{ t('gnssLib.starRtk.max_correction_m') }}</span>
              <el-input-number
                v-model="processing.ar_retry.max_correction_m"
                :disabled="disabled || !processing.ar_retry.enabled"
                :min="Number.MIN_VALUE"
                :step="0.1"
                data-testid="starrtk-ar-retry-max-correction"
              />
            </label>
            <label v-show="matches('max_spp_deviation_m')">
              <span>{{ t('gnssLib.starRtk.max_spp_deviation_m') }}</span>
              <el-input-number
                v-model="processing.ar_retry.max_spp_deviation_m"
                :disabled="disabled || !processing.ar_retry.enabled"
                :min="Number.MIN_VALUE"
                :step="0.5"
                data-testid="starrtk-ar-retry-max-spp-deviation"
              />
            </label>
            <label v-show="matches('validate_candidates')">
              <span>{{ t('gnssLib.starRtk.validate_candidates') }}</span>
              <el-switch
                v-model="processing.ar_retry.validate_candidates"
                :disabled="disabled || !processing.ar_retry.enabled"
                data-testid="starrtk-ar-retry-validate"
              />
            </label>
          </div>
        </section>

        <section v-if="groupVisible('observation-quality')" class="options-group">
          <button
            class="options-group-toggle"
            type="button"
            :aria-expanded="isGroupOpen('observation-quality')"
            @click="toggleGroup('observation-quality')"
          >
            <el-icon :class="{ expanded: isGroupOpen('observation-quality') }"
              ><ArrowRight
            /></el-icon>
            <span>{{ t('gnssLib.starRtk.observationQuality') }}</span>
          </button>
          <div v-if="isGroupOpen('observation-quality')" class="options-field-grid">
            <label v-show="matches('cycle_slip')">
              <span>{{ t('gnssLib.starRtk.cycle_slip') }}</span>
              <el-switch
                v-model="processing.cycle_slip.enabled"
                :disabled="disabled"
                data-testid="starrtk-cycle-slip"
              />
            </label>
            <label v-show="matches('use_lock_flags')">
              <span>{{ t('gnssLib.starRtk.use_lock_flags') }}</span>
              <el-switch
                v-model="processing.cycle_slip.use_lock_flags"
                :disabled="disabled || !processing.cycle_slip.enabled"
                data-testid="starrtk-cycle-slip-lock-flags"
              />
            </label>
            <label v-show="matches('residual_gate')">
              <span>{{ t('gnssLib.starRtk.residual_gate') }}</span>
              <el-switch
                v-model="processing.residual_gate.enabled"
                :disabled="disabled"
                data-testid="starrtk-residual-gate"
              />
            </label>
            <label v-show="matches('phase_sigma')">
              <span>{{ t('gnssLib.starRtk.phase_sigma') }}</span>
              <el-input-number
                v-model="processing.residual_gate.phase_sigma"
                :disabled="disabled || !processing.residual_gate.enabled"
                :min="Number.MIN_VALUE"
                :step="0.5"
                data-testid="starrtk-residual-phase-sigma"
              />
            </label>
            <label v-show="matches('code_sigma')">
              <span>{{ t('gnssLib.starRtk.code_sigma') }}</span>
              <el-input-number
                v-model="processing.residual_gate.code_sigma"
                :disabled="disabled || !processing.residual_gate.enabled"
                :min="Number.MIN_VALUE"
                :step="0.5"
                data-testid="starrtk-residual-code-sigma"
              />
            </label>
            <label v-show="matches('degraded_guard')">
              <span>{{ t('gnssLib.starRtk.degraded_guard') }}</span>
              <el-switch
                v-model="processing.degraded_guard"
                :disabled="disabled"
                data-testid="starrtk-degraded_guard"
              />
            </label>
          </div>
        </section>

        <section v-if="groupVisible('dgnss-fallback')" class="options-group">
          <button
            class="options-group-toggle"
            type="button"
            :aria-expanded="isGroupOpen('dgnss-fallback')"
            @click="toggleGroup('dgnss-fallback')"
          >
            <el-icon :class="{ expanded: isGroupOpen('dgnss-fallback') }"><ArrowRight /></el-icon>
            <span>{{
              t(isRtk ? 'gnssLib.starRtk.dgnssFallback' : 'gnssLib.starRtk.rtdQuality')
            }}</span>
          </button>
          <div v-if="isGroupOpen('dgnss-fallback')">
            <div class="options-field-grid">
              <label v-if="isRtk" v-show="matches('dgnss')">
                <span>{{ t('gnssLib.starRtk.dgnss') }}</span>
                <el-switch
                  v-model="processing.dgnss.enabled"
                  :disabled="disabled"
                  data-testid="starrtk-dgnss"
                />
              </label>
              <label v-if="isRtk" v-show="matches('max_float_rms_m')">
                <span>{{ t('gnssLib.starRtk.max_float_rms_m') }}</span>
                <el-input-number
                  v-model="processing.dgnss.max_float_rms_m"
                  :disabled="disabled || !processing.dgnss.enabled"
                  :min="Number.MIN_VALUE"
                  :max="20"
                  :step="0.05"
                  data-testid="starrtk-dgnss-max-float-rms"
                />
              </label>
              <label v-show="matches('max_dgnss_rms_m')">
                <span>{{ t('gnssLib.starRtk.max_dgnss_rms_m') }}</span>
                <el-input-number
                  v-model="processing.dgnss.max_dgnss_rms_m"
                  :disabled="disabled || (isRtk && !processing.dgnss.enabled)"
                  :min="Number.MIN_VALUE"
                  :max="100"
                  :step="0.1"
                  data-testid="starrtk-dgnss-max-rms"
                />
              </label>
              <label v-show="matches('dgnssMinSatellites')">
                <span>{{ t('gnssLib.starRtk.dgnssMinSatellites') }}</span>
                <el-input-number
                  v-model="processing.dgnss.min_satellites"
                  :disabled="disabled || (isRtk && !processing.dgnss.enabled)"
                  :min="5"
                  :max="64"
                  :step="1"
                  :precision="0"
                  data-testid="starrtk-dgnss-min-satellites"
                />
              </label>
            </div>
            <p v-if="isRtk" class="star-frequency-hint">{{ t('gnssLib.starRtk.dgnssHint') }}</p>
          </div>
        </section>

        <section v-if="groupVisible('spp-filter')" class="options-group">
          <button
            class="options-group-toggle"
            type="button"
            :aria-expanded="isGroupOpen('spp-filter')"
            @click="toggleGroup('spp-filter')"
          >
            <el-icon :class="{ expanded: isGroupOpen('spp-filter') }"><ArrowRight /></el-icon>
            <span>{{ t('gnssLib.starRtk.sppFilter') }}</span>
          </button>
          <div v-if="isGroupOpen('spp-filter')" class="options-field-grid">
            <label v-show="matches('spp_filter')">
              <span>{{ t('gnssLib.starRtk.spp_filter') }}</span>
              <el-switch
                v-model="processing.spp_filter.enabled"
                :disabled="disabled"
                data-testid="starrtk-spp-filter"
              />
            </label>
            <label
              v-for="{ key, min, max, step } in STAR_RTK_SPP_FILTER_FIELDS"
              v-show="matches(key)"
              :key="key"
            >
              <span>{{ t(`gnssLib.starRtk.${key}`) }}</span>
              <el-input-number
                v-model="processing.spp_filter[key]"
                :disabled="disabled || !processing.spp_filter.enabled"
                :min="min"
                :max="max"
                :step="step"
                :data-testid="`starrtk-spp-filter-${key}`"
              />
            </label>
          </div>
        </section>

        <section v-if="groupVisible('motion-filter')" class="options-group">
          <button
            class="options-group-toggle"
            type="button"
            :aria-expanded="isGroupOpen('motion-filter')"
            @click="toggleGroup('motion-filter')"
          >
            <el-icon :class="{ expanded: isGroupOpen('motion-filter') }"><ArrowRight /></el-icon>
            <span>{{ t('gnssLib.starRtk.motionFilter') }}</span>
          </button>
          <div v-if="isGroupOpen('motion-filter')" class="options-field-grid">
            <label v-show="matches('motion_prior')">
              <span>{{ t('gnssLib.starRtk.motion_prior') }}</span>
              <el-switch
                v-model="processing.motion_prior.enabled"
                :disabled="disabled"
                data-testid="starrtk-motion-prior"
              />
            </label>
            <label v-show="matches('float_hold')">
              <span>{{ t('gnssLib.starRtk.float_hold') }}</span>
              <el-switch
                v-model="processing.float_hold.enabled"
                :disabled="disabled"
                data-testid="starrtk-float-hold"
              />
            </label>
            <label v-show="matches('max_duration_s')">
              <span>{{ t('gnssLib.starRtk.max_duration_s') }}</span>
              <el-input-number
                v-model="processing.float_hold.max_duration_s"
                :disabled="disabled || !processing.float_hold.enabled"
                :min="Number.MIN_VALUE"
                :max="60"
                :step="0.5"
                data-testid="starrtk-float-hold-duration"
              />
            </label>
          </div>
        </section>

        <section v-if="groupVisible('output-diagnostics')" class="options-group">
          <button
            class="options-group-toggle"
            type="button"
            :aria-expanded="isGroupOpen('output-diagnostics')"
            @click="toggleGroup('output-diagnostics')"
          >
            <el-icon :class="{ expanded: isGroupOpen('output-diagnostics') }"
              ><ArrowRight
            /></el-icon>
            <span>{{ t('gnssLib.starRtk.categories.output') }}</span>
          </button>
          <div v-if="isGroupOpen('output-diagnostics')" class="options-field-grid">
            <label v-show="matches('trace_directory')">
              <span>{{ t('gnssLib.starRtk.trace_directory') }}</span>
              <div class="star-directory-field">
                <el-input
                  v-model="processing.trace_directory"
                  :disabled="disabled"
                  data-testid="starrtk-trace-directory"
                  clearable
                />
                <el-button
                  :disabled="disabled || busy"
                  :aria-label="t('gnssLib.starRtk.chooseTraceDirectory')"
                  :title="t('gnssLib.starRtk.chooseTraceDirectory')"
                  data-testid="starrtk-choose-trace-directory"
                  @click="chooseTraceDirectory"
                >
                  <el-icon><FolderOpened /></el-icon>
                </el-button>
              </div>
            </label>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowRight, Download, FolderOpened, Search } from '@element-plus/icons-vue'
import { t } from '@/i18n'
import type { RtkPostSaveConfigRequest } from '@/core/gnsslib/RtkPost'
import {
  STAR_RTK_POSITIONING_MODES,
  STAR_RTK_PROCESSING_GROUPS,
  STAR_RTK_SNR_LIMIT,
  STAR_RTK_SPP_FILTER_FIELDS,
  STAR_RTK_SYSTEMS,
  type StarRtkConfiguration,
  type StarRtkProcessingGroup as StarCategory,
  type StarRtkProcessingOptions,
  type StarRtkTimingOptions,
} from '@/core/gnsslib/StarRtkConfig'

const props = defineProps<{
  disabled: boolean
  applyConfig: (config: StarRtkConfiguration) => void
  exportConfig: () => RtkPostSaveConfigRequest
}>()
const processing = defineModel<StarRtkProcessingOptions>({ required: true })
const timing = defineModel<StarRtkTimingOptions>('timing')
const busy = ref(false)
const viewId = `star-options-${useId()}`
const allCategories = Object.keys(STAR_RTK_PROCESSING_GROUPS) as StarCategory[]
const groupCategories = {
  'positioning-mode': 'positioning',
  'realtime-timing': 'positioning',
  'observation-model': 'observations',
  'observation-frequencies': 'observations',
  'ambiguity-resolution': 'ambiguity',
  'ambiguity-ratio': 'ambiguity',
  'ar-retry': 'ambiguity',
  'observation-quality': 'quality_control',
  'dgnss-fallback': 'quality_control',
  'motion-filter': 'filtering',
  'spp-filter': 'filtering',
  'output-diagnostics': 'output',
} as const satisfies Record<string, StarCategory>
type StarGroup = keyof typeof groupCategories
const activeCategory = ref<StarCategory>('positioning')
const isSpp = computed(() => processing.value.positioning_mode === 'spp')
const isRtk = computed(() => processing.value.positioning_mode === 'rtk')
const positioningSwitches = computed(() =>
  isRtk.value
    ? (['base_static', 'rover_static', 'single_epoch'] as const)
    : isSpp.value
      ? []
      : (['base_static', 'rover_static'] as const),
)
const observationSwitches = computed(() =>
  isRtk.value ? (['combine_frequencies', 'widelane_assist'] as const) : [],
)
const query = ref('')
const collapsedGroups = ref(new Set<StarGroup>())
const searching = computed(() => !!query.value.trim())
const satellites = {
  gps: 'GPS',
  beidou: 'BeiDou',
  glonass: 'GLONASS',
  galileo: 'Galileo',
  qzss: 'QZSS',
}
const groupTerms = computed<Record<StarGroup, string[]>>(() => ({
  'positioning-mode': ['positioning_mode', ...positioningSwitches.value],
  'realtime-timing': timing.value ? ['cycle_ms', ...(isSpp.value ? [] : ['max_base_age_s'])] : [],
  'observation-model': ['weighting', 'min_snr_dbhz', ...observationSwitches.value],
  'observation-frequencies': ['frequencies', ...STAR_RTK_SYSTEMS],
  'ambiguity-resolution': isRtk.value
    ? [
        'ambiguity_mode',
        'partial_ambiguity',
        ...(processing.value.ambiguity_mode === 'fix_and_hold'
          ? ['min_fixed_epochs', 'min_satellites', 'min_elevation_deg', 'variance_cycles']
          : []),
      ]
    : [],
  'ambiguity-ratio': isRtk.value
    ? ['adaptiveRatio', 'ratioNominal', 'ratioMinimum', 'ratioMaximum']
    : [],
  'ar-retry': isRtk.value
    ? ['ar_retry', 'max_trials', 'max_correction_m', 'max_spp_deviation_m', 'validate_candidates']
    : [],
  'observation-quality': isRtk.value
    ? [
        'cycle_slip',
        'use_lock_flags',
        'residual_gate',
        'phase_sigma',
        'code_sigma',
        'degraded_guard',
      ]
    : [],
  'dgnss-fallback': isSpp.value
    ? []
    : [
        ...(isRtk.value ? ['dgnss', 'max_float_rms_m'] : []),
        'max_dgnss_rms_m',
        'dgnssMinSatellites',
      ],
  'motion-filter': isRtk.value ? ['motion_prior', 'float_hold', 'max_duration_s'] : [],
  'spp-filter':
    isRtk.value || isSpp.value
      ? ['spp_filter', ...STAR_RTK_SPP_FILTER_FIELDS.map(({ key }) => key)]
      : [],
  'output-diagnostics': ['trace_directory'],
}))
const categories = computed(() =>
  allCategories.filter((category) =>
    (Object.keys(groupCategories) as StarGroup[]).some(
      (group) => groupCategories[group] === category && groupTerms.value[group].length,
    ),
  ),
)
watch(categories, (available) => {
  if (!available.includes(activeCategory.value)) activeCategory.value = 'positioning'
})

const yamlPaths: Partial<Record<string, string>> = {
  ...Object.fromEntries(STAR_RTK_SYSTEMS.map((system) => [system, `frequencies.${system}`])),
  min_fixed_epochs: 'fix_hold.min_fixed_epochs',
  min_satellites: 'fix_hold.min_satellites',
  min_elevation_deg: 'fix_hold.min_elevation_deg',
  variance_cycles: 'fix_hold.variance_cycles',
  adaptiveRatio: 'ratio.adaptive',
  ratioNominal: 'ratio.nominal',
  ratioMinimum: 'ratio.minimum',
  ratioMaximum: 'ratio.maximum',
  ar_retry: 'ar_retry.enabled',
  max_trials: 'ar_retry.max_trials',
  max_correction_m: 'ar_retry.max_correction_m',
  max_spp_deviation_m: 'ar_retry.max_spp_deviation_m',
  validate_candidates: 'ar_retry.validate_candidates',
  cycle_slip: 'cycle_slip.enabled',
  use_lock_flags: 'cycle_slip.use_lock_flags',
  residual_gate: 'residual_gate.enabled',
  phase_sigma: 'residual_gate.phase_sigma',
  code_sigma: 'residual_gate.code_sigma',
  dgnss: 'dgnss.enabled',
  max_float_rms_m: 'dgnss.max_float_rms_m',
  max_dgnss_rms_m: 'dgnss.max_dgnss_rms_m',
  dgnssMinSatellites: 'dgnss.min_satellites',
  motion_prior: 'motion_prior.enabled',
  float_hold: 'float_hold.enabled',
  max_duration_s: 'float_hold.max_duration_s',
  spp_filter: 'spp_filter.enabled',
  ...Object.fromEntries(STAR_RTK_SPP_FILTER_FIELDS.map(({ key }) => [key, `spp_filter.${key}`])),
}

function categoryLabel(category: StarCategory): string {
  return t(`gnssLib.starRtk.categories.${category}`)
}
function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().trim()
}
function matches(term: string): boolean {
  const tokens = normalize(query.value).split(/\s+/).filter(Boolean)
  if (!tokens.length) return true
  const path = yamlPaths[term] ?? term
  const option = path.split('.', 1)[0]
  const category = allCategories.find((group) =>
    (STAR_RTK_PROCESSING_GROUPS[group] as readonly string[]).includes(option),
  )
  const aliases = category
    ? [`processing.${path}`, `processing.${category}.${path}`]
    : [`realtime.${path}`]
  const system = STAR_RTK_SYSTEMS.find((name) => name === term)
  const label = system
    ? satellites[system]
    : term === 'frequencies'
      ? t('gnssRaw.rtkpost.constellations')
      : t(`gnssLib.starRtk.${term}`)
  const text = normalize([term, path, ...aliases, label].join(' '))
  return tokens.every((token) => text.includes(token))
}
function groupVisible(group: StarGroup): boolean {
  const terms = groupTerms.value[group]
  const category = groupCategories[group]
  if (!terms.length || (!searching.value && activeCategory.value !== category)) return false
  return !searching.value || terms.some((term) => matches(term))
}
const visibleFieldCount = computed(
  () =>
    Object.values(groupTerms.value)
      .flat()
      .filter((field) => matches(field)).length,
)
const heading = computed(() =>
  searching.value
    ? t('gnssRaw.solverOptions.searchResults', { count: visibleFieldCount.value })
    : categoryLabel(activeCategory.value),
)
function isGroupOpen(group: StarGroup): boolean {
  return searching.value || !collapsedGroups.value.has(group)
}
function toggleGroup(group: StarGroup): void {
  if (collapsedGroups.value.has(group)) collapsedGroups.value.delete(group)
  else collapsedGroups.value.add(group)
}
function selectCategory(category: StarCategory): void {
  activeCategory.value = category
  clearSearch()
}
function clearSearch(): void {
  query.value = ''
}

async function chooseTraceDirectory(): Promise<void> {
  const choose = window.electronAPI?.starRtkChooseDirectory
  if (!choose) {
    ElMessage.info(t('gnssLib.solver.desktopOnly'))
    return
  }
  busy.value = true
  try {
    const directory = await choose()
    if (directory && !props.disabled) processing.value.trace_directory = directory
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  } finally {
    busy.value = false
  }
}

async function loadConfig(): Promise<void> {
  const api = window.electronAPI
  if (!api?.starRtkReadConfig || !api.openFileDialog) {
    ElMessage.info(t('gnssLib.solver.desktopOnly'))
    return
  }
  busy.value = true
  try {
    const files = await api.openFileDialog({
      scope: 'starrtk-config',
      filters: [{ name: 'StarRTK YAML', extensions: ['yaml', 'yml'] }],
    })
    if (!files?.[0]) return
    const config = await api.starRtkReadConfig(files[0])
    if (props.disabled) return
    props.applyConfig(config)
    ElMessage.success(t('gnssLib.starRtk.yamlLoaded'))
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  } finally {
    busy.value = false
  }
}

async function saveConfig(): Promise<void> {
  const save = window.electronAPI?.rtkPostSaveConfig
  if (!save) {
    ElMessage.info(t('gnssLib.solver.desktopOnly'))
    return
  }
  busy.value = true
  try {
    if (await save(props.exportConfig())) ElMessage.success(t('gnssLib.starRtk.yamlSaved'))
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.star-directory-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--ui-space-sm);
}

.star-directory-field .el-input {
  min-width: 0;
}

.star-directory-field .el-button {
  margin-left: 0;
}

.star-frequency-table {
  width: 100%;
  max-width: 520px;
  border-collapse: collapse;
}

.star-frequency-table th,
.star-frequency-table td {
  padding: var(--ui-space-xs) var(--ui-space-sm);
  border-bottom: 1px solid var(--el-border-color-lighter);
  text-align: center;
}

.star-frequency-table th:first-child {
  text-align: start;
}

.star-frequency-hint {
  margin: var(--ui-space-md) 0 0;
  color: var(--el-text-color-secondary);
  font-size: 11px;
  line-height: 1.5;
}
</style>
<style scoped src="./solverOptionLayout.css"></style>
