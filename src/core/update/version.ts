/** 简单语义化版本比较：a > b 返回 1，a < b 返回 -1，相等返回 0；
    支持 v 前缀与 . - 分隔的数字段（忽略预发布段差异，按数字比较） */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/i, '')
      .split(/[.-]/)
      .map((s) => {
        const n = Number(s)
        return Number.isFinite(n) ? n : 0
      })
  const pa = parse(a)
  const pb = parse(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x > y) return 1
    if (x < y) return -1
  }
  return 0
}
