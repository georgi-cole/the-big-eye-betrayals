import { describe, expect, it } from 'vitest'
import { getGame } from '../minigames/registryBase'
import { BETRAYALS_AI_POOL } from './cast'
import {
  betrayalsChallengeExperience,
  betrayalsChallengeInstructions,
  betrayalsChallengePotTarget,
} from './challengeExperience'
import { scoreField, type ChallengeGame } from './challengeRotation'
import { startRun } from './run'

function challenge(key: string, potTarget = 300): ChallengeGame {
  return { ...getGame(key)!, play: 'solo', publicResults: false, potTarget }
}

describe('Betrayals premium competition adapters', () => {
  it.each([
    ['cardClash', true],
    ['riskWheel', true],
    ['glass_bridge_brutal', true],
    ['crystal_path_shattered', true],
    ['chainOfGreed', true],
    ['houseOfDarkness', true],
    ['majorityRules', true],
    ['batteryLow', false],
    ['colorMatch', false],
  ])('selects only supported premium presentations for %s', (key, expected) => {
    const game = challenge(key as string)
    expect(betrayalsChallengeExperience(game, true).premiumPresentation).toBe(expected)
    expect(betrayalsChallengeExperience(game, false).premiumPresentation).toBe(false)
    expect(betrayalsChallengeInstructions(game, false)).toBe(game.instructions)
  })

  it('briefs players on the real three-round Quick Tap variants', () => {
    expect(betrayalsChallengeExperience(challenge('quickTap'), true).quickTapVariant).toBe('race')
    expect(betrayalsChallengeExperience(challenge('quickTapSeasons'), true).quickTapVariant).toBe(
      'seasons'
    )
    expect(
      betrayalsChallengeExperience(challenge('quickTap'), false).quickTapVariant
    ).toBeUndefined()
    expect(betrayalsChallengeInstructions(challenge('quickTap'), true).join(' ')).toContain(
      'three 25-second rounds'
    )
    expect(betrayalsChallengeInstructions(challenge('quickTapSeasons'), true).join(' ')).toContain(
      'three 28-second rounds'
    )
  })

  it('normalizes only the pot target for a completed longer race, leaving raw scores intact', () => {
    const run = {
      ...startRun(
        { id: 'human', name: 'You' },
        BETRAYALS_AI_POOL,
        { publicMode: false, realityMode: 'off' },
        { id: 'premium-race', publicSeed: 14, roleSeed: 35 }
      ),
      phase: 'immunity' as const,
    }
    const game = challenge('quickTap')
    const ids = run.seats.map(({ id }) => id)
    const completion = {
      betrayalsQuickTapVariant: 'race' as const,
      authoritativeRankedIds: ids,
      rawResults: Object.fromEntries(ids.map((id, i) => [id, 750 - i * 10])),
    }
    const field = scoreField(run, game, { score: 750, completion })
    expect(betrayalsChallengePotTarget(game, completion)).toBe(750)
    expect(field.find(({ contestantId }) => contestantId === run.humanId)?.potContribution).toBe(1)
    expect(field.map(({ score }) => score)).toEqual(ids.map((_, i) => 750 - i * 10))
    expect(field.find(({ contestantId }) => contestantId === ids[1])?.placement).toBe(2)
    expect(
      betrayalsChallengePotTarget(challenge('quickTapSeasons', 360), {
        betrayalsQuickTapVariant: 'seasons',
      })
    ).toBe(756)
  })

  it('leaves standard games, unrelated games and mismatched variant reports unchanged', () => {
    expect(betrayalsChallengePotTarget(challenge('quickTap'))).toBe(300)
    expect(
      betrayalsChallengePotTarget(challenge('quickTap'), { betrayalsQuickTapVariant: 'seasons' })
    ).toBe(300)
    expect(
      betrayalsChallengePotTarget(challenge('colorMatch', 100), {
        betrayalsQuickTapVariant: 'race',
      })
    ).toBe(100)
  })
})
