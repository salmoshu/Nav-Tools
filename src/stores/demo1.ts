import { defineStore } from "pinia"
import { appConfig } from "@/settings/config"

// 获取demo1Props配置
// const props = appConfig.example.demo1.props
const props = {
  status: {
    str: 'Nav-Tools',
    num: 2,
  },
  config: {
    'Shirt': 5,
    'Wool Sweater': 20,
    'Pants': 10,
    'High Hells': 10,
    'Socks': 20,
  },
}

export const useDemo1Store = defineStore("demo1", {
  state: () => {
    return {
      status: { ...props.status },
      config: { ...props.config },
    };
  },
})
