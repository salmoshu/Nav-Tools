<template><slot /></template>
<script setup lang="ts">
import { provide } from 'vue'
import { gnssDisplayContext } from '@/composables/gnss/GnssDisplayContext'
import { gnssSolverSessionKey, useGnssSolverSession } from '@/composables/useGnssSolverSession'
const session = useGnssSolverSession()
provide(gnssDisplayContext, session.display)
provide(gnssSolverSessionKey, session)
</script>
