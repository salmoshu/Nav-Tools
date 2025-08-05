import { ref, onUnmounted } from 'vue'

export function useUserControl(personState: any, setPersonPosition: (x: number, y: number) => void) {
  const isDraggingPerson = ref(false)
  let dragStartX = 0
  let dragStartY = 0
  let personStartX = 0
  let personStartY = 0

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
    
    setPersonPosition(personStartX + deltaX, personStartY + deltaY)
  }

  const handleMouseUp = () => {
    isDraggingPerson.value = false
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }

  onUnmounted(() => {
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  })

  return {
    handleMouseDown,
    isDraggingPerson
  }
}