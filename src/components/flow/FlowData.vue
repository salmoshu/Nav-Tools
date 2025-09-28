<template>
  <div class="flow-container">
    <div class="controls">
      <div class="file-controls">
        <!-- 左侧按钮 -->
        <div class="left-buttons">
          <el-button type="default" size="small" @click="importConfigFile" class="layout-btn">
            载入配置
          </el-button>
          <input
            ref="configFileInput"
            type="file"
            accept=".json"
            style="display: none"
            @change="handleConfigFileUpload"
          />
          <el-button type="default" size="small" @click="showViewConfig" class="layout-btn">
            手动配置
          </el-button>
          <el-button type="default" size="small" @click="showMessageFormat" class="message-btn">
            消息格式
          </el-button>
        </div>
        
        <!-- 右侧按钮 -->
        <div class="right-buttons">
          <el-button type="default" size="small" @click="clearPlotData" class="clear-btn">
            清除
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
        <el-radio-group v-model="viewLayout" @change="onLayoutChange">
          <el-radio-button label="single">单图</el-radio-button>
          <el-radio-button label="double">双图</el-radio-button>
        </el-radio-group>
      </div>
      
      <div style="margin-bottom: 20px;">
        <span style="display: inline-block; width: 100px;">Y轴配置：</span>
        <el-radio-group v-model="yAxisConfig" @change="onYAxisChange">
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
                <el-select v-model="singleChartSource1" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="singleChartColor1" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="singleChartUseArea1" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="singleChartSource2" placeholder="选择数据" style="width: 200px; margin-right: 10px;" :disabled="!singleChartSource1">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="singleChartColor2" placeholder="选择颜色" :disabled="!singleChartSource1"></el-color-picker>
                <el-checkbox v-model="singleChartUseArea2" style="margin-left: 10px;" class="custom-checkbox" :disabled="!singleChartSource1">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="singleChartSource3" placeholder="选择数据" style="width: 200px; margin-right: 10px;" :disabled="!singleChartSource2">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="singleChartColor3" placeholder="选择颜色" :disabled="!singleChartSource2"></el-color-picker>
                <el-checkbox v-model="singleChartUseArea3" style="margin-left: 10px;" class="custom-checkbox" :disabled="!singleChartSource2">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center;">
                <el-select v-model="singleChartSource4" placeholder="选择数据" style="width: 200px; margin-right: 10px;" :disabled="!singleChartSource3">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="singleChartColor4" placeholder="选择颜色" :disabled="!singleChartSource3"></el-color-picker>
                <el-checkbox v-model="singleChartUseArea4" style="margin-left: 10px;" class="custom-checkbox" :disabled="!singleChartSource3">填充</el-checkbox>
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
                <el-select v-model="singleChartLeftSource1" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="singleChartLeftColor1" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="singleChartLeftUseArea1" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="singleChartLeftSource2" placeholder="选择数据" style="width: 200px; margin-right: 10px;" :disabled="!singleChartLeftSource1">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="singleChartLeftColor2" placeholder="选择颜色" :disabled="!singleChartLeftSource1"></el-color-picker>
                <el-checkbox v-model="singleChartLeftUseArea2" style="margin-left: 10px;" class="custom-checkbox" :disabled="!singleChartLeftSource1">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="singleChartLeftSource3" placeholder="选择数据" style="width: 200px; margin-right: 10px;" :disabled="!singleChartLeftSource2">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="singleChartLeftColor3" placeholder="选择颜色" :disabled="!singleChartLeftSource2"></el-color-picker>
                <el-checkbox v-model="singleChartLeftUseArea3" style="margin-left: 10px;" class="custom-checkbox" :disabled="!singleChartLeftSource2">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center;">
                <el-select v-model="singleChartLeftSource4" placeholder="选择数据" style="width: 200px; margin-right: 10px;" :disabled="!singleChartLeftSource3">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="singleChartLeftColor4" placeholder="选择颜色" :disabled="!singleChartLeftSource3"></el-color-picker>
                <el-checkbox v-model="singleChartLeftUseArea4" style="margin-left: 10px;" class="custom-checkbox" :disabled="!singleChartLeftSource3">填充</el-checkbox>
              </div>
            </div>
          </div>
          <div class="chart-config-section">
            <h4 style="margin-bottom: 10px;">右Y轴数据（最多4个）：</h4>
            <div class="source-selectors">
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="singleChartRightSource1" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="singleChartRightColor1" placeholder="选择颜色" ></el-color-picker>
                <el-checkbox v-model="singleChartRightUseArea1" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="singleChartRightSource2" placeholder="选择数据" style="width: 200px; margin-right: 10px;" :disabled="!singleChartRightSource1">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="singleChartRightColor2" placeholder="选择颜色" :disabled="!singleChartRightSource1"></el-color-picker>
                <el-checkbox v-model="singleChartRightUseArea2" style="margin-left: 10px;" class="custom-checkbox" :disabled="!singleChartRightSource1">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="singleChartRightSource3" placeholder="选择数据" style="width: 200px; margin-right: 10px;" :disabled="!singleChartRightSource2">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="singleChartRightColor3" placeholder="选择颜色" :disabled="!singleChartRightSource2"></el-color-picker>
                <el-checkbox v-model="singleChartRightUseArea3" style="margin-left: 10px;" class="custom-checkbox" :disabled="!singleChartRightSource2">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center;">
                <el-select v-model="singleChartRightSource4" placeholder="选择数据" style="width: 200px; margin-right: 10px;" :disabled="!singleChartRightSource3">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="singleChartRightColor4" placeholder="选择颜色" :disabled="!singleChartRightSource3"></el-color-picker>
                <el-checkbox v-model="singleChartRightUseArea4" style="margin-left: 10px;" class="custom-checkbox" :disabled="!singleChartRightSource3">填充</el-checkbox>
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
              <el-select v-model="upperChartSource1" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                <el-option label="<None>" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-color-picker v-model="upperChartColor1" placeholder="选择颜色"></el-color-picker>
              <el-checkbox v-model="upperChartUseArea1" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
            </div>
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
              <el-select v-model="upperChartSource2" placeholder="选择数据" style="width: 200px; margin-right: 10px;" :disabled="!upperChartSource1">
                <el-option label="<None>" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-color-picker v-model="upperChartColor2" placeholder="选择颜色" :disabled="!upperChartSource1"></el-color-picker>
              <el-checkbox v-model="upperChartUseArea2" style="margin-left: 10px;" class="custom-checkbox" :disabled="!upperChartSource1">填充</el-checkbox>
            </div>
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
              <el-select v-model="upperChartSource3" placeholder="选择数据" style="width: 200px; margin-right: 10px;" :disabled="!upperChartSource2">
                <el-option label="<None>" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-color-picker v-model="upperChartColor3" placeholder="选择颜色" :disabled="!upperChartSource2"></el-color-picker>
              <el-checkbox v-model="upperChartUseArea3" style="margin-left: 10px;" class="custom-checkbox" :disabled="!upperChartSource2">填充</el-checkbox>
            </div>
            <div style="display: flex; align-items: center;">
              <el-select v-model="upperChartSource4" placeholder="选择数据" style="width: 200px; margin-right: 10px;" :disabled="!upperChartSource3">
                <el-option label="<None>" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-color-picker v-model="upperChartColor4" placeholder="选择颜色" :disabled="!upperChartSource3"></el-color-picker>
              <el-checkbox v-model="upperChartUseArea4" style="margin-left: 10px;" class="custom-checkbox" :disabled="!upperChartSource3">填充</el-checkbox>
            </div>
            </div>
          </div>
          <div class="chart-config-section">
            <h4 style="margin-bottom: 10px;">下图表数据源（最多4个）：</h4>
            <div class="source-selectors">
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
              <el-select v-model="lowerChartSource1" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                <el-option label="<None>" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-color-picker v-model="lowerChartColor1" placeholder="选择颜色"></el-color-picker>
              <el-checkbox v-model="lowerChartUseArea1" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
            </div>
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
              <el-select v-model="lowerChartSource2" placeholder="选择数据" style="width: 200px; margin-right: 10px;" :disabled="!lowerChartSource1">
                <el-option label="<None>" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-color-picker v-model="lowerChartColor2" placeholder="选择颜色" :disabled="!lowerChartSource1"></el-color-picker>
              <el-checkbox v-model="lowerChartUseArea2" style="margin-left: 10px;" class="custom-checkbox" :disabled="!lowerChartSource1">填充</el-checkbox>
            </div>
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
              <el-select v-model="lowerChartSource3" placeholder="选择数据" style="width: 200px; margin-right: 10px;" :disabled="!lowerChartSource2">
                <el-option label="<None>" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-color-picker v-model="lowerChartColor3" placeholder="选择颜色" :disabled="!lowerChartSource2"></el-color-picker>
              <el-checkbox v-model="lowerChartUseArea3" style="margin-left: 10px;" class="custom-checkbox" :disabled="!lowerChartSource2">填充</el-checkbox>
            </div>
            <div style="display: flex; align-items: center;">
              <el-select v-model="lowerChartSource4" placeholder="选择数据" style="width: 200px; margin-right: 10px;" :disabled="!lowerChartSource3">
                <el-option label="<None>" value=""></el-option>
                <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
              </el-select>
              <el-color-picker v-model="lowerChartColor4" placeholder="选择颜色" :disabled="!lowerChartSource3"></el-color-picker>
              <el-checkbox v-model="lowerChartUseArea4" style="margin-left: 10px;" class="custom-checkbox" :disabled="!lowerChartSource3">填充</el-checkbox>
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
                <el-select v-model="upperChartLeftSource1" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="upperChartLeftColor1" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="upperChartLeftUseArea1" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="upperChartLeftSource2" placeholder="选择数据" style="width: 200px; margin-right: 10px;" :disabled="!upperChartLeftSource1">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="upperChartLeftColor2" placeholder="选择颜色" :disabled="!upperChartLeftSource1"></el-color-picker>
                <el-checkbox v-model="upperChartLeftUseArea2" style="margin-left: 10px;" class="custom-checkbox" :disabled="!upperChartLeftSource1">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="upperChartLeftSource3" placeholder="选择数据" style="width: 200px; margin-right: 10px;" :disabled="!upperChartLeftSource2">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="upperChartLeftColor3" placeholder="选择颜色" :disabled="!upperChartLeftSource2"></el-color-picker>
                <el-checkbox v-model="upperChartLeftUseArea3" style="margin-left: 10px;" class="custom-checkbox" :disabled="!upperChartLeftSource2">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center;">
                <el-select v-model="upperChartLeftSource4" placeholder="选择数据" style="width: 200px; margin-right: 10px;" :disabled="!upperChartLeftSource3">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="upperChartLeftColor4" placeholder="选择颜色" :disabled="!upperChartLeftSource3"></el-color-picker>
                <el-checkbox v-model="upperChartLeftUseArea4" style="margin-left: 10px;" class="custom-checkbox" :disabled="!upperChartLeftSource3">填充</el-checkbox>
              </div>
            </div>
          </div>
          <div class="chart-config-section">
            <h4 style="margin-bottom: 10px;">上图右Y轴数据（最多4个）：</h4>
            <div class="source-selectors">
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="upperChartRightSource1" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="upperChartRightColor1" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="upperChartRightUseArea1" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="upperChartRightSource2" placeholder="选择数据" style="width: 200px; margin-right: 10px;" :disabled="!upperChartRightSource1">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="upperChartRightColor2" placeholder="选择颜色" :disabled="!upperChartRightSource1"></el-color-picker>
                <el-checkbox v-model="upperChartRightUseArea2" style="margin-left: 10px;" class="custom-checkbox" :disabled="!upperChartRightSource1">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="upperChartRightSource3" placeholder="选择数据" style="width: 200px; margin-right: 10px;" :disabled="!upperChartRightSource2">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="upperChartRightColor3" placeholder="选择颜色" :disabled="!upperChartRightSource2"></el-color-picker>
                <el-checkbox v-model="upperChartRightUseArea3" style="margin-left: 10px;" class="custom-checkbox" :disabled="!upperChartRightSource2">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center;">
                <el-select v-model="upperChartRightSource4" placeholder="选择数据" style="width: 200px; margin-right: 10px;" :disabled="!upperChartRightSource3">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="upperChartRightColor4" placeholder="选择颜色" :disabled="!upperChartRightSource3"></el-color-picker>
                <el-checkbox v-model="upperChartRightUseArea4" style="margin-left: 10px;" class="custom-checkbox" :disabled="!upperChartRightSource3">填充</el-checkbox>
              </div>
            </div>
          </div>
          <div class="chart-config-section">
            <h4 style="margin-bottom: 10px;">下图左Y轴数据（最多4个）：</h4>
            <div class="source-selectors">
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="lowerChartLeftSource1" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="lowerChartLeftColor1" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="lowerChartLeftUseArea1" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="lowerChartLeftSource2" placeholder="选择数据" style="width: 200px; margin-right: 10px;" :disabled="!lowerChartLeftSource1">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="lowerChartLeftColor2" placeholder="选择颜色" :disabled="!lowerChartLeftSource1"></el-color-picker>
                <el-checkbox v-model="lowerChartLeftUseArea2" style="margin-left: 10px;" class="custom-checkbox" :disabled="!lowerChartLeftSource1">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="lowerChartLeftSource3" placeholder="选择数据" style="width: 200px; margin-right: 10px;" :disabled="!lowerChartLeftSource2">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="lowerChartLeftColor3" placeholder="选择颜色" :disabled="!lowerChartLeftSource2"></el-color-picker>
                <el-checkbox v-model="lowerChartLeftUseArea3" style="margin-left: 10px;" class="custom-checkbox" :disabled="!lowerChartLeftSource2">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center;">
                <el-select v-model="lowerChartLeftSource4" placeholder="选择数据" style="width: 200px; margin-right: 10px;" :disabled="!lowerChartLeftSource3">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="lowerChartLeftColor4" placeholder="选择颜色" :disabled="!lowerChartLeftSource3"></el-color-picker>
                <el-checkbox v-model="lowerChartLeftUseArea4" style="margin-left: 10px;" class="custom-checkbox" :disabled="!lowerChartLeftSource3">填充</el-checkbox>
              </div>
            </div>
          </div>
          <div class="chart-config-section">
            <h4 style="margin-bottom: 10px;">下图右Y轴数据（最多4个）：</h4>
            <div class="source-selectors">
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="lowerChartRightSource1" placeholder="选择数据" style="width: 200px; margin-right: 10px;">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="lowerChartRightColor1" placeholder="选择颜色"></el-color-picker>
                <el-checkbox v-model="lowerChartRightUseArea1" style="margin-left: 10px;" class="custom-checkbox">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="lowerChartRightSource2" placeholder="选择数据" style="width: 200px; margin-right: 10px;" :disabled="!lowerChartRightSource1">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="lowerChartRightColor2" placeholder="选择颜色" :disabled="!lowerChartRightSource1"></el-color-picker>
                <el-checkbox v-model="lowerChartRightUseArea2" style="margin-left: 10px;" class="custom-checkbox" :disabled="!lowerChartRightSource1">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <el-select v-model="lowerChartRightSource3" placeholder="选择数据" style="width: 200px; margin-right: 10px;" :disabled="!lowerChartRightSource2">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="lowerChartRightColor3" placeholder="选择颜色" :disabled="!lowerChartRightSource2"></el-color-picker>
                <el-checkbox v-model="lowerChartRightUseArea3" style="margin-left: 10px;" class="custom-checkbox" :disabled="!lowerChartRightSource2">填充</el-checkbox>
              </div>
              <div style="display: flex; align-items: center;">
                <el-select v-model="lowerChartRightSource4" placeholder="选择数据" style="width: 200px; margin-right: 10px;" :disabled="!lowerChartRightSource3">
                  <el-option label="<None>" value=""></el-option>
                  <el-option v-for="source in availableSources" :key="source" :label="source" :value="source"></el-option>
                </el-select>
                <el-color-picker v-model="lowerChartRightColor4" placeholder="选择颜色" :disabled="!lowerChartRightSource3"></el-color-picker>
                <el-checkbox v-model="lowerChartRightUseArea4" style="margin-left: 10px;" class="custom-checkbox" :disabled="!lowerChartRightSource3">填充</el-checkbox>
              </div>
            </div>
          </div>
        </div>
      </div>
      

    </div>
    <template #footer>
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

// 初始化数据流处理
const { flowData, initRawData, clearRawData } = useFlow()
const { searchQuery, performSearch } = useConsole()

// 初始化视图配置处理
const { 
  // 状态变量
  viewConfigDialogVisible,
  viewLayout,
  yAxisConfig,

  // 单图单Y轴
  singleChartSource1,
  singleChartSource2,
  singleChartSource3,
  singleChartSource4,
  singleChartColor1,
  singleChartColor2,
  singleChartColor3,
  singleChartColor4,
  singleChartUseArea1,
  singleChartUseArea2,
  singleChartUseArea3,
  singleChartUseArea4,

  // 单图双Y轴
  singleChartLeftSource1,
  singleChartLeftSource2,
  singleChartLeftSource3,
  singleChartLeftSource4,
  singleChartRightSource1,
  singleChartRightSource2,
  singleChartRightSource3,
  singleChartRightSource4,
  singleChartLeftColor1,
  singleChartLeftColor2,
  singleChartLeftColor3,
  singleChartLeftColor4,
  singleChartRightColor1,
  singleChartRightColor2,
  singleChartRightColor3,
  singleChartRightColor4,
  singleChartLeftUseArea1,
  singleChartLeftUseArea2,
  singleChartLeftUseArea3,
  singleChartLeftUseArea4,
  singleChartRightUseArea1,
  singleChartRightUseArea2,
  singleChartRightUseArea3,
  singleChartRightUseArea4,

  // 双图单Y轴
  upperChartSource1,
  upperChartSource2,
  upperChartSource3,
  upperChartSource4,
  lowerChartSource1,
  lowerChartSource2,
  lowerChartSource3,
  lowerChartSource4,
  upperChartColor1,
  upperChartColor2,
  upperChartColor3,
  upperChartColor4,
  lowerChartColor1,
  lowerChartColor2,
  lowerChartColor3,
  lowerChartColor4,
  upperChartUseArea1,
  upperChartUseArea2,
  upperChartUseArea3,
  upperChartUseArea4,
  lowerChartUseArea1,
  lowerChartUseArea2,
  lowerChartUseArea3,
  lowerChartUseArea4,

  // 双图双Y轴
  upperChartLeftSource1,
  upperChartLeftSource2,
  upperChartLeftSource3,
  upperChartLeftSource4,
  upperChartRightSource1,
  upperChartRightSource2,
  upperChartRightSource3,
  upperChartRightSource4,
  lowerChartLeftSource1,
  lowerChartLeftSource2,
  lowerChartLeftSource3,
  lowerChartLeftSource4,
  lowerChartRightSource1,
  lowerChartRightSource2,
  lowerChartRightSource3,
  lowerChartRightSource4,
  upperChartLeftColor1,
  upperChartLeftColor2,
  upperChartLeftColor3,
  upperChartLeftColor4,
  upperChartRightColor1,
  upperChartRightColor2,
  upperChartRightColor3,
  upperChartRightColor4,
  lowerChartLeftColor1,
  lowerChartLeftColor2,
  lowerChartLeftColor3,
  lowerChartLeftColor4,
  lowerChartRightColor1,
  lowerChartRightColor2,
  lowerChartRightColor3,
  lowerChartRightColor4,
  upperChartLeftUseArea1,
  upperChartLeftUseArea2,
  upperChartLeftUseArea3,
  upperChartLeftUseArea4,
  upperChartRightUseArea1,
  upperChartRightUseArea2,
  upperChartRightUseArea3,
  upperChartRightUseArea4,
  lowerChartLeftUseArea1,
  lowerChartLeftUseArea2,
  lowerChartLeftUseArea3,
  lowerChartLeftUseArea4,
  lowerChartRightUseArea1,
  lowerChartRightUseArea2,
  lowerChartRightUseArea3,
  lowerChartRightUseArea4,

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
  hasData,
  availableSources,
  // 方法
  showViewConfig,
  onYAxisChange,
  onLayoutChange,
  applyViewConfig
} = useDataConfig(flowData)

const chartRef = ref<HTMLDivElement>()
let chart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null

const largeDataOptions = computed(() => {
  if (flowData.value.plotTime && flowData.value.plotTime.length > 500) {
    return {
      showSymbol: false,
      large: true,
      largeThreshold: 5000,
      progressive: 5000,
      progressiveThreshold: 10000,
      animation: false,
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

// 验证并应用配置
function validateAndApplyConfig(config: any) {
  // 验证必要字段
  if (!config.viewLayout && !config.yAxisConfig) {
    throw new Error('配置文件缺少必要的布局配置')
  }
  
  // 应用布局配置
  if (config.viewLayout) {
    if (['single', 'double'].includes(config.viewLayout)) {
      viewLayout.value = config.viewLayout
    } else {
      console.warn('无效的viewLayout值，使用默认值')
    }
  }
  
  // 应用Y轴配置
  if (config.yAxisConfig) {
    if (['single', 'double'].includes(config.yAxisConfig)) {
      yAxisConfig.value = config.yAxisConfig
    } else {
      console.warn('无效的yAxisConfig值，使用默认值')
    }
  }
  
  // 应用数据源配置（如果有）
  applyDataSourceConfig(config)
  
  // 应用配置并更新图表
  applyViewConfig(() => {
    createChart()
  })
}

// 应用数据源配置
function applyDataSourceConfig(config: any) {
  // 单图模式下的数据源配置
  if (config.viewLayout === 'single' && config.sources) {
    if (config.yAxisConfig === 'single') {
      // 单Y轴模式
      singleChartSource1.value = config.sources.source1 || ''
      singleChartSource2.value = config.sources.source2 || ''
      singleChartSource3.value = config.sources.source3 || ''
      singleChartSource4.value = config.sources.source4 || ''
      // 应用颜色配置
      if (config.colors) {
        singleChartColor1.value = config.colors.source1 || ''
        singleChartColor2.value = config.colors.source2 || ''
        singleChartColor3.value = config.colors.source3 || ''
        singleChartColor4.value = config.colors.source4 || ''
      }
      // 应用区域配置
      if (config.area) {
        singleChartUseArea1.value = config.area.left1 || ''
        singleChartUseArea2.value = config.area.left2 || ''
        singleChartUseArea3.value = config.area.left3 || ''
        singleChartUseArea4.value = config.area.left4 || ''
      }
    } else if (config.yAxisConfig === 'double') {
      // 单图双Y轴模式
      singleChartLeftSource1.value = config.sources.left1 || ''
      singleChartLeftSource2.value = config.sources.left2 || ''
      singleChartLeftSource3.value = config.sources.left3 || ''
      singleChartLeftSource4.value = config.sources.left4 || ''
      singleChartRightSource1.value = config.sources.right1 || ''
      singleChartRightSource2.value = config.sources.right2 || ''
      singleChartRightSource3.value = config.sources.right3 || ''
      singleChartRightSource4.value = config.sources.right4 || ''
      // 应用颜色配置
      if (config.colors) {
        singleChartLeftColor1.value = config.colors.left1 || ''
        singleChartLeftColor2.value = config.colors.left2 || ''
        singleChartLeftColor3.value = config.colors.left3 || ''
        singleChartLeftColor4.value = config.colors.left4 || ''
        singleChartRightColor1.value = config.colors.right1 || ''
        singleChartRightColor2.value = config.colors.right2 || ''
        singleChartRightColor3.value = config.colors.right3 || ''
        singleChartRightColor4.value = config.colors.right4 || ''
      }
      // 应用区域配置
      if (config.area) {
        singleChartLeftUseArea1.value = config.area.left1 || ''
        singleChartLeftUseArea2.value = config.area.left2 || ''
        singleChartLeftUseArea3.value = config.area.left3 || ''
        singleChartLeftUseArea4.value = config.area.left4 || ''
        singleChartRightUseArea1.value = config.area.right1 || ''
        singleChartRightUseArea2.value = config.area.right2 || ''
        singleChartRightUseArea3.value = config.area.right3 || ''
        singleChartRightUseArea4.value = config.area.right4 || ''
      }
    }
  }
  
  // 双图模式下的数据源配置
  if (config.viewLayout === 'double') {
    // 上图数据源
    if (config.upperSources) {
      if (config.yAxisConfig === 'single') {
        upperChartSource1.value = config.upperSources.source1 || ''
        upperChartSource2.value = config.upperSources.source2 || ''
        upperChartSource3.value = config.upperSources.source3 || ''
        upperChartSource4.value = config.upperSources.source4 || ''
        // 应用颜色配置
        if (config.upperColors) {
          upperChartColor1.value = config.upperColors.source1 || ''
          upperChartColor2.value = config.upperColors.source2 || ''
          upperChartColor3.value = config.upperColors.source3 || ''
          upperChartColor4.value = config.upperColors.source4 || ''
        }
        // 应用区域配置
        if (config.upperArea) {
          upperChartUseArea1.value = config.upperArea.source1 || ''
          upperChartUseArea2.value = config.upperArea.source2 || ''
          upperChartUseArea3.value = config.upperArea.source3 || ''
          upperChartUseArea4.value = config.upperArea.source4 || ''
        }
      } else if (config.yAxisConfig === 'double') {
        upperChartLeftSource1.value = config.upperSources.left1 || ''
        upperChartLeftSource2.value = config.upperSources.left2 || ''
        upperChartLeftSource3.value = config.upperSources.left3 || ''
        upperChartLeftSource4.value = config.upperSources.left4 || ''
        upperChartRightSource1.value = config.upperSources.right1 || ''
        upperChartRightSource2.value = config.upperSources.right2 || ''
        upperChartRightSource3.value = config.upperSources.right3 || ''
        upperChartRightSource4.value = config.upperSources.right4 || ''
        // 应用颜色配置
        if (config.upperColors) {
          upperChartLeftColor1.value = config.upperColors.left1 || ''
          upperChartLeftColor2.value = config.upperColors.left2 || ''
          upperChartLeftColor3.value = config.upperColors.left3 || ''
          upperChartLeftColor4.value = config.upperColors.left4 || ''
          upperChartRightColor1.value = config.upperColors.right1 || ''
          upperChartRightColor2.value = config.upperColors.right2 || ''
          upperChartRightColor3.value = config.upperColors.right3 || ''
          upperChartRightColor4.value = config.upperColors.right4 || ''
        }
        // 应用区域配置
        if (config.upperArea) {
          upperChartLeftUseArea1.value = config.upperArea.left1 || ''
          upperChartLeftUseArea2.value = config.upperArea.left2 || ''
          upperChartLeftUseArea3.value = config.upperArea.left3 || ''
          upperChartLeftUseArea4.value = config.upperArea.left4 || ''
          upperChartRightUseArea1.value = config.upperArea.right1 || ''
          upperChartRightUseArea2.value = config.upperArea.right2 || ''
          upperChartRightUseArea3.value = config.upperArea.right3 || ''
          upperChartRightUseArea4.value = config.upperArea.right4 || ''
        }
      }
    }
    
    // 下图数据源
    if (config.lowerSources) {
      if (config.yAxisConfig === 'single') {
        lowerChartSource1.value = config.lowerSources.source1 || ''
        lowerChartSource2.value = config.lowerSources.source2 || ''
        lowerChartSource3.value = config.lowerSources.source3 || ''
        lowerChartSource4.value = config.lowerSources.source4 || ''
        // 应用颜色配置
        if (config.lowerColors) {
          lowerChartColor1.value = config.lowerColors.source1 || ''
          lowerChartColor2.value = config.lowerColors.source2 || ''
          lowerChartColor3.value = config.lowerColors.source3 || ''
          lowerChartColor4.value = config.lowerColors.source4 || ''
        }
        // 应用区域配置
        if (config.lowerArea) {
          lowerChartUseArea1.value = config.lowerArea.source1 || ''
          lowerChartUseArea2.value = config.lowerArea.source2 || ''
          lowerChartUseArea3.value = config.lowerArea.source3 || ''
          lowerChartUseArea4.value = config.lowerArea.source4 || ''
        }
      } else if (config.yAxisConfig === 'double') {
        lowerChartLeftSource1.value = config.lowerSources.left1 || ''
        lowerChartLeftSource2.value = config.lowerSources.left2 || ''
        lowerChartLeftSource3.value = config.lowerSources.left3 || ''
        lowerChartLeftSource4.value = config.lowerSources.left4 || ''
        lowerChartRightSource1.value = config.lowerSources.right1 || ''
        lowerChartRightSource2.value = config.lowerSources.right2 || ''
        lowerChartRightSource3.value = config.lowerSources.right3 || ''
        lowerChartRightSource4.value = config.lowerSources.right4 || ''
        // 应用颜色配置
        if (config.lowerColors) {
          lowerChartLeftColor1.value = config.lowerColors.left1 || ''
          lowerChartLeftColor2.value = config.lowerColors.left2 || ''
          lowerChartLeftColor3.value = config.lowerColors.left3 || ''
          lowerChartLeftColor4.value = config.lowerColors.left4 || ''
          lowerChartRightColor1.value = config.lowerColors.right1 || ''
          lowerChartRightColor2.value = config.lowerColors.right2 || ''
          lowerChartRightColor3.value = config.lowerColors.right3 || ''
          lowerChartRightColor4.value = config.lowerColors.right4 || ''
        }
        // 应用区域配置
        if (config.lowerArea) {
          lowerChartLeftUseArea1.value = config.lowerArea.left1 || ''
          lowerChartLeftUseArea2.value = config.lowerArea.left2 || ''
          lowerChartLeftUseArea3.value = config.lowerArea.left3 || ''
          lowerChartLeftUseArea4.value = config.lowerArea.left4 || ''
          lowerChartRightUseArea1.value = config.lowerArea.right1 || ''
          lowerChartRightUseArea2.value = config.lowerArea.right2 || ''
          lowerChartRightUseArea3.value = config.lowerArea.right3 || ''
          lowerChartRightUseArea4.value = config.lowerArea.right4 || ''
        }
      }
    }
  }
}

// 同时，为了方便用户，我们可以添加一个导出配置的功能
function exportConfigFile() {
  let config: any = {
    viewLayout: viewLayout.value,
    yAxisConfig: yAxisConfig.value
  }
  
  // 根据当前布局和Y轴配置收集数据源配置
  if (viewLayout.value === 'single') {
    if (yAxisConfig.value === 'single') {
      config.sources = {
        source1: singleChartSource1.value,
        source2: singleChartSource2.value,
        source3: singleChartSource3.value,
        source4: singleChartSource4.value
      }
      // 添加颜色配置
      config.colors = {
        source1: singleChartColor1.value,
        source2: singleChartColor2.value,
        source3: singleChartColor3.value,
        source4: singleChartColor4.value
      }
      config.area = {
        source1: singleChartUseArea1.value,
        source2: singleChartUseArea2.value,
        source3: singleChartUseArea3.value,
        source4: singleChartUseArea4.value,
      }
    } else {
      config.sources = {
        left1: singleChartLeftSource1.value,
        left2: singleChartLeftSource2.value,
        left3: singleChartLeftSource3.value,
        left4: singleChartLeftSource4.value,
        right1: singleChartRightSource1.value,
        right2: singleChartRightSource2.value,
        right3: singleChartRightSource3.value,
        right4: singleChartRightSource4.value
      }
      // 添加颜色配置
      config.colors = {
        left1: singleChartLeftColor1.value,
        left2: singleChartLeftColor2.value,
        left3: singleChartLeftColor3.value,
        left4: singleChartLeftColor4.value,
        right1: singleChartRightColor1.value,
        right2: singleChartRightColor2.value,
        right3: singleChartRightColor3.value,
        right4: singleChartRightColor4.value
      }
      // 添加区域配置
      config.area = {
        left1: singleChartLeftUseArea1.value,
        left2: singleChartLeftUseArea2.value,
        left3: singleChartLeftUseArea3.value,
        left4: singleChartLeftUseArea4.value,
        right1: singleChartRightUseArea1.value,
        right2: singleChartRightUseArea2.value,
        right3: singleChartRightUseArea3.value,
        right4: singleChartRightUseArea4.value,
      }
    }
  } else {
    config.upperSources = {};
    config.lowerSources = {};
    
    if (yAxisConfig.value === 'single') {
      config.upperSources = {
        source1: upperChartSource1.value,
        source2: upperChartSource2.value,
        source3: upperChartSource3.value,
        source4: upperChartSource4.value
      }
      config.lowerSources = {
        source1: lowerChartSource1.value,
        source2: lowerChartSource2.value,
        source3: lowerChartSource3.value,
        source4: lowerChartSource4.value
      }
      // 添加颜色配置
      config.upperColors = {
        source1: upperChartColor1.value,
        source2: upperChartColor2.value,
        source3: upperChartColor3.value,
        source4: upperChartColor4.value
      }
      config.lowerColors = {
        source1: lowerChartColor1.value,
        source2: lowerChartColor2.value,
        source3: lowerChartColor3.value,
        source4: lowerChartColor4.value
      }
      // 添加区域配置
      config.upperArea = {
        source1: upperChartUseArea1.value,
        source2: upperChartUseArea2.value,
        source3: upperChartUseArea3.value,
        source4: upperChartUseArea4.value,
      }
      config.lowerArea = {
        source1: lowerChartUseArea1.value,
        source2: lowerChartUseArea2.value,
        source3: lowerChartUseArea3.value,
        source4: lowerChartUseArea4.value,
      }
    } else {
      config.upperSources = {
        left1: upperChartLeftSource1.value,
        left2: upperChartLeftSource2.value,
        left3: upperChartLeftSource3.value,
        left4: upperChartLeftSource4.value,
        right1: upperChartRightSource1.value,
        right2: upperChartRightSource2.value,
        right3: upperChartRightSource3.value,
        right4: upperChartRightSource4.value
      }
      config.lowerSources = {
        left1: lowerChartLeftSource1.value,
        left2: lowerChartLeftSource2.value,
        left3: lowerChartLeftSource3.value,
        left4: lowerChartLeftSource4.value,
        right1: lowerChartRightSource1.value,
        right2: lowerChartRightSource2.value,
        right3: lowerChartRightSource3.value,
        right4: lowerChartRightSource4.value
      }
      // 添加颜色配置
      config.upperColors = {
        left1: upperChartLeftColor1.value,
        left2: upperChartLeftColor2.value,
        left3: upperChartLeftColor3.value,
        left4: upperChartLeftColor4.value,
        right1: upperChartRightColor1.value,
        right2: upperChartRightColor2.value,
        right3: upperChartRightColor3.value,
        right4: upperChartRightColor4.value
      }
      config.lowerColors = {
        left1: lowerChartLeftColor1.value,
        left2: lowerChartLeftColor2.value,
        left3: lowerChartLeftColor3.value,
        left4: lowerChartLeftColor4.value,
        right1: lowerChartRightColor1.value,
        right2: lowerChartRightColor2.value,
        right3: lowerChartRightColor3.value,
        right4: lowerChartRightColor4.value
      }
      // 添加区域配置
      config.upperArea = {
        left1: upperChartLeftUseArea1.value,
        left2: upperChartLeftUseArea2.value,
        left3: upperChartLeftUseArea3.value,
        left4: upperChartLeftUseArea4.value,
        right1: upperChartRightUseArea1.value,
        right2: upperChartRightUseArea2.value,
        right3: upperChartRightUseArea3.value,
        right4: upperChartRightUseArea4.value,
      }
      config.lowerArea = {
        left1: lowerChartLeftUseArea1.value,
        left2: lowerChartLeftUseArea2.value,
        left3: lowerChartLeftUseArea3.value,
        left4: lowerChartLeftUseArea4.value,
        right1: lowerChartRightUseArea1.value,
        right2: lowerChartRightUseArea2.value,
        right3: lowerChartRightUseArea3.value,
        right4: lowerChartRightUseArea4.value,
      }
    }
  }
  
  // 创建下载链接
  const dataStr = JSON.stringify(config, null, 2)
  const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr)
  
  const exportFileDefaultName = `flow_chart_config_${new Date().toISOString().slice(0,10)}.json`
  
  const linkElement = document.createElement('a')
  linkElement.setAttribute('href', dataUri)
  linkElement.setAttribute('download', exportFileDefaultName)
  linkElement.click()
}

// 消息格式对话框相关
const messageDialogVisible = ref(false)
const configFileInput = ref<HTMLInputElement>()

// 显示消息格式对话框
function showMessageFormat() {
  messageDialogVisible.value = true
}

// 处理文件上传
const handleFileUpload = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  
  if (file) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      try {
        initRawData(content)
        updateChart()
        ElMessage({
          message: `数据加载成功`,
          type: 'success',
          placement: 'bottom-right',
          offset: 50,
        })
      } catch (error) {
        ElMessage({
          message: `数据加载失败`,
          type: 'error',
          placement: 'bottom-right',
          offset: 50,
        })
        console.error('数据加载失败:', error)
      }
    }
    
    reader.readAsText(file)
    
    // 清空input以允许重复选择同一文件
    target.value = ''
  }
}

// 首先在导入部分添加clearAllCustomStatus
import { useFlowStore } from '@/stores/flow'

// 在script setup中初始化store
const flowStore = useFlowStore()

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

// 注意alignTicks: true与自定义的 min 和 max 值两者不要同时设定，当这两个设置同时使用时，ECharts无法找到合适的刻度间隔，导致刻度可能会非常密集，影响可读性。
function maintainScale(allData: LineSeriesOption[]) {
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
  if (!chart || !hasData.value) {
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
          result += `${timeMarker}time: ${(params[0].data[0]+flowData.value.startTime).toFixed(3)}<br/>`
          
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
      xAxis: { type: 'value', name: 't' },
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
    const rawTime = Number(value[0]) + (flowData.value.startTime ?? 0);
    const parts = rawTime.toString().split('.');
    const targetTime = parts[0] + (parts[1] ? '.' + parts[1].substring(0, 2) : '.00');

    searchQuery.value = targetTime;
    performSearch();
  }
}

// 生成随机颜色的辅助函数
function getRandomColor(excludeColor: any, index: number) {
  const color = [
    '#5470c6',  // 蓝
    '#91cc75',  // 绿
    '#fac858',  // 黄
    '#ee6666',  // 红
    '#73c0de',  // 青
    '#3ba272',  // 深绿
    '#fc8452',  // 橙
    '#9a60b4',  // 紫
    '#ea7ccc',  // 粉
    '#ffbd52',  // 浅橙
    '#33baab',  // 蓝绿
    '#ffdb5c',  // 浅黄
    '#8293f0',  // 浅蓝
    '#c1232b'   // 深红
  ]
  const cycle_index = index % color.length;
  excludeColor.value = color[cycle_index];

  return color[cycle_index];
}

// 创建图表选项
function createChartOption() {
  if (viewLayout.value === 'single') {
    // 单图模式
    let series: LineSeriesOption[] = [];
    let minMax: { y1Min: number; y1Max: number; y2Min: number; y2Max: number } | false = false;
    
    if (yAxisConfig.value === 'single') {
      // 单图单Y轴模式
      series = singleChartSources.value.map((source, index) => {
        // 获取对应的颜色配置
        const colorMap = [singleChartColor1, singleChartColor2, singleChartColor3, singleChartColor4];
        const areaMap = [singleChartUseArea1, singleChartUseArea2, singleChartUseArea3, singleChartUseArea4];
        const color = colorMap[index].value || getRandomColor(colorMap[index], index);
        
        const seriesData = (flowData.value[source] as any[]).map((value: any, idx: number) => [
          flowData.value.plotTime![idx], value
        ]);
        
        return {
          name: source, // 不再替换下划线
          type: 'line',
          data: seriesData,
          symbolSize: 4,
          smooth: true,
          yAxisIndex: 0,
          color: color,
          areaStyle: {
            color: areaMap[index].value ? color : 'transparent'
          },
          ...largeDataOptions.value,
        }
      });
    } else {
      // 单图双Y轴模式
      const leftSeries: LineSeriesOption[] = singleChartLeftSources.value.map((source, index) => {
        const seriesData = (flowData.value[source] as any[]).map((value: any, idx: number) => [
          flowData.value.plotTime![idx], value
        ]);

        // 获取左侧Y轴对应的颜色配置
        const colorMap = [singleChartLeftColor1, singleChartLeftColor2, singleChartLeftColor3, singleChartLeftColor4];
        const areaMap = [singleChartLeftUseArea1, singleChartLeftUseArea2, singleChartLeftUseArea3, singleChartLeftUseArea4];
        const color = colorMap[index].value || getRandomColor(colorMap[index], index);
        
        return {
          name: source, // 不再替换下划线
          type: 'line',
          data: seriesData,
          symbolSize: 4,
          smooth: true,
          yAxisIndex: 0,
          color: color,
          areaStyle: {
            color: areaMap[index].value ? color : 'transparent'
          },
          ...largeDataOptions.value,
        }
      });
      
      const rightSeries: LineSeriesOption[] = singleChartRightSources.value.map((source, index) => {
        // 获取右侧Y轴对应的颜色配置
        const colorMap = [singleChartRightColor1, singleChartRightColor2, singleChartRightColor3, singleChartRightColor4];
        const areaMap = [singleChartRightUseArea1, singleChartRightUseArea2, singleChartRightUseArea3, singleChartRightUseArea4];
        const color = colorMap[index].value || getRandomColor(colorMap[index], index+singleChartLeftSources.value.length);
        
        const seriesData = (flowData.value[source] as any[]).map((value: any, idx: number) => [
          flowData.value.plotTime![idx], value
        ]);
        
        return {
          name: source, // 不再替换下划线
          type: 'line',
          data: seriesData,
          symbolSize: 4,
          smooth: true,
          yAxisIndex: 1,
          color: color,
          areaStyle: {
            color: areaMap[index].value ? color : 'transparent'
          },
          ...largeDataOptions.value,
        }
      });
      
      series = [...leftSeries, ...rightSeries];
      
      // 计算双Y轴对齐范围
      minMax = maintainScale(series);
    }

    return {
      title: {
        left: 'center',
        textStyle: { fontSize: 14 }
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          if (params.length === 0) return '';
          
          let result = `显示时间: ${params[0].data[0].toFixed(3)}s<br/>`

          const timeMarker = `<div style="line-height:16px;display:inline-block;vertical-align:middle;margin-right:4px;">
            <svg width="12" height="12" viewBox="0 0 24 24"
                fill="none" stroke="grey" stroke-width="2">
              <circle cx="12" cy="12" r="9"/>
              <path d="M12 7v5l3 3"/>
            </svg>
          </div>`
          result += `${timeMarker}time: ${(params[0].data[0]+flowData.value.startTime).toFixed(3)}<br/>`

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
        name: series.length < 2 ? 't' : '        t',
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
          axisLabel: {
            formatter: function(value: number) {
              return value.toFixed(2)
            }
          }
        },
        {
          type: 'value',
          // alignTicks: true,
          show: true,
          max: minMax ? minMax.y2Max : undefined,
          min: minMax ? minMax.y2Min : undefined,
          axisLabel: {
            formatter: function(value: number) {
              return value.toFixed(2)
            }
          }
        }
      ] : { type: 'value' },
      // zoomOnMouseWheel 只有 布尔 和 'ctrl' 两种有效值：
      // true / 省略 → 滚轮即触发
      // 'ctrl' → 必须 Ctrl + 滚轮才触发
      dataZoom: [
        { type: 'slider', show: true, xAxisIndex: 0, brushSelect: false },
        { type: 'inside', xAxisIndex: 0, zoomOnMouseWheel: true },
        { type: 'inside', yAxisIndex: 0, zoomOnMouseWheel: 'ctrl' },
        { type: 'inside', yAxisIndex: 1, zoomOnMouseWheel: 'ctrl' }
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
        const colorMap = [upperChartLeftColor1, upperChartLeftColor2, upperChartLeftColor3, upperChartLeftColor4];
        const areaMap = [upperChartLeftUseArea1, upperChartLeftUseArea2, upperChartLeftUseArea3, upperChartLeftUseArea4];
        const color = colorMap[index].value || getRandomColor(colorMap[index], index);

        const seriesData = (flowData.value[source] as any[]).map((value: any, idx: number) => [
          flowData.value.plotTime![idx], value
        ]);
        
        return {
          name: source,
          type: 'line',
          data: seriesData,
          symbolSize: 4,
          smooth: true,
          yAxisIndex: 0,
          color: color,
          areaStyle: {
            color: areaMap[index].value ? color : 'transparent'
          },
          ...largeDataOptions.value,
        }
      });
      
      // 上图表右侧Y轴数据
      upperSeries.push(...upperChartRightSources.value.map((source, index) => {
        const colorMap = [upperChartRightColor1, upperChartRightColor2, upperChartRightColor3, upperChartRightColor4];
        const areaMap = [upperChartRightUseArea1, upperChartRightUseArea2, upperChartRightUseArea3, upperChartRightUseArea4];
        const color = colorMap[index].value || getRandomColor(colorMap[index], index+upperChartLeftSources.value.length);

        const seriesData = (flowData.value[source] as any[]).map((value: any, idx: number) => [
          flowData.value.plotTime![idx], value
        ]);
        
        return {
          name: source,
          type: 'line',
          data: seriesData,
          symbolSize: 4,
          smooth: true,
          yAxisIndex: 1,
          color: color,
          areaStyle: {
            color: areaMap[index].value ? color : 'transparent'
          },
          ...largeDataOptions.value,
        }
      }));
      
      // 下图表左侧Y轴数据
      lowerSeries = lowerChartLeftSources.value.map((source, index) => {
        const colorMap = [lowerChartLeftColor1, lowerChartLeftColor2, lowerChartLeftColor3, lowerChartLeftColor4];
        const areaMap = [lowerChartLeftUseArea1, lowerChartLeftUseArea2, lowerChartLeftUseArea3, lowerChartLeftUseArea4];
        const color = colorMap[index].value || getRandomColor(colorMap[index], index);

        const seriesData = (flowData.value[source] as any[]).map((value: any, idx: number) => [
          flowData.value.plotTime![idx], value
        ]);
        
        return {
          name: source,
          type: 'line',
          data: seriesData,
          symbolSize: 4,
          smooth: true,
          yAxisIndex: 2,
          color: color,
          areaStyle: {
            color: areaMap[index].value ? color : 'transparent'
          },
          ...largeDataOptions.value,
        }
      });
      
      // 下图表右侧Y轴数据
      lowerSeries.push(...lowerChartRightSources.value.map((source, index) => {
        const colorMap = [lowerChartRightColor1, lowerChartRightColor2, lowerChartRightColor3, lowerChartRightColor4];
        const areaMap = [lowerChartRightUseArea1, lowerChartRightUseArea2, lowerChartRightUseArea3, lowerChartRightUseArea4];
        const color = colorMap[index].value || getRandomColor(colorMap[index], index+lowerChartLeftSources.value.length);

        const seriesData = (flowData.value[source] as any[]).map((value: any, idx: number) => [
          flowData.value.plotTime![idx], value
        ]);
        
        return {
          name: source,
          type: 'line',
          data: seriesData,
          symbolSize: 4,
          smooth: true,
          yAxisIndex: 3,
          color: color,
          areaStyle: {
            color: areaMap[index].value ? color : 'transparent'
          },
          ...largeDataOptions.value,
        }
      }));
      
      // 计算每个图表的Y轴对齐范围
      if (upperSeries.length > 0) {
        // 只提取上图表的Y轴0和1的数据进行计算
        const upperChartData = upperSeries.filter(s => s.yAxisIndex === 0 || s.yAxisIndex === 1) as LineSeriesOption[];
        upperMinMax = maintainScale(upperChartData);
        console.log('上图表Y轴对齐范围upperMinMax:', upperMinMax);
      }
      
      if (lowerSeries.length > 0) {
        // 只提取下图表的Y轴2和3的数据进行计算，并将索引调整为0和1
        const lowerChartData = lowerSeries.filter(s => s.yAxisIndex === 2 || s.yAxisIndex === 3) as LineSeriesOption[];
        lowerMinMax = maintainScale(lowerChartData);
        console.log('下图表Y轴对齐范围lowerMinMax:', lowerMinMax);
      }
    } else {
      // 双图单Y轴模式 - 上图表
      upperSeries = upperChartSources.value.map((source, index) => {
        const colorMap = [upperChartColor1, upperChartColor2, upperChartColor3, upperChartColor4];
        const areaMap = [upperChartUseArea1, upperChartUseArea2, upperChartUseArea3, upperChartUseArea4];
        const color = colorMap[index].value || getRandomColor(colorMap[index], index);

        // 添加安全检查
        const sourceData = flowData.value[source];
        const seriesData = Array.isArray(sourceData) 
        ? sourceData.map((value: any, idx: number) => [flowData.value.plotTime![idx], value])
        : [];
        
        return {
          name: source,
          type: 'line',
          data: seriesData,
          symbolSize: 4,
          smooth: true,
          yAxisIndex: 0,
          color: color,
          areaStyle: {
            color: areaMap[index].value ? color : 'transparent'
          },
          ...largeDataOptions.value,
        }
      });
      
      // 双图单Y轴模式 - 下图表
      lowerSeries = lowerChartSources.value.map((source, index) => {
        const colorMap = [lowerChartColor1, lowerChartColor2, lowerChartColor3, lowerChartColor4];
        const areaMap = [lowerChartUseArea1, lowerChartUseArea2, lowerChartUseArea3, lowerChartUseArea4];
        const color = colorMap[index].value || getRandomColor(colorMap[index], index+upperChartSources.value.length);

        // 添加安全检查
        const sourceData = flowData.value[source];
        const seriesData = Array.isArray(sourceData) 
        ? sourceData.map((value: any, idx: number) => [flowData.value.plotTime![idx], value])
        : [];

        return {
          name: source,
          type: 'line',
          data: seriesData,
          symbolSize: 4,
          smooth: true,
          yAxisIndex: 1,
          color: color,
          areaStyle: {
            color: areaMap[index].value ? color : 'transparent'
          },
          ...largeDataOptions.value,
        }
      });
    }
    
    // 修复双图双Y轴模式下的yAxis配置
    const yAxisConfigArray = [];
    if (yAxisConfig.value === 'double') {
      // 双图双Y轴模式，每个图表都有左右两个Y轴
      yAxisConfigArray.push(
        {
          type: 'value', 
          // alignTicks: true, 
          gridIndex: 0,
          max: upperMinMax ? upperMinMax.y1Max : undefined,
          min: upperMinMax ? upperMinMax.y1Min : undefined,
          axisLabel: {
            formatter: function(value: number) {
              return value.toFixed(2)
            }
          }
        },
        {
          type: 'value', 
          // alignTicks: true, 
          gridIndex: 0, 
          show: true,
          max: upperMinMax ? upperMinMax.y2Max : undefined,
          min: upperMinMax ? upperMinMax.y2Min : undefined,
          axisLabel: {
            formatter: function(value: number) {
              return value.toFixed(2)
            }
          }
        },
        {
          type: 'value', 
          // alignTicks: true, 
          gridIndex: 1,
          max: lowerMinMax ? lowerMinMax.y1Max : undefined,
          min: lowerMinMax ? lowerMinMax.y1Min : undefined,
          axisLabel: {
            formatter: function(value: number) {
              return value.toFixed(2)
            }
          }
        },
        {
          type: 'value', 
          // alignTicks: true, 
          gridIndex: 1, 
          show: true,
          max: lowerMinMax ? lowerMinMax.y2Max : undefined,
          min: lowerMinMax ? lowerMinMax.y2Min : undefined,
          axisLabel: {
            formatter: function(value: number) {
              return value.toFixed(2)
            }
          }
        }
      );
    } else {
      // 双图单Y轴模式
      yAxisConfigArray.push(
        { type: 'value', gridIndex: 0 },
        { type: 'value', gridIndex: 1 }
      );
    }
    
    // 合并所有系列数据，用于图例显示
    const allSeries = [...upperSeries, ...lowerSeries];
    
    return {
      title: { left: 'center', textStyle: { fontSize: 14 } },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          if (params.length === 0) return '';
          
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
          result += `${timeMarker}time: ${(params[0].data[0]+flowData.value.startTime).toFixed(3)}<br/>`
          
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
        { type: 'value', name: upperSeries.length < 2 ? 't' : '        t', gridIndex: 0, axisLabel: { formatter: (value: number) => value.toFixed(2) } },
        { type: 'value', name: lowerSeries.length < 2 ? 't' : '        t', gridIndex: 1, axisLabel: { formatter: (value: number) => value.toFixed(2) } }
      ],
      yAxis: yAxisConfigArray,
      dataZoom: [
        { type: 'slider', show: true, xAxisIndex: [0, 1], brushSelect: false },
        { type: 'inside', xAxisIndex: [0, 1], zoomOnMouseWheel: true },
        { type: 'inside', yAxisIndex: 0, zoomOnMouseWheel: 'ctrl' },
        { type: 'inside', yAxisIndex: 1, zoomOnMouseWheel: 'ctrl' },
        { type: 'inside', yAxisIndex: 2, zoomOnMouseWheel: 'ctrl' },
        { type: 'inside', yAxisIndex: 3, zoomOnMouseWheel: 'ctrl' }
      ],
      series: [
        // 上图表系列 - 添加gridIndex和xAxisIndex
        ...upperSeries.map(series => ({
          ...series,
          gridIndex: 0,
          xAxisIndex: 0,
          ...largeDataOptions.value,
        })),
        // 下图表系列 - 添加gridIndex和xAxisIndex
        ...lowerSeries.map(series => ({
          ...series,
          gridIndex: 1,
          xAxisIndex: 1,
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

function handleCtrlKeyDown(e: KeyboardEvent) {
  if (e.key === 'Control' || e.key === 'Meta') {
    // 禁用所有x轴的inside缩放
    chart?.setOption({ dataZoom: dataZoomPatch(true) }, { replaceMerge: ['dataZoom'] });
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
  startX: number;
  startY: number;
  isTouching: boolean;
}

const touchParams: touchEventParams = {
  startX: 0,
  startY: 0,
  isTouching: false,
}

function touchStartEvent(e: TouchEvent) {
  if (e.touches.length === 1) {
    touchParams.startX = e.touches[0].clientX
    touchParams.startY = e.touches[0].clientY
    touchParams.isTouching = true
    touchAxisZoom({ enableX: true, enableY: false })
  }
}

function touchMoveEvent(e: TouchEvent) {
  if (!touchParams.isTouching || e.touches.length !== 1) return
    
  const currentX = e.touches[0].clientX
  const deltaX = currentX - touchParams.startX

  const currentY = e.touches[0].clientY
  const deltaY = currentY - touchParams.startY
  
  // 只在有显著移动时触发拖拽
  if (Math.abs(deltaX) >= 5 || Math.abs(deltaY) >= 5) {
    const option = chart?.getOption()

    // 根据方向参数处理不同的拖动逻辑
    if (Math.abs(deltaX) >= Math.abs(deltaY)) {
      // touchAxisZoom({ enableX: true, enableY: false })
      // 水平拖动 - 控制X轴
      if (!Array.isArray(option?.dataZoom)) return
      const xAxisZoom = option.dataZoom.find((dz: any) =>
        dz.type === 'inside' && dz.xAxisIndex !== undefined
      )
      
      if (xAxisZoom) {
        // if (!chartRef.value) return
        const range = xAxisZoom.end - xAxisZoom.start
        const moveAmount = chartRef.value ? (deltaX / chartRef.value.clientWidth) * 100 : 0

        chart?.dispatchAction({
          type: 'dataZoom',
          xAxisIndex: xAxisZoom.xAxisIndex,
          start: Math.max(0, Math.min(100 - range, xAxisZoom.start + moveAmount)),
          end: Math.max(range, Math.min(100, xAxisZoom.end + moveAmount))
        })
        
        touchParams.startX = currentX;
        // touchAxisZoom({ enableX: true, enableY: true })
      }
    } else {
      // touchAxisZoom({ enableX: false, enableY: true })
      // 垂直拖动 - 控制Y轴
      if (!Array.isArray(option?.dataZoom)) return
      const yAxisZooms = option?.dataZoom?.filter((dz: any) => 
        dz.type === 'inside' && dz.yAxisIndex !== undefined
      )

      yAxisZooms?.forEach((yAxisZoom: any) => {
        const range = yAxisZoom.end - yAxisZoom.start
        const moveAmount = chartRef.value ? (deltaY / chartRef.value.clientHeight) * 100 : 0
        
        chart?.dispatchAction({
          type: 'dataZoom',
          yAxisIndex: yAxisZoom.yAxisIndex,
          start: Math.max(0, Math.min(100 - range, yAxisZoom.start - moveAmount)),
          end: Math.max(range, Math.min(100, yAxisZoom.end - moveAmount))
        })
      })
      
      touchParams.startY = currentY
      // touchAxisZoom({ enableX: true, enableY: true })
    }
  }
}

function touchEndEvent(e: TouchEvent) {
  touchParams.isTouching = false
  touchAxisZoom({ enableX: true, enableY: true })
}

function setupTouchEvents() {
  if (!chartRef.value) return

  touchParams.isTouching = false
  touchParams.startX = 0
  touchParams.startY = 0
  
  chartRef.value.addEventListener('touchstart', touchStartEvent, { passive: false }) // 触摸开始
  chartRef.value.addEventListener('touchmove', touchMoveEvent, { passive: false }) // 触摸移动
  chartRef.value.addEventListener('touchend', touchEndEvent, { passive: false }) // 触摸结束
}

// 组件挂载时初始化图表
onMounted(() => {
  createChart()
  
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
  () => flowData.value.plotTime?.length,
  () => {
    if (flowData.value.plotTime?.length) {
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

.el-button {
  font-size: 12px;
}

/* 移除原来的margin-left样式 */
.layout-btn {
  margin-left: 0;
}

/* 其他样式保持不变 */
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
