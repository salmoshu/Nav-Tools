<template>
  <div>
        <div v-for="(item, key) in demo1Store.status" :key="key">
            <el-input @change="handleChange(String(key), item)" v-model="demo1Store.status[key]" :placeholder="`请输入${key}`"></el-input>

        </div>
    </div>
    <p>Pinia: {{ JSON.stringify(demo1Store.status) }}</p>
</template>

<script setup lang="ts">
import { useDemo1Store } from '@/stores/demo1'
const demo1Store = useDemo1Store()
const handleChange = (key: any, value: any) => {
    console.log(key)
    demo1Store.status[key] = value
}
</script>
