import { defineStore } from "pinia"

export const useFollowStore = defineStore('follow', {
  state: () => ({
    status: {},
  }),
})
