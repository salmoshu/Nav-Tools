import { ref, onMounted, onUnmounted } from 'vue'

export function useUserControl(personState: any, setPersonPosition: (x: number, y: number) => void) {
  const isDraggingPerson = ref(false)
  let dragStartX = 0
  let dragStartY = 0
  let personStartX = 0
  let personStartY = 0
  const moveSpeed = 10 // 键盘移动速度
  
  // 容器和人物尺寸常量
  const CONTAINER_WIDTH = 800
  const CONTAINER_HEIGHT = 600
  const PERSON_WIDTH = 30
  const PERSON_HEIGHT = 30

  // 鼠标拖拽控制
  const handleMouseDown = (event: MouseEvent) => {
    isDraggingPerson.value = true
    dragStartX = event.clientX
    dragStartY = event.clientY
    personStartX = personState.x
    personStartY = personState.y
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const handleMouseMove = (event: MouseEvent) => {
    if (!isDraggingPerson.value) return
    
    const deltaX = event.clientX - dragStartX
    const deltaY = event.clientY - dragStartY
    
    // 计算新位置并添加边界检查
    const newX = personStartX + deltaX
    const newY = personStartY + deltaY
    
    // 确保人物不会超出容器边界
    const clampedX = Math.max(0, Math.min(CONTAINER_WIDTH - PERSON_WIDTH, newX))
    const clampedY = Math.max(0, Math.min(CONTAINER_HEIGHT - PERSON_HEIGHT, newY))
    
    setPersonPosition(clampedX, clampedY)
  }

  const handleMouseUp = () => {
    isDraggingPerson.value = false
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }

  // 键盘控制
  const handleKeyDown = (event: KeyboardEvent) => {
    // 防止拖动时同时响应键盘事件
    if (isDraggingPerson.value) return
  
    // 阻止事件冒泡和默认行为，防止外层div滚动
    event.preventDefault()
    event.stopPropagation()
  
    let newX = personState.x
    let newY = personState.y
  
    // 根据按下的键更新位置
    switch (event.key) {
      case 'ArrowUp':
        newY -= moveSpeed
        break
      case 'ArrowDown':
        newY += moveSpeed
        break
      case 'ArrowLeft':
        newX -= moveSpeed
        break
      case 'ArrowRight':
        newX += moveSpeed
        break
      default:
        return // 不处理其他键
    }
  
    // 添加边界检查
    const clampedX = Math.max(0, Math.min(CONTAINER_WIDTH - PERSON_WIDTH, newX))
    const clampedY = Math.max(0, Math.min(CONTAINER_HEIGHT - PERSON_HEIGHT, newY))
    
    // 更新位置
    setPersonPosition(clampedX, clampedY)
  }

  // 注册事件监听
  onMounted(() => {
    document.addEventListener('keydown', handleKeyDown)
  })

  // 清理事件监听
  onUnmounted(() => {
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
    document.removeEventListener('keydown', handleKeyDown)
  })

  return {
    handleMouseDown,
    isDraggingPerson
  }
}