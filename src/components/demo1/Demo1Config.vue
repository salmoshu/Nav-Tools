<template>
  <div>
    <div
      v-for="(value, key) in demo1Store.config"
      :key="key"
      class="row"
    >
      <span>{{ key }}</span>
      <el-input
        v-model="demo1Store.config[key]"
        :placeholder="`请输入${key}`"
        @change="handleChange(key, $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDemo1Store } from '@/stores/demo1'

const demo1Store = useDemo1Store()
const handleChange = (key: string, value: number) => {
    demo1Store.config[key] = Number(value)
}
</script>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

span {
    font-size: 14px;
    color: rgb(79, 79, 79);
}

.row span {
  width: 100px;       /* 固定宽度，按需调整 */
  text-align: right;  /* 文字右对齐更整齐 */
  white-space: nowrap;
}

.row .el-input {
  flex: 1;            /* 输入框占剩余空间 */
}
</style>
