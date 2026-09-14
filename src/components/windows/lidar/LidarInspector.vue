<template>
  <div class="lidar-inspector">
    <div class="inspector-toolbar">
      <el-select
        v-model="selectedTopic"
        size="small"
        filterable
        placeholder="topic"
        style="width: 220px"
      >
        <el-option v-for="topic in topics" :key="topic" :value="topic" :label="topic" />
      </el-select>
      <span class="inspector-meta" v-if="currentMessage">
        {{ t('lidar.inspector.at') }} {{ messageTime }}
      </span>
      <span class="inspector-meta" v-else>{{ t('lidar.inspector.noMessage') }}</span>
    </div>
    <div class="inspector-body" v-if="currentMessage">
      <JsonTreeNode :value="currentMessage" :depth="0" />
    </div>
    <div class="inspector-body inspector-empty" v-else>
      <p>{{ t('lidar.inspector.emptyHint') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { t } from '@/i18n'
import { useLidarPanelPresence, useMcapPlayer } from '@/composables/useMcapPlayer'
import { formatRelativeNs } from '@/core/lidar/timeFormat'
import JsonTreeNode from './JsonTreeNode.vue'

const player = useMcapPlayer()
useLidarPanelPresence()

const topics = computed(() => player.document.value?.topicNames() ?? [])
const selectedTopic = ref<string>('')

// 文档加载后默认选第一个可解码话题
watch(
  () => player.document.value,
  (doc) => {
    if (!doc) {
      selectedTopic.value = ''
      return
    }
    if (!selectedTopic.value || !doc.topicInfo(selectedTopic.value)) {
      selectedTopic.value = doc.topicNames().find((name) => doc.topicInfo(name)?.decodable) ?? ''
    }
  },
  { immediate: true },
)

const currentEntry = computed(() =>
  selectedTopic.value ? player.currentEntry(selectedTopic.value) : undefined,
)

const currentMessage = computed(() => currentEntry.value?.message)

const messageTime = computed(() => {
  const doc = player.document.value
  const entry = currentEntry.value
  if (!doc?.startNs || !entry) return '-'
  return formatRelativeNs(entry.logTimeNs, doc.startNs)
})
</script>

<style scoped>
.lidar-inspector {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--app-surface);
  color: var(--app-text);
}

.inspector-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-surface-muted);
}

.inspector-meta {
  font-size: 12px;
  color: var(--app-text-secondary);
}

.inspector-body {
  flex: 1;
  overflow: auto;
  padding: 8px 10px;
}

.inspector-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-secondary);
  font-size: 13px;
}
</style>
