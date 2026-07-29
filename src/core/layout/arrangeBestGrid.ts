export interface GridLayoutItem {
  x: number
  y: number
  w: number
  h: number
}

// 将组件列表按最优网格排列：组件数 ≤4 用 2 列，5~9 用 3 列，>9 用 4 列。
// 总宽固定为 12 栅格，因此每列宽 = 12 / 列数，行高固定为 6。
// 该函数为纯函数，不依赖任何运行时状态，可独立测试。
export function arrangeLayoutInBestGrid<T extends GridLayoutItem>(items: T[]): T[] {
  const componentCount = items.length
  const columnCount = componentCount > 9 ? 4 : componentCount > 4 ? 3 : 2
  const cellWidth = 12 / columnCount
  return items.map((item, index) => ({
    ...item,
    x: (index % columnCount) * cellWidth,
    y: Math.floor(index / columnCount) * 6,
    w: cellWidth,
    h: 6,
  }))
}
