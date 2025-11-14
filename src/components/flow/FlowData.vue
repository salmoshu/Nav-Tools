<template>
  <div class="flow-container">
    <div class="controls">
      <div class="file-controls">
        <!-- 左侧按钮 -->
        <div class="left-buttons">
          <el-button type="default" size="small" @click="showViewConfig" class="layout-btn">
            <el-icon><Setting /></el-icon>&nbsp;配置
          </el-button>
          <el-button :disabled="deviceConnected" type="default" size="small" @click="toggleSlideWindow">
            <el-icon v-if="enableWindow"><CircleClose /></el-icon>
            <el-icon v-else><CircleCheck /></el-icon>
            &nbsp;{{enableWindow?"关闭滑窗":"启用滑窗"}}
          </el-button>
        </div>
        
        <!-- 右侧按钮 -->
        <div class="right-buttons">
          <el-button type="text" size="small" @click="showMessageFormat" class="message-btn" style="margin: 0px 0px;">
            <el-icon><Message /></el-icon>
          </el-button>
          <el-button type="text" size="small" style="margin: 0px 0px;">
            <el-icon @click="refreshPlotData"><Refresh /></el-icon>
          </el-button>
          <el-button type="text" size="small" @click="clearPlotData" style="margin: 0px 0px;">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
      </div>
    </div>
    
    <!-- 图表容器 -->
    <div ref="chartRef" class="chart-container"></div>
  </div>

  <!-- 消息格式对话框 -->
  <el-dialog
    v-model="messageDialogVisible"
    width="600px"
  >
    <div class="dialog-content, message-content">
      <p><strong>数据说明：</strong></p>
      <p>数据主要采用JSON格式，并以换行符分隔。每行一个JSON对象，每个JSON对象可以灵活配置字段。</p>
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

  <!-- 视图配置对话框 -->
  <el-dialog
    v-model="viewConfigDialogVisible"
    :width="viewLayout === 'double' || yAxisConfig === 'double' ? '710px' : '400px'"
    destroy-on-close
  >
    <div class="dialog-content">
      <div style="margin-bottom: 20px;">
        <span style="display: inline-block; width: 100px;">布局方式：</span>
        <el-radio-group v-model="viewLayout">
          <el-radio-button label="single">单图</el-radio-button>
          <el-radio-button label="double">双图</el-radio-button>
        </el-radio-group>
      </div>
      
      <div style="margin-bottom: 20px;">
        <span style="display: inline-block; width: 100px;">Y轴配置：</span>
        <el-radio-group v-model="yAxisConfig">
          <el-radio-button label="single">单Y轴</el-radio-button>
          <el-radio-button label="double">双Y轴</el-radio-button>
        </el-radio-group>
      </div>

      <!-- 单图模式 -->
      <div v-if="viewLayout === 'single'" style="margin-bottom: 20px;">
        <!-- 单图单Y轴模式 -->
        <div v-if="yAxisConfig === 'single'" class="chart-config-grid">
          <div class="chart-config-section">
            <h4 style="margin-bottom: 10px;">单图表数据源（最多4个）：</h4>
            <div class="source-selectors">
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="singleChartConfig.source1.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="singleChartConfig.color1.value" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="singleChartConfig.useArea1.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="singleChartConfig.source2.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="singleChartConfig.color2.value" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="singleChartConfig.useArea2.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="singleChartConfig.source3.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="singleChartConfig.color3.value" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="singleChartConfig.useArea3.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center;">
                <el-select v-model="singleChartConfig.source4.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="singleChartConfig.color4.value" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="singleChartConfig.useArea4.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 单图双Y轴模式 -->
        <div v-else-if="yAxisConfig === 'double'" class="chart-config-grid">
          <div class="chart-config-section">
            <h4 style="margin-bottom: 10px;">左Y轴数据（最多4个）：</h4>
            <div class="source-selectors">
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="singleChartDoubleYConfig.leftSource1.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="singleChartDoubleYConfig.leftColor1.value" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="singleChartDoubleYConfig.leftUseArea1.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="singleChartDoubleYConfig.leftSource2.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="singleChartDoubleYConfig.leftColor2.value" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="singleChartDoubleYConfig.leftUseArea2.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="singleChartDoubleYConfig.leftSource3.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="singleChartDoubleYConfig.leftColor3.value" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="singleChartDoubleYConfig.leftUseArea3.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center;">
                <el-select v-model="singleChartDoubleYConfig.leftSource4.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="singleChartDoubleYConfig.leftColor4.value" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="singleChartDoubleYConfig.leftUseArea4.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
            </div>
          </div>
          <div class="chart-config-section">
            <h4 style="margin-bottom: 10px;">右Y轴数据（最多4个）：</h4>
            <div class="source-selectors">
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="singleChartDoubleYConfig.rightSource1.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="singleChartDoubleYConfig.rightColor1.value" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="singleChartDoubleYConfig.rightUseArea1.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="singleChartDoubleYConfig.rightSource2.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="singleChartDoubleYConfig.rightColor2.value" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="singleChartDoubleYConfig.rightUseArea2.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="singleChartDoubleYConfig.rightSource3.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="singleChartDoubleYConfig.rightColor3.value" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="singleChartDoubleYConfig.rightUseArea3.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center;">
                <el-select v-model="singleChartDoubleYConfig.rightSource4.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="singleChartDoubleYConfig.rightColor4.value" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="singleChartDoubleYConfig.rightUseArea4.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 双图模式下的数据源选择 -->
      <div v-if="viewLayout === 'double'" style="margin-bottom: 20px;">
        <!-- 双图单Y轴模式 -->
        <div v-if="yAxisConfig === 'single'" class="chart-config-grid">
          <div class="chart-config-section">
            <h4 style="margin-bottom: 10px;">上图表数据源（最多4个）：</h4>
            <div class="source-selectors">
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
              <el-select v-model="doubleChartConfig.upperSource1.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                <el-option label="<None>" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-color-picker v-model="doubleChartConfig.upperColor1.value" placeholder="选择颜色"></el-color-picker>
              <el-checkbox v-model="doubleChartConfig.upperUseArea1.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
            </div>
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
              <el-select v-model="doubleChartConfig.upperSource2.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                <el-option label="<None>" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-color-picker v-model="doubleChartConfig.upperColor2.value" placeholder="选择颜色"></el-color-picker>
              <el-checkbox v-model="doubleChartConfig.upperUseArea2.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
            </div>
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
              <el-select v-model="doubleChartConfig.upperSource3.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                <el-option label="<None>" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-color-picker v-model="doubleChartConfig.upperColor3.value" placeholder="选择颜色"></el-color-picker>
              <el-checkbox v-model="doubleChartConfig.upperUseArea3.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
            </div>
            <div style="display: flex; align-items: center;">
              <el-select v-model="doubleChartConfig.upperSource4.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                <el-option label="<None>" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-color-picker v-model="doubleChartConfig.upperColor4.value" placeholder="选择颜色"></el-color-picker>
              <el-checkbox v-model="doubleChartConfig.upperUseArea4.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
            </div>
            </div>
          </div>
          <div class="chart-config-section">
            <h4 style="margin-bottom: 10px;">下图表数据源（最多4个）：</h4>
            <div class="source-selectors">
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
              <el-select v-model="doubleChartConfig.lowerSource1.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                <el-option label="<None>" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-color-picker v-model="doubleChartConfig.lowerColor1.value" placeholder="选择颜色"></el-color-picker>
              <el-checkbox v-model="doubleChartConfig.lowerUseArea1.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
            </div>
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
              <el-select v-model="doubleChartConfig.lowerSource2.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                <el-option label="<None>" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-color-picker v-model="doubleChartConfig.lowerColor2.value" placeholder="选择颜色"></el-color-picker>
              <el-checkbox v-model="doubleChartConfig.lowerUseArea2.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
            </div>
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
              <el-select v-model="doubleChartConfig.lowerSource3.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                <el-option label="<None>" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-color-picker v-model="doubleChartConfig.lowerColor3.value" placeholder="选择颜色"></el-color-picker>
              <el-checkbox v-model="doubleChartConfig.lowerUseArea3.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
            </div>
            <div style="display: flex; align-items: center;">
              <el-select v-model="doubleChartConfig.lowerSource4.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                <el-option label="<None>" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-color-picker v-model="doubleChartConfig.lowerColor4.value" placeholder="选择颜色"></el-color-picker>
              <el-checkbox v-model="doubleChartConfig.lowerUseArea4.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
            </div>
            </div>
          </div>
        </div>
        
        <!-- 双图双Y轴模式 -->
        <div v-else-if="yAxisConfig === 'double'" class="chart-config-grid">
          <div class="chart-config-section">
            <h4 style="margin-bottom: 10px;">上图左Y轴数据（最多4个）：</h4>
            <div class="source-selectors">
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="doubleChartDoubleYConfig.upperLeftSource1.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="doubleChartDoubleYConfig.upperLeftColor1.value" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="doubleChartDoubleYConfig.upperLeftUseArea1.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="doubleChartDoubleYConfig.upperLeftSource2.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="doubleChartDoubleYConfig.upperLeftColor2.value" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="doubleChartDoubleYConfig.upperLeftUseArea2.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="doubleChartDoubleYConfig.upperLeftSource3.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="doubleChartDoubleYConfig.upperLeftColor3.value" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="doubleChartDoubleYConfig.upperLeftUseArea3.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center;">
                <el-select v-model="doubleChartDoubleYConfig.upperLeftSource4.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="doubleChartDoubleYConfig.upperLeftColor4.value" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="doubleChartDoubleYConfig.upperLeftUseArea4.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
            </div>
          </div>
          <div class="chart-config-section">
            <h4 style="margin-bottom: 10px;">上图右Y轴数据（最多4个）：</h4>
            <div class="source-selectors">
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="doubleChartDoubleYConfig.upperRightSource1.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="doubleChartDoubleYConfig.upperRightColor1.value" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="doubleChartDoubleYConfig.upperRightUseArea1.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="doubleChartDoubleYConfig.upperRightSource2.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="doubleChartDoubleYConfig.upperRightColor2.value" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="doubleChartDoubleYConfig.upperRightUseArea2.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="doubleChartDoubleYConfig.upperRightSource3.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="doubleChartDoubleYConfig.upperRightColor3.value" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="doubleChartDoubleYConfig.upperRightUseArea3.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center;">
                <el-select v-model="doubleChartDoubleYConfig.upperRightSource4.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="doubleChartDoubleYConfig.upperRightColor4.value" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="doubleChartDoubleYConfig.upperRightUseArea4.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
            </div>
          </div>
          <div class="chart-config-section">
            <h4 style="margin-bottom: 10px;">下图左Y轴数据（最多4个）：</h4>
            <div class="source-selectors">
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="doubleChartDoubleYConfig.lowerLeftSource1.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="doubleChartDoubleYConfig.lowerLeftColor1.value" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="doubleChartDoubleYConfig.lowerLeftUseArea1.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="doubleChartDoubleYConfig.lowerLeftSource2.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="doubleChartDoubleYConfig.lowerLeftColor2.value" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="doubleChartDoubleYConfig.lowerLeftUseArea2.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="doubleChartDoubleYConfig.lowerLeftSource3.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="doubleChartDoubleYConfig.lowerLeftColor3.value" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="doubleChartDoubleYConfig.lowerLeftUseArea3.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center;">
                <el-select v-model="doubleChartDoubleYConfig.lowerLeftSource4.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="doubleChartDoubleYConfig.lowerLeftColor4.value" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="doubleChartDoubleYConfig.lowerLeftUseArea4.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
            </div>
          </div>
          <div class="chart-config-section">
            <h4 style="margin-bottom: 10px;">下图右Y轴数据（最多4个）：</h4>
            <div class="source-selectors">
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="doubleChartDoubleYConfig.lowerRightSource1.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="doubleChartDoubleYConfig.lowerRightColor1.value" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="doubleChartDoubleYConfig.lowerRightUseArea1.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="doubleChartDoubleYConfig.lowerRightSource2.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="doubleChartDoubleYConfig.lowerRightColor2.value" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="doubleChartDoubleYConfig.lowerRightUseArea2.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="doubleChartDoubleYConfig.lowerRightSource3.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="doubleChartDoubleYConfig.lowerRightColor3.value" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="doubleChartDoubleYConfig.lowerRightUseArea3.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center;">
                <el-select v-model="doubleChartDoubleYConfig.lowerRightSource4.value" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="doubleChartDoubleYConfig.lowerRightColor4.value" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="doubleChartDoubleYConfig.lowerRightUseArea4.value" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <template #footer>
      <input
        ref="configFileInput"
        type="file"
        accept=".json"
        style="display: none"
        @change="handleConfigFileUpload"
      />
      <el-button type="primary" @click="importConfigFile">载入</el-button>
      <el-button type="primary" @click="exportConfigFile">导出</el-button>
      <el-button type="primary" @click="applyViewConfig(createChart)">确定</el-button>
      <el-button type="default" @click="viewConfigDialogVisible = false">取消</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import * as echarts from 'echarts'
import type { LineSeriesOption } from 'echarts'; 
import { useFlow } from '@/composables/flow/useFlow'
import { useDataConfig } from '@/composables/flow/useDataConfig'
import { ElMessage } from 'element-plus'
import { useConsole } from '@/composables/flow/useConsole'
import { useDevice } from '@/hooks/useDevice'

// 初始化数据流处理
const { flowData, plotData, enableWindow, toggleSlideWindow, clearRawData } = useFlow()
const { searchQuery } = useConsole(true)
const { deviceConnected } = useDevice()

// 初始化视图配置处理
const { 
  // 状态变量
  viewConfigDialogVisible,
  viewLayout,
  yAxisConfig,

  // 配置对象
  singleChartConfig,
  singleChartDoubleYConfig,
  doubleChartConfig,
  doubleChartDoubleYConfig,

  // 计算属性
  upperChartSources,
  lowerChartSources,
  upperChartLeftSources,
  upperChartRightSources,
  lowerChartLeftSources,
  lowerChartRightSources,
  singleChartSources,
  singleChartLeftSources,
  singleChartRightSources,
  checkDataExist,
  availableSources,
  // 工具函数
  getRandomColor,
  // 方法
  showViewConfig,
  applyViewConfig,
  exportConfigFile,
  validateAndApplyConfig,
} = useDataConfig(plotData)

const chartRef = ref<HTMLDivElement>()
let chart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null

const largeDataOptions = computed(() => {
  if (plotData.value?.plotTime && plotData.value.plotTime.length > 500) {
    return {
      showSymbol: false,
      large: true,
      largeThreshold: 5000,
      progressive: 5000,
      progressiveThreshold: 10000,
    }
  } else {
    return {}
  }
})

// 导入配置文件
function importConfigFile() {
  configFileInput.value?.click()
}

// 处理配置文件上传
function handleConfigFileUpload(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  
  if (file) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      try {
        // 解析JSON配置
        const config = JSON.parse(content)
        
        // 验证配置格式
        validateAndApplyConfig(config)
        
        ElMessage({
          message: `配置导入成功`,
          type: 'success',
          placement: 'bottom-right',
          offset: 50,
        })
      } catch (error) {
        ElMessage({
          message: `配置文件解析失败，请检查格式是否正确`,
          type: 'error',
          placement: 'bottom-right',
          offset: 50,
        })
      }
    }
    
    reader.readAsText(file)
    
    // 清空input以允许重复选择同一文件
    target.value = ''
  }
}

// 消息格式对话框相关
const messageDialogVisible = ref(false)
const configFileInput = ref<HTMLInputElement>()

// 显示消息格式对话框
function showMessageFormat() {
  messageDialogVisible.value = true
}

// 首先在导入部分添加clearAllCustomStatus
import { useFlowStore } from '@/stores/flow'

// 在script setup中初始化store
const flowStore = useFlowStore()

function refreshPlotData() {
  createChart()
}

// 修改clearPlotData函数
function clearPlotData() {
  // 清除所有自定义属性
  flowStore.clearAllCustomStatus()
  // 清除原始数据
  clearRawData()
  // 重新创建图表
  createChart()
  // 显示成功消息
  ElMessage({
    message: `数据已清除`,
    type: 'success',
    placement: 'bottom-right',
    offset: 50,
  })
}

function getScale(singleData: LineSeriesOption) {
  let result = {};
  const values = (singleData as LineSeriesOption).data?.map((value: any) => {
    // 确保值是数字并且不为null
    if (value[1] === null || value[1] === undefined || typeof value[1] !== 'number') {
      return 0;
    }
    return value[1];
  }).filter((val: number) => !isNaN(val)); // 过滤掉NaN值

  if (values?.length === 0) return; // 跳过没有有效数据的系列
  result = {
    max: values ? Math.max(...values) : 0,
    min: values ? Math.min(...values) : 0
  };
  return result;
}

// 注意alignTicks: true与自定义的 min 和 max 值两者不要同时设定，当这两个设置同时使用时，ECharts无法找到合适的刻度间隔，导致刻度可能会非常密集，影响可读性。
function getScaleMulti(allData: LineSeriesOption[]) {
  let yIndexOffset = 0;
  let result = {} as { [key: number]: { max: number; min: number } };
  allData.forEach(item => {
    const yAxisIndex = (item as LineSeriesOption).yAxisIndex || 0;
    yIndexOffset = yAxisIndex < 2 ? 0 : 2;
    const values = (item as LineSeriesOption).data?.map((value: any) => {
      // 确保值是数字并且不为null
      if (value[1] === null || value[1] === undefined || typeof value[1] !== 'number') {
        return 0;
      }
      return value[1];
    }).filter((val: number) => !isNaN(val)); // 过滤掉NaN值

    if (values?.length === 0) return; // 跳过没有有效数据的系列

    if (!result[yAxisIndex]) {
      result[yAxisIndex] = {
        max: values ? Math.max(...values) : 0,
        min: values ? Math.min(...values) : 0
      };
    } else {
      result[yAxisIndex].max = Math.max(result[yAxisIndex].max, ...(values || []));
      result[yAxisIndex].min = Math.min(result[yAxisIndex].min, ...(values || []));
    }
  });

  // 检查是否有两个Y轴的数据
  if (Object.keys(result).length !== 2 || !result[0+yIndexOffset] || !result[1+yIndexOffset]) {
    return false;
  }

  const max1 = result[0+yIndexOffset].max || 1;
  const min1 = result[0+yIndexOffset].min || 0;
  const max2 = result[1+yIndexOffset].max || 1;
  const min2 = result[1+yIndexOffset].min || 0;

  // 计算比例
  const ratio = (max1 - min1) / (max2 - min2);
  let minMax = {} as { y1Min: number; y1Max: number; y2Min: number; y2Max: number };

  // 调整最大值
  if (max1 < max2 * ratio) {
    minMax.y1Max = max2 * ratio;
    minMax.y2Max = max2;
  } else {
    minMax.y1Max = max1;
    minMax.y2Max = max1 / ratio;
  }

  // 调整最小值
  if (min1 < min2 * ratio) {
    minMax.y1Min = min1;
    minMax.y2Min = min1 / ratio;
  } else {
    minMax.y1Min = min2 * ratio;
    minMax.y2Min = min2;
  }

  // 扩大范围，增加一些边距
  minMax.y1Min = Number((Number(minMax.y1Min) * 1.2).toFixed(2));
  minMax.y2Min = Number((Number(minMax.y2Min) * 1.2).toFixed(2));
  minMax.y1Max = Number((Number(minMax.y1Max) * 1.2).toFixed(2));
  minMax.y2Max = Number((Number(minMax.y2Max) * 1.2).toFixed(2));

  return minMax;
}

// 创建图表
function createChart() {
  if (!chartRef.value) return
  
  // 销毁已有图表
  if (chart) {
    chart.dispose()
  }
  
  chart = echarts.init(chartRef.value)

  // 添加双击事件监听器
  chart.on('dblclick', handleChartDblClick)

  updateChart()
}

// 更新图表
function updateChart() {
  if (!chart || !checkDataExist.value) {
    // 如果没有数据，显示空图表
    chart?.setOption({
      // 移除双图模式下的标题
      title: { show: false },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          if (params.length === 0) return ''
          
          // 安全处理时间戳
          let result = `显示时间: `
          if (params[0] && params[0].data && params[0].data[0] !== null) {
            if (typeof params[0].data[0] === 'number') {
              result += `${params[0].data[0].toFixed(3)}s`
            } else {
              result += `${params[0].data[0]}s`
            }
          } else {
            result += `0.00s`
          }
          result += `<br/>`

          const timeMarker = `<div style="line-height:16px;display:inline-block;vertical-align:middle;margin-right:4px;">
            <svg width="12" height="12" viewBox="0 0 24 24"
                fill="none" stroke="grey" stroke-width="2">
              <circle cx="12" cy="12" r="9"/>
              <path d="M12 7v5l3 3"/>
            </svg>
          </div>`
          result += `${timeMarker}time: ${(params[0].data[0]+plotData.value.startTime).toFixed(3)}<br/>`
          
          // 安全处理每个参数值
          params.forEach((param: any) => {
            if (param && param.data && param.data[1] !== null) {
              result += `${param.marker}${param.seriesName}: `
              if (typeof param.data[1] === 'number') {
                result += `${param.data[1].toFixed(2)}`
              } else {
                result += `${param.data[1]}`
              }
              result += `<br/>`
            }
          })
          return result
        }
      },
      grid: {
        left: '3%',
        right: '8%',
        bottom: '20%',
        containLabel: true
      },
      xAxis: { type: 'value', name: '' },
      yAxis: { type: 'value' },
      series: []
    })
    return
  }
  
  // 根据视图配置准备图表选项
  const option = createChartOption()
  chart.setOption(option)
}

// 图表双击事件处理函数
function handleChartDblClick(params: any) {
  // params 包含了双击事件的相关信息，如坐标、数据等
  if (params.componentType === 'series') {
    const value = params.value
    const rawTime = Number(value[0]) + (plotData.value.startTime ?? 0);
    const parts = rawTime.toString().split('.');
    const targetTime = parts[0] + (parts[1] ? '.' + parts[1].substring(0, 2) : '.00');

    searchQuery.value = '"time":' + targetTime;
  }
}

const unifiedAxisLabel = {
  formatter: function(value: number) {
    // 假设数据范围在 -999.99 到 999.99 之间
    const formatted = value.toFixed(2);
    
    const numberDigits = formatted.toString().length-3;
    let spaceStr = '';
    switch (numberDigits) {
      case 0:
        spaceStr = '    ';
        break;
      case 1:
        spaceStr = '   ';
        break;
      case 2:
        spaceStr = '  ';
        break;
      case 3:
        spaceStr = ' '
        break;
      default:
        spaceStr = '';
        break;
    }

    return `${spaceStr}${formatted}`;
  },
  width: 70,  // 稍微增加宽度以容纳更大的数值
  overflow: 'none',
  margin: 8,
  // fontFamily: 'monospace'
}

// 创建图表选项
function createChartOption() {
  const plotDataRatio = flowData.value.plotTime?.length ? 1 - 110 / flowData.value.plotTime.length : 0;
  let dataZoomStart = 0;
  if (enableWindow.value) {
    dataZoomStart = !plotData.value.plotTime || plotData.value.plotTime.length < 100 ? 0 : 100 * plotDataRatio;
  }

  if (viewLayout.value === 'single') {
    // 单图模式
    let series: LineSeriesOption[] = [];
    let minMax: { y1Min: number; y1Max: number; y2Min: number; y2Max: number } | false = false;
    
    if (yAxisConfig.value === 'single') {
      // 单图单Y轴模式
      series = singleChartSources.value.map((source, index) => {
        // 获取对应的颜色配置
        const colorMap = [singleChartConfig.color1, singleChartConfig.color2, singleChartConfig.color3, singleChartConfig.color4];
        const areaMap = [singleChartConfig.useArea1, singleChartConfig.useArea2, singleChartConfig.useArea3, singleChartConfig.useArea4];

        let color = colorMap[index].value
        if (source && !color) {
          color = getRandomColor(colorMap[index], index);
        }
        
        try {
          const seriesData = (plotData.value[source] as any[]).map((value: any, idx: number) => [
            plotData.value.plotTime![idx], value
          ]);
          return {
            name: source, // 不再替换下划线
            type: 'line',
            data: seriesData,
            symbolSize: 4,
            smooth: false,
            clip: true,
            yAxisIndex: 0,
            color: color,
            areaStyle: {
              color: areaMap[index].value ? color : 'transparent'
            },
            animation: false,
            ...largeDataOptions.value,
          }
        } catch(err) {
          return {
            name: source, // 确保有name属性
            type: 'line',
            data: undefined, // 空数据
            symbolSize: 4,
            smooth: false,
            yAxisIndex: 0,
            color: color
          };
        }
      });
    } else {
      // 单图双Y轴模式
      const leftSeries: LineSeriesOption[] = singleChartLeftSources.value.map((source, index) => {
        // 获取左侧Y轴对应的颜色配置
        const colorMap = [singleChartDoubleYConfig.leftColor1, singleChartDoubleYConfig.leftColor2, singleChartDoubleYConfig.leftColor3, singleChartDoubleYConfig.leftColor4];
        const areaMap = [singleChartDoubleYConfig.leftUseArea1, singleChartDoubleYConfig.leftUseArea2, singleChartDoubleYConfig.leftUseArea3, singleChartDoubleYConfig.leftUseArea4];
        let color = colorMap[index].value
        if (source && !color) {
          color = getRandomColor(colorMap[index], index);
        }

        try {
          const seriesData = (plotData.value[source] as any[]).map((value: any, idx: number) => [
            plotData.value.plotTime![idx], value
          ]);
          
          return {
            name: source, // 不再替换下划线
            type: 'line',
            data: seriesData,
            symbolSize: 4,
            smooth: false,
            clip: true,
            yAxisIndex: 0,
            color: color,
            areaStyle: {
              color: areaMap[index].value ? color : 'transparent'
            },
            animation: false,
            ...largeDataOptions.value,
          }
        } catch (err) {
          return {
            name: source, // 确保有name属性
            type: 'line',
            data: undefined, // 空数据
            symbolSize: 4,
            smooth: false,
            yAxisIndex: 0,
            color: color
          };
        }
      });
      
      const rightSeries: LineSeriesOption[] = singleChartRightSources.value.map((source, index) => {
        // 获取右侧Y轴对应的颜色配置
        const colorMap = [singleChartDoubleYConfig.rightColor1, singleChartDoubleYConfig.rightColor2, singleChartDoubleYConfig.rightColor3, singleChartDoubleYConfig.rightColor4];
        const areaMap = [singleChartDoubleYConfig.rightUseArea1, singleChartDoubleYConfig.rightUseArea2, singleChartDoubleYConfig.rightUseArea3, singleChartDoubleYConfig.rightUseArea4];
        let color = colorMap[index].value
        if (source && !color) {
          color = getRandomColor(colorMap[index], index+singleChartLeftSources.value.length);
        }

        try {
          const seriesData = (plotData.value[source] as any[]).map((value: any, idx: number) => [
            plotData.value.plotTime![idx], value
          ]);
          
          return {
            name: source, // 不再替换下划线
            type: 'line',
            data: seriesData,
            symbolSize: 4,
            smooth: false,
            clip: true,
            yAxisIndex: 1,
            color: color,
            areaStyle: {
              color: areaMap[index].value ? color : 'transparent'
            },
            animation: false,
            ...largeDataOptions.value,
          }
        } catch (err) {
          return {
            name: source, // 确保有name属性
            type: 'line',
            data: undefined, // 空数据
            symbolSize: 4,
            smooth: false,
            yAxisIndex: 0,
            color: color
          }
        }
      });
      
      series = [...leftSeries, ...rightSeries];
      
      // 计算双Y轴对齐范围
      minMax = getScaleMulti(series);
    }

    return {
      title: {
        left: 'center',
        textStyle: { fontSize: 14 }
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          if (params.length === 0 || params[0].data === undefined) return '';
          
          let result = `显示时间: ${params[0].data[0].toFixed(3)}s<br/>`

          const timeMarker = `<div style="line-height:16px;display:inline-block;vertical-align:middle;margin-right:4px;">
            <svg width="12" height="12" viewBox="0 0 24 24"
                fill="none" stroke="grey" stroke-width="2">
              <circle cx="12" cy="12" r="9"/>
              <path d="M12 7v5l3 3"/>
            </svg>
          </div>`
          result += `${timeMarker}time: ${(params[0].data[0]+plotData.value.startTime).toFixed(3)}<br/>`

          params.forEach((param: any) => {
            if (param.data[1] !== null) {
              result += `${param.marker}${param.seriesName}: ${param.data[1].toFixed(2)}<br/>`
            }
          })
          return result
        }
      },
      legend: {
        data: series.map(item => item.name), // 直接使用原始名称
        top: 30
      },
      grid: {
        left: '3%',
        right: '8%',
        bottom: '20%',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        name: series.length < 2 ? '' : '',
        axisLabel: {
          formatter: function(value: number) {
            return value.toFixed(2)
          }
        },
      },
      yAxis: yAxisConfig.value === 'double' ? [
        {
          type: 'value',
          // alignTicks: true,
          max: minMax ? minMax.y1Max : undefined,
          min: minMax ? minMax.y1Min : undefined,
          axisLabel: unifiedAxisLabel
        },
        {
          type: 'value',
          // alignTicks: true,
          show: true,
          max: minMax ? minMax.y2Max : undefined,
          min: minMax ? minMax.y2Min : undefined,
          axisLabel: unifiedAxisLabel
        }
      ] : { type: 'value' },
      // zoomOnMouseWheel 只有 布尔 和 'ctrl' 两种有效值：
      // true / 省略 → 滚轮即触发
      // 'ctrl' → 必须 Ctrl + 滚轮才触发
      dataZoom: [
        { 
          type: 'slider', show: true, xAxisIndex: 0, brushSelect: false, filterMode: 'none',
          start: dataZoomStart, end: 100,
        },
        { 
          type: 'inside', xAxisIndex: 0, zoomOnMouseWheel: true, filterMode: 'none',
        },
        { 
          type: 'inside', yAxisIndex: 0, zoomOnMouseWheel: 'ctrl', filterMode: 'none',
        },
        { 
          type: 'inside', yAxisIndex: 1, zoomOnMouseWheel: 'ctrl', filterMode: 'none',
        }
      ],
      series
    }
  } else {
    // 双图模式
    let upperSeries = [];
    let lowerSeries = [];
    let upperMinMax: { y1Min: number; y1Max: number; y2Min: number; y2Max: number } | false = false;
    let lowerMinMax: { y1Min: number; y1Max: number; y2Min: number; y2Max: number } | false = false;
    
    if (yAxisConfig.value === 'double') {
      // 双图双Y轴模式 - 使用特定的左右Y轴数据
      // 上图表左侧Y轴数据
      upperSeries = upperChartLeftSources.value.map((source, index) => {
        const colorMap = [doubleChartDoubleYConfig.upperLeftColor1, doubleChartDoubleYConfig.upperLeftColor2, doubleChartDoubleYConfig.upperLeftColor3, doubleChartDoubleYConfig.upperLeftColor4];
        const areaMap = [doubleChartDoubleYConfig.upperLeftUseArea1, doubleChartDoubleYConfig.upperLeftUseArea2, doubleChartDoubleYConfig.upperLeftUseArea3, doubleChartDoubleYConfig.upperLeftUseArea4];
        let color = colorMap[index].value
        if (source && !color) {
          color = getRandomColor(colorMap[index], index);
        }

        try {
          const seriesData = (plotData.value[source] as any[]).map((value: any, idx: number) => [
            plotData.value.plotTime![idx], value
          ]);

          return {
            name: source,
            type: 'line',
            data: seriesData,
            symbolSize: 4,
            smooth: false,
            clip: true,
            yAxisIndex: 0,
            color: color,
            areaStyle: {
              color: areaMap[index].value ? color : 'transparent'
            },
            animation: false,
            ...largeDataOptions.value,
          }
        } catch (err) {
          return {
            name: source, // 确保有name属性
            type: 'line',
            data: undefined, // 空数据
            symbolSize: 4,
            smooth: false,
            yAxisIndex: 0,
            color: color
          }
        }
      });
      
      // 上图表右侧Y轴数据
      upperSeries.push(...upperChartRightSources.value.map((source, index) => {
        const colorMap = [doubleChartDoubleYConfig.upperRightColor1, doubleChartDoubleYConfig.upperRightColor2, doubleChartDoubleYConfig.upperRightColor3, doubleChartDoubleYConfig.upperRightColor4];
        const areaMap = [doubleChartDoubleYConfig.upperRightUseArea1, doubleChartDoubleYConfig.upperRightUseArea2, doubleChartDoubleYConfig.upperRightUseArea3, doubleChartDoubleYConfig.upperRightUseArea4];
        let color = colorMap[index].value
        if (source && !color) {
          color = getRandomColor(colorMap[index], index+upperChartLeftSources.value.length);
        }

        try {
          const seriesData = (plotData.value[source] as any[]).map((value: any, idx: number) => [
            plotData.value.plotTime![idx], value
          ]);
          
          return {
            name: source,
            type: 'line',
            data: seriesData,
            symbolSize: 4,
            smooth: false,
            clip: true,
            yAxisIndex: 1,
            color: color,
            areaStyle: {
              color: areaMap[index].value ? color : 'transparent'
            },
            animation: false,
            ...largeDataOptions.value,
          }
        } catch (err) {
          return {
            name: source, // 确保有name属性
            type: 'line',
            data: undefined, // 空数据
            symbolSize: 4,
            smooth: false,
            yAxisIndex: 1,
            color: color
          }
        }
      }));
      
      // 下图表左侧Y轴数据
      lowerSeries = lowerChartLeftSources.value.map((source, index) => {
        const colorMap = [doubleChartDoubleYConfig.lowerLeftColor1, doubleChartDoubleYConfig.lowerLeftColor2, doubleChartDoubleYConfig.lowerLeftColor3, doubleChartDoubleYConfig.lowerLeftColor4];
        const areaMap = [doubleChartDoubleYConfig.lowerLeftUseArea1, doubleChartDoubleYConfig.lowerLeftUseArea2, doubleChartDoubleYConfig.lowerLeftUseArea3, doubleChartDoubleYConfig.lowerLeftUseArea4];
        let color = colorMap[index].value
        if (source && !color) {
          color = getRandomColor(colorMap[index], index);
        }

        try {
          const seriesData = (plotData.value[source] as any[]).map((value: any, idx: number) => [
            plotData.value.plotTime![idx], value
          ]);

          return {
            name: source,
            type: 'line',
            data: seriesData,
            symbolSize: 4,
            smooth: false,
            clip: true,
            yAxisIndex: 2,
            color: color,
            areaStyle: {
              color: areaMap[index].value ? color : 'transparent'
            },
            animation: false,
            ...largeDataOptions.value,
          }
        } catch (err) {
          return {
            name: source, // 确保有name属性
            type: 'line',
            data: undefined, // 空数据
            symbolSize: 4,
            smooth: false,
            yAxisIndex: 2,
            color: color
          }
        }
      });
      
      // 下图表右侧Y轴数据
      lowerSeries.push(...lowerChartRightSources.value.map((source, index) => {
        const colorMap = [doubleChartDoubleYConfig.lowerRightColor1, doubleChartDoubleYConfig.lowerRightColor2, doubleChartDoubleYConfig.lowerRightColor3, doubleChartDoubleYConfig.lowerRightColor4];
        const areaMap = [doubleChartDoubleYConfig.lowerRightUseArea1, doubleChartDoubleYConfig.lowerRightUseArea2, doubleChartDoubleYConfig.lowerRightUseArea3, doubleChartDoubleYConfig.lowerRightUseArea4];
        let color = colorMap[index].value
        if (source && !color) {
          color = getRandomColor(colorMap[index], index+lowerChartLeftSources.value.length);
        }

        try {
          const seriesData = (plotData.value[source] as any[]).map((value: any, idx: number) => [
            plotData.value.plotTime![idx], value
          ]);

          return {
            name: source,
            type: 'line',
            data: seriesData,
            symbolSize: 4,
            smooth: false,
            clip: true,
            yAxisIndex: 3,
            color: color,
            areaStyle: {
              color: areaMap[index].value ? color : 'transparent'
            },
            animation: false,
            ...largeDataOptions.value,
          }
        } catch (err) {
          return {
            name: source, // 确保有name属性
            type: 'line',
            data: undefined, // 空数据
            symbolSize: 4,
            smooth: false,
            yAxisIndex: 3,
            color: color
          }
        }
      }));
      
      // 计算每个图表的Y轴对齐范围
      if (upperSeries.length > 0) {
        // 只提取上图表的Y轴0和1的数据进行计算
        const upperChartData = upperSeries.filter(s => s.yAxisIndex === 0 || s.yAxisIndex === 1) as LineSeriesOption[];
        upperMinMax = getScaleMulti(upperChartData);
      }
      
      if (lowerSeries.length > 0) {
        // 只提取下图表的Y轴2和3的数据进行计算，并将索引调整为0和1
        const lowerChartData = lowerSeries.filter(s => s.yAxisIndex === 2 || s.yAxisIndex === 3) as LineSeriesOption[];
        lowerMinMax = getScaleMulti(lowerChartData);
      }
    } else {
      // 双图单Y轴模式 - 上图表
      upperSeries = upperChartSources.value.map((source, index) => {
        const colorMap = [doubleChartConfig.upperColor1, doubleChartConfig.upperColor2, doubleChartConfig.upperColor3, doubleChartConfig.upperColor4];
        const areaMap = [doubleChartConfig.upperUseArea1, doubleChartConfig.upperUseArea2, doubleChartConfig.upperUseArea3, doubleChartConfig.upperUseArea4];
        let color = colorMap[index].value
        if (source && !color) {
          color = getRandomColor(colorMap[index], index);
        }

        try {
          const sourceData = plotData.value[source];
          const seriesData = Array.isArray(sourceData) 
          ? sourceData.map((value: any, idx: number) => [plotData.value.plotTime![idx], value])
          : [];
          
          return {
            name: source,
            type: 'line',
            data: seriesData,
            symbolSize: 4,
            smooth: false,
            clip: true,
            yAxisIndex: 0,
            color: color,
            areaStyle: {
              color: areaMap[index].value ? color : 'transparent'
            },
            animation: false,
            ...largeDataOptions.value,
          }
        } catch (err) {
          return {
            name: source, // 确保有name属性
            type: 'line',
            data: undefined, // 空数据
            symbolSize: 4,
            smooth: false,
            yAxisIndex: 0,
            color: color
          }
        }
      });
      
      // 双图单Y轴模式 - 下图表
      lowerSeries = lowerChartSources.value.map((source, index) => {
        const colorMap = [doubleChartConfig.lowerColor1, doubleChartConfig.lowerColor2, doubleChartConfig.lowerColor3, doubleChartConfig.lowerColor4];
        const areaMap = [doubleChartConfig.lowerUseArea1, doubleChartConfig.lowerUseArea2, doubleChartConfig.lowerUseArea3, doubleChartConfig.lowerUseArea4];
        let color = colorMap[index].value
        if (source && !color) {
          color = getRandomColor(colorMap[index], index+upperChartSources.value.length);
        }

        try {
          const sourceData = plotData.value[source];
          const seriesData = Array.isArray(sourceData) 
          ? sourceData.map((value: any, idx: number) => [plotData.value.plotTime![idx], value])
          : [];
  
          return {
            name: source,
            type: 'line',
            data: seriesData,
            symbolSize: 4,
            smooth: false,
            clip: true,
            yAxisIndex: 1,
            color: color,
            areaStyle: {
              color: areaMap[index].value ? color : 'transparent'
            },
            animation: false,
            ...largeDataOptions.value,
          }
        } catch (err) {
          return {
            name: source, // 确保有name属性
            type: 'line',
            data: undefined, // 空数据
            symbolSize: 4,
            smooth: false,
            yAxisIndex: 1,
            color: color
          }
        }
      });
    }
    
    // 修复双图双Y轴模式下的yAxis配置
    const yAxisConfigArray = [];
    if (yAxisConfig.value === 'double') {
      // 双图双Y轴模式，每个图表都有左右两个Y轴
      ;
      
      yAxisConfigArray.push(
        {
          type: 'value', 
          // alignTicks: true, 
          gridIndex: 0,
          max: upperMinMax ? upperMinMax.y1Max : undefined,
          min: upperMinMax ? upperMinMax.y1Min : undefined,
          axisLabel: unifiedAxisLabel
        },
        {
          type: 'value', 
          // alignTicks: true, 
          gridIndex: 0, 
          show: true,
          max: upperMinMax ? upperMinMax.y2Max : undefined,
          min: upperMinMax ? upperMinMax.y2Min : undefined,
          axisLabel: unifiedAxisLabel
        },
        {
          type: 'value', 
          // alignTicks: true, 
          gridIndex: 1,
          max: lowerMinMax ? lowerMinMax.y1Max : undefined,
          min: lowerMinMax ? lowerMinMax.y1Min : undefined,
          axisLabel: unifiedAxisLabel
        },
        {
          type: 'value', 
          // alignTicks: true, 
          gridIndex: 1, 
          show: true,
          max: lowerMinMax ? lowerMinMax.y2Max : undefined,
          min: lowerMinMax ? lowerMinMax.y2Min : undefined,
          axisLabel: unifiedAxisLabel
        }
      );
    } else {
      yAxisConfigArray.push(
        { type: 'value', gridIndex: 0, axisLabel: unifiedAxisLabel },
        { type: 'value', gridIndex: 1, axisLabel: unifiedAxisLabel }
      );
    }
    
    // 合并所有系列数据，用于图例显示
    const allSeries = [...upperSeries, ...lowerSeries];
    
    return {
      title: { left: 'center', textStyle: { fontSize: 14 } },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          if (params.length === 0 || params[0].data === undefined) return '';
          
          // 安全处理时间戳
          let result = `显示时间: `
          if (params[0] && params[0].data && params[0].data[0] !== null) {
            if (typeof params[0].data[0] === 'number') {
              result += `${params[0].data[0].toFixed(3)}s`
            } else {
              result += `${params[0].data[0]}s`
            }
          } else {
            result += `0.00s`
          }
          result += `<br/>`

          const timeMarker = `<div style="line-height:16px;display:inline-block;vertical-align:middle;margin-right:4px;">
            <svg width="12" height="12" viewBox="0 0 24 24"
                fill="none" stroke="grey" stroke-width="2">
              <circle cx="12" cy="12" r="9"/>
              <path d="M12 7v5l3 3"/>
            </svg>
          </div>`
          result += `${timeMarker}time: ${(params[0].data[0]+plotData.value.startTime).toFixed(3)}<br/>`
          
          // 安全处理每个参数值
          params.forEach((param: any) => {
            if (param && param.data && param.data[1] !== null) {
              result += `${param.marker}${param.seriesName}: `
              if (typeof param.data[1] === 'number') {
                result += `${param.data[1].toFixed(2)}`
              } else {
                result += `${param.data[1]}`
              }
              result += `<br/>`
            }
          })
          return result
        }
      },
      legend: {
        data: allSeries.map(item => item.name),
        top: 30
      },
      grid: [
        // 100 - 15 - 52 = 33
        // 100 - 53 - 14 = 33
        { left: '3%', right: '8%', top: '15%', bottom: '52%', containLabel: true },
        { left: '3%', right: '8%', top: '53%', bottom: '14%', containLabel: true }
      ],
      xAxis: [
        { type: 'value', name: upperSeries.length < 2 ? '' : '', gridIndex: 0, axisLabel: { formatter: (value: number) => value.toFixed(2) } },
        { type: 'value', name: lowerSeries.length < 2 ? '' : '', gridIndex: 1, axisLabel: { formatter: (value: number) => value.toFixed(2) } }
      ],
      yAxis: yAxisConfigArray,
      dataZoom: [
        { 
          type: 'slider', show: true, xAxisIndex: [0, 1], brushSelect: false, filterMode: 'none', start: dataZoomStart, end: 100,
        },
        { 
          type: 'inside', xAxisIndex: [0, 1], zoomOnMouseWheel: true, 
          filterMode: 'none' 
        },
        { 
          type: 'inside', yAxisIndex: 0, zoomOnMouseWheel: 'ctrl', 
          filterMode: 'none' 
        },
        { 
          type: 'inside', yAxisIndex: 1, zoomOnMouseWheel: 'ctrl', 
          filterMode: 'none' 
        },
        { 
          type: 'inside', yAxisIndex: 2, zoomOnMouseWheel: 'ctrl', 
          filterMode: 'none' 
        },
        { 
          type: 'inside', yAxisIndex: 3, zoomOnMouseWheel: 'ctrl', 
          filterMode: 'none' 
        }
      ],
      series: [
        // 上图表系列 - 添加gridIndex和xAxisIndex
        ...upperSeries.map(series => ({
          ...series,
          gridIndex: 0,
          xAxisIndex: 0,
          animation: false,
          ...largeDataOptions.value,
        })),
        // 下图表系列 - 添加gridIndex和xAxisIndex
        ...lowerSeries.map(series => ({
          ...series,
          gridIndex: 1,
          xAxisIndex: 1,
          animation: false,
          ...largeDataOptions.value,
        }))
      ]
    }
  }
}

// 监听窗口大小变化
function handleResize() {
  chart?.resize()
}

function dataZoomPatch(disabledXAxisInside = false) {
  const option = chart?.getOption();
  if (!option?.dataZoom || !Array.isArray(option.dataZoom)) return [];
  
  // 保持原始配置的完整性，只修改disabled属性
  return option.dataZoom.map((item: any, index: number) => {
    // 识别x轴inside缩放组件
    const isXAxisInside = item.type === 'inside' && item.xAxisIndex !== undefined;
    return {
      ...item,
      disabled: isXAxisInside && disabledXAxisInside
    };
  });
}

let zoomResetTimer: number | null = null;
function handleCtrlKeyDown(e: KeyboardEvent) {
  if (e.key === 'Control' || e.key === 'Meta') {
    // 禁用所有x轴的inside缩放
    chart?.setOption({ dataZoom: dataZoomPatch(true) }, { replaceMerge: ['dataZoom'] });

    if (zoomResetTimer !== null) {
      clearTimeout(zoomResetTimer);
    }
    zoomResetTimer = window.setTimeout(() => {
      chart?.setOption({ dataZoom: dataZoomPatch(false) }, { replaceMerge: ['dataZoom'] });
      // 定时器执行完毕后，重置ID为null
      zoomResetTimer = null;
    }, 2000);
  }
}

function handleCtrlKeyUp(e: KeyboardEvent) {
  if (e.key === 'Control' || e.key === 'Meta') {
    // 恢复所有缩放功能
    chart?.setOption({ dataZoom: dataZoomPatch(false) }, { replaceMerge: ['dataZoom'] });
  }
}

/**
 * 触屏事件
 */
function getPinchDistance(touch1: Touch, touch2: Touch): number {
  const dx = touch2.clientX - touch1.clientX
  const dy = touch2.clientY - touch1.clientY
  return Math.sqrt(dx * dx + dy * dy)
}

interface TouchAxisZoomOptions {
  enableX?: boolean;
  enableY?: boolean;
}

let xAxisDataZoomOptions: any[] = []
let yAxisDataZoomOptions: any[] = []
function touchAxisZoom(options: TouchAxisZoomOptions) {
  const opt = chart!.getOption() as any;
  const { enableX = true, enableY = true } = options;
  
  // 备份当前的dataZoom配置
  const currentDataZooms = [...opt.dataZoom];
  
  // 重置备份数组
  if (!enableX) {
    xAxisDataZoomOptions = [];
  }
  if (!enableY) {
    yAxisDataZoomOptions = [];
  }
  
  // 筛选需要保留的dataZoom配置
  const filteredDataZooms = currentDataZooms.filter((d: any) => {
    // 判断是否是x轴相关配置
    const isXAxisZoom = d.xAxisIndex !== undefined && d.type === 'inside';
    
    // 判断是否是y轴相关配置
    const isYAxisZoom = d.yAxisIndex !== undefined && d.type === 'inside';
    
    // 备份将要被移除的配置
    if (!enableX && isXAxisZoom && d.type === 'inside') {
      xAxisDataZoomOptions.push({ ...d });
      return false; // 移除x轴配置
    }
    
    if (!enableY && isYAxisZoom && d.type === 'inside') {
      yAxisDataZoomOptions.push({ ...d });
      return false; // 移除y轴配置
    }
    
    // 保留不需要移除的配置
    return true;
  });
  
  // 添加需要启用的备份配置
  if (enableX && xAxisDataZoomOptions.length > 0) {
    filteredDataZooms.push(...xAxisDataZoomOptions);
  }
  
  if (enableY && yAxisDataZoomOptions.length > 0) {
    filteredDataZooms.push(...yAxisDataZoomOptions);
  }
  
  // 应用更新后的配置
  chart!.setOption({ dataZoom: filteredDataZooms }, { replaceMerge: ['dataZoom'] });
}

interface touchEventParams {
  startX: number
  startY: number
  isTouching: boolean
  isPinching: boolean // 新增：标记是否为双指缩放
  initialPinchDistance: number // 新增：初始双指距离
  pinchCenterX: number // 新增：缩放中心点 X
  pinchCenterY: number // 新增：缩放中心点 Y
}

const touchParams: touchEventParams = {
  startX: 0,
  startY: 0,
  isTouching: false,
  isPinching: false,
  initialPinchDistance: 0,
  pinchCenterX: 0,
  pinchCenterY: 0,
}

function touchStartEvent(e: TouchEvent) {
  if (e.touches.length === 1) {
    // 单指触控：拖动模式
    touchParams.startX = e.touches[0].clientX
    touchParams.startY = e.touches[0].clientY
    touchParams.isTouching = true
    touchParams.isPinching = false
    touchAxisZoom({ enableX: true, enableY: true })
  } else if (e.touches.length === 2) {
    // 双指触控：缩放模式
    touchParams.isTouching = false
    touchParams.isPinching = true
    touchParams.initialPinchDistance = getPinchDistance(e.touches[0], e.touches[1])
    touchParams.pinchCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2
    touchParams.pinchCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2
    touchAxisZoom({ enableX: true, enableY: true })
  }
}

function touchMoveEvent(e: TouchEvent) {
  if (touchParams.isPinching && e.touches.length === 2) {
    // 双指缩放逻辑
    const currentDistance = getPinchDistance(e.touches[0], e.touches[1])
    const scale = touchParams.initialPinchDistance / currentDistance // 缩放比例（<1 放大，>1 缩小）
    const option = chart?.getOption()

    if (!Array.isArray(option?.dataZoom)) return

    // 计算缩放中心在图表中的相对位置（0到1）
    const chartRect = chartRef.value?.getBoundingClientRect()
    if (!chartRect) return
    const relativeX = (touchParams.pinchCenterX - chartRect.left) / chartRect.width
    const relativeY = (touchParams.pinchCenterY - chartRect.top) / chartRect.height

    const deltaX = Math.abs(e.touches[1].clientX - e.touches[0].clientX)
    const deltaY = Math.abs(e.touches[1].clientY - e.touches[0].clientY)

    if (Math.abs(deltaX) >= Math.abs(deltaY)) {
      // 处理 X 轴缩放
      const xAxisZooms = option.dataZoom.filter((dz: any) => 
        dz.type === 'inside' && dz.xAxisIndex !== undefined
      )
      xAxisZooms.forEach((xAxisZoom: any) => {
        if (!Array.isArray(option?.dataZoom)) return
        const dataZoomIndex = option.dataZoom.findIndex((dz: any) => dz === xAxisZoom)
        const range = xAxisZoom.end - xAxisZoom.start
        const newRange = Math.min(100, Math.max(5, range * scale)) // 限制最小范围为 5%
        const center = xAxisZoom.start + range * relativeX // 缩放中心点
  
        chart?.dispatchAction({
          type: 'dataZoom',
          dataZoomIndex: dataZoomIndex,
          start: Math.max(0, Math.min(100 - newRange, center - (newRange * relativeX))),
          end: Math.max(newRange, Math.min(100, center + (newRange * (1 - relativeX))))
        })
      })
    } else {
      // 处理 Y 轴缩放
      const yAxisZooms = option.dataZoom.filter((dz: any) => 
        dz.type === 'inside' && dz.yAxisIndex !== undefined
      )
      yAxisZooms.forEach((yAxisZoom: any) => {
        if (!Array.isArray(option?.dataZoom)) return;
        const dataZoomIndex = option.dataZoom.findIndex((dz: any) => dz === yAxisZoom)
        const range = yAxisZoom.end - yAxisZoom.start
        const newRange = Math.min(100, Math.max(5, range * scale)) // 限制最小范围为 5%
        const center = yAxisZoom.start + range * relativeY // 缩放中心点
  
        chart?.dispatchAction({
          type: 'dataZoom',
          dataZoomIndex: dataZoomIndex,
          start: Math.max(0, Math.min(100 - newRange, center - (newRange * relativeY))),
          end: Math.max(newRange, Math.min(100, center + (newRange * (1 - relativeY))))
        })
      })
    }

    // 更新初始距离以支持连续缩放
    touchParams.initialPinchDistance = currentDistance
  } else if (touchParams.isTouching && e.touches.length === 1) {
    // 单指拖动逻辑（保持 X 轴反转方向）
    const currentX = e.touches[0].clientX
    const deltaX = currentX - touchParams.startX

    const currentY = e.touches[0].clientY
    const deltaY = currentY - touchParams.startY
    
    if (Math.abs(deltaX) >= 5 || Math.abs(deltaY) >= 5) {
      const option = chart?.getOption()

      if (Math.abs(deltaX) >= Math.abs(deltaY)) {
        // 水平拖动 - 控制 X 轴
        if (!Array.isArray(option?.dataZoom)) return
        const xAxisZoom = option.dataZoom.find((dz: any) =>
          dz.type === 'inside' && dz.xAxisIndex !== undefined
        )
        if (xAxisZoom) {
          const range = xAxisZoom.end - xAxisZoom.start
          const moveAmount = chartRef.value ? (deltaX / chartRef.value.clientWidth) * 20 : 0
          const dataZoomIndex = option.dataZoom.findIndex((dz: any) => dz === xAxisZoom)

          chart?.dispatchAction({
            type: 'dataZoom',
            dataZoomIndex: dataZoomIndex,
            start: Math.max(0, Math.min(100 - range, xAxisZoom.start - moveAmount)),
            end: Math.max(range, Math.min(100, xAxisZoom.end - moveAmount))
          })
          
          touchParams.startX = currentX
        }
      } else {
        // 垂直拖动 - 控制 Y 轴
        if (!Array.isArray(option?.dataZoom)) return
        const yAxisZooms = option?.dataZoom?.filter((dz: any) => 
          dz.type === 'inside' && dz.yAxisIndex !== undefined
        )

        yAxisZooms?.forEach((yAxisZoom: any) => {
          if (!Array.isArray(option?.dataZoom)) return
          const range = yAxisZoom.end - yAxisZoom.start
          const moveAmount = chartRef.value ? (deltaY / chartRef.value.clientHeight) * 100 : 0
          const dataZoomIndex = option.dataZoom.findIndex((dz: any) => dz === yAxisZoom)
          
          chart?.dispatchAction({
            type: 'dataZoom',
            dataZoomIndex: dataZoomIndex,
            start: Math.max(0, Math.min(100 - range, yAxisZoom.start + moveAmount)),
            end: Math.max(range, Math.min(100, yAxisZoom.end + moveAmount)),
          })
        })
        
        touchParams.startY = currentY
      }
    }
  }
}

function touchEndEvent(e: TouchEvent) {
  touchParams.isTouching = false
  touchParams.isPinching = false
  touchAxisZoom({ enableX: true, enableY: true })
}

function setupTouchEvents() {
  if (!chartRef.value) return

  touchParams.isTouching = false
  touchParams.isPinching = false
  touchParams.startX = 0
  touchParams.startY = 0
  touchParams.initialPinchDistance = 0
  touchParams.pinchCenterX = 0
  touchParams.pinchCenterY = 0
  
  chartRef.value.addEventListener('touchstart', touchStartEvent, { passive: false }) // 触摸开始
  chartRef.value.addEventListener('touchmove', touchMoveEvent, { passive: false }) // 触摸移动
  chartRef.value.addEventListener('touchend', touchEndEvent, { passive: false }) // 触摸结束
}

// 组件挂载时初始化图表
onMounted(() => {
  clearRawData();
  createChart();
  
  // 设置ResizeObserver监听图表容器大小变化
  if (chartRef.value) {
    resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(chartRef.value)
  }

  // 监听 Ctrl 键
  window.addEventListener('resize', handleResize)
  window.addEventListener('keydown', handleCtrlKeyDown)
  window.addEventListener('keyup', handleCtrlKeyUp)

  setupTouchEvents()
})

// 组件卸载时清理
onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  // 移除Ctrl键事件监听器
  window.removeEventListener('keydown', handleCtrlKeyDown)
  window.removeEventListener('keyup', handleCtrlKeyUp)

  if (chartRef.value) {
    chartRef.value.removeEventListener('touchstart', touchStartEvent)
    chartRef.value.removeEventListener('touchmove', touchMoveEvent)
    chartRef.value.removeEventListener('touchend', touchEndEvent)
  }

  if (resizeObserver && chartRef.value) {
    resizeObserver.unobserve(chartRef.value)
  }
  
  chart?.off('dblclick', handleChartDblClick)
  chart?.dispose()
})

// 监听flowData变化，更新图表
watch(
  () => plotData.value.plotTime,
  () => {
    if (plotData.value.plotTime) {
      updateChart()
    } else {
      createChart()
    }
  }
)
</script>

<style scoped>
.flow-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background-color: #f8f9fa;
  border-bottom: 1px solid #e9ecef;
  height: 50px;
  box-sizing: border-box;
}

.chart-container {
  flex: 1;
  min-height: 300px;
  padding: 5px 10px;
}

/* 按钮样式 */
.file-controls {
  display: flex;
  width: 100%;
  justify-content: space-between;
  align-items: center;
}

.left-buttons {
  display: flex;
}

.right-buttons {
  display: flex;
}

/* 示例代码样式 */
.example-code {
  background-color: #f5f5f5;
  padding: 10px;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 12px;
  line-height: 1.5;
}

/* 对话框内容样式 */
.message-content {
  text-align: left; /* 添加这一行，使所有内容左对齐 */
}

.dialog-content > div {
  display: flex;
  align-items: center;
  gap: 10px;
}

.dialog-content span {
  min-width: 100px;
}

/* 视图配置按钮样式 */
.layout-btn {
  margin-left: 8px;
}

/* 图表配置区域样式 */
.chart-config-section {
  margin-bottom: 15px;
  padding: 10px;
  background-color: #f9f9f9;
  border-radius: 4px;
}

.source-selectors {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 新增加的网格布局样式 */
.chart-config-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
  margin-bottom: 15px;
}

.custom-checkbox :deep(.el-checkbox__inner) {
  width: 22px;
  height: 22px;
}

/* 针对不同屏幕尺寸的响应式调整 */
@media (max-width: 768px) {
  .chart-config-grid {
    grid-template-columns: 1fr;
  }
}
</style>
