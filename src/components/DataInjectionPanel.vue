<template>
  <div class="data-injection-panel">
    <div class="injection-status" :class="`is-${status.state}`">
      <strong>{{ t(`app.injection.states.${status.state}`) }}</strong>
      <span
        >{{ t('app.injection.target') }}: {{ status.target || t('app.injection.targetHint') }}</span
      >
      <span
        >{{ t('app.injection.received') }}: {{ status.receivedBytes }} B ·
        {{ t('app.injection.forwarded') }}:
        <span class="injection-forwarded">{{ status.forwardedBytes }} B</span>
        <template v-if="settings.network.protocol === 'ntrip'">
          · GGA: {{ status.ggaSent }}</template
        >
      </span>
      <span v-if="status.error || actionError" class="injection-error" role="alert">{{
        actionError || status.error
      }}</span>
    </div>
    <el-tabs
      v-model="settings.source"
      :tab-position="tabPosition"
      :stretch="tabPosition === 'top'"
      class="injection-source-tabs"
      :before-leave="() => !active"
    >
      <el-tab-pane name="serial" :label="t('app.toolbar.serialTab')">
        <template #label>
          <span class="source-tab-label"
            ><el-icon><Connection /></el-icon
            ><span class="source-tab-copy"
              ><strong>{{ t('app.toolbar.serialTab') }}</strong
              ><small>Serial</small></span
            ></span
          >
        </template>
        <div class="source-panel-heading">
          <strong>{{ t('app.injection.serialTitle') }}</strong
          ><span>{{ t('app.injection.description') }}</span>
        </div>
        <div class="source-config-card">
          <div class="input-group">
            <label>{{ t('app.toolbar.port') }}</label>
            <el-select
              v-model="settings.serial.path"
              :disabled="active"
              :placeholder="t('app.toolbar.portPlaceholder')"
              :aria-label="t('app.toolbar.port')"
              :teleported="false"
              filterable
            >
              <el-option
                v-for="port in ports"
                :key="port"
                :label="port"
                :value="extractSerialPortPath(port) || port"
              />
            </el-select>
            <el-button
              :icon="Refresh"
              :loading="refreshing"
              :disabled="active"
              :aria-label="t('app.injection.refreshPorts')"
              @click="refreshPorts"
            />
          </div>
          <div class="input-group">
            <label>{{ t('app.toolbar.baudRate') }}</label
            ><el-select
              v-model="baudRateText"
              :disabled="active"
              :aria-label="t('app.toolbar.baudRate')"
              filterable
              allow-create
              :teleported="false"
              ><el-option
                v-for="rate in baudRates"
                :key="rate"
                :label="String(rate)"
                :value="String(rate)"
            /></el-select>
          </div>
          <div class="input-group">
            <label>{{ t('app.toolbar.dataBits') }}</label
            ><el-select
              v-model="settings.serial.dataBits"
              :disabled="active"
              :teleported="false"
              :aria-label="t('app.toolbar.dataBits')"
              ><el-option
                v-for="bits in [5, 6, 7, 8]"
                :key="bits"
                :label="String(bits)"
                :value="bits"
            /></el-select>
          </div>
          <div class="input-group">
            <label>{{ t('app.toolbar.stopBits') }}</label
            ><el-select
              v-model="settings.serial.stopBits"
              :disabled="active"
              :teleported="false"
              :aria-label="t('app.toolbar.stopBits')"
              ><el-option
                v-for="bits in [1, 1.5, 2]"
                :key="bits"
                :label="String(bits)"
                :value="bits"
            /></el-select>
          </div>
          <div class="input-group">
            <label>{{ t('app.toolbar.parity') }}</label
            ><el-select
              v-model="settings.serial.parity"
              :disabled="active"
              :teleported="false"
              :aria-label="t('app.toolbar.parity')"
              ><el-option
                v-for="parity in ['none', 'even', 'odd']"
                :key="parity"
                :label="parity"
                :value="parity"
            /></el-select>
          </div>
        </div>
      </el-tab-pane>
      <el-tab-pane name="network" :label="t('app.toolbar.networkTab')">
        <template #label>
          <span class="source-tab-label"
            ><el-icon><Monitor /></el-icon
            ><span class="source-tab-copy"
              ><strong>{{ t('app.toolbar.networkTab') }}</strong
              ><small>TCP / UDP / NTRIP</small></span
            ></span
          >
        </template>
        <div class="source-panel-heading">
          <strong>{{ t('app.injection.networkTitle') }}</strong
          ><span>{{ t('app.injection.description') }}</span>
        </div>
        <div class="source-config-card">
          <div class="input-group">
            <label>{{ t('app.toolbar.networkProtocol') }}</label
            ><el-select
              v-model="settings.network.protocol"
              :disabled="active"
              :teleported="false"
              :aria-label="t('app.toolbar.networkProtocol')"
              ><el-option label="TCP" value="tcp" /><el-option label="UDP" value="udp" /><el-option
                label="NTRIP Client"
                value="ntrip"
            /></el-select>
          </div>
          <div class="input-group">
            <label>{{
              t(
                settings.network.protocol === 'udp'
                  ? 'app.toolbar.listenAddr'
                  : 'app.toolbar.remoteAddr',
              )
            }}</label
            ><el-input
              v-model="settings.network.host"
              :disabled="active"
              :aria-label="t('app.injection.host')"
              :placeholder="settings.network.protocol === 'udp' ? '0.0.0.0' : 'cors.example.com'"
            />
          </div>
          <div class="input-group">
            <label>{{ t('app.toolbar.networkPort') }}</label
            ><el-input-number
              v-model="settings.network.port"
              :disabled="active"
              :min="1"
              :max="65535"
              controls-position="right"
              :aria-label="t('app.toolbar.networkPort')"
            />
          </div>
          <template v-if="settings.network.protocol === 'ntrip'">
            <div class="input-group">
              <label>{{ t('app.injection.mountpoint') }}</label
              ><el-autocomplete
                v-model="settings.network.mountpoint"
                :disabled="active"
                :aria-label="t('app.injection.mountpoint')"
                :fetch-suggestions="suggestMountpoints"
                :teleported="false"
                :placeholder="t('app.injection.mountpointPlaceholder')"
                popper-class="mountpoint-suggestions"
                clearable
              >
                <template #suffix
                  ><el-icon><ArrowDown /></el-icon
                ></template>
                <template #default="{ item }">
                  <div class="mountpoint-option">
                    <strong>{{ item.value }}</strong>
                    <small>{{
                      [item.format, item.navigationSystem, item.identifier]
                        .filter(Boolean)
                        .join(' · ')
                    }}</small>
                  </div>
                </template>
              </el-autocomplete>
              <el-button
                :icon="Refresh"
                :loading="fetchingMountpoints"
                :disabled="active || !desktop"
                :title="t('app.injection.fetchMountpoints')"
                :aria-label="t('app.injection.fetchMountpoints')"
                @click="fetchMountpoints"
                >{{ t('app.injection.fetchMountpoints') }}</el-button
              >
            </div>
            <p v-if="mountpointError" class="field-hint injection-error" role="alert">
              {{ mountpointError }}
            </p>
            <p v-else-if="mountpointsFetched" class="field-hint" role="status">
              {{
                mountpoints.length
                  ? t('app.injection.mountpointsLoaded', { count: mountpoints.length })
                  : t('app.injection.noMountpoints')
              }}
            </p>
            <div class="input-group">
              <label>{{ t('app.injection.username') }}</label
              ><el-input
                v-model="settings.network.username"
                :disabled="active"
                :aria-label="t('app.injection.username')"
                autocomplete="off"
              />
            </div>
            <div class="input-group">
              <label>{{ t('app.injection.password') }}</label
              ><el-input
                v-model="settings.network.password"
                :disabled="active"
                :aria-label="t('app.injection.password')"
                type="password"
                show-password
                autocomplete="off"
              />
            </div>
            <p class="field-hint">{{ t('app.injection.passwordHint') }}</p>
            <div class="input-group">
              <label>{{ t('app.injection.sendGga') }}</label
              ><el-switch
                v-model="settings.network.sendGga"
                :disabled="active"
                :aria-label="t('app.injection.sendGga')"
              /><span class="inline-hint">{{ t('app.injection.ggaHint') }}</span>
            </div>
            <div v-if="settings.network.sendGga" class="input-group">
              <label>{{ t('app.injection.ggaInterval') }}</label
              ><el-input-number
                v-model="settings.network.ggaInterval"
                :disabled="active"
                :min="1"
                :max="3600"
                controls-position="right"
                :aria-label="t('app.injection.ggaInterval')"
              /><span class="inline-hint">{{ t('app.toolbar.second') }}</span>
            </div>
          </template>
        </div>
      </el-tab-pane>
    </el-tabs>
    <div class="injection-footer">
      <el-checkbox v-model="settings.autoReconnect" :disabled="active">{{
        t('app.injection.autoReconnect')
      }}</el-checkbox>
      <small v-if="!desktop" class="inline-hint">{{ t('app.injection.desktopOnly') }}</small>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { ArrowDown, Connection, Monitor, Refresh } from '@element-plus/icons-vue'
import {
  ElAutocomplete,
  ElButton,
  ElCheckbox,
  ElIcon,
  ElInput,
  ElInputNumber,
  ElOption,
  ElSelect,
  ElSwitch,
  ElTabPane,
  ElTabs,
} from 'element-plus'
import {
  DataInjectionStorage,
  idleInjectionStatus,
  type DataInjectionStatus,
} from '@/core/data/DataInjection'
import { JsonStorage } from '@/core/storage/JsonStorage'
import type { NtripMountpoint } from '@/core/data/NtripSourceTable'
import { createBrowserIpcTransport } from '@/core/platform/IpcTransport'
import { SerialService, extractSerialPortPath } from '@/core/serial/SerialService'
import { t } from '@/i18n'

defineProps<{ tabPosition: 'top' | 'left' }>()
const storage = new DataInjectionStorage(new JsonStorage(localStorage))
const settings = reactive(storage.load())
const ipc = createBrowserIpcTransport()
const serial = new SerialService(ipc)
const desktop = Boolean(window.electronAPI)
const status = ref<DataInjectionStatus>(idleInjectionStatus())
const ports = ref<string[]>([])
const refreshing = ref(false)
const starting = ref(false)
const actionError = ref('')
const mountpoints = ref<NtripMountpoint[]>([])
const fetchingMountpoints = ref(false)
const mountpointsFetched = ref(false)
const mountpointError = ref('')
let mountpointRequest = 0
const active = computed(() =>
  ['connecting', 'connected', 'reconnecting'].includes(status.value.state),
)
const baudRates = [4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]
const baudRateText = computed({
  get: () => String(settings.serial.baudRate),
  set: (value: string) => {
    settings.serial.baudRate = Number(value)
  },
})
let action = 0
let unsubscribe: (() => void) | undefined
watch(settings, () => storage.save(settings), { deep: true })
watch(
  () => [
    settings.network.host,
    settings.network.port,
    settings.network.username,
    settings.network.password,
    settings.network.protocol,
  ],
  () => {
    ++mountpointRequest
    mountpoints.value = []
    mountpointsFetched.value = false
    fetchingMountpoints.value = false
    mountpointError.value = ''
  },
)

function suggestMountpoints(
  query: string,
  done: (items: Array<NtripMountpoint & { value: string }>) => void,
) {
  const search = query.trim().toLowerCase()
  done(
    mountpoints.value
      .filter((item) =>
        [item.mountpoint, item.identifier, item.format, item.navigationSystem].some((field) =>
          field.toLowerCase().includes(search),
        ),
      )
      .slice(0, 200)
      .map((item) => ({ ...item, value: item.mountpoint })),
  )
}

async function fetchMountpoints() {
  if (!desktop || active.value) return
  const attempt = ++mountpointRequest
  fetchingMountpoints.value = true
  mountpointError.value = ''
  try {
    const { host, port, username, password } = settings.network
    const result = await ipc.invoke<NtripMountpoint[]>('data-injection-mountpoints', {
      host,
      port,
      username,
      password,
    })
    if (attempt !== mountpointRequest) return
    mountpoints.value = result
    mountpointsFetched.value = true
  } catch (error) {
    if (attempt === mountpointRequest) mountpointError.value = errorMessage(error)
  } finally {
    if (attempt === mountpointRequest) fetchingMountpoints.value = false
  }
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
}

async function refreshPorts() {
  if (!desktop) return
  refreshing.value = true
  try {
    ports.value = await serial.listPorts()
  } catch (error) {
    actionError.value = errorMessage(error)
  } finally {
    refreshing.value = false
  }
}

async function start() {
  const attempt = ++action
  actionError.value = ''
  starting.value = true
  try {
    const result = await ipc.invoke<DataInjectionStatus>(
      'data-injection-start',
      JSON.parse(JSON.stringify(settings)),
    )
    if (attempt === action) status.value = result
  } catch (error) {
    if (attempt === action) actionError.value = errorMessage(error)
  } finally {
    if (attempt === action) starting.value = false
  }
}

async function stop() {
  ++action
  starting.value = false
  actionError.value = ''
  try {
    status.value = await ipc.invoke<DataInjectionStatus>('data-injection-stop')
  } catch (error) {
    actionError.value = errorMessage(error)
  }
}

onMounted(async () => {
  if (!desktop) return
  unsubscribe = ipc.on('data-injection-status', (_event, value) => {
    status.value = value as DataInjectionStatus
  })
  try {
    status.value = await ipc.invoke<DataInjectionStatus>('data-injection-status')
  } catch {
    /* Older hosts have no injection status. */
  }
  void refreshPorts()
})
onUnmounted(() => {
  ++mountpointRequest
  unsubscribe?.()
})
defineExpose({ start, stop, active, starting, desktop })
</script>

<style scoped>
.injection-source-tabs {
  min-height: 290px;
}
.source-tab-label {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 10px;
}
.source-tab-label > .el-icon {
  flex: none;
  font-size: 17px;
}
.source-tab-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  line-height: 1.2;
}
.source-tab-copy strong {
  font-size: 12px;
  font-weight: 600;
}
.source-tab-copy small {
  color: var(--app-text-muted);
  font-size: 10px;
  font-weight: 400;
}
.source-panel-heading {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 2px 2px 13px;
}
.source-panel-heading strong {
  color: var(--app-text);
  font-size: 15px;
}
.source-panel-heading span {
  color: var(--app-text-muted);
  font-size: 12px;
  line-height: 1.45;
}
.source-config-card {
  padding: 5px 2px 0;
}
.input-group {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.input-group > label {
  flex: 0 0 94px;
  color: var(--app-text-secondary);
  font-size: 12px;
}
.input-group .el-input,
.input-group .el-autocomplete,
.input-group .el-select {
  flex: 1;
  min-width: 0;
}
.mountpoint-option {
  display: flex;
  flex-direction: column;
  padding: 5px 0;
  line-height: 1.5;
}
.mountpoint-option small {
  color: var(--app-text-muted);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.input-group .el-input-number {
  width: 145px;
}
.field-hint {
  margin: -5px 0 12px 102px;
  color: var(--app-text-muted);
  font-size: 11px;
}
.inline-hint {
  color: var(--app-text-muted);
  font-size: 11px;
  line-height: 1.4;
}
.injection-footer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--app-border);
}
.injection-status {
  display: flex;
  flex: 1 1 100%;
  flex-direction: column;
  gap: 4px;
  color: var(--app-text-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
  margin-bottom: 14px;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface-muted);
}
.injection-status strong {
  color: var(--app-text-muted);
}
.injection-status.is-connected strong {
  color: var(--el-color-success);
}
.injection-status.is-reconnecting strong {
  color: var(--el-color-warning);
}
.injection-error,
.injection-status.is-error strong {
  color: var(--el-color-danger);
}
:deep(.el-tabs__item) {
  height: 62px;
  padding: 0 16px;
}
:deep(.el-tabs--left > .el-tabs__header) {
  margin-right: 28px;
}
@media (max-width: 560px) {
  .input-group {
    flex-wrap: wrap;
  }
  .input-group > label {
    flex-basis: 100%;
  }
  .field-hint {
    margin-left: 0;
  }
  :deep(.el-tabs__item) {
    padding: 0 12px;
  }
}
</style>
