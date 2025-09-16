import { defineStore } from "pinia"
import { appConfig } from "@/settings/config"

// 定义类型接口
interface StatusType {
  [key: string]: string | number
  str: string
  num: number
}

interface ConfigType {
  [key: string]: number
}

// 获取demo1Props配置
// const props = appConfig.example.demo1.props
const props = {
  status: {
    str: 'Nav-Tools',
    num: 2,
  } as StatusType,
  config: {
    'Shirt': 5,
    'Wool Sweater': 20,
    'Pants': 10,
    'High Hells': 10,
    'Socks': 20,
  } as ConfigType,
}

export const useDemo1Store = defineStore("demo1", {
  state: () => {
    return {
      status: { ...props.status } as StatusType,
      config: { ...props.config } as ConfigType,
    };
  },
})
