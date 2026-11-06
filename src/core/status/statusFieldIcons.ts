import type { Component } from 'vue'
import {
  Aim,
  Clock,
  Compass,
  Connection,
  DataAnalysis,
  Location,
  MapLocation,
  Odometer,
  Position,
  Stopwatch,
  TrendCharts,
} from '@element-plus/icons-vue'

export function getStatusFieldIcon(fieldName: string): Component {
  const field = fieldName.split('.').at(-1)?.toLowerCase() ?? ''

  if (field === 'utctime') return Clock
  if (field === 'ttff') return Stopwatch
  if (field === 'fixmode' || field === 'quality') return Position
  if (field === 'longitude' || field === 'latitude') return Location
  if (field === 'altitude' || field === 'altitudemsl') return TrendCharts
  if (field === 'velocity') return Odometer
  if (field === 'satsused' || field === 'satsvisible') return Connection
  if (field === 'pdop' || field === 'hdop') return Compass
  if (field === 'twodacc' || field === 'threedacc') return Aim
  if (field.includes('position')) return MapLocation
  return DataAnalysis
}
