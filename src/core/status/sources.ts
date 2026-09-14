/**
 * 内置 status source 清单。
 *
 * 新组件的接入方式：在自己的模块里（store 文件或组合式函数旁）调用
 * registerStatusSource 就近声明，然后在这里加一行 side-effect import。
 * 本文件只负责保证注册代码被加载，不含任何接线逻辑。
 */
import '@/stores/flow'
import '@/stores/gnss'
