import { describe, expect, it } from 'vitest'
import { betrayalsAdPlacement, getBetrayalsAdBreakAfter } from './adBreakPolicy'
import { BETRAYALS_AI_POOL } from './cast'
import { startRun, type Run } from './run'

function season(overrides: Partial<Run> = {}): Run {
  return {
    ...startRun(
      { id: 'human', name: 'You' },
      BETRAYALS_AI_POOL,
      { publicMode: false, realityMode: 'off' },
      { id: 'ad-season', roleSeed: 35, publicSeed: 23 }
    ),
    day: 3,
    revision: 8,
    ...overrides,
  }
}

describe('Betrayals automatic break cadence', () => {
  it('offers one ordinary banishment slot after the result, including an early season ending', () => {
    const receipt = { banishedId: 'alice', blind: false, tally: {}, tiedByDraw: false }
    const before = season({
      phase: 'table-reveal',
      private: { ...season().private, pendingTable: receipt },
    })
    for (const phase of ['night', 'final-challenge', 'settled'] as const) {
      const after = { ...before, revision: 9, phase, lastTable: receipt }
      const event = getBetrayalsAdBreakAfter(before, after)!
      expect(event).toEqual({ id: 'banishment:3', runId: before.id, day: 3, kind: 'banishment' })
      expect(betrayalsAdPlacement(event)).toBe('betrayals_banishment_break')
    }
  })

  it('places the night slot after its result, even when a shield prevented the murder', () => {
    const before = season({
      phase: 'night-resolved',
      private: { ...season().private, pendingNight: { targetId: 'alice', blocked: true } },
    })
    const after = {
      ...before,
      phase: 'final-challenge' as const,
      day: 4,
      revision: 9,
      lastDawn: { day: 4, eliminatedId: null },
    }
    expect(getBetrayalsAdBreakAfter(before, after)).toEqual({
      id: 'murder:3',
      runId: before.id,
      day: 3,
      kind: 'murder',
    })
    expect(getBetrayalsAdBreakAfter(season({ phase: 'night' }), before)).toBeUndefined()
  })

  it('uses final-vote slots for each final banishment without adding an ordinary break', () => {
    const receipt = { banishedId: 'alice', blind: true, tally: {}, tiedByDraw: false }
    const before = season({
      phase: 'table-reveal',
      private: { ...season().private, pendingTable: receipt },
    })
    const after = { ...before, revision: 9, phase: 'end-vote' as const, lastTable: receipt }
    const first = getBetrayalsAdBreakAfter(before, after)!
    expect(first.kind).toBe('final-vote')
    expect(betrayalsAdPlacement(first)).toBe('betrayals_final_vote_break')
    const secondReceipt = { ...receipt, banishedId: 'bob' }
    const second = getBetrayalsAdBreakAfter(
      { ...before, private: { ...before.private, pendingTable: secondReceipt } },
      { ...after, phase: 'settled', lastTable: secondReceipt }
    )!
    expect(second.id).not.toBe(first.id)
    expect(second.kind).toBe('final-vote')
  })

  it('covers repeated End Season votes and the final unanimous settlement separately', () => {
    const before = season({ phase: 'end-vote' })
    const first = getBetrayalsAdBreakAfter(before, {
      ...before,
      phase: 'final-banishment',
      revision: 9,
    })!
    const last = getBetrayalsAdBreakAfter(
      { ...before, revision: 12 },
      { ...before, revision: 13, phase: 'settled' }
    )!
    expect(first.kind).toBe('final-vote')
    expect(last.kind).toBe('final-vote')
    expect(last.id).not.toBe(first.id)
  })

  it('waits for a tied Final Five count to close before scheduling its runoff break', () => {
    const before = season({
      phase: 'final-banishment',
      tableCount: { round: 1, ballots: [], tiedIds: ['alice', 'bob'] },
    })
    expect(getBetrayalsAdBreakAfter(before, { ...before, revision: 9 })).toBeUndefined()
    expect(
      getBetrayalsAdBreakAfter(before, {
        ...before,
        revision: 9,
        tableCount: undefined,
        tableRound: 2,
      })?.kind
    ).toBe('final-vote')
    const ordinary = { ...before, phase: 'round-table' as const }
    expect(
      getBetrayalsAdBreakAfter(ordinary, {
        ...ordinary,
        revision: 9,
        tableCount: undefined,
        tableRound: 2,
      })
    ).toBeUndefined()
  })

  it('does not introduce breaks on challenge/social transitions, reloads, or a new run', () => {
    const before = season({ phase: 'social' })
    expect(
      getBetrayalsAdBreakAfter(before, { ...before, phase: 'immunity', revision: 9 })
    ).toBeUndefined()
    expect(getBetrayalsAdBreakAfter(before, before)).toBeUndefined()
    expect(
      getBetrayalsAdBreakAfter(before, { ...before, id: 'other', revision: 9 })
    ).toBeUndefined()
  })
})
