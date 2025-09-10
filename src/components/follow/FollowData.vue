<template>
  <div class="ultrasonic-container">
    <div class="controls">
      <div class="time-range-control">
        <span>时间范围/帧：</span>
        <el-select v-model="timeRange" placeholder="选择时间范围" size="small" @change="updateChart" :disabled="!deviceConnected">
          <el-option label="50" :value="50"></el-option>
          <el-option label="100" :value="100"></el-option>
          <el-option label="200" :value="200"></el-option>
          <el-option label="500" :value="500"></el-option>
          <el-option label="全部" :value="0"></el-option>
        </el-select>
        <el-button type="default" size="small" @click="showMessageFormat" class="message-btn">
          消息格式
        </el-button>
      </div>
      
      <div class="file-controls">
        <input type="file" ref="fileInput" @change="handleFileUpload" accept=".txt,.csv" style="display: none">
        <el-button type="primary" size="small" @click="fileInput?.click()" class="upload-btn" :disabled="deviceConnected">
          载入数据
        </el-button>
        <el-button type="primary" size="small" @click="saveData" class="save-btn" :disabled="cameraDistance.length===0 || deviceConnected">
          保存数据
        </el-button>
        <el-button type="default" size="small" @click="clearPlotData" class="clear-btn">
          清除数据
        </el-button>
      </div>
    </div>
    <!-- 使用从useEcharts返回的chartRef -->
    <div ref="chartRef" class="chart-container"></div>
    
    <el-dialog
      v-model="messageDialogVisible"
      width="600px"
    >
      <div class="dialog-content">
        <p><strong>数据说明：</strong></p>
        <p>数据主要采用JSON格式，并以换行符分隔。每行一个JSON对象，每个JSON对象包含以下字段：</p>
        <ul style="list-style-type: disc; padding-left: 20px;">
          <li style="display: flex; align-items: center; margin-bottom: 5px;"><code style="min-width: 120px; display: inline-block;">time</code>: 时间戳 (s)</li>
          <li style="display: flex; align-items: center; margin-bottom: 5px;"><code style="min-width: 120px; display: inline-block;">camera_distance</code>: 相机距离 (m)</li>
          <li style="display: flex; align-items: center; margin-bottom: 5px;"><code style="min-width: 120px; display: inline-block;">camera_angle</code>: 相机角度 (°)</li>
          <li style="display: flex; align-items: center; margin-bottom: 5px;"><code style="min-width: 120px; display: inline-block;">pid_left_speed</code>: PID左轮速度 (m/s)</li>
          <li style="display: flex; align-items: center; margin-bottom: 5px;"><code style="min-width: 120px; display: inline-block;">pid_right_speed</code>: PID右轮速度 (m/s)</li>
          <li style="display: flex; align-items: center; margin-bottom: 5px;"><code style="min-width: 120px; display: inline-block;">motor_left_speed</code>: 电机左轮速度 (m/s)</li>
          <li style="display: flex; align-items: center; margin-bottom: 5px;"><code style="min-width: 120px; display: inline-block;">motor_right_speed</code>: 电机右轮速度 (m/s)</li>
        </ul>
        <el-divider></el-divider>
        <p><strong>示例数据：</strong></p>
        <pre class="example-code">
{"time": 0.00, "camera_distance": 1.20, "camera_angle": 0.5, "pid_left_speed": 0.30, "pid_right_speed": 0.30, "motor_left_speed": 0.28, "motor_right_speed": 0.28}
{"time": 0.05, "camera_distance": 1.18, "camera_angle": 0.4, "pid_left_speed": 0.30, "pid_right_speed": 0.30, "motor_left_speed": 0.29, "motor_right_speed": 0.29}
{"time": 0.10, "camera_distance": 1.15, "camera_angle": 0.3, "pid_left_speed": 0.31, "pid_right_speed": 0.30, "motor_left_speed": 0.30, "motor_right_speed": 0.29}
        </pre>
        <el-divider></el-divider>
        <p><strong>注意事项：</strong></p>
        <ul style="list-style-type: disc; padding-left: 20px;">
          <li>数值型空数据请使用null</li>
          <li>时间戳非必须选项，若不包含则默认从0开始递增</li>
        </ul>
      </div>
      <template #footer>
        <el-button @click="messageDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'
import { useFollow } from '@/composables/follow/useFollow'
import { ElMessage } from 'element-plus'
import { useDevice } from '@/hooks/useDevice'

// 初始化超声波数据处理
const { timestamps, cameraDistance, cameraAngle, pidLeftSpeed, pidRightSpeed, motorLeftSpeed, motorRightSpeed, initRawData, clearRawData, saveData } = useFollow()

const fileInput = ref<HTMLInputElement>()
const chartRef = ref<HTMLDivElement>()
let chart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null
const deviceConnected = ref(useDevice().deviceConnected)
// 将timeRange改为响应式变量
const timeRange = ref<number>(100)
const messageDialogVisible = ref(false)

// 清除数据
function clearPlotData() {
  clearRawData()
  updateChart()
}

// 显示消息格式
function showMessageFormat() {
  messageDialogVisible.value = true
}

// 创建自定义图表配置
function createChartOption() {
  // 由于x、y轴都是value类型，因此需要处理为二维数组的形式
  // item, index
  const cameraDistanceSeries = cameraDistance.value.map((item, index: number) => [timestamps.value[index], item])
  const cameraAngleSeries = cameraAngle.value.map((item, index: number) => [timestamps.value[index], item])
  const pidLeftSpeedSeries = pidLeftSpeed.value.map((item, index: number) => [timestamps.value[index], item])
  const pidRightSpeedSeries = pidRightSpeed.value.map((item, index: number) => [timestamps.value[index], item])
  const motorLeftSpeedSeries = motorLeftSpeed.value.map((item, index: number) => [timestamps.value[index], item])
  const motorRightSpeedSeries = motorRightSpeed.value.map((item, index: number) => [timestamps.value[index], item])

  let xAxisStart = 0
  if (timeRange.value > 0 && cameraDistanceSeries.length > timeRange.value) {
    xAxisStart = (1 - timeRange.value / cameraDistanceSeries.length) * 100
  }
  
  if (cameraDistanceSeries.length === 0) {
    return {
      title: { 
        // text: 'FollowFit 感知与控制',
        left: 'center',
        textStyle: { fontSize: 14 } 
      },
      grid: [
        {
          left: '5%',
          right: '10%',
          bottom: '60%',
          containLabel: true
        },
        {
          left: '5%',
          right: '10%',
          top: '50%',
          containLabel: true
        }
      ],
      xAxis: [
        { type: 'value', name: '时间(s)', data: [], gridIndex: 0 },
        { type: 'value', name: '时间(s)', data: [], gridIndex: 1 }
      ],
      yAxis: [
        { type: 'value', name: '距离(m)', gridIndex: 0 },
        { type: 'value', name: '角度(°)', gridIndex: 0 },
        { type: 'value', name: '速度(m/s)', gridIndex: 1 }
      ],
      series: [
        {
          name: '相机距离',
          symbolSize: 4,
          type: 'line',
          data: [],
          yAxisIndex: 0,
          xAxisIndex: 0
        },
        {
          name: '相机角度',
          symbolSize: 4,
          type: 'line',
          data: [],
          yAxisIndex: 1,
          xAxisIndex: 0
        },
        {
          name: '左轮PID速度',
          symbolSize: 4,
          type: 'line',
          data: [],
          yAxisIndex: 2,
          xAxisIndex: 1
        },
        {
          name: '右轮PID速度',
          symbolSize: 4,
          type: 'line',
          data: [],
          yAxisIndex: 2,
          xAxisIndex: 1
        },
        {
          name: '左轮电机速度',
          symbolSize: 4,
          type: 'line',
          data: [],
          yAxisIndex: 2,
          xAxisIndex: 1
        },
        {
          name: '右轮电机速度',
          symbolSize: 4,
          type: 'line',
          data: [],
          yAxisIndex: 2,
          xAxisIndex: 1
        },
      ],
      dataZoom: [
        {
          type: 'slider',
          show: false,
          xAxisIndex: 0
        },
        {
          type: 'inside',
          show: false,
          xAxisIndex: 0
        },
        {
          type: 'slider',
          show: false,
          xAxisIndex: 1
        },
        {
          type: 'inside',
          show: false,
          xAxisIndex: 1
        }
      ],
    }
  }

  const pidPieces: Array<{gt: number, lt: number, color: string}> = [];
  const motorPieces: Array<{gt: number, lt: number, color: string}> = [];
  timestamps.value.forEach((_, index) => {
    if (index == 0) return;
    if (pidLeftSpeed.value[index-1] > pidRightSpeed.value[index-1] && pidLeftSpeed.value[index] > pidRightSpeed.value[index]) {
      pidPieces.push({
        gt: timestamps.value[index-1],
        lt: timestamps.value[index],
        color: 'rgb(32, 201, 151, 0.5)'
      })
    }
    if (motorLeftSpeed.value[index-1] > motorRightSpeed.value[index-1] && motorLeftSpeed.value[index] > motorRightSpeed.value[index]) {
      motorPieces.push({
        gt: timestamps.value[index-1],
        lt: timestamps.value[index],
        color: 'rgba(0, 0, 180, 0.3)'
      })
    }
  })

  return {
    title: { 
      // text: 'FollowFit 感知与控制',
      left: 'center',
      textStyle: { fontSize: 14 } 
    },
    tooltip: { 
      trigger: 'axis',
      formatter: (params: any) => {
        if (params.length === 0) return '';
        
        // 获取当前时间点
        const currentTime = params[0].data[0];
        
        // 创建一个映射来存储所有系列的数据
        const seriesData: Record<string, any> = {};
        params.forEach((param: any) => {
          seriesData[param.seriesName] = param;
        });
        
        // 获取所有系列配置
        const allSeries = chart?.getOption().series || [];
        
        // 查找其他图表中相同时间点的数据
        (Array.isArray(allSeries) ? allSeries : []).forEach((series: any) => {
          if (!seriesData[series.name]) {
            // 查找当前时间点的数据
            const dataPoint = series.data.find((item: any) => 
              Math.abs(item[0] - currentTime) < 0.001 // 考虑浮点数精度问题
            );
            
            if (dataPoint) {
              // 构建缺失的数据项
              seriesData[series.name] = {
                seriesName: series.name,
                data: dataPoint,
                marker: `<span style="display:inline-block;margin-right:5px;border-radius:10px;width:10px;height:10px;background-color:${series.itemStyle?.color || '#ccc'};"></span>`
              };
            }
          }
        });
        
        let result = `时间: ${currentTime.toFixed(2)}s<br/>`;
        let targetTrend = null;
        let pidLeft = null;
        let pidRight = null;
        let pidTrend = null;
        let motorLeft = null;
        let motorRight = null;
        let motorTrend = null;

        // 按顺序显示所有系列的数据
        ['相机距离', '相机角度', '左轮PID速度', '右轮PID速度', '左轮电机速度', '右轮电机速度'].forEach(name => {
          const param = seriesData[name];
          if (param && param.data[1] !== null) {
            switch (name) {
              case '相机距离':
                result += `${param.marker}相机距离: ${param.data[1].toFixed(2)}m<br/>`;
                break;
              case '相机角度':
                result += `${param.marker}相机角度: ${param.data[1].toFixed(1)}°<br/>`;
                if (param.data[1] > 0) {
                  targetTrend = '目标趋势: 目标靠右';
                } else if (param.data[1] < 0) {
                  targetTrend = '目标趋势: 目标靠左';
                } else {
                  targetTrend = '目标趋势: 目标直行';
                }
                break;
              case '左轮PID速度':
                result += `${param.marker}左轮PID速度: ${param.data[1].toFixed(2)}m/s<br/>`;
                pidLeft = param.data[1];
                break;
              case '右轮PID速度':
                result += `${param.marker}右轮PID速度: ${param.data[1].toFixed(2)}m/s<br/>`;
                pidRight = param.data[1];
                break;
              case '左轮电机速度':
                result += `${param.marker}左轮电机速度: ${param.data[1].toFixed(2)}m/s<br/>`;
                motorLeft = param.data[1];
                break;
              case '右轮电机速度':
                result += `${param.marker}右轮电机速度: ${param.data[1].toFixed(2)}m/s<br/>`;
                motorRight = param.data[1];
                break;
            }
          } else if (name === '相机角度') {
            targetTrend = '目标趋势: 目标丢失';
          }
        });

        if (targetTrend !== null) {
          result += `${targetTrend} (绿色靠右，红色靠左)<br/>`;
        }

        if (pidLeft !== null && pidRight !== null) {
          if (pidLeft > pidRight) {
            pidTrend = 'PID趋势: 小车右转';
          } else if (pidLeft < pidRight) {
            pidTrend = 'PID趋势: 小车左转';
          } else {
            if (pidLeft === 0 && pidRight === 0) {
              pidTrend = 'PID趋势: 小车静止';
            } else {
              pidTrend = 'PID趋势: 小车直行';
            }
          }
          result += `${pidTrend}  (涂色区域为右转)<br/>`;
        }

        if (motorLeft !== null && motorRight !== null) {
          if (motorLeft > motorRight) {
            motorTrend = '电机趋势: 小车右转';
          } else if (motorLeft < motorRight) {
            motorTrend = '电机趋势: 小车左转';
          } else {
            if (motorLeft === 0 && motorRight === 0) {
              motorTrend = '电机趋势: 小车静止';
            } else {
              motorTrend = '电机趋势: 小车直行';
            }
          }
          result += `${motorTrend} (涂色区域为右转)<br/>`;
        }

        return result;
      },
      textStyle: {
        fontSize: 12
      },
      backgroundColor: 'rgba(255, 255, 255, 0.7)',
      borderColor: '#eee',
      borderWidth: 1,
      borderRadius: 4,
      shadowBlur: 5,
      shadowColor: 'rgba(0, 0, 0, 0.1)',
      maxWidth: 250,
    },
    legend: { 
      data: ['相机距离', '相机角度', '左轮PID速度', '右轮PID速度', '左轮电机速度', '右轮电机速度'],
      top: 50,
      left: 'right'
    },
    grid: [
      {
        left: '2%',
        right: '10%',
        // 1 - top - bottom
        bottom: '45%',
        top: '20%',
        containLabel: true
      },
      {
        left: '2%',
        // 1 - top - bottom
        right: '10%',
        top: '60%',
        bottom: '10%',
        containLabel: true
      }
    ],
    xAxis: [
      {
        type: 'value',
        name: '时间(s)',
        axisLabel: {
          formatter: function(value: number) {
            return value.toFixed(2);
          }
        },
        gridIndex: 0,
        nameGap: 45,
      },
      {
        type: 'value',
        name: '时间(s)',
        axisLabel: {
          formatter: function(value: number) {
            return value.toFixed(2);
          }
        },
        gridIndex: 1
      }
    ],
    yAxis: [
      {
        type: 'value',
        name: '距离(m)',
        axisLabel: {
          formatter: function(value: any) {
            return value ? value.toFixed(2) : null;
          }
        },
        gridIndex: 0
      },
      {
        type: 'value',
        name: '角度(°)',
        axisLabel: {
          formatter: function(value: any) {
            return value ? value.toFixed(1) : null;
          }
        },
        gridIndex: 0
      },
      {
        type: 'value',
        name: '速度(m/s)',
        axisLabel: {
          formatter: function(value: any) {
            return value ? value.toFixed(2) : null;
          }
        },
        gridIndex: 1
      }
    ],
    // 添加dataZoom组件实现滚动条和鼠标滚轮缩放
    dataZoom: [
      {
        type: 'slider',
        show: true,
        xAxisIndex: [0, 1],
        start: xAxisStart,
        end: 100,
        bottom: 5,
        height: 20,
        borderColor: '#ddd',
        fillerColor: 'rgba(64, 158, 255, 0.1)',
        handleStyle: { color: '#409EFF' },
        textStyle: { color: '#666', fontSize: 12 },
        minSpan: 1.0,
        rangeMode: 'value',
      },
      {
        type: 'inside',
        xAxisIndex: [0, 1],
        start: xAxisStart,
        end: 100,
        minSpan: 1.0,
        rangeMode: 'value',
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: true,
        preventDefaultMouseMove: true,
      }
    ],
    visualMap: [
      {
        type: 'piecewise',
        show: false,
        dimension: 0,
        seriesIndex: 2,
        pieces: pidPieces,
      },
      {
        type: 'piecewise',
        show: false,
        dimension: 0,
        seriesIndex: 4,
        pieces: motorPieces,
      },
    ],
    series: [
      {
        name: '相机距离', // index: 0
        type: 'line',
        data: cameraDistanceSeries,
        smooth: true,
        lineStyle: { color: '#409EFF', width: 2 },
        itemStyle: { color: '#409EFF' },
        showSymbol: false,
        large: true,
        largeThreshold: 5000,
        progressive: 5000,
        progressiveThreshold: 10000,
        animation: false,
        yAxisIndex: 0,
        xAxisIndex: 0,
        connectNulls: false,
        ...(cameraDistanceSeries.length > 5000 && { sampling: 'lttb' })
      },
      {
        name: '相机角度', // index: 1
        type: 'line',
        data: cameraAngleSeries,
        smooth: true,
        lineStyle: { color: '#FF4040', width: 2 },
        itemStyle: { color: '#FF4040' },
        showSymbol: false,
        large: true,
        largeThreshold: 5000,
        progressive: 5000,
        progressiveThreshold: 10000,
        animation: false,
        yAxisIndex: 1,
        xAxisIndex: 0,
        markLine: {
          silent: true,
          lineStyle: {
            color: '#000',
            width: 1,
            type: 'solid',
          },
          data: [{
            yAxis: 0,
          }],
          symbol: 'none',
          label: {
            show: false,
          },
        },
        connectNulls: false,
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(32, 201, 151, 0.6)' },
            { offset: 1, color: 'rgba(255, 64, 64, 0.6)' }
          ])
        },
        ...(cameraAngleSeries.length > 5000 && { sampling: 'lttb' })
      },
      {
        name: '左轮PID速度', // index: 2
        type: 'line',
        data: pidLeftSpeedSeries,
        smooth: true,
        lineStyle: { color: '#20C997', width: 2 },
        itemStyle: { color: '#20C997' },
        areaStyle: {},
        showSymbol: false,
        large: true,
        largeThreshold: 5000,
        progressive: 5000,
        progressiveThreshold: 10000,
        animation: false,
        yAxisIndex: 2,
        xAxisIndex: 1,
        connectNulls: false,
        ...(pidLeftSpeedSeries.length > 5000 && { sampling: 'lttb' })
      },
      {
        name: '右轮PID速度', // index: 3
        type: 'line',
        data: pidRightSpeedSeries,
        smooth: true,
        lineStyle: { color: '#409EFF', width: 2 },
        itemStyle: { color: '#409EFF' },
        showSymbol: false,
        large: true,
        largeThreshold: 5000,
        progressive: 5000,
        progressiveThreshold: 10000,
        animation: false,
        yAxisIndex: 2,
        xAxisIndex: 1,
        connectNulls: false,
        ...(pidRightSpeedSeries.length > 5000 && { sampling: 'lttb' })
      },
      {
        name: '左轮电机速度', // index: 4
        type: 'line',
        data: motorLeftSpeedSeries,
        smooth: true,
        lineStyle: { color: 'rgba(0, 0, 180, 0.3)', width: 2 },
        itemStyle: { color: 'rgba(0, 0, 180, 0.3)' },
        areaStyle: {}, // 淡紫色
        showSymbol: false,
        large: true,
        largeThreshold: 5000,
        progressive: 5000,
        progressiveThreshold: 10000,
        animation: false,
        yAxisIndex: 2,
        xAxisIndex: 1,
        connectNulls: false,
        ...(motorLeftSpeedSeries.length > 5000 && { sampling: 'lttb' })
      },
      {
        name: '右轮电机速度', // index: 5
        type: 'line',
        data: motorRightSpeedSeries,
        smooth: true,
        lineStyle: { color: '#F7BA1E', width: 2 },
        itemStyle: { color: '#F7BA1E' },
        showSymbol: false,
        large: true,
        largeThreshold: 5000,
        progressive: 5000,
        progressiveThreshold: 10000,
        animation: false,
        yAxisIndex: 2,
        xAxisIndex: 1,
        connectNulls: false,
        ...(motorRightSpeedSeries.length > 5000 && { sampling: 'lttb' })
      },
    ]
  }
}

// 初始化图表
function initChart() {
  if (!chartRef.value || chart) return

  try {
    chart = echarts.init(chartRef.value)
    const options = createChartOption()
    chart.setOption(options)
    
    // 延迟调整尺寸
    setTimeout(() => {
      if (chart && chartRef.value) {
        chart.resize()
      }
    }, 10)
    
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
    const options = createChartOption()
    if (cameraDistance.value.length === 0) {
      // 当数据为空时，使用notMerge: true强制替换所有配置
      chart.setOption(options, { notMerge: true })
    } else {
      // 当有数据时，仍使用合并模式以保持交互状态
      chart.setOption(options, { notMerge: false, lazyUpdate: true })
    }
    
    // 延迟调整尺寸
    setTimeout(() => {
      if (chart && chartRef.value) {
        chart.resize()
      }
    }, 500)
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

// 处理文件上传
function handleFileUpload(event: Event) {
  clearPlotData()
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  
  if (!file) return
  
  const reader = new FileReader()
  reader.onload = (e) => {
    const content = e.target?.result as string
    try {
      timeRange.value = 0
      initRawData(content, 0)
      updateChart()
    } catch (error) {
      ElMessage.error('文件数据处理失败')
      console.error('文件处理错误:', error)
    }
  }
  reader.onerror = () => {
    ElMessage.error('文件读取失败')
  }
  reader.readAsText(file)
  
  // 重置文件输入，以便可以重复上传同一个文件
  target.value = ''
}

// 监听数据变化更新图表
watch(cameraDistance, () => {
  if (deviceConnected.value) {
    updateChart()
  }
}, { immediate: true, deep: true })

// 组件挂载时初始化
onMounted(() => {
  // 延迟初始化确保DOM就绪
  setTimeout(initChart, 50)
})

// 组件卸载时清理
onUnmounted(() => {
  dispose()
})
</script>

<style scoped>
.ultrasonic-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 10px;
  box-sizing: border-box;
}

.controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  flex-wrap: wrap;
  gap: 10px;
}

.time-range-control {
  font-size: 12px;
  display: flex;
  align-items: center;
  padding: 4px 12px;
  gap: 10px;
}

.file-controls {
  display: flex;
  gap: 5px;
}

.chart-container {
  flex: 1;
  min-height: 200px;
  /* 确保容器有明确的尺寸 */
  width: 100%;
  height: 400px;
}

/* Element Plus 按钮样式调整 */
:deep(.upload-btn) {
  font-size: 12px;
  padding: 4px 12px;
}

:deep(.clear-btn) {
  font-size: 12px;
  padding: 4px 12px;
}

/* Element Plus 下拉框样式调整 */
:deep(.el-select) {
  width: 120px;
}

:deep(.el-select .el-input__inner) {
  font-size: 12px;
}

.dialog-content {
  font-size: 12px;
  line-height: 1.5;
  text-align: left;
}

.example-code {
  background-color: #f5f5f5;
  padding: 10px;
  border-radius: 4px;
  overflow-x: auto;
  font-family: monospace;
  font-size: 12px;
}
</style>
