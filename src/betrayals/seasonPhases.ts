import type { Phase } from './run'

export const MIN_BETRAYERS = 3
export const MAX_BETRAYERS = 4
export const NIGHT_SHIELD_COUNT = 2
export const FINALE_CAST_SIZE = 5
export const FINAL_SURVIVOR_COUNT = 2

export const phaseLabel: Record<Phase, string> = {
  'role-reveal': 'Your role',
  dawn: 'Dawn',
  social: 'Social',
  immunity: 'Immunity Challenge',
  safety: 'Safety Challenge',
  'final-challenge': 'Final challenge',
  'round-table': 'Round Table',
  'final-banishment': 'Final banishment',
  'table-reveal': 'Vote result',
  night: 'Night',
  'night-resolved': 'Daybreak',
  'end-vote': 'End Season',
  settled: 'Season result',
}

export const phaseGroupLabel: Record<Phase, string> = {
  'role-reveal': 'Opening',
  dawn: 'Day',
  social: 'Day',
  immunity: 'Day',
  safety: 'Day',
  'final-challenge': 'Finale',
  'round-table': 'Council',
  'table-reveal': 'Council',
  night: 'Night',
  'night-resolved': 'Night',
  'final-banishment': 'Finale',
  'end-vote': 'Finale',
  settled: 'Finale',
}
