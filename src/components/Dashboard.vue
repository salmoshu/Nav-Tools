<template>
  <div class="dashboard">
    <Toolbar 
      @positionChange="handleToolbarPositionChange"
      @funcModeChange="handleFuncModeChange"
    />
    
    <div 
      class="dashboard-content" 
      :class="{ 
        'toolbar-top': toolbarPosition === 'top',
        'toolbar-bottom': toolbarPosition === 'bottom',
        'toolbar-left': toolbarPosition === 'left',
        'toolbar-right': toolbarPosition === 'right'
      }"
      :style="contentStyle"
    >
      <!-- Grid Layout Plus 拖拽布局区域 -->
      <div class="dashboard-grid">
        <grid-layout
          v-model:layout="layoutDraggableList"
          :col-num="12"
          :row-height="60"
          :is-draggable="draggableLayout"
          :is-resizable="resizableLayout"
          :vertical-compact="true"
          :use-css-transforms="true"
          :margin="[10, 10]"
          class="grid-layout"
        >
          <grid-item
            v-for="item in layoutDraggableList"
            :key="item.i"
            :x="item.x"
            :y="item.y"
            :w="item.w"
            :h="item.h"
            :i="item.i"
            :minW="item.minW || 3"
            :minH="item.minH || 3"
            :maxW="item.maxW || 6"
            :maxH="item.maxH || 6"
            @resize="resizeEvent"
            @moved="movedEvent"
          >
            <div class="layout-component">
              <el-card class="box-card" shadow="always">
                <template #header>
                  <div class="card-header">
                    <span class="title">{{ item.titleName }}</span>
                    <div class="card-actions">
                      <el-button 
                        type="text" 
                        @click="removeItem(item.i)"
                        class="remove-btn"
                      >
                        <el-icon><Close /></el-icon>
                      </el-button>
                    </div>
                  </div>
                </template>
                <component :is="item.component" v-bind="item.props" />
              </el-card>
            </div>
          </grid-item>
        </grid-layout>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { GridLayout, GridItem } from 'grid-layout-plus'
import { ElButton, ElCard, ElIcon } from 'element-plus'
import { Close } from '@element-plus/icons-vue'
import Toolbar from './Toolbar.vue'
import emitter from '@/hooks/useMitt'
import { useLayoutManager } from '@/composables/useLayoutManager'
import { FuncMode, FuncModeMap } from '@/types/mode'

const {
  layoutDraggableList,
  currentFuncMode,
  isEditDraggable,
  draggableLayout,
  resizableLayout,
  initLayout,
  saveLayout,
  resetLayout,
  editLayout,
  addItem,
  removeItem,
  handleFuncModeChange
} = useLayoutManager()

// 工具栏位置状态（这是 Dashboard 特有的，不在 useLayoutManager 中）
const toolbarPosition = ref<'top' | 'right' | 'bottom' | 'left'>('top')
const toolbarSize = ref({ width: 40, height: 40 })

// 工具栏位置处理
const handleToolbarPositionChange = (position: 'top' | 'right' | 'bottom' | 'left') => {
  toolbarPosition.value = position
}

// 内容区域样式计算
const contentStyle = computed(() => {
  const size = toolbarSize.value
  switch (toolbarPosition.value) {
    case 'top':
      return {
        height: `calc(100vh - ${size.height}px)`,
        marginTop: `${size.height}px`
      }
    case 'bottom':
      return {
        height: `calc(100vh - ${size.height}px)`,
        marginBottom: `${size.height}px`
      }
    case 'left':
      return {
        width: `calc(100vw - ${size.width}px)`,
        marginLeft: `${size.width}px`
      }
    case 'right':
      return {
        width: `calc(100vw - ${size.width}px)`,
        marginRight: `${size.width}px`
      }
    default:
      return {}
  }
})

// 事件处理函数
const resizeEvent = (i: string, newH: number, newW: number, newHPx: number, newWPx: number) => {
  console.log('RESIZE i=' + i + ', H=' + newH + ', W=' + newW + ', H(px)=' + newHPx + ', W(px)=' + newWPx)
}

const movedEvent = (i: string, newX: number, newY: number) => {
  console.log('MOVED i=' + i + ', X=' + newX + ', Y=' + newY)
}

// 生命周期
onMounted(() => {
  initLayout()
  
  emitter.on('save', saveLayout)
  emitter.on('reset', resetLayout)
  emitter.on('edit', editLayout)

  FuncModeMap.forEach(([mode, event]) => {
    emitter.on(event, () => {
      handleFuncModeChange(mode)
    })
  })
})

onUnmounted(() => {
  emitter.all.clear()
})
</script>

<style scoped>
.dashboard {
  width: 100vw;
  height: 100vh;
  position: relative;
  overflow: hidden;
  background-color: #F0F0F0;
}

.dashboard-content {
  width: 100%;
  height: 100%;
  transition: all 0.3s ease;
  position: relative;
  border: 5px solid #E0E0E0;
}

.dashboard-grid {
  padding: 10px;
  height: calc(100% - 60px);
}

.grid-layout {
  border-radius: 8px;
  min-height: 100%;
}

.layout-component {
  height: 100%;
  width: 100%;
}

.box-card {
  height: 100%;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  overflow: auto;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 15px;
}

.title {
  font-weight: 600;
  font-size: 16px;
}

.card-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.remove-btn {
  padding: 0;
  color: #909399;
}

.remove-btn:hover {
  color: #F56C6C;
}
</style>
