import { describe, expect, it } from 'vitest'
import { arrangeLayoutInBestGrid } from '@/core/layout/arrangeBestGrid'
import { DEFAULT_APPLICATIONS } from '@/core/application/ApplicationStorage'
import { panelRegistry } from '@/core/panels/registry'

// 需求 #160：GNSS 应用的默认布局应是最佳布局，且包含应用设定的全部组件（每个仅一个）。
describe('GNSS 默认布局（需求 #160）', () => {
  const gnss = DEFAULT_APPLICATIONS.find(application => application.id === 'gnss')

  it('GNSS 应用包含了所有设定组件，且每个组件仅一个（配置完整性）', () => {
    expect(gnss).toBeDefined()
    const ids = gnss!.windowIds
    // 每个设定组件都是注册表中真实存在的面板
    for (const id of ids) {
      expect(panelRegistry.some(panel => panel.id === id)).toBe(true)
    }
    // 设定组件无重复
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('默认布局即为最佳布局（最优网格排列）', () => {
    // GNSS 设定 5 个组件：5 > 4 ⇒ 3 列，列宽 = 12 / 3 = 4
    const items = gnss!.windowIds.map((id, index) => ({ i: `${id}-${index + 1}`, windowId: id, x: 0, y: 0, w: 6, h: 6 }))
    const arranged = arrangeLayoutInBestGrid(items)

    expect(arranged.every(item => item.w === 4)).toBe(true)
    // 从左到右、自上而下填充
    expect(arranged[0].x).toBe(0)
    expect(arranged[1].x).toBe(4)
    expect(arranged[2].x).toBe(8)
    expect(arranged[3].x).toBe(0)
    expect(arranged[3].y).toBe(6)
    expect(arranged[4].x).toBe(4)
    expect(arranged[4].y).toBe(6)
    // 组件数量与唯一性保持不变：每个组件仅一个
    expect(arranged.length).toBe(gnss!.windowIds.length)
    expect(new Set(arranged.map(item => item.windowId)).size).toBe(arranged.length)
  })

  it('最佳布局网格列数随组件数自适应', () => {
    const make = (n: number) => Array.from({ length: n }, (_, i) => ({ i: `${i}`, windowId: `w${i}`, x: 0, y: 0, w: 6, h: 6 }))
    expect(arrangeLayoutInBestGrid(make(2)).every(i => i.w === 6)).toBe(true) // 2 列
    expect(arrangeLayoutInBestGrid(make(5)).every(i => i.w === 4)).toBe(true) // 3 列
    expect(arrangeLayoutInBestGrid(make(12)).every(i => i.w === 3)).toBe(true) // 4 列
  })
})
