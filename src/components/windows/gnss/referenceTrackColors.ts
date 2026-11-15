// RTKPlot solution 2 marker colors, mapped to the panel's GGA-style quality codes.
export const RTKPLOT_REFERENCE_COLORS: Readonly<Record<number, string>> = {
  0: '#c0c0c0',
  1: '#ff8080',
  2: '#0080ff',
  4: '#004080',
  5: '#808000',
  6: '#8080ff',
}

export function referenceQualityColor(quality: number): string {
  return RTKPLOT_REFERENCE_COLORS[quality] ?? RTKPLOT_REFERENCE_COLORS[0]
}

export function referenceQualityColorRgb01(quality: number): [number, number, number] {
  const color = referenceQualityColor(quality)
  return [
    Number.parseInt(color.slice(1, 3), 16) / 255,
    Number.parseInt(color.slice(3, 5), 16) / 255,
    Number.parseInt(color.slice(5, 7), 16) / 255,
  ]
}
