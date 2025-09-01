import { defineStore } from "pinia"
import { appConfig } from "@/settings/config"

// 获取demo1Props配置
const props = appConfig.example.module.demo1.props

export const useDemo1Store = defineStore("demo1", {
  state: () => {
    return {
      status: { ...props.status },
      config: { ...props.config },
    };
  },
})
