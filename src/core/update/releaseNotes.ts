/**
 * releaseNotes 摘要：去掉 Markdown 标题/列表符号，取前几行纯文本。
 * 供 UpdateDialog 与设置页版本区共用。
 */
export function summarizeReleaseNotes(notes: string, maxLines = 5): string {
  if (!notes) return ''
  return notes
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^#+\s*/, '')
        .replace(/^[-*]\s*/, '')
        .trim(),
    )
    .filter(Boolean)
    .slice(0, maxLines)
    .join('\n')
}
