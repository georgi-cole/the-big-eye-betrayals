import type { AdPlacement } from '../services/ads/adsService'
import type { Run } from './run'

export type BetrayalsAdBreakEvent = {
  id: string
  runId: string
  day: number
  kind: 'banishment' | 'murder' | 'final-vote'
}

const placements: Record<BetrayalsAdBreakEvent['kind'], AdPlacement> = {
  banishment: 'betrayals_banishment_break',
  murder: 'betrayals_murder_break',
  'final-vote': 'betrayals_final_vote_break',
}

export function betrayalsAdPlacement(event: BetrayalsAdBreakEvent): AdPlacement {
  return placements[event.kind]
}

/**
 * The event is saved with the new run, but only presented after its result and
 * cinematic queue have closed. Ordinary days have exactly two possible slots;
 * the Final Five use a separate slot after each completed vote instead.
 */
export function getBetrayalsAdBreakAfter(
  before: Run,
  after: Run
): BetrayalsAdBreakEvent | undefined {
  if (before.id !== after.id || after.revision <= before.revision) return
  const event = (kind: BetrayalsAdBreakEvent['kind'], id: string): BetrayalsAdBreakEvent => ({
    id,
    runId: before.id,
    day: before.day,
    kind,
  })

  if (
    before.phase === 'table-reveal' &&
    before.private.pendingTable &&
    after.phase !== 'table-reveal' &&
    after.lastTable?.banishedId === before.private.pendingTable.banishedId
  ) {
    return before.private.pendingTable.blind
      ? event('final-vote', `banishment:${after.lastTable.banishedId}`)
      : event('banishment', `banishment:${before.day}`)
  }

  // A prevented murder still completes the night's result. If five guests now
  // remain, this slot belongs to that completed ordinary night, not the finale.
  if (
    before.phase === 'night-resolved' &&
    before.private.pendingNight &&
    after.day === before.day + 1 &&
    after.lastDawn?.day === after.day
  ) {
    return event('murder', `murder:${before.day}`)
  }

  if (
    before.phase === 'end-vote' &&
    (after.phase === 'final-banishment' || after.phase === 'settled')
  ) {
    return event('final-vote', `end-season:${after.revision}`)
  }

  // A tied final vote ends when its count is dismissed and the runoff opens.
  // The successful vote is handled by the banishment case above, exactly once.
  if (
    before.phase === 'final-banishment' &&
    after.phase === 'final-banishment' &&
    before.tableCount &&
    before.tableCount.tiedIds.length > 1 &&
    !after.tableCount &&
    after.tableRound === before.tableCount.round + 1
  ) {
    return event('final-vote', `runoff:${after.revision}`)
  }
}
