/**
 * 命令历史的模糊匹配与排序(纯函数,可单测)。
 *
 * 服务于 GUI 输入行的 Ctrl+R 历史搜索:子序列匹配(大小写不敏感),
 * 打分偏向「连续命中」「词首命中」「越靠后输入的越常用」。
 * 不引外部模糊搜索库——需求只有几十到几百条历史,一个函数足够。
 */

export interface FuzzyMatch<T> {
  item: T
  /** 展示文本:由调用方给出(对历史搜索就是命令字符串本身) */
  text: string
  /** 命中的字符下标,供 UI 高亮;无命中不出现 */
  positions: number[]
  score: number
}

/**
 * 子序列判定 + 打分。query 为空串时视为「全匹配但零分」,
 * 由调用方决定空查询是否列出全部。
 */
function matchItem(query: string, text: string): { positions: number[]; score: number } | null {
  if (!query) return { positions: [], score: 0 }

  const lowerQuery = query.toLowerCase()
  const lowerText = text.toLowerCase()
  const positions: number[] = []
  let score = 0
  let consecutive = 0
  let cursor = 0

  for (let i = 0; i < lowerQuery.length; i++) {
    const char = lowerQuery[i]
    const found = lowerText.indexOf(char, cursor)
    if (found === -1) return null

    // 词首(前一个字符不是字母数字)命中权重最高
    const isWordStart = found === 0 || !/[a-z0-9]/.test(lowerText[found - 1])
    if (isWordStart) score += 8

    // 连续命中给递增奖励,模拟「整词输入」优先
    if (found === cursor && i > 0) {
      consecutive += 1
      score += 4 * consecutive
    } else {
      consecutive = 0
      score += 1
    }

    // 命中越靠前越好(信息量大的词通常在命令开头)
    score += Math.max(0, 4 - Math.floor(found / 8))

    positions.push(found)
    cursor = found + 1
  }
  return { positions, score }
}

/**
 * 对候选列表做模糊过滤与排序。
 *
 * @param query 查询串;空串按「最新在前」返回全部,便于刚打开搜索时浏览
 * @param items 候选项;假定已按时间先后排列(索引大 = 较新),较新的同分靠前
 * @param limit 最多返回条数
 */
export function fuzzySearch<T>(
  query: string,
  items: T[],
  limit = 20,
): FuzzyMatch<T>[] {
  // 空查询:按「最新在前」原样返回,匹配刚打开搜索时的浏览习惯
  if (!query) {
    return items
      .slice(-limit)
      .reverse()
      .map((item) => ({ item, text: String(item), positions: [], score: 0 }))
  }

  const results: FuzzyMatch<T>[] = []
  for (let index = 0; index < items.length; index++) {
    const item = items[index]
    const text = String(item)
    const matched = matchItem(query, text)
    if (!matched) continue
    // 较新的历史加小额时间权重:同分时最近用过的排前面
    const recency = index * 0.01
    results.push({
      item,
      text,
      positions: matched.positions,
      score: matched.score + recency,
    })
  }
  results.sort((a, b) => b.score - a.score)
  return results.slice(0, limit)
}
