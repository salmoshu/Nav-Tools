import { DEFAULT_RTKPOST_OPTIONS, type RtkPostOptions } from './RtkPost'

/** Processing parameters shared by rnx2rtkp and rtkrcv, excluding the existing basic controls. */
export type RtkNaviAdvancedOptions = Omit<
  RtkPostOptions,
  | 'mode'
  | 'frequency'
  | 'ambiguityResolution'
  | 'constellations'
  | 'elevationMaskDeg'
  | 'basePositionMode'
  | 'solutionType'
  | 'startTime'
  | 'endTime'
  | 'intervalS'
  | 'outputFormat'
  | 'timeSystem'
  | 'timeFormat'
  | 'timeDecimals'
  | 'outputStatus'
  | 'traceLevel'
>
export type RtkNaviAdvancedKey = keyof RtkNaviAdvancedOptions

/** The first key is the canonical output; further keys are compatible aliases. */
export const RTKNAVI_ADVANCED_CONFIG: ReadonlyArray<{
  key: RtkNaviAdvancedKey
  configKeys: readonly string[]
}> = [
  { key: 'gloArMode', configKeys: ['pos2-gloarmode'] },
  { key: 'bdsArEnabled', configKeys: ['pos2-bdsarmode'] },
  { key: 'arFilterEnabled', configKeys: ['pos2-arfilter'] },
  { key: 'ratioThreshold', configKeys: ['pos2-arthres'] },
  { key: 'ratioMin', configKeys: ['pos2-arthresmin'] },
  { key: 'ratioMax', configKeys: ['pos2-arthresmax'] },
  { key: 'maxPosVar', configKeys: ['pos2-arthres1'] },
  { key: 'gloHwBiasM', configKeys: ['pos2-arthres2'] },
  { key: 'minLockCount', configKeys: ['pos2-arlockcnt'] },
  { key: 'arElevationMaskDeg', configKeys: ['pos2-arelmask'] },
  { key: 'minFixCount', configKeys: ['pos2-arminfix'] },
  { key: 'holdElevationMaskDeg', configKeys: ['pos2-elmaskhold'] },
  { key: 'dopplerSlipThresholdHz', configKeys: ['pos2-dopthres', 'pos2-thresdop'] },
  { key: 'gfSlipThresholdM', configKeys: ['pos2-slipthres'] },
  { key: 'maxAgeS', configKeys: ['pos2-maxage'] },
  { key: 'arResetOutageEpochs', configKeys: ['pos2-aroutcnt'] },
  { key: 'codeOutlierM', configKeys: ['pos2-rejcode'] },
  { key: 'phaseOutlierM', configKeys: ['pos2-rejionno'] },
  { key: 'filterIterations', configKeys: ['pos2-armaxiter'] },
  { key: 'syncSolutionEnabled', configKeys: ['pos2-syncsol'] },
  { key: 'baselineLengthM', configKeys: ['pos2-baselen'] },
  { key: 'baselineSigmaM', configKeys: ['pos2-basesig'] },
  { key: 'minFixSats', configKeys: ['pos2-minfixsats'] },
  { key: 'minHoldSats', configKeys: ['pos2-minholdsats'] },
  { key: 'minDropSats', configKeys: ['pos2-mindropsats'] },
  { key: 'holdAmbVar', configKeys: ['pos2-varholdamb'] },
  { key: 'holdAmbGain', configKeys: ['pos2-gainholdamb'] },
  { key: 'errorRatioL1', configKeys: ['stats-eratio1'] },
  { key: 'errorRatioL2', configKeys: ['stats-eratio2'] },
  { key: 'errorRatioL5', configKeys: ['stats-eratio5'] },
  { key: 'phaseErrorM', configKeys: ['stats-errphase'] },
  { key: 'phaseElevationErrorM', configKeys: ['stats-errphaseel'] },
  { key: 'phaseBaselineErrorM', configKeys: ['stats-errphasebl'] },
  { key: 'phaseSnrErrorM', configKeys: ['stats-errsnr'] },
  { key: 'snrMaxDbHz', configKeys: ['stats-snrmax'] },
  { key: 'receiverErrorM', configKeys: ['stats-errrcv'] },
  { key: 'dopplerErrorHz', configKeys: ['stats-errdoppler'] },
  { key: 'initialBiasStdM', configKeys: ['stats-stdbias'] },
  { key: 'initialIonoStdM', configKeys: ['stats-stdiono'] },
  { key: 'initialTropStdM', configKeys: ['stats-stdtrop'] },
  { key: 'receiverAccelHorizontalMps2', configKeys: ['stats-prnaccelh'] },
  { key: 'receiverAccelVerticalMps2', configKeys: ['stats-prnaccelv'] },
  { key: 'processBiasM', configKeys: ['stats-prnbias'] },
  { key: 'processIonoM', configKeys: ['stats-prniono'] },
  { key: 'processTropM', configKeys: ['stats-prntrop'] },
  { key: 'clockStabilitySps', configKeys: ['stats-clkstab'] },
]

export function createDefaultRtkNaviAdvancedOptions(): RtkNaviAdvancedOptions {
  return Object.fromEntries(
    RTKNAVI_ADVANCED_CONFIG.map(({ key }) => [key, DEFAULT_RTKPOST_OPTIONS[key]]),
  ) as unknown as RtkNaviAdvancedOptions
}
