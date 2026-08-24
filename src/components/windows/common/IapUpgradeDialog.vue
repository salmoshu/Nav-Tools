<template>
  <el-dialog
    v-model="visible"
    :title="t('common.iap.title')"
    width="min(880px, 94vw)"
    :close-on-click-modal="false"
    :before-close="beforeClose"
    append-to-body
  >
    <div class="iap-dialog-body">
      <section class="iap-section">
        <div class="section-heading">
          <strong>{{ t('common.iap.firmware') }}</strong>
          <el-tag v-if="firmwareName" size="small" type="info">{{ firmwareName }}</el-tag>
        </div>
        <div class="firmware-row">
          <el-input
            :model-value="firmwarePath"
            readonly
            :placeholder="t('common.iap.selectFirmwareHint')"
          />
          <el-button :disabled="active" @click="selectFirmware">
            <el-icon><FolderOpened /></el-icon>
            {{ t('common.iap.selectFirmware') }}
          </el-button>
        </div>
      </section>

      <section class="iap-section">
        <div class="section-heading protocol-heading">
          <strong>{{ t('common.iap.protocol') }}</strong>
          <div class="template-actions">
            <el-button size="small" text :disabled="active" @click="saveTemplate">
              {{ t('common.iap.saveTemplate') }}
            </el-button>
            <el-button
              size="small"
              text
              type="danger"
              :disabled="active || selectedTemplate?.builtin"
              @click="removeTemplate"
            >
              {{ t('common.iap.deleteTemplate') }}
            </el-button>
            <el-button size="small" text :disabled="active" @click="importTemplates">
              {{ t('common.iap.import') }}
            </el-button>
            <el-button size="small" text :disabled="active" @click="exportTemplates">
              {{ t('common.iap.export') }}
            </el-button>
          </div>
        </div>

        <el-form label-position="top" class="iap-form">
          <div class="form-grid common-grid">
            <el-form-item :label="t('common.iap.template')">
              <el-select v-model="selectedTemplateId" :disabled="active" @change="applyTemplate">
                <el-option
                  v-for="template in templates"
                  :key="template.id"
                  :label="template.name"
                  :value="template.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('common.iap.baudRate')">
              <el-input-number
                v-model="config.baudRate"
                :min="1200"
                :max="12000000"
                :disabled="active"
              />
            </el-form-item>
            <el-form-item :label="t('common.iap.packageSize')">
              <el-input-number
                v-model="config.packageSize"
                :min="16"
                :max="65535"
                :disabled="active"
              />
            </el-form-item>
            <el-form-item :label="t('common.iap.timeout')">
              <el-input-number
                v-model="config.timeoutMs"
                :min="100"
                :max="120000"
                :step="100"
                :disabled="active"
              />
            </el-form-item>
            <el-form-item :label="t('common.iap.maxRetries')">
              <el-input-number v-model="config.maxRetries" :min="0" :max="20" :disabled="active" />
            </el-form-item>
          </div>

          <el-checkbox v-model="advanced" class="advanced-toggle" :disabled="active">
            {{ t('common.iap.advanced') }}
          </el-checkbox>

          <template v-if="advanced">
            <el-divider content-position="left">{{ t('common.iap.frameCommands') }}</el-divider>
            <div class="form-grid advanced-grid">
              <el-form-item :label="t('common.iap.frameHeader')"
                ><el-input v-model="config.frameHeaderHex" :disabled="active"
              /></el-form-item>
              <el-form-item :label="t('common.iap.askCommand')"
                ><el-input v-model="config.askCommandHex" :disabled="active"
              /></el-form-item>
              <el-form-item :label="t('common.iap.dataCommand')"
                ><el-input v-model="config.dataCommandHex" :disabled="active"
              /></el-form-item>
              <el-form-item :label="t('common.iap.finalCommand')"
                ><el-input v-model="config.finalCommandHex" :disabled="active"
              /></el-form-item>
              <el-form-item :label="t('common.iap.askAckCommand')"
                ><el-input v-model="config.askAckCommandHex" :disabled="active"
              /></el-form-item>
              <el-form-item :label="t('common.iap.dataAckCommand')"
                ><el-input v-model="config.dataAckCommandHex" :disabled="active"
              /></el-form-item>
            </div>

            <el-divider content-position="left">{{ t('common.iap.encoding') }}</el-divider>
            <div class="form-grid advanced-grid">
              <el-form-item :label="t('common.iap.byteOrder')">
                <el-select v-model="config.byteOrder" :disabled="active">
                  <el-option label="Big Endian" value="big" />
                  <el-option label="Little Endian" value="little" />
                </el-select>
              </el-form-item>
              <el-form-item :label="t('common.iap.checksum')">
                <el-select v-model="config.checksumAlgorithm" :disabled="active">
                  <el-option label="CRC32" value="crc32" />
                  <el-option label="CRC16-Modbus" value="crc16-modbus" />
                  <el-option label="Checksum8" value="checksum8" />
                  <el-option label="Checksum16" value="checksum16" />
                  <el-option label="XOR" value="xor" />
                  <el-option :label="t('common.iap.noChecksum')" value="none" />
                </el-select>
              </el-form-item>
              <el-form-item :label="t('common.iap.checksumByteOrder')">
                <el-select v-model="config.checksumByteOrder" :disabled="active">
                  <el-option label="Big Endian" value="big" />
                  <el-option label="Little Endian" value="little" />
                </el-select>
              </el-form-item>
            </div>

            <el-divider content-position="left">{{ t('common.iap.fieldLayout') }}</el-divider>
            <div class="form-grid numeric-grid">
              <el-form-item :label="t('common.iap.fileLengthBytes')"
                ><el-input-number
                  v-model="config.fileLengthBytes"
                  :min="1"
                  :max="6"
                  :disabled="active"
              /></el-form-item>
              <el-form-item :label="t('common.iap.packageCountBytes')"
                ><el-input-number
                  v-model="config.packageCountBytes"
                  :min="1"
                  :max="6"
                  :disabled="active"
              /></el-form-item>
              <el-form-item :label="t('common.iap.remainderBytes')"
                ><el-input-number
                  v-model="config.remainderLengthBytes"
                  :min="1"
                  :max="6"
                  :disabled="active"
              /></el-form-item>
              <el-form-item :label="t('common.iap.packetIndexBytes')"
                ><el-input-number
                  v-model="config.packetIndexBytes"
                  :min="1"
                  :max="6"
                  :disabled="active"
              /></el-form-item>
              <el-form-item :label="t('common.iap.packetIndexBase')"
                ><el-input-number
                  v-model="config.packetIndexBase"
                  :min="0"
                  :max="255"
                  :disabled="active"
              /></el-form-item>
              <el-form-item :label="t('common.iap.ackIndexOffset')"
                ><el-input-number
                  v-model="config.ackIndexOffset"
                  :min="0"
                  :max="255"
                  :disabled="active"
              /></el-form-item>
              <el-form-item :label="t('common.iap.ackIndexBytes')"
                ><el-input-number
                  v-model="config.ackIndexBytes"
                  :min="1"
                  :max="6"
                  :disabled="active"
              /></el-form-item>
              <el-form-item :label="t('common.iap.ackStatusOffset')"
                ><el-input-number
                  v-model="config.ackStatusOffset"
                  :min="0"
                  :max="255"
                  :disabled="active"
              /></el-form-item>
              <el-form-item :label="t('common.iap.ackSuccessValue')"
                ><el-input-number
                  v-model="config.ackSuccessValue"
                  :min="0"
                  :max="255"
                  :disabled="active"
              /></el-form-item>
              <el-form-item :label="t('common.iap.ackRetryValue')"
                ><el-input-number
                  v-model="config.ackRetryValue"
                  :min="0"
                  :max="255"
                  :disabled="active"
              /></el-form-item>
              <el-form-item :label="t('common.iap.responseMinLength')"
                ><el-input-number
                  v-model="config.responseMinLength"
                  :min="2"
                  :max="1024"
                  :disabled="active"
              /></el-form-item>
              <el-form-item :label="t('common.iap.responseMaxLength')"
                ><el-input-number
                  v-model="config.responseMaxLength"
                  :min="2"
                  :max="4096"
                  :disabled="active"
              /></el-form-item>
              <el-form-item
                v-if="config.checksumAlgorithm === 'none'"
                :label="t('common.iap.responseFrameLength')"
                ><el-input-number
                  v-model="config.responseFrameLength"
                  :min="2"
                  :max="4096"
                  :disabled="active"
              /></el-form-item>
            </div>
          </template>
        </el-form>

        <el-alert
          v-if="validationErrors.length"
          type="error"
          :closable="false"
          :title="validationErrors.join('; ')"
          show-icon
        />
      </section>

      <section v-if="snapshot.phase !== 'idle'" class="iap-section progress-section">
        <div class="progress-heading">
          <strong>{{ statusText }}</strong>
          <span>{{ formatElapsed(snapshot.elapsedMs) }}</span>
        </div>
        <el-progress :percentage="snapshot.progress" :status="progressStatus" :stroke-width="14" />
        <div class="stats-row">
          <span>{{
            t('common.iap.ackedPackets', {
              acked: snapshot.acknowledgedPackets,
              total: snapshot.totalPackets,
            })
          }}</span>
          <span>{{ t('common.iap.sentPackets', { count: snapshot.sentPackets }) }}</span>
          <span>{{ t('common.iap.retries', { count: snapshot.retryCount }) }}</span>
          <span v-if="snapshot.error" class="error-text">{{ snapshot.error }}</span>
        </div>
      </section>

      <section class="iap-log-section">
        <div class="section-heading">
          <strong>{{ t('common.iap.log') }}</strong>
          <el-button size="small" text @click="logs = []">{{ t('common.iap.clearLog') }}</el-button>
        </div>
        <pre ref="logElement" class="iap-log">{{ logs.join('\n') || t('common.iap.waiting') }}</pre>
      </section>
    </div>

    <template #footer>
      <el-button @click="requestClose">{{ t('common.iap.close') }}</el-button>
      <el-button v-if="active" type="danger" @click="cancelUpgrade">{{
        t('common.iap.cancel')
      }}</el-button>
      <el-button
        v-else
        type="primary"
        :disabled="!firmwarePath || validationErrors.length > 0"
        @click="startUpgrade"
      >
        {{ t('common.iap.start') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { FolderOpened } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { t } from '@/i18n'
import {
  cloneIapConfig,
  IGK_IAP_TEMPLATE,
  validateIapProtocolConfig,
  type IapProtocolConfig,
  type IapProtocolTemplate,
} from '@/core/iap/IapProtocol'
import { createProfileId, IapProfileStorage } from '@/core/iap/IapProfileStorage'
import {
  EMPTY_IAP_SNAPSHOT,
  type IapUpgradeEvent,
  type IapUpgradeSnapshot,
} from '@/core/iap/IapUpgrade'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const profileStorage = new IapProfileStorage(localStorage)
const templates = ref<IapProtocolTemplate[]>(profileStorage.list())
const selectedTemplateId = ref(IGK_IAP_TEMPLATE.id)
const config = reactive<IapProtocolConfig>(cloneIapConfig(IGK_IAP_TEMPLATE.config))
const advanced = ref(false)
const firmwarePath = ref('')
const firmwareName = ref('')
const logs = ref<string[]>([])
const logElement = ref<HTMLElement | null>(null)
const snapshot = ref<IapUpgradeSnapshot>({ ...EMPTY_IAP_SNAPSHOT })

const selectedTemplate = computed(() =>
  templates.value.find((template) => template.id === selectedTemplateId.value),
)
const active = computed(() => ['preparing', 'asking', 'sending'].includes(snapshot.value.phase))
const validationErrors = computed(() => validateIapProtocolConfig(config))
const progressStatus = computed(() => {
  if (snapshot.value.phase === 'success') return 'success'
  if (snapshot.value.phase === 'error' || snapshot.value.phase === 'cancelled') return 'exception'
  return undefined
})
const statusText = computed(() => t(`common.iap.status.${snapshot.value.phase}`))

function applyTemplate(id: string): void {
  const template = templates.value.find((entry) => entry.id === id)
  if (template) Object.assign(config, cloneIapConfig(template.config))
}

function selectFirmware(): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.bin,.hex,.img,.fw,*/*'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    firmwareName.value = file.name
    firmwarePath.value = window.electronAPI?.getPathForFile(file) || ''
    if (!firmwarePath.value) ElMessage.error(t('common.iap.desktopOnly'))
  }
  input.click()
}

async function saveTemplate(): Promise<void> {
  try {
    const result = await ElMessageBox.prompt(
      t('common.iap.templateNameHint'),
      t('common.iap.saveTemplate'),
      { inputValue: selectedTemplate.value?.builtin ? '' : selectedTemplate.value?.name },
    )
    const current = selectedTemplate.value
    const profile = profileStorage.save({
      id: current && !current.builtin ? current.id : createProfileId(),
      name: result.value,
      config: cloneIapConfig(config),
    })
    templates.value = profileStorage.list()
    selectedTemplateId.value = profile.id
    ElMessage.success(t('common.iap.templateSaved'))
  } catch (error) {
    if (error !== 'cancel' && error !== 'close')
      ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

async function removeTemplate(): Promise<void> {
  const template = selectedTemplate.value
  if (!template || template.builtin) return
  await ElMessageBox.confirm(
    t('common.iap.deleteTemplateConfirm'),
    t('common.iap.deleteTemplate'),
    { type: 'warning' },
  )
  profileStorage.remove(template.id)
  templates.value = profileStorage.list()
  selectedTemplateId.value = IGK_IAP_TEMPLATE.id
  applyTemplate(selectedTemplateId.value)
}

function exportTemplates(): void {
  const blob = new Blob([profileStorage.exportJson()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'nav-tools-iap-templates.json'
  anchor.click()
  URL.revokeObjectURL(url)
}

function importTemplates(): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,application/json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const imported = profileStorage.importJson(await file.text())
      templates.value = profileStorage.list()
      if (imported[0]) {
        selectedTemplateId.value = imported[0].id
        applyTemplate(imported[0].id)
      }
      ElMessage.success(t('common.iap.imported'))
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : String(error))
    }
  }
  input.click()
}

async function startUpgrade(): Promise<void> {
  try {
    logs.value = []
    await window.ipcRenderer.invoke('iap-upgrade-start', {
      filePath: firmwarePath.value,
      fileName: firmwareName.value,
      protocolName: selectedTemplate.value?.name || t('common.iap.customProtocol'),
      config: cloneIapConfig(config),
    })
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

async function cancelUpgrade(): Promise<void> {
  try {
    await ElMessageBox.confirm(t('common.iap.cancelConfirm'), t('common.iap.cancel'), {
      type: 'warning',
    })
    await window.ipcRenderer.invoke('iap-upgrade-cancel')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close')
      ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

function beforeClose(done: () => void): void {
  if (!active.value) {
    done()
    return
  }
  void ElMessageBox.confirm(t('common.iap.closeConfirm'), t('common.iap.cancel'), {
    type: 'warning',
  })
    .then(async () => {
      await window.ipcRenderer.invoke('iap-upgrade-cancel')
      done()
    })
    .catch(() => undefined)
}

function requestClose(): void {
  beforeClose(() => (visible.value = false))
}

function handleUpgradeEvent(_event: unknown, value: IapUpgradeEvent): void {
  if (value.type === 'log') {
    const time = new Date(value.timestamp).toLocaleTimeString()
    logs.value.push(`${time} ${value.message}`)
    void nextTick(() => {
      if (logElement.value) logElement.value.scrollTop = logElement.value.scrollHeight
    })
    return
  }
  const previous = snapshot.value.phase
  snapshot.value = value.snapshot
  if (value.snapshot.phase === 'error' && previous !== 'error') {
    ElMessageBox.alert(value.snapshot.error || t('common.iap.failed'), t('common.iap.failed'), {
      type: 'error',
    })
  }
}

function formatElapsed(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

watch(
  () => props.modelValue,
  (open) => {
    if (open)
      void window.ipcRenderer
        .invoke('iap-upgrade-snapshot')
        .then((value) => (snapshot.value = value))
  },
)

onMounted(() => window.ipcRenderer?.on('iap-upgrade-event', handleUpgradeEvent))
onUnmounted(() => window.ipcRenderer?.off('iap-upgrade-event', handleUpgradeEvent))
</script>

<style scoped>
.iap-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 70vh;
  overflow: auto;
  padding-right: 4px;
}
.iap-section,
.iap-log-section {
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
}
.section-heading,
.progress-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.protocol-heading {
  align-items: flex-start;
}
.template-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.firmware-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}
.form-grid {
  display: grid;
  gap: 0 12px;
}
.common-grid {
  grid-template-columns: repeat(5, minmax(110px, 1fr));
}
.advanced-grid {
  grid-template-columns: repeat(3, minmax(150px, 1fr));
}
.numeric-grid {
  grid-template-columns: repeat(4, minmax(120px, 1fr));
}
.iap-form :deep(.el-form-item) {
  margin-bottom: 10px;
}
.iap-form :deep(.el-select),
.iap-form :deep(.el-input-number) {
  width: 100%;
}
.advanced-toggle {
  margin-top: 4px;
}
.progress-section {
  background: var(--app-surface-muted);
}
.stats-row {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 8px;
  font-size: 12px;
  color: var(--app-text-muted);
}
.error-text {
  color: var(--el-color-danger);
  font-weight: 600;
}
.iap-log {
  height: 150px;
  overflow: auto;
  margin: 0;
  padding: 10px;
  border-radius: 6px;
  color: #d8dee9;
  background: #151922;
  font:
    12px/1.5 Consolas,
    'Cascadia Mono',
    monospace;
  white-space: pre-wrap;
  word-break: break-all;
}
@media (max-width: 760px) {
  .common-grid,
  .advanced-grid,
  .numeric-grid {
    grid-template-columns: repeat(2, minmax(120px, 1fr));
  }
}
</style>
