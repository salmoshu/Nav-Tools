<template>
  <section class="camera-parameters">
    <div class="parameter-scroll">
      <div class="connection-card section-card">
        <div class="section-heading">
          <span class="heading-icon"
            ><el-icon><Connection /></el-icon
          ></span>
          <strong class="section-title">{{ t('common.camera.connectionSettings') }}</strong>
          <el-tag :type="statusType" effect="plain" round>{{ statusText }}</el-tag>
        </div>

        <div class="connection-grid">
          <label>
            <span>{{ t('common.camera.serverAddress') }}</span>
            <el-input v-model="host" placeholder="192.168.3.14" :disabled="sending" />
          </label>
          <label>
            <span>{{ t('common.camera.port') }}</span>
            <el-input-number
              v-model="port"
              :min="1"
              :max="65535"
              controls-position="right"
              :disabled="sending"
            />
          </label>
          <label>
            <span>{{ t('common.camera.loginCommand') }}</span>
            <el-input model-value="0x00000001" :aria-label="t('common.camera.loginCommand')" readonly />
          </label>
        </div>
      </div>

      <div class="command-card section-card">
        <div class="section-heading">
          <span class="heading-icon"
            ><el-icon><Setting /></el-icon
          ></span>
          <strong class="section-title">{{ t('common.camera.cameraCommands') }}</strong>
          <el-button text class="hint-toggle" @click="showCommandHelp = true">
            <el-icon><InfoFilled /></el-icon>
            {{ t('common.camera.help') }}
          </el-button>
        </div>

        <div class="command-form">
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
              <el-switch v-model="contentIsHex" :disabled="sending" />
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
            <el-button type="primary" :loading="sending" @click="sendCommand">
              <el-icon v-if="!sending"><Promotion /></el-icon>
              {{ sending ? t('common.camera.sending') : t('common.camera.sendCommand') }}
            </el-button>
          </div>
        </div>
      </div>

      <div class="output-card section-card">
        <div class="section-heading output-heading">
          <span class="heading-icon"
            ><el-icon><Document /></el-icon
          ></span>
          <strong class="section-title">{{ t('common.camera.outputResult') }}</strong>
          <el-button text :disabled="logs.length === 0 || sending" @click="clearOutput"
            >{{ t('common.camera.clear') }}</el-button
          >
        </div>
        <pre ref="outputElement" class="output-console">{{ outputText }}</pre>
      </div>
    </div>

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
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Connection, Document, InfoFilled, Promotion, Setting } from '@element-plus/icons-vue'
import { t } from '@/i18n'
import {
  CAMERA_SUB_COMMANDS,
  CameraParametersStorage,
  type CameraParametersSettings,
} from '@/core/camera/CameraParametersStorage'
import { JsonStorage } from '@/core/storage/JsonStorage'

type Status = 'ready' | 'sending' | 'success' | 'error'

const subCommandOptions = CAMERA_SUB_COMMANDS
const parametersStorage = new CameraParametersStorage(new JsonStorage(window.localStorage))
const savedSettings = parametersStorage.load()
const host = ref(savedSettings.host)
const port = ref(savedSettings.port)
const subCommand = ref(savedSettings.subCommand)
const content = ref(savedSettings.content)
const contentIsHex = ref(savedSettings.contentIsHex)
const showCommandHelp = ref(false)
const sending = ref(false)
const status = ref<Status>('ready')
const logs = ref<string[]>([])
const outputElement = ref<HTMLElement>()

watch(
  [host, port, subCommand, content, contentIsHex],
  () => {
    parametersStorage.save({
      version: 1,
      host: host.value,
      port: port.value,
      subCommand: subCommand.value,
      content: content.value,
      contentIsHex: contentIsHex.value,
    } satisfies CameraParametersSettings)
  },
  { flush: 'post' },
)

const statusText = computed(
  () =>
    ({
      ready: t('common.camera.status.ready'),
      sending: t('common.camera.status.sending'),
      success: t('common.camera.status.success'),
      error: t('common.camera.status.error'),
    })[status.value],
)

const statusType = computed(
  () =>
    (
      ({
        ready: 'info',
        sending: 'warning',
        success: 'success',
        error: 'danger',
      }) as const
    )[status.value],
)

const contentPlaceholder = computed(() =>
  contentIsHex.value
    ? t('common.camera.placeholderHex')
    : t('common.camera.placeholderUtf8'),
)

const outputText = computed(() =>
  logs.value.length > 0 ? logs.value.join('\n') : t('common.camera.waitingToSend'),
)

function handleSubCommandChange(value: string) {
  contentIsHex.value = value === 'bbox_draw'
}

function validateInput(): string | undefined {
  if (!host.value.trim()) return t('common.camera.errEnterServerAddress')
  if (!Number.isInteger(port.value) || port.value < 1 || port.value > 65535) {
    return t('common.camera.errPortRange')
  }
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
  status.value = 'sending'
  await appendLog(
    '',
    t('common.camera.logLoginHeader'),
    t('common.camera.logMainCmd'),
    t('common.camera.logServer', { host: `${host.value.trim()}:${port.value}` }),
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
      host: host.value.trim(),
      port: port.value,
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
      t('common.camera.logResponse', { resp: result.response || '(空响应)' }),
      t('common.camera.logResponseByte', { hex: formatHex(result.responseHex) || '(空)' }),
      t('common.camera.logBigSeparator'),
    )
    status.value = 'success'
    ElMessage.success(t('common.camera.sentSuccess'))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await appendLog(t('common.camera.logError', { msg: message }), t('common.camera.logBigSeparator'))
    status.value = 'error'
    ElMessage.error(t('common.camera.sendFailed') + message)
  } finally {
    sending.value = false
  }
}

function clearOutput() {
  logs.value = []
  status.value = 'ready'
}
</script>

<style scoped>
.camera-parameters {
  width: 100%;
  height: 100%;
  min-height: 0;
  color: var(--app-text);
  background: var(--app-surface);
}

.parameter-scroll {
  box-sizing: border-box;
  height: 100%;
  overflow: auto;
  padding: 14px;
}

.section-card {
  margin-bottom: 12px;
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
  padding: 11px 13px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-surface-muted);
}

.section-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
}

.heading-icon {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--el-color-primary) 30%, var(--app-border));
  border-radius: 8px;
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 10%, var(--app-surface));
}

.connection-grid {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 150px minmax(190px, 1fr);
  gap: 12px;
  padding: 13px;
}

.connection-grid label {
  display: grid;
  gap: 6px;
  color: var(--app-text-secondary);
  font-size: 12px;
}

.connection-grid :deep(.el-input-number),
.connection-grid :deep(.el-input),
.command-form :deep(.el-select) {
  width: 100%;
}

.command-form {
  display: grid;
  gap: 11px;
  padding: 13px;
}

.field-row {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
}

.sub-command-field {
  grid-template-columns: 88px minmax(0, 1fr) auto;
}

.field-label {
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 500;
}

.format-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--app-text-secondary);
  font-size: 12px;
  white-space: nowrap;
}

.content-field {
  align-items: start;
}

.content-field .field-label {
  padding-top: 7px;
}

.content-field :deep(.el-textarea) {
  width: 100%;
}

.command-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.command-actions > span {
  color: var(--app-text-muted);
  font-size: 11px;
}

.command-help {
  display: grid;
  gap: 12px;
}

.command-help p {
  display: grid;
  gap: 5px;
  margin: 0;
  padding: 12px 14px;
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

.hint-toggle {
  margin-left: auto;
}

.hint-toggle .el-icon {
  margin-right: 4px;
}

.output-console {
  box-sizing: border-box;
  height: 210px;
  min-height: 130px;
  margin: 0;
  overflow: auto;
  padding: 13px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: #b9f6ca;
  background: #17202a;
  font:
    11px/1.55 Consolas,
    'Courier New',
    monospace;
  user-select: text;
}

@media (max-width: 760px) {
  .parameter-scroll {
    padding: 10px;
  }

  .connection-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 430px) {
  .command-actions {
    align-items: flex-start;
    flex-direction: column;
  }

  .command-actions :deep(.el-button) {
    width: 100%;
  }
}
</style>
