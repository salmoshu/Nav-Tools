import { RtkSolutionParser } from '@/core/gnsslib/RtkSolution'

export type GnssTextParser = 'nmea' | 'rtklib-pos'

const NMEA_SENTENCE = /^\s*\$[A-Z0-9]{2}[A-Z]{3},/im

/** Detect the two text formats accepted by the GNSS timeline without trusting the suffix. */
export function detectGnssTextParser(text: string): GnssTextParser | undefined {
  if (NMEA_SENTENCE.test(text)) return 'nmea'

  const parser = new RtkSolutionParser()
  for (const line of text.split(/\r?\n/)) {
    if (parser.addLine(line)) return 'rtklib-pos'
  }
  return undefined
}
