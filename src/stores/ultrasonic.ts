import { defineStore } from 'pinia'

export const useUltrasonicStore = defineStore('ultrasonic', {
  state: () => ({
    status: {},
  }),
})