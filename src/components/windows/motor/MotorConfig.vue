<template>
  <div class="motor-config-container">
    <div class="controls">
      <div class="file-controls">
        <!-- 左侧按钮 -->
        <div class="left-buttons">
          <el-button
            type="default"
            size="small"
            class="config-btn"
            :disabled="activeReadCommands.size > 0"
            :title="activeReadCommands.size > 0 ? t('motor.stopPeriodicReadFirst') : t('motor.configureMotorCommand')"
            @click="showConfigDialog"
          >
            <el-icon><Setting /></el-icon>&nbsp;{{ t('motor.configButton') }}
          </el-button>
        </div>
      </div>
    </div>
    
    <div class="config-content">
      <MotorCommandPanel
        v-model:active-tab="activeControlTab"
        :read-commands="readCommands"
        :write-commands="writeCommands"
        :active-read-commands="activeReadCommands"
        :decimal-inputs="decimalInputs"
        :is-config-valid="isConfigValid"
        :get-data-count="getDataCount"
        :split-data="splitData"
        :get-data-input-key="getDataInputKey"
        @send-read="sendReadCommand"
        @send-write="sendWriteCommand"
        @single-input="handleSingleDecimalInput"
        @multi-input="updateDataValueWithDecimal"
      />
    </div>
    <!-- 配置对话框 -->
    <el-dialog
      v-model="configDialogVisible"
      :title="t('motor.dialogTitle')"
      class="app-dialog motor-config-dialog"
      width="min(1180px, calc(100vw - 32px))"
      :append-to-body="true"
      :z-index="8000"
      align-center
      :close-on-click-modal="true"
      :close-on-press-escape="true"
      :destroy-on-close="true"
      :before-close="handleDialogBeforeClose"
    >
      <template #header>
        <AppDialogTitle
          :icon="Setting"
          :title="t('motor.dialogTitleMain')"
          :description="t('motor.dialogDescription')"
        />
      </template>

      <div class="dialog-content">
        <section class="config-tool-card" :aria-label="t('motor.configToolTitle')">
          <div class="config-tool-copy">
            <div class="config-tool-icon">
              <el-icon><Setting /></el-icon>
            </div>
            <div>
              <div class="config-tool-title">{{ t('motor.configToolTitle') }}</div>
              <div class="config-tool-description">{{ t('motor.configToolDescription') }}</div>
            </div>
          </div>
          <div class="config-tool-actions">
            <el-upload
              ref="uploadRef"
              action="#"
              :auto-upload="false"
              :show-file-list="false"
              accept=".json"
              :on-change="handleFileLoad"
            >
              <template #trigger>
                <el-button :icon="Upload" size="default">{{ t('motor.loadConfig') }}</el-button>
              </template>
            </el-upload>
            <el-button :icon="Download" size="default" @click="downloadConfig">
              {{ t('motor.exportConfig') }}
            </el-button>
            <span class="config-tool-separator" aria-hidden="true"></span>
            <el-button
              type="warning"
              plain
              :icon="Refresh"
              size="default"
              @click="resetConfig"
            >
              {{ t('motor.restoreDefault') }}
            </el-button>
          </div>
        </section>

        <!-- 指令预览区域 -->
        <div class="command-preview-container">
          <div class="message-preview">
            <div 
              v-for="(field, index) in previewMessage" 
              :key="index"
              class="preview-cell"
              :title="field.label + ': ' + field.value"
            >
              <div class="cell-content">{{ field.value }}</div>
              <div class="cell-label">{{ field.label }}</div>
            </div>
          </div>
        </div>

        <el-alert
          v-if="configurationIssues.length"
          class="config-validation-alert"
          type="warning"
          :closable="false"
          show-icon
        >
          <template #title>{{ t('motor.configIssuesTitle', { n: configurationIssues.length }) }}</template>
          <div class="config-validation-list">
            <span v-for="issue in configurationIssues.slice(0, 4)" :key="issue">{{ issue }}</span>
            <span v-if="configurationIssues.length > 4">
              {{ t('motor.configIssuesMore', { n: configurationIssues.length - 4 }) }}
            </span>
          </div>
        </el-alert>

        <el-divider />

        <!-- 命令配置 Tab -->
        <el-tabs v-model="activeTab" type="border-card" class="command-tabs">
          <!-- 指令结构 Tab -->
          <el-tab-pane name="structure">
            <template #label>
              <span class="tab-label">
                <el-icon><Rank /></el-icon>
                {{ t('motor.structureTab') }}
              </span>
            </template>
            
            <!-- 基础配置 - 拖拽式报文结构 -->
            <div class="message-structure-container">
              <el-text type="info" size="small" style="margin-bottom: 15px; display: block;">
                {{ t('motor.dragHint') }}
              </el-text>
              
              <draggable
                v-model="messageStructure"
                item-key="id"
                tag="div"
                class="message-fields-container"
                :animation="200"
                easing="cubic-bezier(0.22, 1, 0.36, 1)"
                :force-fallback="true"
                :fallback-on-body="true"
                :fallback-tolerance="4"
                draggable=":not(.fixed-field)"
                ghost-class="structure-ghost"
                drag-class="structure-drag-clone"
                :filter="STRUCTURE_INTERACTIVE_SELECTOR"
                :prevent-on-filter="false"
                :move="onStructureMove"
                @end="onStructureDragEnd"
              >
                <template #item="{ element }">
                <div
                  :data-field-id="element.id"
                  class="message-field"
                  :class="{ 'fixed-field': element.fixed }"
                >
                    <div class="field-header">
                      <el-icon class="drag-handle"><Rank /></el-icon>
                      <span class="field-title">{{ element.title }}</span>
                      <el-tag size="small" :type="element.tagType">{{ element.tag }}</el-tag>
                    </div>
                    <div class="field-content">
                      <!-- 报头字段 -->
                      <div v-if="element.id === 'header'" class="field-config">
                        <el-input 
                          :model-value="configForm.header"
                          @input="handleHeaderInput"
                          :placeholder="t('motor.headerPlaceholder')"
                          size="small"
                          style="width: 110px;"
                        >
                          <template #prefix>
                            <el-icon><Key /></el-icon>
                          </template>
                        </el-input>
                      </div>
                      
                      <!-- 地址字段 -->
                      <div v-else-if="element.id === 'address'" class="field-config">
                        <el-switch :model-value="true" size="small" :active-text="t('motor.enabled')" disabled />
                        <el-select 
                          v-model="configForm.addressLength" 
                          popper-class="app-dialog-select-popper"
                          :placeholder="t('motor.byteLength')"
                          size="small"
                          style="width: 80px; margin-left: 8px;"
                          @change="normalizeAllCommands"
                        >
                          <el-option :label="t('motor.oneByte')" :value="1" />
                          <el-option :label="t('motor.twoByte')" :value="2" />
                        </el-select>
                      </div>
                      
                      <!-- 功能码字段 -->
                      <div v-else-if="element.id === 'function'" class="field-config">
                        <el-switch v-model="configForm.includeFunction" size="small" :active-text="t('motor.enabled')" />
                        <el-select 
                          v-model="configForm.functionLength" 
                          popper-class="app-dialog-select-popper"
                          :placeholder="t('motor.byteLength')"
                          size="small"
                          style="width: 80px; margin-left: 8px;"
                          :disabled="!configForm.includeFunction"
                          @change="normalizeAllCommands"
                        >
                          <el-option :label="t('motor.oneByte')" :value="1" />
                          <el-option :label="t('motor.twoByte')" :value="2" />
                        </el-select>
                      </div>
                      
                      <!-- 寄存器个数字段 -->
                      <div v-else-if="element.id === 'registerCount'" class="field-config">
                        <el-switch
                          v-model="configForm.includeRegisterCount"
                          size="small"
                          :active-text="t('motor.enabled')"
                          @change="handleGlobalRegisterCountChange"
                        />
                        <el-select 
                          v-model="configForm.registerCountLength" 
                          popper-class="app-dialog-select-popper"
                          :placeholder="t('motor.byteLength')"
                          size="small"
                          style="width: 80px; margin-left: 8px;"
                          :disabled="!configForm.includeRegisterCount"
                          @change="handleRegisterCountWidthChange"
                        >
                          <el-option :label="t('motor.oneByte')" :value="1" />
                          <el-option :label="t('motor.twoByte')" :value="2" />
                        </el-select>
                      </div>
                      
                      <!-- 长度字段 -->
                      <div v-else-if="element.id === 'length'" class="field-config">
                        <el-switch :model-value="true" size="small" :active-text="t('motor.enabled')" disabled />
                        <el-select 
                          v-model="configForm.lengthLength" 
                          popper-class="app-dialog-select-popper"
                          :placeholder="t('motor.byteLength')"
                          size="small"
                          style="width: 80px; margin-left: 8px;"
                        >
                          <el-option :label="t('motor.oneByte')" :value="1" />
                          <el-option :label="t('motor.twoByte')" :value="2" />
                        </el-select>
                      </div>
                      
                      <!-- 数据字段 -->
                      <div v-else-if="element.id === 'data'" class="field-config">
                        <el-switch :model-value="true" size="small" :active-text="t('motor.enabled')" disabled />
                        <el-select 
                          :model-value="configForm.dataEndianness"
                          popper-class="app-dialog-select-popper"
                          @change="handleDataEndiannessChange"
                          :placeholder="t('motor.endianness')"
                          size="small"
                          style="width: 80px; margin-left: 8px;"
                        >
                          <el-option :label="t('motor.bigEndian')" value="big" />
                          <el-option :label="t('motor.littleEndian')" value="little" />
                        </el-select>
                      </div>
                      
                      <!-- 校验和字段 -->
                      <div v-else-if="element.id === 'checksum'" class="field-config">
                        <el-select 
                          v-model="configForm.checksum.method" 
                          popper-class="app-dialog-select-popper"
                          :placeholder="t('motor.checksumMethod')"
                          size="small"
                          style="width: 90px;"
                        >
                          <el-option :label="t('motor.checksumNone')" value="none" />
                          <el-option :label="t('motor.checksumSum')" value="sum" />
                          <el-option :label="t('motor.checksumXor')" value="xor" />
                          <el-option :label="t('motor.checksumCrc8')" value="crc8" />
                          <el-option :label="t('motor.checksumCrc16')" value="crc16" />
                        </el-select>
                        <div class="checksum-params" v-if="configForm.checksum.method === 'crc16'">
                          <el-select 
                            v-model="configForm.checksum.endianness" 
                            popper-class="app-dialog-select-popper"
                            :placeholder="t('motor.endianness')"
                            size="small"
                            style="width: 80px;"
                          >
                            <el-option :label="t('motor.bigEndian')" value="big" />
                            <el-option :label="t('motor.littleEndian')" value="little" />
                          </el-select>
                        </div>
                        <div class="checksum-params" v-if="configForm.checksum.method && configForm.checksum.method !== 'none'">
                          <el-input-number 
                            v-model="configForm.checksum.start_index" 
                            :min="0" 
                            size="small"
                            controls-position="right"
                            style="width: 70px;"
                            :placeholder="t('motor.startIndexPlaceholder')"
                          />
                          <el-tooltip :content="t('motor.checksumStartTooltip')" placement="top">
                            <el-icon class="param-info"><InfoFilled /></el-icon>
                          </el-tooltip>
                        </div>
                      </div>
                    </div>
                </div>
                </template>
              </draggable>
            </div>
          </el-tab-pane>

          <el-tab-pane name="read">
            <template #label>
              <span class="tab-label">
                <el-icon><Upload /></el-icon>
                {{ t('motor.readTab') }}
                <el-tag size="small" type="info">{{ readCommands.length }}</el-tag>
              </span>
            </template>
            
            <div class="command-header">
              <el-text type="info" size="small">{{ t('motor.readCommandHint') }}</el-text>
              <el-button type="primary" size="small" @click="addMotorCommand('read')" :icon="Plus" :disabled="activeReadCommands.size > 0">
                {{ t('motor.addReadCommand') }}
              </el-button>
            </div>
            
            <el-table 
              :data="readCommands" 
              style="width: 100%" 
              size="default" 
              class="command-table" 
              stripe 
              border
            >
              <el-table-column width="50" align="center">
                <template #header>
                  <el-icon><Rank /></el-icon>
                </template>
                <template #default="scope">
                  <el-icon 
                    class="drag-handle" 
                    @mousedown="(e: MouseEvent) => startDrag(e, 'read', scope.$index)"
                    style="cursor: move; color: #909399;"
                    :title="t('motor.dragSort')"
                  >
                    <Rank />
                  </el-icon>
                </template>
              </el-table-column>
              <el-table-column :label="t('motor.colOperation')" width="50" align="center" fixed="right">
                <template #default="scope">
                  <el-button
                    type="danger"
                    size="small"
                    @click="removeCommand('read', scope.$index)"
                    :disabled="activeReadCommands.has(scope.row.name)"
                    :icon="Delete"
                    circle
                  />
                </template>
              </el-table-column>
              <el-table-column prop="name" :label="t('motor.colCommandName')" min-width="120">
                <template #default="scope">
                  <el-input v-model="scope.row.name" size="default" :disabled="activeReadCommands.has(scope.row.name)" @blur="normalizeCommand(scope.row, 'read')">
                    <template #prefix>
                      <el-icon><Position /></el-icon>
                    </template>
                  </el-input>
                </template>
              </el-table-column>
              <el-table-column v-if="configForm.includeFunction" prop="functionCode" :label="t('motor.fieldFunction')" width="110">
                <template #default="scope">
                  <el-input
                    :model-value="scope.row.functionCode"
                    size="default"
                    placeholder="00"
                    :maxlength="(configForm.functionLength || 1) * 2"
                    :disabled="activeReadCommands.has(scope.row.name)"
                    @input="handleCommandHexInput(scope.row, 'functionCode', String($event), 'read')"
                    @blur="normalizeCommand(scope.row, 'read')"
                  >
                    <template #prepend>0x</template>
                  </el-input>
                </template>
              </el-table-column>
              <el-table-column prop="address" :label="t('motor.colRegisterAddress')" width="120">
                <template #default="scope">
                  <el-input
                    :model-value="scope.row.address"
                    size="default"
                    placeholder="00"
                    :maxlength="(configForm.addressLength || 1) * 2"
                    :disabled="activeReadCommands.has(scope.row.name)"
                    @input="handleCommandHexInput(scope.row, 'address', String($event), 'read')"
                    @blur="normalizeCommand(scope.row, 'read')"
                  >
                    <template #prepend>0x</template>
                  </el-input>
                </template>
              </el-table-column>
              <el-table-column v-if="configForm.includeRegisterCount" prop="registerCount" :label="t('motor.colRegisterCount')" width="100">
                <template #default="scope">
                  <div style="display: flex; align-items: center; gap: 4px;">
                    <el-checkbox 
                      v-model="scope.row.includeRegisterCount" 
                      class="custom-checkbox"
                      :disabled="activeReadCommands.has(scope.row.name)"
                      @change="handleRegisterCountToggle(scope.row, Boolean($event), 'read')"
                    />
                    <el-input-number 
                      :model-value="scope.row.registerCount"
                      size="default" 
                      :min="0" 
                      :max="registerCountMax"
                      :step="scope.row.dataType === 'float32' ? 2 : 1"
                      controls-position="right" 
                      style="width: 100%;"
                      :disabled="activeReadCommands.has(scope.row.name) || !scope.row.includeRegisterCount"
                      @change="handleCommandRegisterCount(scope.row, $event, 'read')"
                    />
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="length" :label="t('motor.colByteCount')" width="100">
                <template #default="scope">
                  <div style="display: flex; align-items: center; gap: 4px;">
                    <el-checkbox 
                      v-model="scope.row.includeLength" 
                      class="custom-checkbox"
                      :disabled="activeReadCommands.has(scope.row.name)"
                    />
                    <el-input-number 
                      :model-value="scope.row.length"
                      size="default" 
                      :min="0" 
                      :max="32" 
                      :step="scope.row.dataType === 'float32' ? 4 : 2"
                      controls-position="right" 
                      style="width: 100%;"
                      :disabled="activeReadCommands.has(scope.row.name) || !scope.row.includeLength"
                      @change="handleCommandLength(scope.row, $event, 'read')"
                    >
                      <template #prepend>0x</template>
                    </el-input-number>
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="data" :label="t('motor.colDataContent')" width="180">
                <template #default>
                  <el-input size="default" placeholder="" disabled>
                    <template #prefix>
                      <el-icon><DataAnalysis /></el-icon>
                    </template>
                    <template #prepend>0x</template>
                  </el-input>
                </template>
              </el-table-column>
              <el-table-column prop="dataType" :label="t('motor.colDataType')" width="100">
                <template #default="scope">
                  <el-select
                    :model-value="scope.row.dataType"
                    popper-class="app-dialog-select-popper"
                    size="default"
                    :disabled="activeReadCommands.has(scope.row.name)"
                    @change="handleCommandDataType(scope.row, $event, 'read')"
                  >
                    <el-option label="int16" value="int16" />
                    <el-option label="float32" value="float32" />
                  </el-select>
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>

          <el-tab-pane name="write">
            <template #label>
              <span class="tab-label">
                <el-icon><Download /></el-icon>
                {{ t('motor.writeTab') }}
                <el-tag size="small" type="info">{{ writeCommands.length }}</el-tag>
              </span>
            </template>
            
            <div class="command-header">
              <el-text type="info" size="small">{{ t('motor.writeCommandHint') }}</el-text>
              <el-button type="primary" size="small" @click="addMotorCommand('write')" :icon="Plus">
                {{ t('motor.addWriteCommand') }}
              </el-button>
            </div>
            
            <el-table 
              :data="writeCommands" 
              style="width: 100%" 
              size="default" 
              class="command-table" 
              stripe 
              border
            >
              <el-table-column width="50" align="center">
                <template #header>
                  <el-icon><Rank /></el-icon>
                </template>
                <template #default="scope">
                  <el-icon 
                    class="drag-handle" 
                    @mousedown="(e: MouseEvent) => startDrag(e, 'write', scope.$index)"
                    style="cursor: move; color: #909399;"
                    :title="t('motor.dragSort')"
                  >
                    <Rank />
                  </el-icon>
                </template>
              </el-table-column>
              <el-table-column :label="t('motor.colOperation')" width="50" align="center" fixed="right">
                <template #default="scope">
                  <el-button
                    type="danger"
                    size="small"
                    @click="removeCommand('write', scope.$index)"
                    :icon="Delete"
                    circle
                  />
                </template>
              </el-table-column>
              <el-table-column prop="name" :label="t('motor.colCommandName')" min-width="120">
                <template #default="scope">
                  <el-input v-model="scope.row.name" size="default" @blur="normalizeCommand(scope.row, 'write')">
                    <template #prefix>
                      <el-icon><Edit /></el-icon>
                    </template>
                  </el-input>
                </template>
              </el-table-column>
              <el-table-column v-if="configForm.includeFunction" prop="functionCode" :label="t('motor.fieldFunction')" width="110">
                <template #default="scope">
                  <el-input
                    :model-value="scope.row.functionCode"
                    size="default"
                    placeholder="00"
                    :maxlength="(configForm.functionLength || 1) * 2"
                    @input="handleCommandHexInput(scope.row, 'functionCode', String($event), 'write')"
                    @blur="normalizeCommand(scope.row, 'write')"
                  >
                    <template #prepend>0x</template>
                  </el-input>
                </template>
              </el-table-column>
              <el-table-column prop="address" :label="t('motor.colRegisterAddress')" width="120">
                <template #default="scope">
                  <el-input
                    :model-value="scope.row.address"
                    size="default"
                    placeholder="00"
                    :maxlength="(configForm.addressLength || 1) * 2"
                    @input="handleCommandHexInput(scope.row, 'address', String($event), 'write')"
                    @blur="normalizeCommand(scope.row, 'write')"
                  >
                    <template #prepend>0x</template>
                  </el-input>
                </template>
              </el-table-column>
              <el-table-column v-if="configForm.includeRegisterCount" prop="registerCount" :label="t('motor.colRegisterCount')" width="100">
                <template #default="scope">
                  <div style="display: flex; align-items: center; gap: 4px;">
                    <el-checkbox 
                      v-model="scope.row.includeRegisterCount" 
                      class="custom-checkbox"
                      @change="handleRegisterCountToggle(scope.row, Boolean($event), 'write')"
                    />
                    <el-input-number 
                      :model-value="scope.row.registerCount"
                      size="default" 
                      :min="0" 
                      :max="registerCountMax"
                      :step="scope.row.dataType === 'float32' ? 2 : 1"
                      controls-position="right" 
                      style="width: 100%;"
                      :disabled="!scope.row.includeRegisterCount"
                      @change="handleCommandRegisterCount(scope.row, $event, 'write')"
                    />
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="length" :label="t('motor.colByteCount')" width="100">
                <template #default="scope">
                  <div style="display: flex; align-items: center; gap: 4px;">
                    <el-checkbox 
                      v-model="scope.row.includeLength" 
                      class="custom-checkbox"
                    />
                    <el-input-number 
                      :model-value="scope.row.length"
                      size="default" 
                      :min="0" 
                      :max="32" 
                      :step="scope.row.dataType === 'float32' ? 4 : 2"
                      controls-position="right" 
                      style="width: 100%;"
                      :disabled="!scope.row.includeLength"
                      @change="handleCommandLength(scope.row, $event, 'write')"
                    >
                      <template #prepend>0x</template>
                    </el-input-number>
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="data" :label="t('motor.colDataContent')" width="180">
                <template #default="scope">
                  <el-input 
                    :model-value="scope.row.data"
                    :disabled="scope.row.length===0"
                    size="default" 
                    :placeholder="t('motor.dataHexPlaceholder')"
                    :maxlength="scope.row.length * 2"
                    @input="handleWriteDataHexInput(scope.row, String($event))"
                    @blur="normalizeCommand(scope.row, 'write')"
                  >
                    <template #prepend>0x</template>
                    <template #prefix>
                      <el-icon><DataAnalysis /></el-icon>
                    </template>
                  </el-input>
                </template>
              </el-table-column>
              <el-table-column prop="dataType" :label="t('motor.colDataType')" width="100">
                <template #default="scope">
                  <el-select
                    :model-value="scope.row.dataType"
                    popper-class="app-dialog-select-popper"
                    size="default"
                    @change="handleCommandDataType(scope.row, $event, 'write')"
                  >
                    <el-option label="int16" value="int16" />
                    <el-option label="float32" value="float32" />
                  </el-select>
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="cancelConfig" :icon="Close">{{ t('motor.cancel') }}</el-button>
          <el-button type="primary" @click="saveConfig" :icon="Check" :disabled="!isConfigValid">
            {{ t('motor.confirm') }}
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted, onUnmounted, watch, computed, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { t } from '@/i18n'
import {
  DEFAULT_MOTOR_MESSAGE_FIELD_ORDER,
  fitHexToBytes,
  maxUnsignedValue,
  sanitizeHex,
  useMotorCmd,
  type Command,
  type MotorCommandKind,
  type MotorDataType,
  type MotorEndianness,
  type MotorMessageFieldId,
  type ReadCommand,
  type WriteCommand,
} from '@/composables/motor/useMotorCmd'
import { useConsole } from '@/composables/flow/useConsole'
import draggable from 'vuedraggable'
import MotorCommandPanel from './MotorCommandPanel.vue'
import AppDialogTitle from '@/components/AppDialogTitle.vue'
import { 
  Setting, 
  Key, 
  Download, 
  Upload, 
  Plus, 
  Delete, 
  Position, 
  Edit, 
  DataAnalysis, 
  Check, 
  Close,
  Refresh,
  Rank,
  InfoFilled
} from '@element-plus/icons-vue'

// 使用指令配置钩子
const {
  configForm,
  readCommands,
  writeCommands,
  currentConfig,
  formattedConfig,
  isConfigValid,
  configurationIssues,
  messageFieldOrder,
  addCommand,
  removeCommand,
  moveCommand,
  normalizeCommand,
  normalizeAllCommands,
  updateCommandLength,
  updateCommandRegisterCount,
  updateCommandDataType,
  reencodeWriteCommandData,
  resetConfiguration,
  // 数据转换函数
  getDataCount,
  splitData,
  getDataInputKey,
  decimalToHex,
  hexToDecimal,
  calculateChecksum,
  // 指令构建函数
  buildReadCommandMessage,
  buildWriteCommandMessage,
  // 指令状态缓存初始化函数
  initializeCommandStatusCache
} = useMotorCmd()
const { sendMessage } = useConsole(true)

// 响应式变量
const configDialogVisible = ref(false)
const activeTab = ref('structure')
const activeControlTab = ref('read')
const uploadRef = ref()
const decimalInputs = ref<Record<string, string>>({}) // 存储十进制输入值

// 指令预览相关
const previewMessage = ref<Array<{type: string, label: string, value: string, color: string}>>([])

interface MessageField {
  id: MotorMessageFieldId
  title: string
  tag: string
  tagType: 'info' | 'success' | 'warning'
  fixed: boolean
}

// 报文字段配置
const messageFields = reactive<MessageField[]>([
  {
    id: 'header',
    title: t('motor.fieldHeader'),
    tag: t('motor.tagFixed'),
    tagType: 'info' as const,
    fixed: true
  },
  {
    id: 'address',
    title: t('motor.fieldRegisterAddress'),
    tag: t('motor.tagVariable'),
    tagType: 'success' as const,
    fixed: false
  },
  {
    id: 'function',
    title: t('motor.fieldFunction'),
    tag: t('motor.tagOptional'),
    tagType: 'warning' as const,
    fixed: false
  },
  {
    id: 'registerCount',
    title: t('motor.fieldRegisterCount'),
    tag: t('motor.tagOptional'),
    tagType: 'warning' as const,
    fixed: false
  },
  {
    id: 'length',
    title: t('motor.fieldLength'),
    tag: t('motor.tagVariable'),
    tagType: 'success' as const,
    fixed: false
  },
  {
    id: 'data',
    title: t('motor.fieldData'),
    tag: t('motor.tagVariable'),
    tagType: 'success' as const,
    fixed: false
  },
  {
    id: 'checksum',
    title: t('motor.fieldChecksumFull'),
    tag: t('motor.tagFixed'),
    tagType: 'info' as const,
    fixed: true
  }
])

// 拖拽排序后的字段列表
const messageStructure = computed<MessageField[]>({
  get() {
    // 确保报头始终在最前，校验和始终在最后
    const headerField = messageFields.find(f => f.id === 'header')
    const checksumField = messageFields.find(f => f.id === 'checksum')
    
    // 获取所有中间字段（不再过滤功能码字段，让它始终可见）
    const middleFields = messageFields.filter(f => f.id !== 'header' && f.id !== 'checksum')
    
    // 根据用户拖拽排序中间字段
    return [headerField!, ...middleFields, checksumField!]
  },
  set(newValue) {
    // 更新字段顺序（保持报头和校验和的固定位置）
    const newOrder = newValue.map(field => field?.id)
    messageFields.sort((a, b) => {
      const aIndex = newOrder.indexOf(a.id)
      const bIndex = newOrder.indexOf(b.id)
      return aIndex - bIndex
    })
  }
})

const applyMessageFieldOrder = (order: MotorMessageFieldId[]) => {
  messageFields.sort((left, right) => order.indexOf(left.id) - order.indexOf(right.id))
}

// IPC事件监听器引用
const serialSuccessListener = (event: any, result: any) => {
  console.log('串口数据发送成功:', result.data)
}

const serialErrorListener = (event: any, error: any) => {
  console.error('串口数据发送失败:', error.error)
  ElMessage({
    message: t('motor.serialSendFailed', { error: error.error }),
    type: 'error',
    duration: 2000,
    placement: 'bottom-right',
    offset: 50,
  })
}

// localStorage键名
const STORAGE_KEY = 'motor-config'

type MotorConfigSnapshot = ReturnType<typeof createConfigSnapshot>
let dialogSnapshot: MotorConfigSnapshot | null = null

function createConfigSnapshot() {
  return JSON.parse(
    JSON.stringify({
      ...currentConfig.value,
      messageStructure: messageStructure.value,
      hasBeenCustomized: true,
    }),
  )
}

// 从localStorage加载配置
const loadConfigFromStorage = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const config = JSON.parse(stored)
      // 使用统一的 loadConfig 函数处理配置加载
      loadConfig(config)
      console.log('配置已从localStorage加载')
      return true
    }
  } catch (error) {
    console.error('从localStorage加载配置失败:', error)
  }
  return false
}

// 保存配置到localStorage
const saveConfigToStorage = () => {
  try {
    const config = {
      ...currentConfig.value,
      messageStructure: messageStructure.value,
      hasBeenCustomized: true  // 标记用户已自定义配置
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    console.log('配置已保存到localStorage')
  } catch (error) {
    console.error('保存配置到localStorage失败:', error)
  }
}

// 全局定时器相关
const globalTimer = ref<number | null>(null)
const activeReadCommands = ref<Set<string>>(new Set())

// 草稿变化只刷新预览；只有点击“确定”时才持久化。
watch(writeCommands, () => {
  generateCommandPreview()
}, { deep: true })

// 监听读指令数据变化
watch(readCommands, () => {
  generateCommandPreview()
}, { deep: true })

// 监听拖拽结构变化
watch(
  messageStructure,
  structure => {
    messageFieldOrder.value = structure.map(field => field.id)
    generateCommandPreview()
  },
  { deep: true },
)

// 监听配置变化
watch([() => configForm.header, () => configForm.checksum.method, () => configForm.checksum.start_index, () => configForm.checksum.endianness, () => configForm.addressLength, () => configForm.functionLength, () => configForm.dataEndianness, () => configForm.includeFunction, () => configForm.includeRegisterCount, () => configForm.registerCountLength, () => configForm.lengthLength], () => {
  generateCommandPreview()
}, { deep: true })

// 监听标签页切换
watch(activeTab, () => {
  generateCommandPreview()
})

// 方法
const showConfigDialog = () => {
  dialogSnapshot = createConfigSnapshot()
  configDialogVisible.value = true
}

const restoreDialogSnapshot = () => {
  if (!dialogSnapshot) return
  loadConfig(dialogSnapshot)
  dialogSnapshot = null
}

const cancelConfig = () => {
  restoreDialogSnapshot()
  configDialogVisible.value = false
}

const handleDialogBeforeClose = (done: () => void) => {
  restoreDialogSnapshot()
  done()
}

// 处理报文结构变化
const handleStructureChange = () => {
  ElMessage({
    message: t('motor.structureUpdated'),
    type: 'success',
    duration: 1000,
    placement: 'bottom-right',
    offset: 50,
  })
}

// 指令结构拖拽：vuedraggable（SortableJS）实现，animation 驱动挤压换位动画（iOS 桌面效果）
// 卡片内交互控件不触发拖拽
const STRUCTURE_INTERACTIVE_SELECTOR =
  'input, textarea, select, button, a, .el-switch, .el-select, .el-input-number, .el-checkbox'

// 固定字段（报头/校验和）不可作为拖拽目标或落点，保证报头恒前、校验和恒后
const onStructureMove = (evt: {
  draggedContext: { element: MessageField }
  relatedContext: { element: MessageField | null }
}) => {
  if (evt.draggedContext.element.fixed) return false
  if (evt.relatedContext.element?.fixed) return false
  return true
}

const onStructureDragEnd = (evt: { oldIndex?: number; newIndex?: number }) => {
  if (evt.oldIndex !== evt.newIndex) handleStructureChange()
}

// 保存配置
const saveConfig = () => {
  try {
    normalizeAllCommands()
    if (!isConfigValid.value) {
      ElMessage.warning(configurationIssues.value[0] || t('motor.fixConfigIssues'))
      return
    }

    saveConfigToStorage()
    initializeDecimalInputs()
    initializeCommandStatusCache()
    dialogSnapshot = null
    configDialogVisible.value = false
    ElMessage({
      message: t('motor.configSaved'),
      type: 'success',
      duration: 1000,
      placement: 'bottom-right',
      offset: 50,
    })
  } catch (error) {
    ElMessage({
      message: t('motor.configSaveFailed'),
      type: 'error',
      duration: 1000,
      placement: 'bottom-right',
      offset: 50,
    })
  }
}

const registerCountMax = computed(() =>
  maxUnsignedValue(configForm.registerCountLength ?? 1),
)

const handleHeaderInput = (value: string) => {
  configForm.header = sanitizeHex(value).slice(0, 32)
}

const handleCommandHexInput = (
  command: Command,
  field: 'address' | 'functionCode',
  value: string,
  kind: MotorCommandKind,
) => {
  const byteLength =
    field === 'address' ? configForm.addressLength ?? 1 : configForm.functionLength ?? 1
  command[field] = sanitizeHex(value).slice(0, byteLength * 2)
  if (command[field]?.length === byteLength * 2) normalizeCommand(command, kind)
}

const handleWriteDataHexInput = (command: WriteCommand, value: string) => {
  command.data = sanitizeHex(value).slice(0, command.length * 2)
}

const handleCommandLength = (
  command: Command,
  value: number | undefined,
  kind: MotorCommandKind,
) => {
  updateCommandLength(command, value, kind)
  initializeDecimalInputs()
}

const handleCommandRegisterCount = (
  command: Command,
  value: number | undefined,
  kind: MotorCommandKind,
) => {
  updateCommandRegisterCount(command, value, kind)
  initializeDecimalInputs()
}

const handleCommandDataType = (
  command: Command,
  value: MotorDataType,
  kind: MotorCommandKind,
) => {
  updateCommandDataType(command, value, kind)
  initializeDecimalInputs()
}

const handleRegisterCountToggle = (
  command: Command,
  enabled: boolean,
  kind: MotorCommandKind,
) => {
  command.includeRegisterCount = enabled
  if (enabled) updateCommandLength(command, command.length, kind)
}

const handleGlobalRegisterCountChange = (enabled: string | number | boolean) => {
  if (!enabled) return
  readCommands.value.forEach(command => {
    if (command.includeRegisterCount !== false) {
      updateCommandLength(command, command.length, 'read')
    }
  })
  writeCommands.value.forEach(command => {
    if (command.includeRegisterCount !== false) {
      updateCommandLength(command, command.length, 'write')
    }
  })
}

const handleRegisterCountWidthChange = () => {
  normalizeAllCommands()
}

const handleDataEndiannessChange = (nextEndianness: MotorEndianness) => {
  const previousEndianness = configForm.dataEndianness || 'little'
  reencodeWriteCommandData(previousEndianness, nextEndianness)
  configForm.dataEndianness = nextEndianness
  initializeDecimalInputs()
}

const addMotorCommand = (kind: MotorCommandKind) => {
  addCommand(kind)
  initializeDecimalInputs()
}


const previewLabels: Record<MotorMessageFieldId, string> = {
  header: t('motor.fieldHeader'),
  address: t('motor.fieldRegisterAddress'),
  function: t('motor.fieldFunction'),
  registerCount: t('motor.fieldRegisterCount'),
  length: t('motor.fieldLength'),
  data: t('motor.fieldData'),
  checksum: t('motor.fieldChecksum'),
}

// 使用当前标签页中的真实命令生成预览，确保预览与实际下发报文一致。
const generateCommandPreview = () => {
  const preferRead = activeTab.value === 'read'
  const command: Command = (preferRead
    ? readCommands.value[0] || writeCommands.value[0]
    : writeCommands.value[0] || readCommands.value[0]) ?? {
    // 无任何指令时使用占位指令，保证预览区始终能展示当前报文结构
    name: '',
    address: '00',
    data: '',
    length: 0,
    dataType: 'int16',
    functionCode: '00',
    registerCount: 0,
    includeRegisterCount: true,
    includeLength: true,
  }

  const isWriteCommand = writeCommands.value.includes(command as WriteCommand)
  let message = ''
  const preview: Array<{ type: string; label: string; value: string; color: string }> = []
  const append = (field: MotorMessageFieldId, value: string) => {
    if (!value) return
    message += value
    preview.push({ type: field, label: previewLabels[field], value, color: '' })
  }

  messageStructure.value.forEach(field => {
    switch (field.id) {
      case 'header':
        append(field.id, sanitizeHex(configForm.header))
        break
      case 'address':
        append(field.id, fitHexToBytes(command.address, configForm.addressLength ?? 1))
        break
      case 'function':
        if (configForm.includeFunction) {
          append(
            field.id,
            fitHexToBytes(command.functionCode, configForm.functionLength ?? 1),
          )
        }
        break
      case 'registerCount':
        if (configForm.includeRegisterCount && command.includeRegisterCount !== false) {
          append(
            field.id,
            fitHexToBytes(
              (command.registerCount ?? 0).toString(16),
              configForm.registerCountLength ?? 1,
            ),
          )
        }
        break
      case 'length':
        if (command.includeLength !== false) {
          append(
            field.id,
            fitHexToBytes(command.length.toString(16), configForm.lengthLength ?? 1),
          )
        }
        break
      case 'data':
        if (isWriteCommand && command.length > 0) {
          append(field.id, fitHexToBytes(command.data, command.length, 'end'))
        }
        break
      case 'checksum':
        append(
          field.id,
          calculateChecksum(
            message,
            configForm.checksum.method,
            configForm.checksum.start_index,
            configForm.checksum.endianness || 'big',
          ),
        )
        break
    }
  })

  previewMessage.value = preview
}

// 发送读指令
const sendReadCommand = (cmd: any) => {
  try {
    // 使用钩子中的函数构建报文，传入messageStructure以支持动态顺序
    const message = buildReadCommandMessage(cmd, configForm, messageStructure.value as Array<{id: string, title: string}>)
    
    // 检查是否有频率设置
    if (cmd.frequency && cmd.frequency > 0) {
      // 定时发送模式
      if (activeReadCommands.value.has(cmd.name)) {
        // 如果已经在发送，停止发送
        activeReadCommands.value.delete(cmd.name)
        ElMessage({
          message: t('motor.readStopped', { name: cmd.name }),
          type: 'success',
          duration: 1000,
          placement: 'bottom-right',
          offset: 50,
        })
        
        // 更新定时器
        updateGlobalTimer()
      } else {
        // 开始定时发送
        activeReadCommands.value.add(cmd.name)
        ElMessage({
          message: t('motor.readStarted', { name: cmd.name, freq: cmd.frequency }),
          type: 'success',
          duration: 1000,
          placement: 'bottom-right',
          offset: 50,
        })
        
        // 更新定时器
        updateGlobalTimer()
      }
    } else {
      // 单次发送模式
      console.log(`发送读指令: ${cmd.name}, 报文: ${message}`)
      ElMessage({
        message: t('motor.readSent', { name: cmd.name }),
        type: 'success',
        duration: 1000,
        placement: 'bottom-right',
        offset: 50,
      })
      sendDataToSerial(message)
    }
    
  } catch (error) {
    ElMessage({
      message: t('motor.readSendFailed', { name: cmd.name }),
      type: 'error',
      duration: 1000,
      placement: 'bottom-right',
      offset: 50,
    })
  }
}

// 发送写指令
const sendWriteCommand = (cmd: any) => {
  try {
    // 使用钩子中的函数构建报文，传入messageStructure以支持动态顺序
    const message = buildWriteCommandMessage(cmd, configForm, messageStructure.value as Array<{id: string, title: string}>)
    
    // 实际发送到串口
    sendDataToSerial(message)
    
  } catch (error) {
    ElMessage({
      message: t('motor.writeSendFailed', { name: cmd.name }),
      type: 'error',
      duration: 1000,
      placement: 'bottom-right',
      offset: 50,
    })
  }
}



// 处理配置对话框中的十进制输入
const handleDecimalInput = (cmd: any, value: string) => {
  if (!value || value.trim() === '') {
    cmd.data = ''
    return
  }
  
  const trimmedValue = value.trim()
  
  // 检查是否为纯数字（十进制）
  if (/^-?\d+$/.test(trimmedValue)) {
    // 是十进制数字，转换为十六进制
    const hexValue = decimalToHex(trimmedValue, cmd.dataType)
    cmd.data = hexValue
    // 更新十进制输入缓存
    decimalInputs.value[cmd.name] = trimmedValue
  } else {
    // 不是纯数字，按原始逻辑处理（假设用户输入的是十六进制）
    cmd.data = trimmedValue
    // 更新十进制输入缓存（尝试转换回十进制）
    decimalInputs.value[cmd.name] = hexToDecimal(trimmedValue, cmd.dataType)
  }
}

// 处理单个输入框的十进制输入（主界面）
const handleSingleDecimalInput = (cmd: any, value: string) => {
  decimalInputs.value[cmd.name] = value
  if (!value || value.trim() === '') {
    // 根据数据长度（字节数）设置默认值
    if (cmd.length === 2 || cmd.dataType === 'int16') {
      cmd.data = '0000'  // 2字节 = 4个十六进制字符
    } else if (cmd.length === 4 || cmd.dataType === 'float32') {
      cmd.data = '00000000'  // 4字节 = 8个十六进制字符
    } else {
      // 其他长度，根据字节数计算十六进制字符数（每字节2个字符）
      const hexChars = cmd.length * 2
      cmd.data = '0'.repeat(hexChars)
    }
    return
  }
  
  const trimmedValue = value.trim()
  
  // 检查是否为有效数字（支持整数和小数）
  if (/^-?(\d+\.?\d*|\.\d+)$/.test(trimmedValue)) {
    // 是有效数字，转换为十六进制
    const hexValue = decimalToHex(trimmedValue, cmd.dataType)
    cmd.data = hexValue
    // 更新十进制输入缓存
    decimalInputs.value[cmd.name] = trimmedValue
  } else {
    // 不是有效数字，不能作为十六进制输入，使用默认值
    cmd.data = cmd.dataType === 'float32' ? '00000000' : '0000'
    // 更新十进制输入缓存为0
    decimalInputs.value[cmd.name] = '0'
  }
}

// 处理多输入框的十进制输入并更新数据
const updateDataValueWithDecimal = (cmd: any, index: number, value: string) => {
  const dataCount = getDataCount(cmd)
  const dataArray = splitData(cmd.data, dataCount, cmd.dataType)
  
  if (!value || value.trim() === '') {
    // 根据数据类型设置默认值
    dataArray[index] = cmd.dataType === 'float32' ? '00000000' : '0000'
  } else {
    const trimmedValue = value.trim()
    
    // 检查是否为有效数字（支持整数和小数）
    if (/^-?(\d+\.?\d*|\.\d+)$/.test(trimmedValue)) {
      // 是有效数字，转换为十六进制
      // 使用指令的数据类型进行转换
      const hexValue = decimalToHex(trimmedValue, cmd.dataType)
      dataArray[index] = hexValue
    } else {
      // 不是有效数字，使用默认值
      dataArray[index] = cmd.dataType === 'float32' ? '00000000' : '0000'
    }
  }
  
  // 更新数据
  cmd.data = dataArray.join('')
  // 同步更新decimalInputs，保持输入框显示
  decimalInputs.value[getDataInputKey(cmd, index)] = value
}

// 处理读命令表格行拖拽排序
const handleReadCommandSort = (evt: any) => {
  const { oldIndex, newIndex } = evt
  moveCommand('read', oldIndex, newIndex)
}

// 处理写命令表格行拖拽排序
const handleWriteCommandSort = (evt: any) => {
  const { oldIndex, newIndex } = evt
  moveCommand('write', oldIndex, newIndex)
}

// 拖拽排序相关状态
const dragState = reactive({
  isDragging: false,
  dragType: null as 'read' | 'write' | null,
  dragIndex: -1,
  showSortTip: false,
  dragIndicator: null as HTMLElement | null
})

// 开始拖拽
const startDrag = (event: MouseEvent, type: 'read' | 'write', index: number) => {
  event.preventDefault()
  
  dragState.isDragging = true
  dragState.dragType = type
  dragState.dragIndex = index
  dragState.showSortTip = true
  
  // 添加全局鼠标事件监听
  document.addEventListener('mousemove', handleDragMove)
  document.addEventListener('mouseup', handleDragEnd)
  
  // 阻止文本选择
  document.body.style.userSelect = 'none'
}

// 处理拖拽移动
const handleDragMove = (event: MouseEvent) => {
  if (!dragState.isDragging) return
  
  // 清除之前的高亮
  document.querySelectorAll('.drag-over').forEach(el => {
    el.classList.remove('drag-over')
  })
  
  // 获取鼠标位置下的表格行
  const elementBelow = document.elementFromPoint(event.clientX, event.clientY)
  const trElement = elementBelow?.closest('tr')
  
  if (trElement && !trElement.classList.contains('sortable-ghost')) {
    // 高亮当前悬停的行
    trElement.classList.add('drag-over')
    
    // 计算新的索引位置
    const table = trElement.closest('table')
    const tbody = table?.querySelector('tbody')
    const rows = Array.from(tbody?.querySelectorAll('tr') || [])
    const newIndex = rows.indexOf(trElement)
    
    if (newIndex !== -1 && newIndex !== dragState.dragIndex) {
      // 执行移动
      moveCommand(dragState.dragType!, dragState.dragIndex, newIndex)
      dragState.dragIndex = newIndex
      
      // 添加移动成功的视觉反馈
      trElement.classList.add('sort-success')
      setTimeout(() => {
        trElement.classList.remove('sort-success')
      }, 300)
    }
  }
  
  // 阻止事件冒泡，防止触发其他元素的事件
  event.stopPropagation()
  event.preventDefault()
}

// 结束拖拽
const handleDragEnd = () => {
  // 移除拖拽时的视觉反馈
  document.querySelectorAll('.sortable-ghost').forEach(el => {
    el.classList.remove('sortable-ghost')
  })
  
  // 移除高亮效果
  document.querySelectorAll('.drag-over').forEach(el => {
    el.classList.remove('drag-over')
  })
  
  // 移除表格拖拽样式
  document.querySelectorAll('.command-table.sorting-active').forEach(el => {
    el.classList.remove('sorting-active')
  })
  
  // 重置拖拽状态
  dragState.isDragging = false
  dragState.dragType = null
  dragState.dragIndex = -1
  dragState.showSortTip = false
  
  // 移除全局事件监听
  document.removeEventListener('mousemove', handleDragMove)
  document.removeEventListener('mouseup', handleDragEnd)
  
  // 恢复文本选择
  document.body.style.userSelect = ''
}

// 发送数据到串口
const sendDataToSerial = (data: string) => {
  if (window.ipcRenderer) {
    sendMessage(data, 'hex', false)
    // window.ipcRenderer.send('send-serial-hex-data', data)
  } else {
    console.error('IPC通信不可用')
    ElMessage({
      message: t('motor.serialNotInitialized'),
      type: 'error',
      duration: 2000,
      placement: 'bottom-right',
      offset: 50,
    })
  }
}

// 更新全局定时器
const updateGlobalTimer = () => {
  // 清理现有定时器
  if (globalTimer.value) {
    clearInterval(globalTimer.value)
    globalTimer.value = null
  }
  
  // 获取所有活跃指令的频率
  const activeFrequencies = readCommands.value
    .filter(cmd => activeReadCommands.value.has(cmd.name) && (cmd.frequency && cmd.frequency > 0))
    .map(cmd => cmd.frequency)
  
  if (activeFrequencies.length === 0) return
  
  // 以最高频率作为调度基准，避免高频命令被低频命令拖慢。
  const maxFrequency = Math.max(...activeFrequencies.filter(f => f !== null) as number[])
  const baseInterval = 1000 / maxFrequency
  
  // 创建新的定时器
  globalTimer.value = window.setInterval(() => {
    const currentTime = Date.now()
    
    readCommands.value.forEach(command => {
      if (activeReadCommands.value.has(command.name) && command.frequency && command.frequency > 0) {
        // 检查是否应该发送这个指令
        const sendInterval = 1000 / command.frequency
        if (!command.lastSentTime || 
            (currentTime - command.lastSentTime) >= sendInterval) {
          
          const cmdMessage = buildReadCommandMessage(
            command,
            configForm,
            messageStructure.value,
          )
          
          sendDataToSerial(cmdMessage)
          
          command.lastSentTime = currentTime
        }
      }
    })
  }, Math.min(baseInterval, 100)) // 最大检查间隔100ms
}

// 重置为默认配置
const resetConfig = () => {
  ElMessageBox.confirm(
    t('motor.restoreDefaultConfirm'),
    t('motor.restoreDefaultTitle'),
    {
      confirmButtonText: t('motor.confirm'),
      confirmButtonClass: 'el-button--warning',
      cancelButtonText: t('motor.cancel'),
      type: 'warning',
      customClass: 'app-message-box',
      closeOnClickModal: true,
      closeOnPressEscape: true,
    }
  ).then(() => {
    resetConfiguration()
    applyMessageFieldOrder(messageFieldOrder.value)
    initializeDecimalInputs()
    generateCommandPreview()
    ElMessage({
      message: t('motor.restoredDefault'),
      type: 'success',
      duration: 1000,
      placement: 'bottom-right',
      offset: 50,
    })
  }).catch(() => {
    // 用户取消重置
  })
}

// 载入配置数据
const loadConfig = (config: any) => {
  try {
    // 验证配置结构 - 支持新旧两种格式
    if (!config.header || !config.format || !config.checksum) {
      throw new Error('配置格式不完整')
    }
    
    const byteWidth = (value: unknown) => (Number(value) === 2 ? 2 : 1)
    const checksumMethods = ['none', 'sum', 'xor', 'crc8', 'crc16'] as const
    const checksumMethod = checksumMethods.includes(config.checksum.method)
      ? config.checksum.method
      : 'sum'

    // 载入基础配置
    configForm.header = sanitizeHex(config.header)
    configForm.format = config.format === 'ascii' ? 'ascii' : 'hex'
    configForm.checksum.method = checksumMethod
    configForm.checksum.start_index = Math.max(
      0,
      Math.trunc(Number(config.checksum.start_index) || 0),
    )
    configForm.checksum.end_index = Number(config.checksum.end_index) || -1
    configForm.checksum.endianness = config.checksum?.endianness === 'little' ? 'little' : 'big'
    configForm.dataEndianness = config.dataEndianness === 'big' ? 'big' : 'little'
    configForm.includeFunction = config.includeFunction !== false
    configForm.addressLength = byteWidth(config.addressLength)
    configForm.functionLength = byteWidth(config.functionLength)
    configForm.includeRegisterCount = config.includeRegisterCount !== false
    configForm.registerCountLength = byteWidth(config.registerCountLength)
    configForm.lengthLength = byteWidth(config.lengthLength)
    
    // 载入拖拽顺序配置
    if (config.messageStructure && Array.isArray(config.messageStructure)) {
      const validIds = new Set<MotorMessageFieldId>(DEFAULT_MOTOR_MESSAGE_FIELD_ORDER)
      const savedOrder = config.messageStructure
        .map((field: any) => field?.id)
        .filter((id: unknown): id is MotorMessageFieldId => validIds.has(id as MotorMessageFieldId))
      const completedOrder = [
        ...new Set([
          'header' as MotorMessageFieldId,
          ...savedOrder.filter(
            (id: MotorMessageFieldId) => id !== 'header' && id !== 'checksum',
          ),
          ...DEFAULT_MOTOR_MESSAGE_FIELD_ORDER.filter(
            id => id !== 'header' && id !== 'checksum' && !savedOrder.includes(id),
          ),
          'checksum' as MotorMessageFieldId,
        ]),
      ]
      applyMessageFieldOrder(completedOrder)
      messageFieldOrder.value = completedOrder
    } else {
      applyMessageFieldOrder(DEFAULT_MOTOR_MESSAGE_FIELD_ORDER)
      messageFieldOrder.value = [...DEFAULT_MOTOR_MESSAGE_FIELD_ORDER]
    }
    
    // 清空现有命令
    readCommands.value = []
    writeCommands.value = []
    
    // 处理新格式（有独立的readCommands和writeCommands数组）
    if (config.readCommands && Array.isArray(config.readCommands) && config.writeCommands && Array.isArray(config.writeCommands)) {
      // 新格式处理
      readCommands.value = config.readCommands.map((cmd: any) => ({
        name: String(cmd.name || 'UNKNOWN_CMD'),
        address: sanitizeHex(cmd.address || '00'),
        data: sanitizeHex(cmd.data || '0000'),
        length: Math.max(0, Math.trunc(Number(cmd.length) || 0)),
        dataType: cmd.dataType === 'float32' ? 'float32' : 'int16',
        functionCode: sanitizeHex(cmd.functionCode || '03'),
        registerCount: Math.max(0, Math.trunc(Number(cmd.registerCount) || 0)),
        includeRegisterCount: cmd.includeRegisterCount !== false,
        includeLength: cmd.includeLength !== false,
        frequency: Number(cmd.frequency) > 0 ? Number(cmd.frequency) : null,
        lastSentTime: 0,
      }))
      
      writeCommands.value = config.writeCommands.map((cmd: any) => ({
        name: String(cmd.name || 'UNKNOWN_CMD'),
        address: sanitizeHex(cmd.address || '00'),
        data: sanitizeHex(cmd.data || '0000'),
        length: Math.max(0, Math.trunc(Number(cmd.length) || 0)),
        dataType: cmd.dataType === 'float32' ? 'float32' : 'int16',
        functionCode: sanitizeHex(cmd.functionCode || '06'),
        registerCount: Math.max(0, Math.trunc(Number(cmd.registerCount) || 0)),
        includeRegisterCount: cmd.includeRegisterCount !== false,
        includeLength: cmd.includeLength !== false,
      }))
    } else if (config.command && typeof config.command === 'object') {
      // 旧格式处理（兼容旧配置文件）
      Object.entries(config.command).forEach(([name, cmd]: [string, any]) => {
        if (parseInt(cmd.length) === 0) {
          // 读命令（长度为0）
        readCommands.value.push({
          name,
          address: cmd.address || '00',
          data: cmd.data || '0000',
          length: cmd.dataType === 'float32' ? 4 : 2,
          dataType: cmd.dataType === 'float32' ? 'float32' : 'int16',
          functionCode: cmd.functionCode || '03',
          registerCount: parseInt(cmd.registerCount, 10) || 1,
          includeRegisterCount: true,
          includeLength: true,
          frequency: cmd.frequency || null,
          lastSentTime: 0
        })
      } else {
        // 写命令（长度大于0）
        writeCommands.value.push({
          name,
          address: cmd.address || '00',
          data: cmd.data || '0000',
          length: parseInt(cmd.length) || 2,
          dataType: cmd.dataType || 'int16',
          functionCode: cmd.functionCode || '06',
          registerCount: parseInt(cmd.registerCount, 10) || 1,
          includeRegisterCount: true,
          includeLength: true
        })
        }
      })
    }
    
    // 如果没有命令，添加默认命令（仅在首次初始化时）
    if (readCommands.value.length === 0 && !config.hasBeenCustomized) {
      readCommands.value = [
        { name: 'GET_SPEED', address: '00', data: '0000', length: 2, dataType: 'int16', functionCode: '03', registerCount: 1, includeRegisterCount: true, includeLength: true, frequency: null, lastSentTime: 0 }
      ]
    }
    if (writeCommands.value.length === 0 && !config.hasBeenCustomized) {
      writeCommands.value = [
        { name: 'SET_SPEED', address: '00', data: '0000', length: 2, dataType: 'int16', functionCode: '06', registerCount: 1, includeRegisterCount: true, includeLength: true }
      ]
    }

    normalizeAllCommands()
    messageFieldOrder.value = messageStructure.value.map(field => field.id)
    initializeCommandStatusCache()
    
  } catch (error) {
    ElMessage({
      message: t('motor.configFormatError'),
      type: 'error',
      duration: 1000,
      placement: 'bottom-right',
      offset: 50,
    })
    throw error
  }
  
  // 初始化decimalInputs，确保输入框显示正确的十进制值
  initializeDecimalInputs()
}

// 初始化decimalInputs，将所有命令的十六进制数据转换为十进制并显示在输入框中
const initializeDecimalInputs = () => {
  // 清空现有数据
  decimalInputs.value = {}
  
  // 处理写命令（因为读命令没有实际数据输入）
  writeCommands.value.forEach(cmd => {
    const dataCount = getDataCount(cmd)
    const dataArray = splitData(cmd.data, dataCount, cmd.dataType)
    
    if (dataCount === 1) {
      // 单个数据项
      // 只有在数据是有效的十六进制时才转换
      if (cmd.data && /^[0-9A-Fa-f]+$/.test(cmd.data)) {
        decimalInputs.value[cmd.name] = hexToDecimal(cmd.data, cmd.dataType)
      } else {
        // 如果数据无效，使用默认值
        decimalInputs.value[cmd.name] = '0'
      }
    } else {
      // 多个数据项
      dataArray.forEach((dataItem, index) => {
        const inputKey = getDataInputKey(cmd, index)
        if (dataItem && /^[0-9A-Fa-f]+$/.test(dataItem)) {
          // 使用指令的数据类型进行转换
          decimalInputs.value[inputKey] = hexToDecimal(dataItem, cmd.dataType)
        } else {
          decimalInputs.value[inputKey] = '0'
        }
      })
    }
  })
}

// 处理文件载入
const handleFileLoad = (uploadFile: any) => {
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const config = JSON.parse(e.target?.result as string)
      loadConfig(config)
      ElMessage({
        message: t('motor.configLoaded'),
        type: 'success',
        duration: 1000,
        placement: 'bottom-right',
        offset: 50,
      })
    } catch (error) {
      ElMessage({
        message: t('motor.configFileFormatError'),
        type: 'error',
        duration: 1000,
        placement: 'bottom-right',
        offset: 50,
      })
    } finally {
      uploadRef.value?.clearFiles?.()
    }
  }
  reader.onerror = () => {
    uploadRef.value?.clearFiles?.()
    ElMessage.error(t('motor.configFileReadFailed'))
  }
  if (!uploadFile.raw) {
    ElMessage.error(t('motor.noConfigFile'))
    return
  }
  reader.readAsText(uploadFile.raw)
}

// 下载配置
const downloadConfig = () => {
  try {
    normalizeAllCommands()
    if (!isConfigValid.value) {
      ElMessage.warning(configurationIssues.value[0] || t('motor.fixConfigBeforeExport'))
      return
    }
    const configData = JSON.stringify({
      ...JSON.parse(formattedConfig.value),
      messageStructure: messageStructure.value,
      addressLength: configForm.addressLength,
      functionLength: configForm.functionLength,
      includeRegisterCount: configForm.includeRegisterCount,
      registerCountLength: configForm.registerCountLength,
      hasBeenCustomized: true,
    }, null, 2)
    const blob = new Blob([configData], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `motor-config-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    ElMessage({
      message: t('motor.configExported'),
      type: 'success',
      duration: 1000,
      placement: 'bottom-right',
      offset: 50,
    })
  } catch (error) {
    ElMessage({
      message: t('motor.configExportFailed'),
      type: 'error',
      duration: 1000,
      placement: 'bottom-right',
      offset: 50,
    })
  }
}

// 监听频率变化
watch(() => readCommands.value.map(cmd => ({name: cmd.name, frequency: cmd.frequency})), 
  () => {
    // 如果有活跃的指令，重新计算定时器
    if (activeReadCommands.value.size > 0) {
      updateGlobalTimer()
    }
  },
  { deep: true }
)

// 组件挂载时加载配置
onMounted(() => {
  const restored = loadConfigFromStorage()
  if (!restored) {
    applyMessageFieldOrder(messageFieldOrder.value)
    normalizeAllCommands()
    initializeDecimalInputs()
  }
  messageFieldOrder.value = messageStructure.value.map(field => field.id)
  initializeCommandStatusCache()

  // 监听串口发送结果
  if (window.ipcRenderer) {
    window.ipcRenderer.on('serial-send-success', serialSuccessListener)
    window.ipcRenderer.on('serial-send-error', serialErrorListener)
  }
  
  // 初始化指令预览
  generateCommandPreview()
})

// 组件卸载时清理定时器
onUnmounted(() => {
  // 清理全局定时器
  if (globalTimer.value) {
    clearInterval(globalTimer.value)
    globalTimer.value = null
  }
  // 清空活跃指令集合
  activeReadCommands.value.clear()
  
  // 清理串口事件监听
  if (window.ipcRenderer) {
    window.ipcRenderer.off('serial-send-success', serialSuccessListener)
    window.ipcRenderer.off('serial-send-error', serialErrorListener)
  }
})
</script>

<style scoped>
.motor-config-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--app-text);
  background: var(--app-surface);
}

.controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background-color: var(--app-surface-muted);
  border-bottom: 1px solid var(--app-border);
  height: 50px;
  box-sizing: border-box;
}

.file-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.left-buttons, .right-buttons {
  display: flex;
  gap: 8px;
}

.config-content {
  flex: 1;
  padding: 20px;
  overflow: auto;
}

/* 指令控制区域样式 */
.command-control {
  margin-bottom: 20px;
}

.control-tabs {
  background-color: var(--app-surface);
  border-radius: 8px;
  overflow: hidden;
}

.command-buttons {
  padding: 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  min-height: 80px;
  align-items: flex-start;
}

.command-list {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 80px;
}

.command-item {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: flex-start;
}

.command-item .command-btn {
  width: 140px;
  text-align: left;
}

.command-item .data-input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.command-item .frequency-input-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
}

.command-item .el-input {
  width: 120px;
  flex-shrink: 0;
}

.frequency-label {
  font-size: 12px;
  color: #909399;
  white-space: nowrap;
  min-width: 15px;
}

.data-bits-label {
  font-size: 12px;
  color: #909399;
  white-space: nowrap;
  min-width: 30px;
}

.command-btn {
  min-width: 140px;
  transition: all 0.3s ease;
}

.command-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.command-btn .el-icon {
  margin-right: 4px;
}

:deep(.el-empty) {
  margin: 20px auto;
}

:deep(.el-tabs__item) {
  padding: 0 20px;
  height: 40px;
  line-height: 40px;
}

:deep(.el-tabs__item .el-tag) {
  margin-left: 6px;
}

.dialog-content {
  padding: 0;
}

:deep(.el-textarea__inner) {
  font-family: 'Courier New', monospace;
  font-size: 14px;
}

/* 对话框样式 */
.dialog-content {
  max-height: none;
  overflow: visible;
  scroll-behavior: smooth;
}

/* 防止标签页切换时的自动滚动 */
:deep(.el-tabs__content) {
  overflow: visible;
  min-height: 300px;
  padding: 15px;
}

:deep(.el-form-item) {
  margin-bottom: 15px;
}

:deep(.el-table) {
  font-size: 12px;
}

:deep(.el-table .cell) {
  padding: 4px;
}

.config-btn {
  margin-left: 8px;
}

/* 对话框自定义样式 */
:deep(.motor-config-dialog) {
  border-radius: 10px;
  overflow: hidden;
}

:deep(.motor-config-dialog .el-dialog__header) {
  background: var(--app-surface);
  color: var(--app-text);
  padding: 16px 20px 14px;
  margin: 0;
}

:deep(.motor-config-dialog .el-dialog__title) {
  color: var(--app-text);
  font-size: 16px;
  font-weight: 600;
}

:deep(.motor-config-dialog .el-dialog__headerbtn) {
  top: 12px;
  right: 12px;
}

:deep(.motor-config-dialog .el-dialog__headerbtn .el-dialog__close) {
  color: var(--app-text-muted);
  font-size: 18px;
}

:deep(.motor-config-dialog .el-dialog__body) {
  padding: 18px 20px;
  background-color: var(--app-surface);
}

:deep(.motor-config-dialog .el-dialog__footer) {
  padding: 13px 20px 15px;
  background-color: var(--app-surface);
  border-top: 1px solid var(--app-border);
}

/* 配置表单样式 */
.config-form {
  background-color: var(--app-surface-muted);
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
  border: 1px solid var(--app-border);
}

/* 配置工具区：与底部提交操作保持明确的层级分离。 */
.config-tool-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 16px;
  padding: 14px 16px;
  background-color: var(--app-surface-muted);
  border-radius: 10px;
  border: 1px solid var(--app-border);
}

.config-tool-copy,
.config-tool-actions {
  display: flex;
  align-items: center;
}

.config-tool-copy {
  gap: 11px;
  min-width: 240px;
}

.config-tool-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 12%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--el-color-primary) 25%, var(--app-border));
  border-radius: 9px;
}

.config-tool-title {
  color: var(--app-text);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.4;
}

.config-tool-description {
  margin-top: 2px;
  color: var(--app-text-muted);
  font-size: 12px;
  line-height: 1.4;
}

.config-tool-actions {
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.config-tool-actions :deep(.el-upload) {
  display: inline-flex;
}

.config-tool-actions .el-button {
  margin: 0;
}

.config-tool-separator {
  width: 1px;
  height: 24px;
  margin: 0 2px;
  background: var(--app-border-strong);
}

.config-validation-alert {
  margin: -4px 0 16px;
}

.config-validation-list {
  display: grid;
  gap: 3px;
  margin-top: 5px;
  color: var(--app-text-secondary);
  font-size: 12px;
}

/* 拖拽式报文结构样式 */
.message-structure-container {
  padding: 20px;
  background-color: var(--app-surface-muted);
  border-radius: 8px;
  border: 1px solid var(--app-border);
}

.message-fields-container {
  display: flex;
  gap: 15px;
  flex-wrap: wrap;
  align-items: flex-start;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

.message-field {
  background: var(--app-surface);
  border: 2px solid var(--app-border);
  border-radius: 8px;
  padding: 15px;
  min-width: 120px;
  max-width: 300px;
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
  cursor: move;
  position: relative;
}

.message-fields-container .message-field {
  transition: transform 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
}

.message-fields-container .message-field:hover {
  border-color: #409eff;
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.15);
  transform: translateY(-2px);
}

.message-field.fixed-field {
  border-color: #b3d8ff;
  background: color-mix(in srgb, var(--el-color-primary) 10%, var(--app-surface));
  cursor: default;
}

.message-fields-container .message-field.fixed-field:hover {
  border-color: #b3d8ff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.1);
  transform: none;
}

.field-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--app-border);
}

.drag-handle {
  color: #909399;
  cursor: grab;
  font-size: 14px;
  touch-action: none;
}

.fixed-field .drag-handle {
  cursor: default;
  color: #b3d8ff;
}

.field-title {
  font-weight: 600;
  color: var(--app-text);
  font-size: 14px;
  flex: 1;
}

.field-content {
  padding: 8px 0;
}

.field-config {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.field-unit {
  font-size: 12px;
  color: #909399;
}

.param-separator {
  color: #c0c4cc;
  font-weight: 500;
}

.checksum-params {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
}

/* 拖拽换位挤压动画：SortableJS animation 选项驱动其余模块平滑让位（iOS 桌面效果） */

/* 排序拖拽：落点占位槽 */
.structure-ghost {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--el-color-primary) 45%, var(--app-border));
  background: color-mix(in srgb, var(--el-color-primary) 8%, transparent);
  box-shadow: none;
  transition: none;
}

.structure-ghost > * {
  opacity: 0;
}

/* 排序拖拽：跟随光标的悬浮克隆体（SortableJS 已内联 position/z-index/pointer-events，
   且其定位使用 inline transform，因此这里只做阴影与描边高亮，不可用 transform） */
.structure-drag-clone {
  border-color: color-mix(in srgb, var(--el-color-primary) 60%, var(--app-border));
  background: var(--app-surface);
  box-shadow:
    0 16px 38px color-mix(in srgb, var(--app-shadow) 65%, transparent),
    0 0 0 1px color-mix(in srgb, var(--el-color-primary) 22%, transparent);
  cursor: grabbing;
  transition: none;
}

/* 响应式布局 */
@media (max-width: 768px) {
  .message-fields-container {
    flex-direction: column;
  }
  
  .message-field {
    max-width: 100%;
    min-width: auto;
  }
  
  .field-config {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .checksum-params {
    margin-left: 0;
    margin-top: 8px;
  }
}

:deep(.el-form-item__label) {
  font-weight: 500;
  color: var(--app-text);
}

/* Tab 标签样式 */
.tab-label {
  display: flex;
  align-items: center;
  gap: 5px;
}

.tab-label .el-tag {
  margin-left: 5px;
}

/* 命令 Tab 样式 */
.command-tabs {
  background: var(--app-surface);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
}

.command-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding: 10px 0;
  border-bottom: 1px solid var(--app-border);
}

/* 缩小配置对话框中输入框 prepend (0x) 的宽度，防止挤占输入空间 */
:deep(.motor-config-dialog .el-input-group__prepend) {
  padding: 0 6px;
  min-width: auto;
}

/* 命令表格样式 */
.command-table {
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--app-border);
}

.command-table :deep(.el-table__header-wrapper) {
  background-color: var(--app-surface-muted);
}

.command-table :deep(.el-table__header th) {
  background-color: var(--app-surface-muted);
  color: var(--app-text-secondary);
  font-weight: 600;
  border-bottom: 2px solid var(--app-border);
}

.command-table :deep(.el-table__row:hover) {
  background-color: var(--app-hover);
}

.command-table :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--app-border) inset;
}

.command-table :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px #409eff inset;
}

.command-table :deep(.el-input-number__decrease),
.command-table :deep(.el-input-number__increase) {
  background-color: var(--app-surface-muted);
}

/* 拖拽排序样式 */
.drag-handle {
  cursor: grab !important;
  transition: all 0.2s ease;
}

.drag-handle:hover {
  color: #409eff !important;
  transform: scale(1.2);
  transition: all 0.2s ease;
}

.drag-handle:active {
  cursor: grabbing !important;
  color: #3375b9;
  transform: scale(0.9);
}

/* 拖拽时的行样式 */
:deep(.el-table__row.sortable-ghost) {
  opacity: 0.5;
  background-color: color-mix(in srgb, var(--el-color-primary) 12%, var(--app-surface)) !important;
  border: 2px dashed #409eff !important;
  transform: scale(1.02);
  transition: all 0.2s ease;
}

:deep(.el-table__row.sortable-drag) {
  opacity: 0.8;
  transform: rotate(2deg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  background-color: color-mix(in srgb, var(--el-color-primary) 16%, var(--app-surface)) !important;
  border: 2px dashed #409eff;
  cursor: move;
}

/* 拖拽悬停时的行样式 */
:deep(.el-table__row.drag-over) {
  background-color: color-mix(in srgb, var(--el-color-primary) 18%, var(--app-surface)) !important;
  border-top: 2px solid #409eff !important;
  border-bottom: 2px solid #409eff !important;
  transform: translateY(2px);
  transition: all 0.2s ease;
}

/* 拖拽排序时的表格容器样式 */
.command-table.sorting-active {
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

/* 拖拽时的表格行过渡效果 */
:deep(.el-table__row) {
  transition: all 0.3s ease;
}

/* 排序成功时的动画效果 */
:deep(.el-table__row.sort-success) {
  animation: sortSuccess 0.5s ease-in-out;
}

@keyframes sortSuccess {
  0% {
    background-color: color-mix(in srgb, var(--el-color-primary) 10%, var(--app-surface));
    transform: scale(1);
  }
  50% {
    background-color: color-mix(in srgb, var(--el-color-primary) 16%, var(--app-surface));
    transform: scale(1.02);
  }
  100% {
    background-color: transparent;
    transform: scale(1);
  }
}

/* 拖拽手柄的动画效果 */
.drag-handle {
  transition: all 0.2s ease;
  cursor: grab;
}

.drag-handle:active {
  cursor: grabbing;
  transform: scale(0.9);
}

/* 对话框底部样式 */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  padding: 0;
}

.dialog-footer .el-button {
  margin: 0 !important;
}

@media (max-width: 820px) {
  .config-tool-card {
    align-items: flex-start;
    flex-direction: column;
  }

  .config-tool-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .config-tool-description {
    max-width: none;
  }
}

@media (max-width: 520px) {
  :deep(.motor-config-dialog .el-dialog__body) {
    padding: 14px;
  }

  .config-tool-copy {
    min-width: 0;
  }

  .config-tool-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .config-tool-actions :deep(.el-upload),
  .config-tool-actions .el-button {
    width: 100%;
  }

  .config-tool-separator {
    display: none;
  }

  .config-tool-actions > :last-child {
    grid-column: 1 / -1;
  }
}

/* 十六进制显示样式 */
.hex-display {
  font-family: 'Courier New', monospace;
  font-size: 11px;         /* 使用.hex-display-small的字体大小 */
  color: #409eff;
  background-color: color-mix(in srgb, var(--el-color-primary) 10%, var(--app-surface));
  padding: 2px 6px;        /* 使用.hex-display-small的内边距 */
  border-radius: 3px;      /* 使用.hex-display-small的圆角 */
  border: 1px solid #b3d8ff;
  white-space: nowrap;
  min-width: 45px;         /* 使用.hex-display-small的最小宽度 */
  width: 45px;             /* 使用.hex-display-small的宽度 */
  height: 25px;
  text-align: center;
  flex-shrink: 0;
  letter-spacing: 0.3px;   /* 使用.hex-display-small的字间距 */
  display: inline-flex;    /* 保持flex布局 */
  align-items: center;     /* 保持垂直居中 */
  justify-content: center; /* 保持水平居中 */
  line-height: normal;     /* 保持正常行高 */
}

/* 指令预览区域样式 */
.command-preview-container {
  background-color: var(--app-surface-muted);
  padding: 20px;
  border-radius: 8px;
  border: 1px solid var(--app-border);
  margin-bottom: 20px;
}

.message-preview {
  display: flex;
  gap: 4px;
  padding: 15px;
  background-color: var(--app-surface);
  border-radius: 6px;
  border: 1px solid var(--app-border);
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  min-height: 60px;
}

.preview-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 60px;
  height: 50px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.3s ease;
  cursor: pointer;
  position: relative;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  background-color: var(--app-surface-muted);
  color: var(--app-text-secondary);
  border: 1px solid var(--app-border);
}

.preview-cell:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

.cell-content {
  font-family: 'Courier New', monospace;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 2px;
}

.cell-label {
  font-size: 10px;
  opacity: 0.8;
  text-align: center;
}

/* 预览单元悬停效果 */
.preview-cell:hover {
  background-color: var(--app-hover);
  border-color: var(--app-border-strong);
}

/* 单个数据输入框容器 */
.single-data-input {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
}

/* 多数据输入框样式 */
.multi-data-inputs {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.multi-input-item {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.multi-data-inputs .el-input {
  flex-shrink: 0;
}

.multi-data-inputs .el-input:last-child {
  margin-right: 0;
}

.custom-checkbox :deep(.el-checkbox__inner) {
  width: 22px;
  height: 22px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .config-form {
    padding: 15px;
  }
  
  .command-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  
  .command-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  
  .command-item .command-btn {
    width: 100%;
  }
  
  .command-item .data-input-wrapper {
    width: 100%;
    padding-left: 0;
  }
  
  .multi-data-inputs {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  
  .multi-input-item {
    width: 100%;
  }
  
  .multi-data-inputs .el-input {
    width: 100% !important;
    margin-right: 0;
    margin-bottom: 4px;
  }
  
  .single-data-input {
    width: 100%;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
  
  .single-data-input .el-input {
    width: 100% !important;
  }
  
  .hex-display {
    width: 100%;
    text-align: left;
  }
}
</style>
