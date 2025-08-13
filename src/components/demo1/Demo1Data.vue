<template>
  <div>
        <div v-for="(_, key) in demo1Store.status" :key="key">
            <el-input @change="handleChange(key, $event)" v-model="demo1Store.status[key]" :placeholder="`请输入${key}`"></el-input>
        </div>
    </div>
    <p>Pinia: {{ JSON.stringify(demo1Store.status) }}</p>
</template>

<script setup lang="ts">
import { useDemo1Store } from '@/stores/demo1'
const demo1Store = useDemo1Store()
const handleChange = (key: string, value: number) => {
    demo1Store.status[key] = Number(value)
}
</script>
