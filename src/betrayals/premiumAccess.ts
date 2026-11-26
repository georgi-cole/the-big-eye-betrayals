import type { InvestigationAction } from './investigation'
import type { CastleChoice } from './castleLifeBank'
import type { SocialEntry, TableSway } from './run'

/** Basic conversation and management remain available in every eligible phase. */
export const BASIC_BETRAYALS_ACTIONS: readonly SocialEntry['kind'][] = [
  'rapport',
  'question',
  'debrief',
  'mend-fences',
  'end-pact',
  'lay-low',
  'explore-castle',
  'shield-gift',
  'shield-request',
  'ask-shield',
]

export function isPremiumBetrayalsAction(kind: SocialEntry['kind']) {
  return !BASIC_BETRAYALS_ACTIONS.includes(kind)
}

export function canUseBetrayalsAction(
  kind: SocialEntry['kind'],
  realityMode: boolean,
  dramaMode = false
) {
  if (kind === 'reveal-castle-role') return dramaMode
  return realityMode || !isPremiumBetrayalsAction(kind)
}

export function isPremiumCastleChoice(choice: CastleChoice) {
  return choice === 'ask' || choice === 'observe' || isPremiumBetrayalsAction(choice)
}

export function investigationProductFor(action: InvestigationAction): 'myPulse' | 'realityMode' {
  return action.kind === 'save' || action.kind === 'note' ? 'myPulse' : 'realityMode'
}

/** Voting and an ordinary, careful contribution remain available without an upgrade. */
export function canUseBetrayalsTableSway(choice: TableSway | null, hasRealityMode: boolean) {
  return (
    choice === null ||
    hasRealityMode ||
    (choice.tone === 'careful' &&
      choice.stance !== 'defend' &&
      choice.evidence === undefined &&
      choice.investigation === undefined)
  )
}
