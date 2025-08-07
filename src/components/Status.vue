<template>
  <div v-if="navMode.funcMode == FuncMode.Follow" class="status-container">
    <FollowStatus />
  </div>
  <div v-else>
    <!-- 其他状态模块 -->
  </div>
</template>

<script lang="ts" setup>
import { reactive } from 'vue'
import { FuncMode } from '@/types/mode'
import FollowStatus from '@/components/follow/FollowStatus.vue'

const navMode = reactive({
  funcMode: FuncMode.Follow
})
</script>

<style scoped>
.status-container {
  padding: 20px;
}
</style>