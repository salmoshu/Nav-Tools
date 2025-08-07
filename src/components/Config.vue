<template>
  <div v-if="navMode.funcMode == FuncMode.Follow" class="config-container">
    <FollowConfig />
  </div>
  <div v-else>
    <!-- 其他配置模块 -->
  </div>
</template>

<script lang="ts" setup>
import { reactive } from 'vue'
import { FuncMode } from '@/types/mode'
import FollowConfig from '@/components/follow/FollowConfig.vue'

const navMode = reactive({
  funcMode: FuncMode.Follow
})
</script>

<style scoped>
.config-container {
  padding: 20px;
}
</style>