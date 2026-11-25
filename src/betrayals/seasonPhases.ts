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
  'after-immunity': 'After Immunity · Vote Plans',
  safety: 'Safety Challenge',
  'shield-deals': 'Before the Table · Shield Deals',
  'final-challenge': 'Final challenge',
  'round-table': 'Round Table',
  'final-banishment': 'Final banishment',
  'table-reveal': 'Vote result',
  cocktail: 'Cocktails',
  night: 'Night',
  'night-resolved': 'Night',
  'end-vote': 'End Season',
  settled: 'Season result',
}

export const phaseGroupLabel: Record<Phase, string> = {
  'role-reveal': 'Opening',
  dawn: 'Day',
  social: 'Day',
  immunity: 'Day',
  'after-immunity': 'Day',
  safety: 'Day',
  'shield-deals': 'Day',
  'final-challenge': 'Finale',
  'round-table': 'Council',
  'table-reveal': 'Council',
  cocktail: 'Evening',
  night: 'Night',
  'night-resolved': 'Night',
  'final-banishment': 'Finale',
  'end-vote': 'Finale',
  settled: 'Finale',
}
