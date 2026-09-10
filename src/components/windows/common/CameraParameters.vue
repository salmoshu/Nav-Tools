<template>
  <section class="camera-parameters">
    <div class="camera-toolbar">
      <span class="camera-endpoint" :title="`${host}:${portText}`">
        <el-icon><Connection /></el-icon>
        {{ host || '—' }}<span class="endpoint-port">:{{ portText }}</span>
      </span>
      <span class="conn-status" :class="`conn-status--${status}`" role="status">
        <span class="conn-status__dot"></span>
        TCP · {{ statusText }}
      </span>
    </div>
    <el-tabs v-model="activeTab" class="camera-tabs" stretch>
      <el-tab-pane :label="t('common.camera.tabs.connection')" name="connection">
        <div class="parameter-scroll">
          <div class="connection-card section-card">
            <div class="section-heading">
              <span class="heading-icon"
                ><el-icon><Connection /></el-icon
              ></span>
              <div class="section-title">
                <strong>{{ t('common.camera.tcpTitle') }}</strong>
                <p>{{ t('common.camera.tcpDesc') }}</p>
              </div>
              <el-button text type="primary" @click="openNetworkSettings">
                {{ t('common.camera.configure') }}
              </el-button>
            </div>

            <div class="connection-grid">
              <label>
                <span>{{ t('common.camera.serverAddress') }}</span>
                <el-input
                  class="network-setting-display"
                  :model-value="host"
                  :aria-label="t('common.camera.serverAddress')"
                  :title="t('common.camera.networkSettingsHint')"
                  readonly
                  @click="openNetworkSettings"
                />
              </label>
              <label>
                <span>{{ t('common.camera.port') }}</span>
                <el-input
                  class="network-setting-display"
                  :model-value="portText"
                  :aria-label="t('common.camera.port')"
                  :title="t('common.camera.networkSettingsHint')"
                  readonly
                  @click="openNetworkSettings"
                />
              </label>
              <label>
                <span>{{ t('common.camera.loginCommand') }}</span>
                <el-input
                  model-value="0x00000001"
                  :aria-label="t('common.camera.loginCommand')"
                  readonly
                />
              </label>
            </div>
          </div>
          <div class="ssh-card section-card">
            <div class="section-heading">
              <span class="heading-icon"
                ><el-icon><Key /></el-icon
              ></span>
              <div class="section-title">
                <strong>{{ t('common.camera.sshTitle') }}</strong>
                <p>{{ t('common.camera.sshDesc') }}</p>
              </div>
              <span class="protocol-tag">SSH</span>
            </div>
            <div class="cal-config cal-ssh">
              <label>
                <span>{{ t('common.camera.calibration.sshHost') }}</span>
                <el-input
                  v-model="sshForm.host"
                  :disabled="calRunning || observing || scriptRunning"
                  :aria-label="t('common.camera.calibration.sshHost')"
                />
              </label>
              <label>
                <span>{{ t('common.camera.calibration.sshPort') }}</span>
                <el-input-number
                  v-model="sshForm.port"
                  :min="1"
                  :max="65535"
                  :step="1"
                  :precision="0"
                  controls-position="right"
                  :disabled="calRunning || observing || scriptRunning"
                  :aria-label="t('common.camera.calibration.sshPort')"
                />
              </label>
              <label>
                <span>{{ t('common.camera.calibration.sshUsername') }}</span>
                <el-input
                  v-model="sshForm.username"
                  :disabled="calRunning || observing || scriptRunning"
                  :aria-label="t('common.camera.calibration.sshUsername')"
                />
              </label>
              <label>
                <span>{{ t('common.camera.calibration.sshPassword') }}</span>
                <el-input
                  v-model="sshForm.password"
                  type="password"
                  show-password
                  :disabled="calRunning || observing || scriptRunning"
                  :aria-label="t('common.camera.calibration.sshPassword')"
                  :placeholder="
                    sshPasswordSaved
                      ? t('common.camera.calibration.sshPasswordSaved')
                      : t('common.camera.calibration.sshPassword')
                  "
                />
              </label>
            </div>
            <p class="connection-note">
              <el-icon><InfoFilled /></el-icon>{{ t('common.camera.sshHint') }}
            </p>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane :label="t('common.camera.tabs.command')" name="command">
        <div class="parameter-scroll">
          <div class="command-card section-card">
            <div class="section-heading">
              <span class="heading-icon"
                ><el-icon><Setting /></el-icon
              ></span>
              <div class="section-title">
                <strong>{{ t('common.camera.cameraCommands') }}</strong>
                <p>{{ t('common.camera.commandDesc') }}</p>
              </div>
              <el-button text class="hint-toggle" @click="showCommandHelp = true">
                <el-icon><InfoFilled /></el-icon>
                {{ t('common.camera.help') }}
              </el-button>
            </div>

            <div class="command-form">
              <div v-if="status !== 'connected' || calRunning" class="inline-notice">
                <el-icon><InfoFilled /></el-icon>
                <span>{{
                  t(
                    calRunning
                      ? 'common.camera.commandBusy'
                      : 'common.camera.errTcpConfigurationRequired',
                  )
                }}</span>
                <el-button
                  v-if="status !== 'connected'"
                  link
                  type="primary"
                  @click="openNetworkSettings"
                  >{{ t('common.camera.configure') }}</el-button
                >
              </div>
              <div class="field-row sub-command-field">
                <span class="field-label">{{ t('common.camera.subCommandType') }}</span>
                <el-select
                  v-model="subCommand"
                  :aria-label="t('common.camera.subCommandType')"
                  :placeholder="t('common.camera.selectSubCommand')"
                  :disabled="sending"
                  @change="handleSubCommandChange"
                >
                  <el-option
                    v-for="option in subCommandOptions"
                    :key="option"
                    :label="option"
                    :value="option"
                  />
                </el-select>
                <div class="format-switch">
                  <span>{{ t('common.camera.byteFormat') }}</span>
                  <el-switch
                    v-model="contentIsHex"
                    :disabled="sending"
                    :aria-label="t('common.camera.byteFormat')"
                  />
                </div>
              </div>

              <div class="field-row content-field">
                <span class="field-label">{{ t('common.camera.subCommandContent') }}</span>
                <el-input
                  v-model="content"
                  :aria-label="t('common.camera.subCommandContent')"
                  type="textarea"
                  :rows="3"
                  resize="vertical"
                  :disabled="sending"
                  :placeholder="contentPlaceholder"
                  @keydown.ctrl.enter.prevent="sendCommand"
                />
              </div>

              <div class="command-actions">
                <span>{{ t('common.camera.ctrlEnterHint') }}</span>
                <el-button
                  type="primary"
                  :loading="sending"
                  :disabled="status !== 'connected' || calRunning"
                  @click="sendCommand"
                >
                  <el-icon v-if="!sending"><Promotion /></el-icon>
                  {{ sending ? t('common.camera.sending') : t('common.camera.sendCommand') }}
                </el-button>
              </div>

              <div class="output-summary">
                <span class="output-summary-text" :title="lastLogLine">{{
                  lastLogLine || t('common.camera.waitingToSend')
                }}</span>
                <el-button
                  text
                  size="small"
                  :disabled="logs.length === 0"
                  @click="showFullOutput = true"
                >
                  <el-icon><Document /></el-icon>
                  {{ t('common.camera.fullOutput') }}
                </el-button>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane name="calibration" class="calibration-pane">
        <template #label>
          <span class="tab-label"
            >{{ t('common.camera.calibration.title')
            }}<i v-if="observing || calRunning" class="activity-dot"></i
          ></span>
        </template>
        <div ref="calScrollContainer" class="parameter-scroll" @scroll="onCalViewScroll">
          <div class="calibration-card section-card">
            <div class="section-heading">
              <span class="heading-icon"
                ><el-icon><Aim /></el-icon
              ></span>
              <div class="section-title">
                <strong>{{ t('common.camera.calibration.title') }}</strong>
                <p>{{ t('common.camera.calibration.desc') }}</p>
              </div>
              <span class="cal-phase" :class="`cal-phase--${phaseTone}`" role="status">
                <span class="cal-phase__dot"></span>
                {{ phaseText }}
              </span>
            </div>

            <div class="calibration-body">
              <div
                v-if="calState && (calState.observing || calState.reason)"
                class="cal-progress"
                :class="`cal-progress--${phaseTone}`"
              >
                <div class="cal-progress-row">
                  <span>{{
                    t('common.camera.calibration.currentOffset', {
                      offset: formatOffset(calState.offset),
                    })
                  }}</span>
                  <span>{{
                    t('common.camera.calibration.writeCount', { n: calState.writeCount })
                  }}</span>
                  <span>{{
                    t('common.camera.calibration.sampleCountText', { n: calState.sampleCount })
                  }}</span>
                </div>
                <div v-if="calState.distances" class="cal-progress-row">
                  <span v-for="(distance, index) in calState.distances" :key="index">
                    {{
                      t('common.camera.calibration.targetMedian', {
                        n: index + 1,
                        value: distance.toFixed(3),
                        spread: calState.spreads ? calState.spreads[index].toFixed(3) : '—',
                      })
                    }}
                  </span>
                </div>
                <div class="cal-reason" role="status">{{ calState.reason }}</div>
              </div>
              <div class="workflow-section">
                <div class="workflow-heading">
                  <span class="step-number">1</span>
                  <h3>{{ t('common.camera.calibration.observeTitle') }}</h3>
                  <el-button text size="small" @click="activeTab = 'connection'">{{
                    t('common.camera.connectionSettings')
                  }}</el-button>
                </div>
                <div class="cal-source">
                  <span class="field-label">{{
                    t('common.camera.calibration.measurementSource')
                  }}</span>
                  <span
                    class="cal-source-value"
                    :class="{ 'cal-source-value--off': sshStateText === null }"
                    :title="sshStateText ?? sshEndpoint"
                  >
                    {{ sshStateText ?? sshEndpoint }}
                  </span>
                  <el-button
                    :type="observing ? 'default' : 'primary'"
                    plain
                    :disabled="calRunning || status !== 'connected'"
                    @click="toggleObservation"
                  >
                    <el-icon><Refresh /></el-icon>
                    {{
                      observing
                        ? t('common.camera.calibration.stopObserve')
                        : t('common.camera.calibration.observe')
                    }}
                  </el-button>
                </div>

                <p v-if="calState?.observing" class="cal-hint">
                  {{ t('common.camera.calibration.observeHint') }}
                  ·
                  {{
                    t('common.camera.calibration.frameStats', {
                      valid: calState.validFrames,
                      invalid: calState.invalidFrames,
                      count: calState.reportedCount ?? '—',
                    })
                  }}
                </p>
                <p v-if="!observing" class="cal-hint">
                  {{ t('common.camera.calibration.observeIdleHint') }}
                </p>
                <details
                  v-if="calState?.observing && calState.rawLines.length"
                  class="cal-diagnostics"
                >
                  <summary>{{ t('common.camera.calibration.rawData') }}</summary>
                  <pre class="cal-raw">{{ calState.rawLines.join('\n') }}</pre>
                </details>
              </div>

              <div v-if="recoveryItems.length" class="cal-recovery">
                <div class="cal-recovery-title">
                  {{ t('common.camera.calibration.recoveryTitle') }}
                </div>
                <div v-for="item in recoveryItems" :key="item.label" class="cal-recovery-item">
                  <span
                    v-if="item.pending"
                    class="cal-remark-verify"
                  >…</span>
                  <span
                    v-else
                    :class="item.ok ? 'cal-ok' : 'cal-bad'"
                  >{{ item.ok ? '✓' : '✗' }}</span>
                  <span>{{ item.label }}</span>
                  <span v-if="item.detail" class="cal-recovery-detail">{{ item.detail }}</span>
                </div>
              </div>

              <div class="workflow-section">
                <div class="workflow-heading">
                  <span class="step-number">2</span>
                  <h3>{{ t('common.camera.calibration.targetsTitle') }}</h3>
                </div>
                <div class="cal-targets-head">
                  <label class="cal-target-count">
                    <span>{{ t('common.camera.calibration.targetCount') }}</span>
                    <el-select
                      v-model="targetCount"
                      :disabled="calRunning"
                      :aria-label="t('common.camera.calibration.targetCount')"
                    >
                      <el-option
                        :label="t('common.camera.calibration.targetCountOne')"
                        :value="1"
                      />
                      <el-option
                        :label="t('common.camera.calibration.targetCountTwo')"
                        :value="2"
                        disabled
                      />
                    </el-select>
                  </label>
                  <label v-if="targetCount === 2" class="cal-target-count">
                    <span>{{ t('common.camera.calibration.person1Side') }}</span>
                    <el-select
                      v-model="calForm.nearSide"
                      :disabled="calRunning"
                      :aria-label="t('common.camera.calibration.person1Side')"
                    >
                      <el-option :label="t('common.camera.calibration.sideLeft')" value="left" />
                      <el-option :label="t('common.camera.calibration.sideRight')" value="right" />
                    </el-select>
                  </label>
                </div>

                <div class="cal-target-groups">
                  <div
                    v-for="(target, index) in calForm.targets"
                    :key="index"
                    class="cal-target-group"
                  >
                    <div class="cal-target-group-title">
                      {{ t('common.camera.calibration.targetGroup', { n: index + 1 }) }}
                    </div>
                    <label>
                      <span>{{ t('common.camera.calibration.targetDistance') }}</span>
                      <el-input-number
                        v-model="target.distance"
                        :min="0.1"
                        :max="20"
                        :step="0.1"
                        :precision="2"
                        controls-position="right"
                        :disabled="calRunning"
                      />
                    </label>
                    <label>
                      <span>{{ t('common.camera.calibration.biasMinCm') }}</span>
                      <el-input-number
                        v-model="target.biasMinCm"
                        :min="-100"
                        :max="100"
                        :step="1"
                        :precision="1"
                        controls-position="right"
                        :disabled="calRunning"
                      />
                    </label>
                    <label>
                      <span>{{ t('common.camera.calibration.biasMaxCm') }}</span>
                      <el-input-number
                        v-model="target.biasMaxCm"
                        :min="-100"
                        :max="100"
                        :step="1"
                        :precision="1"
                        controls-position="right"
                        :disabled="calRunning"
                      />
                    </label>
                  </div>
                </div>
              </div>
              <div class="workflow-section">
                <div class="workflow-heading">
                  <span class="step-number">3</span>
                  <h3>{{ t('common.camera.calibration.paramsTitle') }}</h3>
                </div>
                <div class="cal-config">
                  <label>
                    <span>{{ t('common.camera.calibration.height') }}</span>
                    <el-input-number
                      v-model="calForm.height"
                      :min="0.1"
                      :max="5"
                      :step="0.05"
                      :precision="2"
                      controls-position="right"
                      :disabled="calRunning"
                    />
                  </label>
                  <label>
                    <span>{{ t('common.camera.calibration.fov') }}</span>
                    <el-input-number
                      v-model="calForm.fov"
                      :min="1"
                      :max="179"
                      :step="0.1"
                      :precision="3"
                      controls-position="right"
                      :disabled="calRunning"
                    />
                  </label>
                  <label>
                    <span>{{ t('common.camera.calibration.initialOffset') }}</span>
                    <el-input-number
                      v-model="calForm.initialOffset"
                      :min="calForm.minOffset"
                      :max="calForm.maxOffset"
                      :step="0.5"
                      :precision="2"
                      controls-position="right"
                      :disabled="calRunning"
                    />
                  </label>
                  <label>
                    <span>{{ t('common.camera.calibration.personClassId') }}</span>
                    <el-input-number
                      v-model="calForm.personClassId"
                      :min="0"
                      :max="255"
                      :step="1"
                      :precision="0"
                      controls-position="right"
                      :disabled="calRunning"
                    />
                  </label>
                  <label>
                    <span>{{ t('common.camera.calibration.minOffset') }}</span>
                    <el-input-number
                      v-model="calForm.minOffset"
                      :min="-100"
                      :max="-0.1"
                      :step="1"
                      :precision="2"
                      controls-position="right"
                      :disabled="calRunning"
                    />
                  </label>
                  <label>
                    <span>{{ t('common.camera.calibration.maxOffset') }}</span>
                    <el-input-number
                      v-model="calForm.maxOffset"
                      :min="-100"
                      :max="-0.1"
                      :step="1"
                      :precision="2"
                      controls-position="right"
                      :disabled="calRunning"
                    />
                  </label>
                  <label>
                    <span>{{ t('common.camera.calibration.step') }}</span>
                    <el-input-number
                      v-model="calForm.step"
                      :min="0.05"
                      :max="10"
                      :step="0.1"
                      :precision="2"
                      controls-position="right"
                      :disabled="calRunning"
                    />
                  </label>
                </div>

                <el-collapse class="cal-advanced">
                  <el-collapse-item
                    :title="t('common.camera.calibration.advancedTitle')"
                    name="advanced"
                  >
                    <div class="cal-config">
                      <label>
                        <span>{{ t('common.camera.calibration.sampleCount') }}</span>
                        <el-input-number
                          v-model="calForm.sampleCount"
                          :min="3"
                          :max="1000"
                          :step="1"
                          :precision="0"
                          controls-position="right"
                          :disabled="calRunning"
                        />
                      </label>
                      <label>
                        <span>{{ t('common.camera.calibration.windowMs') }}</span>
                        <el-input-number
                          v-model="calForm.windowMs"
                          :min="200"
                          :max="10000"
                          :step="100"
                          :precision="0"
                          controls-position="right"
                          :disabled="calRunning"
                        />
                      </label>
                      <label>
                        <span>{{ t('common.camera.calibration.maxSpreadM') }}</span>
                        <el-input-number
                          v-model="calForm.maxSpreadM"
                          :min="0.005"
                          :max="1"
                          :step="0.01"
                          :precision="3"
                          controls-position="right"
                          :disabled="calRunning"
                        />
                      </label>
                      <label>
                        <span>{{ t('common.camera.calibration.settleMs') }}</span>
                        <el-input-number
                          v-model="calForm.settleMs"
                          :min="500"
                          :max="10000"
                          :step="100"
                          :precision="0"
                          controls-position="right"
                          :disabled="calRunning"
                        />
                      </label>
                      <label>
                        <span>{{ t('common.camera.calibration.staleMs') }}</span>
                        <el-input-number
                          v-model="calForm.staleMs"
                          :min="500"
                          :max="10000"
                          :step="100"
                          :precision="0"
                          controls-position="right"
                          :disabled="calRunning"
                        />
                      </label>
                      <label>
                        <span>{{ t('common.camera.calibration.minStep') }}</span>
                        <el-input-number
                          v-model="calForm.minStep"
                          :min="0.01"
                          :max="5"
                          :step="0.05"
                          :precision="2"
                          controls-position="right"
                          :disabled="calRunning"
                        />
                      </label>
                      <label>
                        <span>{{ t('common.camera.calibration.maxWrites') }}</span>
                        <el-input-number
                          v-model="calForm.maxWrites"
                          :min="1"
                          :max="30"
                          :step="1"
                          :precision="0"
                          controls-position="right"
                          :disabled="calRunning"
                        />
                      </label>
                      <label>
                        <span>{{ t('common.camera.calibration.maxDurationS') }}</span>
                        <el-input-number
                          v-model="calDurationS"
                          :min="1"
                          :max="120"
                          :step="5"
                          :precision="0"
                          controls-position="right"
                          :disabled="calRunning"
                        />
                      </label>
                    </div>
                  </el-collapse-item>
                </el-collapse>
              </div>

              <div
                v-if="calState && (calState.originalParams || calState.lastSentParams)"
                class="cal-params"
              >
                <span v-if="calState.originalParams">
                  {{
                    t('common.camera.calibration.originalParams', {
                      params: calState.originalParams,
                    })
                  }}
                </span>
                <span v-if="calState.lastSentParams">
                  {{
                    t('common.camera.calibration.lastSentParams', {
                      params: calState.lastSentParams,
                    })
                  }}
                </span>
              </div>

              <el-table
                v-if="calState && calState.history.length"
                :data="calState.history"
                size="small"
                :max-height="180"
                class="cal-history"
              >
                <el-table-column
                  :label="t('common.camera.calibration.historyOffset')"
                  prop="offset"
                  width="90"
                />
                <el-table-column
                  v-for="(target, index) in calForm.targets"
                  :key="index"
                  :label="t('common.camera.calibration.historyDistance', { n: index + 1 })"
                  width="120"
                >
                  <template #default="{ row }">{{ row.distances[index]?.toFixed(3) }} m</template>
                </el-table-column>
                <el-table-column
                  v-for="(target, index) in calForm.targets"
                  :key="`e${index}`"
                  :label="t('common.camera.calibration.historyError', { n: index + 1 })"
                  width="110"
                >
                  <template #default="{ row }">{{
                    formatErrorCm(row.errorsCm[index] ?? 0)
                  }}</template>
                </el-table-column>
                <el-table-column
                  :label="t('common.camera.calibration.historyRemark')"
                  width="130"
                >
                  <template #default="{ row }">
                    <span v-if="row.verification" class="cal-remark-verify">{{
                      t('common.camera.calibration.remarkVerify')
                    }}</span>
                    <span v-else>{{
                      row.accepted
                        ? t('common.camera.calibration.remarkInitialPassed')
                        : t('common.camera.calibration.remarkInitial')
                    }}</span>
                  </template>
                </el-table-column>
                <el-table-column :label="t('common.camera.calibration.historyAccepted')" width="80">
                  <template #default="{ row }">
                    <span :class="row.accepted ? 'cal-ok' : 'cal-bad'">
                      {{
                        row.accepted
                          ? t('common.camera.calibration.acceptedYes')
                          : t('common.camera.calibration.acceptedNo')
                      }}
                    </span>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </div>
        </div>
        <div class="cal-actions">
          <div class="action-buttons">
            <el-button
              :type="calRunning ? 'default' : 'primary'"
              :disabled="!calRunning && !canStartCalibration"
              @click="toggleCalibration"
            >
              {{
                calRunning
                  ? t('common.camera.calibration.stop')
                  : t('common.camera.calibration.start')
              }}
            </el-button>
            <el-button :disabled="!canRestoreParams" @click="restoreParams">
              {{ t('common.camera.calibration.restore') }}
            </el-button>
          </div>
          <span class="cal-action-hint">{{
            t(
              calRunning
                ? 'common.camera.calibration.runningHint'
                : observing
                  ? 'common.camera.calibration.readyHint'
                  : 'common.camera.calibration.startHint',
            )
          }}</span>
        </div>
      </el-tab-pane>
      <el-tab-pane name="script">
        <template #label>
          <span class="tab-label"
            >{{ t('common.camera.script.title') }}<i v-if="scriptRunning" class="activity-dot"></i
          ></span>
        </template>
        <div class="parameter-scroll">
          <div class="script-card section-card">
            <div class="section-heading">
              <span class="heading-icon"
                ><el-icon><MagicStick /></el-icon
              ></span>
              <div class="section-title">
                <strong>{{ t('common.camera.script.title') }}</strong>
                <p>{{ t('common.camera.script.subtitle') }}</p>
              </div>
              <span class="cal-phase" :class="`cal-phase--${scriptTone}`" role="status">
                <span class="cal-phase__dot"></span>
                {{ scriptStateText }}
              </span>
            </div>
            <div class="script-body">
              <div class="script-connection">
                <el-icon><Connection /></el-icon>
                <span :title="sshEndpoint">{{ sshEndpoint }}</span>
                <el-button text size="small" @click="activeTab = 'connection'">{{
                  t('common.camera.connectionSettings')
                }}</el-button>
              </div>
              <div class="script-file" :class="{ 'script-file--selected': scriptPath }">
                <span class="script-file-icon"
                  ><el-icon><Document /></el-icon
                ></span>
                <div class="script-file-info">
                  <span class="field-label">{{ t('common.camera.script.scriptFile') }}</span>
                  <strong :title="scriptPath">{{
                    scriptFileName || t('common.camera.script.noFile')
                  }}</strong>
                  <span class="script-file-path" :title="scriptPath">{{
                    scriptPath || t('common.camera.script.onlyShell')
                  }}</span>
                </div>
                <el-button :disabled="scriptRunning" @click="pickScriptFile">
                  <el-icon><FolderOpened /></el-icon>
                  {{ t('common.camera.script.choose') }}
                </el-button>
              </div>
              <div class="script-controls">
                <label class="script-timeout">
                  <span class="field-label">{{ t('common.camera.script.timeout') }}</span>
                  <el-input-number
                    v-model="scriptTimeoutS"
                    :min="1"
                    :max="600"
                    :step="10"
                    :precision="0"
                    :aria-label="t('common.camera.script.timeout')"
                    controls-position="right"
                    :disabled="scriptRunning"
                  />
                </label>
                <div class="action-buttons">
                  <el-button
                    type="primary"
                    :loading="scriptRunning"
                    :disabled="!scriptPath || scriptRunning"
                    @click="runScript"
                  >
                    <el-icon v-if="!scriptRunning"><VideoPlay /></el-icon>
                    {{ t('common.camera.script.run') }}
                  </el-button>
                  <el-button v-if="scriptRunning" type="danger" plain @click="stopScript">
                    {{ t('common.camera.script.stop') }}
                  </el-button>
                </div>
              </div>
              <p class="cal-hint">{{ t('common.camera.script.desc') }}</p>
              <div class="script-output">
                <div class="console-heading">
                  <span>{{ t('common.camera.outputResult') }}</span>
                  <span class="console-format">stdout / stderr</span>
                  <el-button
                    text
                    size="small"
                    :disabled="!scriptLogs.length"
                    @click="scriptLogs = []"
                    >{{ t('common.camera.clear') }}</el-button
                  >
                </div>
                <pre
                  ref="scriptOutputElement"
                  class="output-console script-console"
                  tabindex="0"
                  :aria-label="t('common.camera.outputResult')"
                  >{{ scriptOutputText || t('common.camera.script.outputEmpty') }}</pre>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
    <input
      ref="scriptFileInput"
      type="file"
      accept=".sh"
      class="script-file-input"
      @change="onScriptFileChange"
    />

    <el-dialog
      v-model="showCommandHelp"
      :title="t('common.camera.commandHelpTitle')"
      class="app-dialog camera-command-help-dialog"
      width="min(520px, calc(100vw - 32px))"
      :close-on-click-modal="true"
      :close-on-press-escape="true"
      :append-to-body="true"
      align-center
    >
      <div class="command-help">
        <p>
          <strong>{{ t('common.camera.paramExample') }}</strong>
          <span>{{ t('common.camera.paramExampleDesc') }}</span>
        </p>
        <p>
          <strong>{{ t('common.camera.displayBox') }}</strong>
          <span>{{ t('common.camera.displayBoxDesc') }}</span>
        </p>
      </div>
    </el-dialog>

    <el-dialog
      v-model="showFullOutput"
      :title="t('common.camera.outputResult')"
      class="app-dialog camera-output-dialog"
      width="min(680px, calc(100vw - 32px))"
      :close-on-click-modal="true"
      :close-on-press-escape="true"
      :append-to-body="true"
      align-center
    >
      <pre ref="outputElement" class="output-console">{{ outputText }}</pre>
      <template #footer>
        <el-button :disabled="logs.length === 0" @click="clearOutput">{{
          t('common.camera.clear')
        }}</el-button>
        <el-button type="primary" @click="showFullOutput = false">{{ t('app.close') }}</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Aim,
  Connection,
  Document,
  FolderOpened,
  InfoFilled,
  Key,
  MagicStick,
  Promotion,
  Refresh,
  Setting,
  VideoPlay,
} from '@element-plus/icons-vue'
import { t } from '@/i18n'
import {
  CAMERA_SUB_COMMANDS,
  CameraParametersStorage,
  type CameraParametersSettings,
} from '@/core/camera/CameraParametersStorage'
import { JsonStorage } from '@/core/storage/JsonStorage'
import { isCameraTcpDataConnected } from '@/core/camera/CameraConnectionStatus'
import {
  DEFAULT_CALIBRATION_CONFIG,
  isCalibrationRunning,
  type CameraCalibrationConfig,
  type CameraCalibrationPhase,
  type CameraCalibrationSnapshot,
  type CameraCalibrationTargetConfig,
} from '@/core/camera/CameraCalibrationTypes'
import { useDataSourceManager } from '@/composables/useDataSourceManager'
import { useDevice } from '@/hooks/useDevice'
import { showToolBar } from '@/composables/useStatusManager'
import emitter from '@/hooks/useMitt'

// 连接状态（同步相机 TCP 连接结果）：
// disconnected 未连接 / connecting 连接中 / connected 连接成功(就绪) / error 连接失败
type Status = 'disconnected' | 'connecting' | 'connected' | 'error'

const activeTab = ref('command')
const subCommandOptions = CAMERA_SUB_COMMANDS
const parametersStorage = new CameraParametersStorage(new JsonStorage(window.localStorage))
const savedSettings = parametersStorage.load()
const { settings: dataSourceSettings } = useDataSourceManager()
const { globalDevice } = useDevice()
const host = computed(() => dataSourceSettings.network.host)
const port = computed(() => dataSourceSettings.network.port ?? 0)
const portText = computed(() => (port.value > 0 ? String(port.value) : '—'))
const subCommand = ref(savedSettings.subCommand)
const content = ref(savedSettings.content)
const contentIsHex = ref(savedSettings.contentIsHex)
const showCommandHelp = ref(false)
const showFullOutput = ref(false)
const sending = ref(false)
const status = computed<Status>(() =>
  isCameraTcpDataConnected(globalDevice.value, {
    host: host.value,
    port: port.value,
  })
    ? 'connected'
    : 'disconnected',
)
const logs = ref<string[]>([])
const outputElement = ref<HTMLElement>()

watch(
  [subCommand, content, contentIsHex],
  () => {
    parametersStorage.save({
      version: 1,
      subCommand: subCommand.value,
      content: content.value,
      contentIsHex: contentIsHex.value,
    } satisfies CameraParametersSettings)
  },
  { flush: 'post' },
)

// 连接状态文案：连接成功显示“就绪”，未连接/失败显示为“其他状态”。
const statusText = computed(
  () =>
    ({
      disconnected: t('common.camera.status.disconnected'),
      connecting: t('common.camera.status.connecting'),
      connected: t('common.camera.status.ready'),
      error: t('common.camera.status.failed'),
    })[status.value],
)

const contentPlaceholder = computed(() =>
  contentIsHex.value ? t('common.camera.placeholderHex') : t('common.camera.placeholderUtf8'),
)

const outputText = computed(() =>
  logs.value.length > 0 ? logs.value.join('\n') : t('common.camera.waitingToSend'),
)

/** 命令卡片底部的简略输出：最近一条非空日志 */
const lastLogLine = computed(() => {
  for (let i = logs.value.length - 1; i >= 0; i--) {
    const line = logs.value[i].trim()
    if (line) return line
  }
  return ''
})

function handleSubCommandChange(value: string) {
  contentIsHex.value = value === 'bbox_draw'
}

async function openNetworkSettings() {
  if (showToolBar.value === false) {
    showToolBar.value = true
    await nextTick()
  }
  emitter.emit('input-event', { tab: 'network', protocol: 'tcp' })
}

function validateInput(): string | undefined {
  if (status.value !== 'connected') return t('common.camera.errTcpConfigurationRequired')
  if (!subCommand.value) return t('common.camera.errSelectSubCommand')
  if (!content.value.trim()) return t('common.camera.errEnterSubCommandContent')
  if (contentIsHex.value) {
    const compact = content.value.replace(/\s/g, '')
    if (compact.length % 2 !== 0 || !/^[\da-fA-F]+$/.test(compact)) {
      return t('common.camera.errHexBytes')
    }
  }
  return undefined
}

async function appendLog(...messages: string[]) {
  logs.value.push(...messages)
  await nextTick()
  if (outputElement.value) outputElement.value.scrollTop = outputElement.value.scrollHeight
}

function formatHex(value: string): string {
  return value.match(/.{1,2}/g)?.join(' ') ?? ''
}

async function sendCommand() {
  if (sending.value) return
  const validationError = validateInput()
  if (validationError) {
    ElMessage.warning(validationError)
    return
  }
  if (!window.electronAPI?.sendCameraCommand) {
    ElMessage.error(t('common.camera.errTcpNotSupported'))
    return
  }

  sending.value = true
  await appendLog(
    '',
    t('common.camera.logLoginHeader'),
    t('common.camera.logMainCmd'),
    t('common.camera.logServer', { host: `${host.value.trim()}:${port.value}` }),
    t('common.camera.logTransport'),
    t('common.camera.logSubCommand', { sub: subCommand.value }),
    t('common.camera.logContentFormat', {
      fmt: contentIsHex.value
        ? t('common.camera.logContentFormatHex')
        : t('common.camera.logContentFormatUtf8'),
    }),
    t('common.camera.logSubCommandContent', { content: content.value }),
    t('common.camera.logSeparator'),
  )

  try {
    const result = await window.electronAPI.sendCameraCommand({
      subCommand: subCommand.value,
      content: content.value,
      contentFormat: contentIsHex.value ? 'hex' : 'text',
    })
    await appendLog(
      t('common.camera.logSubField', { hex: formatHex(result.subCommandHex) }),
      t('common.camera.logContentBytes', { n: result.contentBytes }),
      t('common.camera.logContentByte', { hex: formatHex(result.contentHex) || '(空)' }),
      t('common.camera.logTotalLen', { n: result.dataLength }),
      t('common.camera.logFullPacket', { hex: formatHex(result.packetHex) }),
      t('common.camera.logBigSeparator'),
    )
    ElMessage.success(t('common.camera.sentSuccess'))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await appendLog(
      t('common.camera.logError', { msg: message }),
      t('common.camera.logBigSeparator'),
    )
    ElMessage.error(t('common.camera.sendFailed') + message)
  } finally {
    sending.value = false
  }
}

function clearOutput() {
  logs.value = []
}

// ---------- 自动标定 ----------
const calState = ref<CameraCalibrationSnapshot | null>(null)
// structuredClone 深拷贝：DEFAULT 的 targets 数组是冻结对象，reactive 无法代理冻结属性
const calForm = reactive<CameraCalibrationConfig>(structuredClone(DEFAULT_CALIBRATION_CONFIG))
const calDurationS = ref(Math.round(DEFAULT_CALIBRATION_CONFIG.maxDurationMs / 1000))
const targetCount = ref(calForm.targets.length)

watch(targetCount, (count) => {
  const targets = calForm.targets
  while (targets.length < count) targets.push({ distance: 2, biasMinCm: 2, biasMaxCm: 6 })
  if (targets.length > count) targets.splice(count)
})

const observing = computed(() => calState.value?.observing === true)
const calRunning = computed(() =>
  calState.value ? isCalibrationRunning(calState.value.phase) : false,
)

const PHASE_TONES: Record<string, string> = {
  idle: 'idle',
  observing: 'idle',
  sampling: 'active',
  verifying: 'active',
  writing: 'active',
  settling: 'active',
  paused: 'warn',
  succeeded: 'ok',
  stopped: 'idle',
  failed: 'bad',
}

const phaseTone = computed(() => PHASE_TONES[calState.value?.phase ?? 'idle'] ?? 'idle')

const phaseText = computed(() => {
  const phase = calState.value?.phase
  return phase
    ? t(`common.camera.calibration.phase.${phase}`)
    : t('common.camera.calibration.phase.idle')
})

const canStartCalibration = computed(
  () => observing.value && !calRunning.value && calState.value?.busy === false,
)
const canRestoreParams = computed(
  () => observing.value && !calRunning.value && Boolean(calState.value?.originalParams),
)

// 标定运行与结束时保持标定页视图置底跟随(用户手动上滚即停止跟随)
const calScrollContainer = ref<HTMLElement | null>(null)
const calScrollFollow = ref(false)

watch(
  () => [
    calState.value?.history.length,
    calState.value?.phase,
    calState.value?.recovery,
  ],
  async ([, phase]) => {
    if (isCalibrationRunning(phase as CameraCalibrationPhase)) calScrollFollow.value = true
    if (!calScrollFollow.value) return
    await nextTick()
    scrollCalView()
  },
)

async function reportCalibrationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  ElMessage.error(message)
}

// 测量源 = 主进程 SSH 测量通道（旁听相机板 ttyS6 的 INSSEG 报文流）
const sshForm = reactive({ host: '192.168.3.14', port: 22, username: 'root', password: '' })
const sshPasswordSaved = ref(false)
const sshEndpoint = computed(
  () => `${sshForm.username || '—'}@${sshForm.host || '—'}:${sshForm.port}`,
)
const sshStateText = computed(() => {
  const ssh = calState.value?.ssh
  if (!ssh) return null
  return `${ssh.host}:${ssh.port} · ${t(`common.camera.calibration.sshState.${ssh.state}`)}`
})

const recoveryItems = computed(() => {
  const recovery = calState.value?.recovery
  if (!recovery) return []
  const stracePending = recovery.pendingChecks
  return [
    {
      ok: recovery.straceCleared,
      pending: stracePending,
      label: t('common.camera.calibration.recoveryStrace'),
      detail: stracePending ? t('common.camera.calibration.checkPending') : '',
    },
    {
      ok: recovery.tracerPidZero,
      pending: stracePending,
      label: t('common.camera.calibration.recoveryTracer'),
      detail: stracePending ? t('common.camera.calibration.checkPending') : '',
    },
    {
      ok: recovery.paramsVerified,
      pending: false,
      label: recovery.restored
        ? t('common.camera.calibration.recoveryRestored')
        : t('common.camera.calibration.recoveryKept'),
      detail: recovery.detail,
    },
  ]
})

// 数据接入连上的瞬间自动 read_params 一次，把设备最新值填入表单（FOV 由弧度换算回角度）；
// 读取失败时 height/FOV 保持表单现值，OFFSET 回退默认值 -20 并提示人工核对
let autoReadInFlight = false
async function autoFillDeviceParams() {
  if (autoReadInFlight || calRunning.value || observing.value) return
  if (!window.electronAPI?.cameraCalibrationReadParams) return
  autoReadInFlight = true
  try {
    const snapshot = await window.electronAPI.cameraCalibrationReadParams()
    calForm.height = Number(snapshot.height.toFixed(2))
    calForm.fov = Number(((snapshot.fov * 180) / Math.PI).toFixed(3))
    calForm.initialOffset = Number(snapshot.thetaOffset.toFixed(2))
  } catch {
    calForm.initialOffset = -20
    ElMessage.warning(t('common.camera.calibration.autoReadFailed'))
  } finally {
    autoReadInFlight = false
  }
}

watch(status, (value, previous) => {
  if (value === 'connected' && previous !== 'connected') void autoFillDeviceParams()
})

onMounted(async () => {
  const access = await window.electronAPI?.cameraCalibrationAccess?.().catch(() => undefined)
  if (access) {
    if (access.host) sshForm.host = access.host
    if (access.port) sshForm.port = access.port
    if (access.username) sshForm.username = access.username
    sshPasswordSaved.value = access.hasPassword
  }
  if (status.value === 'connected') void autoFillDeviceParams()
})

async function toggleObservation() {
  if (!window.electronAPI?.cameraCalibrationObserve) {
    ElMessage.error(t('common.camera.errTcpNotSupported'))
    return
  }
  if (observing.value) {
    try {
      calState.value = await window.electronAPI.cameraCalibrationClose()
    } catch (error) {
      await reportCalibrationError(error)
    }
    return
  }
  if (status.value !== 'connected') {
    ElMessage.warning(t('common.camera.errTcpConfigurationRequired'))
    return
  }
  if (!sshForm.host.trim() || !sshForm.username.trim()) {
    ElMessage.warning(t('common.camera.calibration.errSshMissing'))
    return
  }
  try {
    calState.value = await window.electronAPI.cameraCalibrationObserve({
      host: sshForm.host.trim(),
      port: sshForm.port,
      username: sshForm.username.trim(),
      password: sshForm.password,
    })
    calScrollFollow.value = false
    sshForm.password = ''
  } catch (error) {
    await reportCalibrationError(error)
  }
}

async function startCalibration() {
  if (!window.electronAPI?.cameraCalibrationStart) {
    ElMessage.error(t('common.camera.errTcpNotSupported'))
    return
  }
  const missing = validateCalibrationForm()
  if (missing) {
    ElMessage.warning(t('common.camera.calibration.errMissingField', { field: missing }))
    return
  }
  const config: CameraCalibrationConfig = {
    ...calForm,
    targets: calForm.targets.map((target) => ({ ...target })),
    maxDurationMs: calDurationS.value * 1000,
  }
  try {
    calState.value = await window.electronAPI.cameraCalibrationStart(config)
    // 标定信息(进度/历史)在卡片底部:启动即进入置底跟随, 结束/恢复清单出现后仍稳定在底部
    calScrollFollow.value = true
    await nextTick()
    scrollCalView()
  } catch (error) {
    await reportCalibrationError(error)
  }
}

function scrollCalView(): void {
  const el = calScrollContainer.value
  if (!el) return
  el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
}

function onCalViewScroll(): void {
  const el = calScrollContainer.value
  if (!el) return
  // 用户向上滚离底部 → 停止自动跟随
  calScrollFollow.value = el.scrollHeight - el.scrollTop - el.clientHeight < 48
}

const CAL_NUMBER_FIELDS: Array<[keyof CameraCalibrationConfig, string]> = [
  ['height', 'calibration.height'],
  ['fov', 'calibration.fov'],
  ['initialOffset', 'calibration.initialOffset'],
  ['personClassId', 'calibration.personClassId'],
  ['minOffset', 'calibration.minOffset'],
  ['maxOffset', 'calibration.maxOffset'],
  ['step', 'calibration.step'],
  ['minStep', 'calibration.minStep'],
  ['sampleCount', 'calibration.sampleCount'],
  ['windowMs', 'calibration.windowMs'],
  ['maxSpreadM', 'calibration.maxSpreadM'],
  ['settleMs', 'calibration.settleMs'],
  ['staleMs', 'calibration.staleMs'],
  ['maxWrites', 'calibration.maxWrites'],
]

const CAL_TARGET_FIELDS: Array<[keyof CameraCalibrationTargetConfig, string]> = [
  ['distance', 'calibration.targetDistance'],
  ['biasMinCm', 'calibration.biasMinCm'],
  ['biasMaxCm', 'calibration.biasMaxCm'],
]

function validateCalibrationForm(): string | undefined {
  if (!Number.isFinite(calDurationS.value)) return t('common.camera.calibration.maxDurationS')
  for (const [key, label] of CAL_NUMBER_FIELDS) {
    const value = calForm[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return t(`common.camera.${label}`)
    }
  }
  for (const [index, target] of calForm.targets.entries()) {
    for (const [key, label] of CAL_TARGET_FIELDS) {
      const value = target[key]
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return `${t('common.camera.calibration.targetGroup', { n: index + 1 })} · ${t(`common.camera.${label}`)}`
      }
    }
  }
  return undefined
}

async function stopCalibration() {
  if (!window.electronAPI?.cameraCalibrationStop) return
  try {
    calState.value = await window.electronAPI.cameraCalibrationStop()
  } catch (error) {
    await reportCalibrationError(error)
  }
}

async function toggleCalibration() {
  if (calRunning.value) {
    await stopCalibration()
  } else {
    await startCalibration()
  }
}

async function restoreParams() {
  if (!window.electronAPI?.cameraCalibrationRestore) return
  try {
    calState.value = await window.electronAPI.cameraCalibrationRestore()
    ElMessage.success(t('common.camera.calibration.restoreSent'))
  } catch (error) {
    await reportCalibrationError(error)
  }
}

function formatOffset(offset: number | null): string {
  return offset === null ? '—' : offset.toFixed(2)
}

function formatErrorCm(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)} cm`
}

const calStateListener = (_event: unknown, state: CameraCalibrationSnapshot) => {
  calState.value = state
}

// ---------- 脚本注入 ----------
type CameraScriptEvent =
  | {
      type: 'state'
      state: 'uploading' | 'running' | 'success' | 'error' | 'stopped'
      detail: string
    }
  | { type: 'output'; text: string }

const scriptFileInput = ref<HTMLInputElement | null>(null)
const scriptPath = ref('')
const scriptFileName = computed(() => scriptPath.value.split(/[\\/]/).pop() ?? '')
const scriptTimeoutS = ref(120)
const scriptLogs = ref<string[]>([])
const scriptOutputElement = ref<HTMLElement | null>(null)
const scriptState = ref<{ state: string; detail: string } | null>(null)

const SCRIPT_STATE_TONES: Record<string, string> = {
  uploading: 'active',
  running: 'active',
  success: 'ok',
  error: 'bad',
  stopped: 'idle',
}

const scriptTone = computed(() => SCRIPT_STATE_TONES[scriptState.value?.state ?? 'idle'] ?? 'idle')
const scriptRunning = computed(
  () => scriptState.value?.state === 'uploading' || scriptState.value?.state === 'running',
)

const scriptStateText = computed(() => {
  return scriptState.value
    ? t(`common.camera.script.state.${scriptState.value.state}`)
    : t('common.camera.script.idle')
})

const scriptOutputText = computed(() => scriptLogs.value.join(''))

function pickScriptFile() {
  scriptFileInput.value?.click()
}

function onScriptFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file && !file.name.toLowerCase().endsWith('.sh')) {
    ElMessage.warning(t('common.camera.script.onlyShell'))
    input.value = ''
    return
  }
  if (file) scriptPath.value = window.electronAPI?.getPathForFile(file) || ''
  input.value = ''
}

function appendScriptOutput(text: string) {
  scriptLogs.value.push(text)
  if (scriptLogs.value.length > 800) scriptLogs.value.splice(0, scriptLogs.value.length - 800)
}

async function runScript() {
  if (!window.electronAPI?.cameraScriptRun) {
    ElMessage.error(t('common.camera.errTcpNotSupported'))
    return
  }
  if (!sshForm.host.trim() || !sshForm.username.trim()) {
    ElMessage.warning(t('common.camera.calibration.errSshMissing'))
    return
  }
  try {
    await window.electronAPI.cameraScriptRun({
      host: sshForm.host.trim(),
      port: sshForm.port,
      username: sshForm.username.trim(),
      password: sshForm.password,
      localPath: scriptPath.value,
      timeoutS: scriptTimeoutS.value,
    })
  } catch (error) {
    await reportCalibrationError(error)
  }
}

async function stopScript() {
  try {
    await window.electronAPI?.cameraScriptStop?.()
  } catch (error) {
    await reportCalibrationError(error)
  }
}

const scriptEventListener = (_event: unknown, scriptEvent: CameraScriptEvent) => {
  if (scriptEvent.type === 'output') {
    appendScriptOutput(scriptEvent.text)
    return
  }
  scriptState.value = { state: scriptEvent.state, detail: scriptEvent.detail }
  appendScriptOutput(`\n[${scriptEvent.state}] ${scriptEvent.detail}\n`)
}

watch(
  () => scriptLogs.value.length,
  async () => {
    await nextTick()
    if (scriptOutputElement.value)
      scriptOutputElement.value.scrollTop = scriptOutputElement.value.scrollHeight
  },
)

onMounted(() => {
  window.ipcRenderer?.on('camera-calibration-state', calStateListener)
  window.ipcRenderer?.on('camera-script-event', scriptEventListener)
  void window.electronAPI
    ?.cameraCalibrationSnapshot?.()
    .then((state) => {
      calState.value = state
    })
    .catch(() => undefined)
})

onUnmounted(() => {
  window.ipcRenderer?.off('camera-calibration-state', calStateListener)
  window.ipcRenderer?.off('camera-script-event', scriptEventListener)
})
</script>

<style scoped>
.camera-parameters {
  container: camera / inline-size;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  color: var(--app-text);
  background: var(--app-surface-muted);
  text-align: left;
}

.camera-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-surface);
}

.camera-endpoint {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  overflow: hidden;
  font:
    12px/1.5 Consolas,
    'Courier New',
    monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.camera-endpoint > .el-icon {
  color: var(--el-color-primary);
}
.endpoint-port {
  margin-left: -7px;
  color: var(--app-text-muted);
}

.camera-tabs {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.camera-tabs :deep(.el-tabs__header) {
  flex: 0 0 auto;
  margin: 0;
  padding: 0 16px;
  background: var(--app-surface);
}

.camera-tabs :deep(.el-tabs__nav-wrap::after) {
  height: 1px;
  background: var(--app-border);
}
.camera-tabs :deep(.el-tabs__item) {
  height: 42px;
  font-size: 12px;
}
.camera-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
}
.camera-tabs :deep(.el-tab-pane) {
  height: 100%;
  overflow: auto;
  scrollbar-gutter: stable;
}
.camera-tabs :deep(.calibration-pane) {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.calibration-pane .parameter-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.calibration-pane > .cal-actions {
  flex: 0 0 auto;
  border-top: 1px solid var(--app-border);
  border-radius: 0;
  background: var(--app-surface);
  padding: 10px 16px;
}
.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.activity-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--el-color-primary);
}

.parameter-scroll {
  box-sizing: border-box;
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 16px;
}

.section-card {
  min-width: 0;
  margin-bottom: 14px;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-surface);
}

.section-card:last-child {
  margin-bottom: 0;
}

.section-heading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
  border-bottom: 1px solid var(--app-border);
}

.section-title {
  flex: 1;
  min-width: 0;
  font-size: 14px;
}
.section-title strong {
  font-weight: 600;
}
.section-title p {
  margin: 4px 0 0;
  color: var(--app-text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.heading-icon,
.script-file-icon {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 9px;
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 10%, var(--app-surface));
}

.protocol-tag {
  padding: 3px 7px;
  border: 1px solid var(--app-border);
  border-radius: 5px;
  color: var(--app-text-muted);
  font:
    11px/1.3 Consolas,
    monospace;
}

.conn-status,
.cal-phase {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.3;
  white-space: nowrap;
}
.conn-status__dot,
.cal-phase__dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.conn-status--disconnected,
.cal-phase--idle {
  color: var(--app-text-muted);
  background: var(--app-surface-muted);
}
.conn-status--connecting,
.cal-phase--warn {
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
}
.conn-status--connected,
.cal-phase--ok {
  color: var(--el-color-success);
  background: var(--el-color-success-light-9);
}
.conn-status--error,
.cal-phase--bad {
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
}
.cal-phase--active {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.connection-grid,
.cal-ssh {
  padding: 16px;
}
.connection-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1.4fr);
  gap: 12px;
}
.connection-grid label,
.cal-config label,
.cal-target-group label,
.cal-target-count,
.script-timeout {
  display: grid;
  align-content: start;
  min-width: 0;
  gap: 7px;
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}
.connection-grid :deep(.el-input),
.cal-config :deep(.el-input-number),
.cal-config :deep(.el-select),
.cal-target-group :deep(.el-input-number),
.cal-target-count :deep(.el-select) {
  width: 100%;
  min-width: 0;
}
.connection-grid :deep(.el-input__inner),
.command-form :deep(.el-select),
.command-form :deep(.el-textarea__inner) {
  font-family: Consolas, 'Courier New', monospace;
}
.connection-grid :deep(.network-setting-display .el-input__wrapper) {
  background: var(--app-surface-muted);
  cursor: pointer;
}
.connection-grid :deep(.network-setting-display .el-input__inner) {
  cursor: pointer;
}

.connection-note {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 0;
  padding: 0 16px 16px;
  color: var(--app-text-muted);
  font-size: 12px;
  line-height: 1.6;
}
.connection-note .el-icon {
  margin-top: 3px;
  flex-shrink: 0;
}

.command-form,
.calibration-body,
.script-body {
  display: grid;
  gap: 16px;
  padding: 16px;
  min-width: 0;
}
.field-row {
  display: grid;
  grid-template-columns: 98px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}
.sub-command-field {
  grid-template-columns: 98px minmax(0, 1fr) auto;
}
.field-label {
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 500;
}
.format-switch {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--app-text-secondary);
  font-size: 12px;
  white-space: nowrap;
}
.content-field {
  align-items: start;
}
.content-field .field-label {
  padding-top: 8px;
}
.command-form :deep(.el-select),
.content-field :deep(.el-textarea) {
  width: 100%;
}
.command-form :deep(.el-textarea__inner) {
  min-height: 108px !important;
  padding: 10px 12px;
  line-height: 1.7;
}
.command-actions,
.action-buttons {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.command-actions {
  justify-content: space-between;
}
.command-actions > span {
  color: var(--app-text-muted);
  font-size: 11px;
}
.action-buttons .el-button + .el-button {
  margin-left: 0;
}
.el-button .el-icon + span,
.el-button .el-icon {
  margin-right: 4px;
}
.hint-toggle {
  margin-left: auto;
}

.inline-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 11px;
  border-radius: 6px;
  color: var(--app-text-secondary);
  background: var(--app-surface-muted);
  font-size: 12px;
  line-height: 1.6;
}
.inline-notice > span {
  flex: 1;
  min-width: 0;
}
.inline-notice > .el-icon {
  flex: 0 0 auto;
  color: var(--el-color-primary);
}

.output-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 11px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-surface-muted);
}
.output-summary-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--app-text-secondary);
  font:
    11px/1.5 Consolas,
    monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.output-summary .el-button {
  flex-shrink: 0;
}
.output-console {
  box-sizing: border-box;
  height: min(52vh, 440px);
  margin: 0;
  overflow: auto;
  padding: 14px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--app-text-secondary);
  background: var(--app-surface-muted);
  font:
    12px/1.7 Consolas,
    'Courier New',
    monospace;
  user-select: text;
}
.command-help {
  display: grid;
  gap: 12px;
}
.command-help p {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 14px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface-muted);
}
.command-help strong {
  color: var(--app-text);
  font-size: 13px;
}
.command-help span {
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.workflow-section {
  display: grid;
  gap: 14px;
  min-width: 0;
}
.workflow-section + .workflow-section {
  padding-top: 16px;
  border-top: 1px solid var(--app-border);
}
.workflow-heading {
  display: flex;
  align-items: center;
  gap: 8px;
}
.workflow-heading h3 {
  flex: 1;
  margin: 0;
  font-size: 12px;
  font-weight: 600;
}
.step-number {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  font-size: 11px;
  font-weight: 600;
}
.cal-source {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 7px;
  background: var(--app-surface-muted);
}
.cal-source .field-label,
.cal-source .el-button {
  flex: 0 0 auto;
}
.cal-source-value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--app-text-secondary);
  font:
    12px/1.5 Consolas,
    monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cal-source-value--off {
  color: var(--app-text-muted);
}
.cal-hint {
  margin: 0;
  color: var(--app-text-muted);
  font-size: 12px;
  line-height: 1.65;
}
.cal-diagnostics {
  min-width: 0;
  color: var(--app-text-secondary);
  font-size: 12px;
}
.cal-diagnostics summary {
  width: fit-content;
  cursor: pointer;
}
.cal-raw {
  box-sizing: border-box;
  max-height: 110px;
  margin: 8px 0 0;
  overflow: auto;
  padding: 10px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-surface-muted);
  font:
    11px/1.6 Consolas,
    monospace;
  user-select: text;
}

.cal-config {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px 12px;
}
.cal-ssh {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.cal-targets-head {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 12px;
}
.cal-target-count {
  width: 180px;
  max-width: 100%;
}
.cal-target-groups {
  display: grid;
  gap: 10px;
}
.cal-target-group {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px 12px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface-muted);
}
.cal-target-group-title {
  grid-column: 1 / -1;
  color: var(--app-text);
  font-size: 12px;
  font-weight: 600;
}
.cal-advanced {
  border: 1px solid var(--app-border);
  border-radius: 7px;
  padding: 0 12px;
  overflow: hidden;
}
.cal-advanced :deep(.el-collapse-item__header) {
  min-height: 40px;
  height: auto;
  padding: 8px 0;
  line-height: 1.5;
  border: 0;
  color: var(--app-text-secondary);
  font-size: 12px;
}
.cal-advanced :deep(.el-collapse-item__wrap) {
  border: 0;
}
.cal-advanced :deep(.el-collapse-item__content) {
  padding: 8px 0 12px;
}
.cal-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  background: var(--app-surface-muted);
}
.cal-action-hint {
  flex: 1;
  min-width: 0;
  color: var(--app-text-muted);
  font-size: 12px;
  line-height: 1.5;
}
.cal-params {
  display: grid;
  gap: 5px;
  color: var(--app-text-muted);
  font:
    11px/1.5 Consolas,
    monospace;
  overflow-wrap: anywhere;
}
.cal-progress,
.cal-recovery {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface-muted);
}
.cal-progress--bad {
  border-color: var(--el-color-danger-light-5);
}
.cal-progress--ok {
  border-color: var(--el-color-success-light-5);
}
.cal-progress-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  font-size: 12px;
}
.cal-reason {
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.cal-history {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--app-border);
  border-radius: 7px;
}
.cal-recovery-title {
  font-size: 12px;
  font-weight: 600;
}
.cal-recovery-item {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.cal-recovery-detail {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--app-text-muted);
  font-size: 11px;
}
.cal-ok {
  color: var(--el-color-success);
  font-weight: 600;
}
.cal-bad {
  color: var(--el-color-danger);
  font-weight: 600;
}

.script-connection {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--app-text-muted);
  font-size: 12px;
}
.script-connection > span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: Consolas, monospace;
}
.script-file {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border: 1px dashed var(--app-border-strong);
  border-radius: 9px;
  background: var(--app-surface-muted);
}
.script-file--selected {
  border-style: solid;
  border-color: var(--el-color-primary-light-5);
}
.script-file-icon {
  width: 42px;
  height: 48px;
  font-size: 21px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
}
.script-file-info {
  display: grid;
  flex: 1;
  min-width: 0;
  gap: 5px;
}
.script-file-info strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
}
.script-file-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--app-text-muted);
  font:
    11px/1.5 Consolas,
    monospace;
}
.script-controls {
  display: flex;
  align-items: end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
}
.script-timeout :deep(.el-input-number) {
  width: 148px;
}
.script-output {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 8px;
}
.console-heading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 12px;
  border-bottom: 1px solid var(--app-border);
  font-size: 12px;
}
.console-format {
  flex: 1;
  color: var(--app-text-muted);
  font:
    11px/1.4 Consolas,
    monospace;
}
.script-console {
  height: 220px;
}
.script-file-input {
  display: none;
}

.cal-remark-verify {
  color: var(--el-color-primary);
  font-weight: 600;
}

@container camera (max-width: 620px) {
  .parameter-scroll {
    padding: 12px;
  }
  .section-heading,
  .command-form,
  .calibration-body,
  .script-body {
    padding: 12px;
  }
  .section-title p {
    font-size: 11px;
  }
  .field-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 7px;
  }
  .sub-command-field {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .sub-command-field > .field-label {
    grid-column: 1 / -1;
  }
  .content-field .field-label {
    padding-top: 0;
  }
  .cal-config {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .script-file {
    padding: 12px;
  }
}

@container camera (max-width: 420px) {
  .camera-toolbar {
    padding: 8px 12px;
  }
  .camera-tabs :deep(.el-tabs__header) {
    padding: 0 8px;
  }
  .camera-tabs :deep(.el-tabs__item) {
    padding: 0 8px;
    font-size: 11px;
  }
  .section-heading {
    flex-wrap: wrap;
  }
  .section-title p {
    display: none;
  }
  .heading-icon {
    width: 28px;
    height: 28px;
  }
  .connection-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .connection-grid label:first-child {
    grid-column: 1 / -1;
  }
  .cal-source {
    flex-wrap: wrap;
  }
  .cal-source .field-label {
    display: none;
  }
  .cal-source-value {
    flex-basis: 100%;
  }
  .cal-target-group {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .cal-target-group label:first-of-type {
    grid-column: 1 / -1;
  }
  .script-file {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
  }
  .script-file > .el-button {
    grid-column: 2;
    justify-self: start;
    margin-left: 0;
  }
  .command-actions {
    align-items: flex-start;
    flex-direction: column;
  }
  .inline-notice {
    flex-wrap: wrap;
  }
}
</style>
