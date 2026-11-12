<template>
  <el-dropdown trigger="click" placement="bottom-end" @command="handleCommand">
    <button
      class="panel-actions-trigger"
      :class="{ 'is-header': header }"
      type="button"
      :title="t('app.dashboard.panelActions')"
      :aria-label="t('app.dashboard.panelActions')"
      @dblclick.stop
    >
      <el-icon :size="17"><MoreFilled /></el-icon>
    </button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item v-if="showDetach" command="detach">
          <el-icon><Share /></el-icon>
          {{ t('app.dashboard.detach') }}
        </el-dropdown-item>
        <el-dropdown-item command="shortcut">
          <el-icon><SquareArrowOutUpRight /></el-icon>
          {{ shortcutLabel || t('app.dashboard.createShortcut') }}
        </el-dropdown-item>
        <el-dropdown-item
          command="pure-content"
          :disabled="!pureContentAvailable"
          :title="pureContentAvailable ? '' : t('app.dashboard.pureContentUnavailable')"
        >
          <el-icon><Aim /></el-icon>
          {{ pureContent ? t('app.dashboard.exitPureContent') : t('app.dashboard.pureContent') }}
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import { Aim, MoreFilled, Share } from '@element-plus/icons-vue'
import { SquareArrowOutUpRight } from '@lucide/vue'
import { t } from '@/i18n'

const props = withDefaults(
  defineProps<{
    pureContent?: boolean
    pureContentAvailable?: boolean
    shortcutLabel?: string
    header?: boolean
    showDetach?: boolean
  }>(),
  {
    pureContent: false,
    pureContentAvailable: false,
    shortcutLabel: '',
    header: false,
    showDetach: false,
  },
)

const emit = defineEmits<{
  'create-shortcut': []
  'toggle-pure-content': []
  detach: []
}>()

function handleCommand(command: string) {
  if (command === 'shortcut') emit('create-shortcut')
  else if (command === 'pure-content' && props.pureContentAvailable) emit('toggle-pure-content')
  else if (command === 'detach' && props.showDetach) emit('detach')
}
</script>

<style scoped>
.el-dropdown {
  display: inline-flex;
  align-items: center;
}

.panel-actions-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 0;
  color: var(--app-text-muted);
  background: transparent;
  cursor: pointer;
}

.panel-actions-trigger:hover,
.panel-actions-trigger:focus-visible {
  color: var(--el-color-primary);
  background: transparent;
  outline: none;
}

.panel-actions-trigger.is-header {
  width: 42px;
  height: 38px;
  color: var(--app-text-secondary);
}

.panel-actions-trigger.is-header:hover,
.panel-actions-trigger.is-header:focus-visible {
  color: var(--app-text);
  background: var(--app-hover);
}
</style>
