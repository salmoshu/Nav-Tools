/* 使用方法：
// follow模块
const { chartRef, updateChart } = useEcharts(
  () => followStore.followData,
  { type: 'line', title: '跟随数据' }
)

// gnss模块
const { chartRef, updateChart } = useEcharts(
  () => gnssStore.gnssData,
  { type: 'pie', title: 'GNSS数据' }
)
*/

import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

export function useEcharts(
  dataSource: () => Record<string, any>,
  options: {
    type?: 'bar' | 'line' | 'pie'
    title?: string
    colors?: string[]
  } = {}
) {
  const chartRef = ref<HTMLDivElement>()
  let chart: echarts.ECharts | null = null
  let resizeObserver: ResizeObserver | null = null

  // 默认颜色配置
  const defaultColors = ['#409EFF', '#67C23A', '#E6A23C', '#F56C6C', '#909399']

  // 创建普通对象的图表配置
  function createChartOption(data: Record<string, any>) {
    if (!data || Object.keys(data).length === 0) return null
    
    // 确保数据是普通对象
    const plainData = JSON.parse(JSON.stringify(data))
    const keys = Object.keys(plainData)
    const values = Object.values(plainData)
    
    switch (options.type || 'bar') {
      case 'bar':
        return {
          title: {
            text: options.title || '数据图表',
            left: 'center',
            textStyle: { fontSize: 14 }
          },
          tooltip: { trigger: 'axis' },
          grid: {
            left: '3%',
            right: '4%',
            bottom: '3%',
            containLabel: true
          },
          xAxis: {
            type: 'category',
            data: keys,
            axisLabel: { interval: 0, rotate: 45 }
          },
          yAxis: { type: 'value' },
          series: [{
            type: 'bar',
            data: values,
            itemStyle: {
              color: (params: any) => {
                const colors = options.colors || defaultColors
                return colors[params.dataIndex % colors.length]
              }
            }
          }]
        }
      
      case 'line':
        return {
          title: {
            text: options.title || '数据图表',
            left: 'center',
            textStyle: { fontSize: 14 }
          },
          tooltip: { trigger: 'axis' },
          grid: {
            left: '3%',
            right: '4%',
            bottom: '3%',
            containLabel: true
          },
          xAxis: {
            type: 'category',
            data: keys
          },
          yAxis: { type: 'value' },
          series: [{
            type: 'line',
            data: values,
            smooth: true,
            itemStyle: { color: '#67C23A' }
          }]
        }
      
      case 'pie':
        return {
          title: {
            text: options.title || '数据图表',
            left: 'center',
            textStyle: { fontSize: 14 }
          },
          tooltip: { trigger: 'item' },
          series: [{
            type: 'pie',
            radius: '50%',
            data: keys.map((key, index) => ({
              name: key,
              value: values[index]
            })),
            emphasis: {
              itemStyle: {
                shadowBlur: 10,
                shadowOffsetX: 0,
                shadowColor: 'rgba(0, 0, 0, 0.5)'
              }
            }
          }]
        }
    }
  }

  // 初始化图表
  function initChart() {
    if (!chartRef.value || chart) return
    
    try {
      const data = dataSource()
      const chartOption = createChartOption(data)
      
      if (!chartOption) return
      
      chart = echarts.init(chartRef.value)
      chart.setOption(chartOption)
      
      // 延迟调整尺寸
      setTimeout(() => {
        if (chart && chartRef.value) {
          chart.resize()
        }
      }, 0)
      
      // 添加ResizeObserver
      if (window.ResizeObserver) {
        resizeObserver = new ResizeObserver(() => {
          if (chart && chartRef.value) {
            chart.resize()
          }
        })
        resizeObserver.observe(chartRef.value)
      }
    } catch (error) {
      console.error('Failed to initialize chart:', error)
    }
  }

  // 更新图表
  function updateChart() {
    if (!chart) return
    
    try {
      const data = dataSource()
      const chartOption = createChartOption(data)
      
      if (chartOption) {
        // 使用notMerge避免数据合并问题
        chart.setOption(chartOption, { notMerge: true })
        
        // 延迟调整尺寸
        setTimeout(() => {
          if (chart && chartRef.value) {
            chart.resize()
          }
        }, 0)
      }
    } catch (error) {
      console.error('Failed to update chart:', error)
    }
  }

  // 清理资源
  function dispose() {
    if (resizeObserver && chartRef.value) {
      resizeObserver.unobserve(chartRef.value)
      resizeObserver = null
    }
    
    if (chart) {
      chart.dispose()
      chart = null
    }
  }

  // 生命周期
  onMounted(() => {
    // 延迟初始化确保DOM就绪
    setTimeout(initChart, 50)
  })

  onUnmounted(() => {
    dispose()
  })

  return {
    chartRef,
    updateChart,
    dispose
  }
}