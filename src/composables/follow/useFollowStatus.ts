import { reactive, computed } from 'vue'

import { useFollowMain } from '@/composables/follow/useFollowMain'

// 使用useFollowMain函数获取状态
const {
  carState,
  distance,
  targetAngle,
  isInFOV
} = useFollowMain()

const inFovStyle = 'color: #00b894; background: rgba(0, 184, 148, 0.1); font-weight: 700;'
const outFovStyle = 'color: #ff6b6b; background: rgba(255, 107, 107, 0.1); font-weight: 700;'

const followStatus = reactive({
  '线速度': {
    value: computed(() => carState.linearSpeed.toFixed(1)),
    style: '',
  },
  '角速度': {
    value: computed(() => carState.angularSpeed.toFixed(2)),
    style: '',
  },
  '朝向角度': {
    value: computed(() => (carState.angle * 180 / Math.PI).toFixed(1) + '°'),
    style: '',
  },
  '目标角度': {
    value: computed(() => (targetAngle.value * 180 / Math.PI).toFixed(1) + '°'),
    style: '',
  },
  '距离': {
    value: computed(() => distance.value.toFixed(1)),
    style: '',
  },
  'FOV状态': {
    value: computed(() => isInFOV.value ? '范围内' : '范围外'),
    style: computed(() => isInFOV.value ? inFovStyle : outFovStyle),
  },
})

export { followStatus }
