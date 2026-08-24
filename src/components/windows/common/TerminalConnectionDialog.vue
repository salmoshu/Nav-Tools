<template>
  <el-dialog
    v-model="visible"
    :title="t('common.terminal.sshConnection')"
    class="app-dialog terminal-connection-dialog"
    width="min(760px, calc(100vw - 24px))"
    append-to-body
    align-center
    :z-index="8000"
    :close-on-click-modal="false"
    :close-on-press-escape="!connecting"
    :show-close="!connecting"
  >
    <template #header>
      <AppDialogTitle
        :icon="Connection"
        :title="t('common.terminal.sshConnection')"
        :description="t('common.terminal.sshConnectionDescription')"
      />
    </template>

    <el-form label-position="top" class="ssh-form" :disabled="connecting">
      <section class="profile-picker">
        <div class="profile-picker__copy">
          <strong>{{ t('common.terminal.savedConnections') }}</strong>
          <small>{{ t('common.terminal.savedConnectionsHint') }}</small>
        </div>
        <el-select
          v-model="selectedId"
          clearable
          filterable
          popper-class="app-dialog-select-popper"
          :placeholder="t('common.terminal.newConnection')"
          @change="loadSelected"
        >
          <el-option
            v-for="profile in profiles"
            :key="profile.id"
            :label="
              profile.source === 'ssh-config' ? `${profile.name} (~/.ssh/config)` : profile.name
            "
            :value="profile.id"
          />
        </el-select>
      </section>

      <section class="config-section">
        <header class="section-heading">
          <div>
            <h3>{{ t('common.terminal.connectionDetails') }}</h3>
            <p>{{ t('common.terminal.connectionDetailsHint') }}</p>
          </div>
          <span class="section-badge">SSH</span>
        </header>

        <div class="ssh-grid">
          <el-form-item :label="t('common.terminal.profileName')" class="col-3">
            <el-input v-model="form.name" />
          </el-form-item>
          <el-form-item :label="t('common.terminal.username')" class="col-3">
            <el-input v-model="form.username" autocomplete="username" />
          </el-form-item>
          <el-form-item :label="t('common.terminal.host')" class="col-4">
            <el-input v-model="form.host" />
          </el-form-item>
          <el-form-item :label="t('common.terminal.port')" class="col-2">
            <el-input-number v-model="form.port" :min="1" :max="65535" controls-position="right" />
          </el-form-item>
          <el-form-item :label="t('common.terminal.authentication')" class="col-3">
            <el-select v-model="form.authMethod" popper-class="app-dialog-select-popper">
              <el-option :label="t('common.terminal.password')" value="password" />
              <el-option :label="t('common.terminal.privateKey')" value="private-key" />
              <el-option label="SSH Agent" value="agent" />
            </el-select>
          </el-form-item>
          <el-form-item
            v-if="form.authMethod === 'password'"
            :label="t('common.terminal.password')"
            class="col-3"
          >
            <el-input
              v-model="password"
              type="password"
              show-password
              autocomplete="current-password"
            />
          </el-form-item>
          <el-form-item
            v-if="form.authMethod === 'private-key'"
            :label="t('common.terminal.privateKeyPath')"
            class="col-4"
          >
            <el-input v-model="form.privateKeyPath">
              <template #append>
                <el-button @click="selectPrivateKey">{{ t('common.terminal.browse') }}</el-button>
              </template>
            </el-input>
          </el-form-item>
          <el-form-item
            v-if="form.authMethod === 'private-key'"
            :label="t('common.terminal.passphrase')"
            class="col-2"
          >
            <el-input v-model="passphrase" type="password" show-password autocomplete="off" />
          </el-form-item>
        </div>
      </section>

      <el-collapse v-model="expandedSections" class="advanced-sections">
        <el-collapse-item :title="t('common.terminal.advancedSettings')" name="advanced">
          <div class="ssh-grid advanced-grid">
            <el-form-item label="ProxyJump" class="col-3">
              <el-input v-model="form.proxyJump" placeholder="user@jump-host:22" />
            </el-form-item>
            <el-form-item :label="t('common.terminal.initialDirectory')" class="col-3">
              <el-input v-model="form.initialDirectory" placeholder="~" />
            </el-form-item>
          </div>
        </el-collapse-item>

        <el-collapse-item :title="t('common.terminal.portForwarding')" name="forwarding">
          <div class="forward-toolbar">
            <span>{{ t('common.terminal.portForwardingHint') }}</span>
            <div>
              <el-button size="small" @click="addForward('local')">+ Local</el-button>
              <el-button size="small" @click="addForward('remote')">+ Remote</el-button>
              <el-button size="small" @click="addForward('dynamic')">+ SOCKS</el-button>
            </div>
          </div>
          <div v-if="form.forwards.length" class="forward-list">
            <article v-for="rule in form.forwards" :key="rule.id" class="forward-rule">
              <header class="forward-rule__header">
                <el-switch v-model="rule.enabled" />
                <el-input v-model="rule.name" :placeholder="t('common.terminal.ruleName')" />
                <el-select
                  v-model="rule.kind"
                  class="kind-select"
                  popper-class="app-dialog-select-popper"
                >
                  <el-option label="Local (-L)" value="local" />
                  <el-option label="Remote (-R)" value="remote" />
                  <el-option label="SOCKS (-D)" value="dynamic" />
                </el-select>
                <el-button text type="danger" @click="removeForward(rule.id)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </header>
              <div class="forward-rule__fields">
                <label>
                  <span>{{ t('common.terminal.bindAddress') }}</span>
                  <el-input v-model="rule.bindAddress" placeholder="127.0.0.1" />
                </label>
                <label>
                  <span>{{ t('common.terminal.bindPort') }}</span>
                  <el-input-number
                    v-model="rule.bindPort"
                    :min="0"
                    :max="65535"
                    controls-position="right"
                  />
                </label>
                <template v-if="rule.kind !== 'dynamic'">
                  <label>
                    <span>{{ t('common.terminal.targetHost') }}</span>
                    <el-input v-model="rule.targetHost" placeholder="127.0.0.1" />
                  </label>
                  <label>
                    <span>{{ t('common.terminal.targetPort') }}</span>
                    <el-input-number
                      v-model="rule.targetPort"
                      :min="1"
                      :max="65535"
                      controls-position="right"
                    />
                  </label>
                </template>
              </div>
            </article>
          </div>
          <div v-else class="forward-empty">
            <el-icon><Connection /></el-icon>
            <div>
              <strong>{{ t('common.terminal.noForwardRules') }}</strong>
              <span>{{ t('common.terminal.noForwardRulesHint') }}</span>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </el-form>

    <el-alert
      v-if="connectionError"
      class="connection-error"
      type="error"
      show-icon
      :title="t('common.terminal.connectionFailed')"
      :description="connectionError"
      :closable="false"
    />
    <div v-else-if="connecting" class="connection-progress" role="status">
      <span class="connection-progress__icon">
        <el-icon class="is-loading"><Loading /></el-icon>
      </span>
      <span>
        <strong>{{ t('common.terminal.connecting') }}</strong>
        <small>{{ connectionTarget }}</small>
      </span>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-checkbox
          v-model="saveConnection"
          :disabled="connecting || form.source === 'ssh-config'"
        >
          {{ t('common.terminal.saveConnectionNoSecrets') }}
        </el-checkbox>
        <div class="dialog-footer__actions">
          <el-button :disabled="connecting" @click="visible = false">
            {{ t('common.terminal.cancel') }}
          </el-button>
          <el-button
            v-if="selectedProfile?.source === 'nav-tools'"
            type="danger"
            plain
            :disabled="connecting"
            @click="removeProfile"
          >
            {{ t('common.terminal.deleteConnection') }}
          </el-button>
          <el-button type="primary" :loading="connecting" :disabled="!valid" @click="connect">
            {{ t('common.terminal.connect') }}
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, toRaw, watch } from 'vue'
import { Connection, Delete, Loading } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import AppDialogTitle from '@/components/AppDialogTitle.vue'
import { t } from '@/i18n'
import {
  createPortForwardRule,
  type PortForwardKind,
  type SshConnectionProfile,
  type SshConnectionSecrets,
} from '@/core/terminal/TerminalTypes'
import { createSshProfile } from '@/core/terminal/TerminalProfileStorage'

const props = defineProps<{
  modelValue: boolean
  profiles: SshConnectionProfile[]
  connecting?: boolean
  connectionError?: string
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  connect: [profile: SshConnectionProfile, secrets: SshConnectionSecrets, save: boolean]
  remove: [id: string]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})
const selectedId = ref('')
const expandedSections = ref<string[]>([])
const form = reactive<SshConnectionProfile>(createSshProfile())
const password = ref('')
const passphrase = ref('')
const saveConnection = ref(true)
const selectedProfile = computed(() =>
  props.profiles.find((profile) => profile.id === selectedId.value),
)
const connectionTarget = computed(() => `${form.username || '…'}@${form.host || '…'}:${form.port}`)
const valid = computed(() => {
  if (!form.name.trim() || !form.host.trim() || !form.username.trim()) return false
  if (form.port < 1 || form.port > 65535) return false
  if (form.authMethod === 'password' && !password.value) return false
  if (form.authMethod === 'private-key' && !form.privateKeyPath.trim()) return false
  return form.forwards.every(
    (rule) =>
      rule.bindPort >= 0 &&
      rule.bindPort <= 65535 &&
      (rule.kind === 'dynamic' ||
        (!!rule.targetHost && rule.targetPort > 0 && rule.targetPort <= 65535)),
  )
})

function reset(): void {
  selectedId.value = ''
  Object.assign(form, createSshProfile())
  password.value = ''
  passphrase.value = ''
  saveConnection.value = true
  expandedSections.value = []
}

function loadSelected(id: string): void {
  const profile = props.profiles.find((entry) => entry.id === id)
  if (!profile) {
    reset()
    return
  }
  Object.assign(form, cloneProfile(profile))
  password.value = ''
  passphrase.value = ''
  saveConnection.value = profile.source === 'nav-tools'
  expandedSections.value = profile.forwards.length ? ['forwarding'] : []
}

function addForward(kind: PortForwardKind): void {
  form.forwards.push(createPortForwardRule(kind))
}

function removeForward(id: string): void {
  form.forwards = form.forwards.filter((rule) => rule.id !== id)
}

async function selectPrivateKey(): Promise<void> {
  const selected = await window.ipcRenderer.invoke('terminal-private-key-select')
  if (typeof selected === 'string') form.privateKeyPath = selected
}

function connect(): void {
  const profile = cloneProfile(form)
  if (profile.source === 'ssh-config') saveConnection.value = false
  emit(
    'connect',
    profile,
    { password: password.value || undefined, passphrase: passphrase.value || undefined },
    saveConnection.value,
  )
}

function cloneProfile(profile: SshConnectionProfile): SshConnectionProfile {
  const rawProfile = toRaw(profile)
  return {
    ...rawProfile,
    forwards: rawProfile.forwards.map((rule) => ({ ...toRaw(rule) })),
  }
}

async function removeProfile(): Promise<void> {
  const profile = selectedProfile.value
  if (!profile) return
  await ElMessageBox.confirm(
    t('common.terminal.deleteConnectionConfirm'),
    t('common.terminal.deleteConnection'),
    { type: 'warning', customClass: 'app-message-box' },
  )
  emit('remove', profile.id)
  reset()
}

watch(
  () => props.modelValue,
  (open) => {
    if (open && !selectedId.value) reset()
  },
)
</script>

<style scoped>
.ssh-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.profile-picker,
.config-section {
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-surface-muted);
}
.profile-picker {
  display: grid;
  grid-template-columns: minmax(190px, 0.85fr) minmax(260px, 1.35fr);
  align-items: center;
  gap: 18px;
  padding: 12px 14px;
}
.profile-picker__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}
.profile-picker__copy strong {
  color: var(--app-text);
  font-size: 13px;
  font-weight: 650;
}
.profile-picker__copy small,
.section-heading p,
.forward-toolbar > span,
.forward-empty span {
  color: var(--app-text-muted);
  font-size: 11px;
  line-height: 1.45;
}
.config-section {
  padding: 14px 16px 4px;
}
.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.section-heading h3,
.section-heading p {
  margin: 0;
}
.section-heading h3 {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 650;
}
.section-heading p {
  margin-top: 3px;
}
.section-badge {
  padding: 3px 8px;
  border: 1px solid color-mix(in srgb, var(--el-color-primary) 28%, var(--app-border));
  border-radius: 999px;
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 9%, var(--app-surface));
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
}
.ssh-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0 14px;
}
.col-2 {
  grid-column: span 2;
}
.col-3 {
  grid-column: span 3;
}
.col-4 {
  grid-column: span 4;
}
.ssh-grid :deep(.el-form-item) {
  margin-bottom: 14px;
}
.ssh-grid :deep(.el-form-item__label) {
  height: auto;
  margin-bottom: 5px;
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1.25;
}
.advanced-sections {
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  --el-collapse-border-color: transparent;
  --el-collapse-header-bg-color: var(--app-surface);
  --el-collapse-content-bg-color: var(--app-surface);
}
.advanced-sections :deep(.el-collapse-item__header) {
  height: 44px;
  padding: 0 14px;
  color: var(--app-text);
  font-size: 13px;
  font-weight: 600;
}
.advanced-sections :deep(.el-collapse-item + .el-collapse-item) {
  border-top: 1px solid var(--app-border);
}
.advanced-sections :deep(.el-collapse-item__wrap) {
  border-top: 1px solid var(--app-border);
}
.advanced-sections :deep(.el-collapse-item__content) {
  padding: 14px;
  color: var(--app-text-secondary);
}
.advanced-grid :deep(.el-form-item) {
  margin-bottom: 0;
}
.forward-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.forward-toolbar > div {
  display: flex;
  flex: none;
  gap: 6px;
}
.forward-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.forward-rule {
  padding: 10px 12px 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface-muted);
}
.forward-rule__header {
  display: grid;
  grid-template-columns: auto minmax(120px, 1fr) 128px auto;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.forward-rule__fields {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.forward-rule__fields label {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}
.forward-rule__fields label > span {
  color: var(--app-text-muted);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.forward-empty {
  display: flex;
  min-height: 64px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 1px dashed var(--app-border-strong);
  border-radius: 8px;
  color: var(--app-text-muted);
  background: var(--app-surface-muted);
}
.forward-empty > .el-icon {
  font-size: 20px;
}
.forward-empty > div {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.forward-empty strong {
  color: var(--app-text-secondary);
  font-size: 12px;
}
.kind-select {
  width: 128px;
}
:deep(.el-select),
:deep(.el-input-number) {
  width: 100%;
}
.connection-error,
.connection-progress {
  margin-top: 14px;
}
.connection-progress {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 13px;
  border: 1px solid color-mix(in srgb, var(--el-color-primary) 24%, var(--app-border));
  border-radius: 9px;
  color: var(--app-text);
  background: color-mix(in srgb, var(--el-color-primary) 7%, var(--app-surface));
}
.connection-progress__icon {
  display: grid;
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 8px;
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 12%, var(--app-surface));
  place-items: center;
}
.connection-progress > span:last-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}
.connection-progress strong {
  font-size: 12px;
}
.connection-progress small {
  overflow: hidden;
  color: var(--app-text-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dialog-footer {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}
.dialog-footer :deep(.el-checkbox) {
  min-width: 0;
  margin-right: auto;
}
.dialog-footer :deep(.el-checkbox__label) {
  overflow: hidden;
  color: var(--app-text-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dialog-footer__actions {
  display: flex;
  flex: none;
  gap: 8px;
}
.dialog-footer__actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
@media (max-width: 680px) {
  .profile-picker {
    grid-template-columns: 1fr;
    gap: 9px;
  }
  .col-2,
  .col-3,
  .col-4 {
    grid-column: span 6;
  }
  .forward-toolbar,
  .dialog-footer {
    align-items: stretch;
    flex-direction: column;
  }
  .forward-toolbar > div,
  .dialog-footer__actions {
    flex-wrap: wrap;
  }
  .forward-rule__header {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }
  .kind-select {
    width: auto;
    grid-column: 2 / 3;
  }
  .forward-rule__fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
