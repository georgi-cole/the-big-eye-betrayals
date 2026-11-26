import { mulberry32 } from '../store/rng.ts'
import { isCurrentCommand, viewFor } from './run.ts'
import type { CommandToken, Run } from './run.ts'
import { openShieldDeals } from './dayAftermath.ts'
import { prepareVotePlans } from './votePlans.ts'
import { walletsAfterChallenge } from './socialResources.ts'
import { openCastleMoment } from './castleLife.ts'
import { recordBetrayalsChallengeRewards } from './economy.ts'
import { NIGHT_SHIELD_COUNT } from './seasonPhases.ts'
import {
  castleRoleFor,
  eligibleCastleRole,
  recordCastleRoleUse,
  recordClairvoyantResults,
} from './castleRoles.ts'
import { shieldRoll } from './nightShields.ts'

export type RankedScore = {
  contestantId: string
  score: number
  rankScore?: number
  tieBreak?: number
  placement?: number
  potContribution: number
  forfeited?: boolean
}

export function chooseFatiguedSafety(run: Run): Run {
  const card = castleRoleFor(run, run.humanId)
  return run.phase === 'immunity' && card && eligibleCastleRole(run, run.humanId, 'fatigued')
    ? recordCastleRoleUse(run, card, { roleId: 'fatigued', day: run.day, challenge: 'safety' })
    : run
}

function fatiguedChallenge(run: Run, id: string) {
  const card = castleRoleFor(run, id)
  if (card?.roleId !== 'fatigued' || card.status === 'retired') return
  if (card.used?.roleId === 'fatigued' && card.used.day === run.day) return card.used.challenge
  if (!eligibleCastleRole(run, id, 'fatigued')) return
  if (id !== run.humanId) return shieldRoll(run, id, 7853) < 0.55 ? 'safety' : 'immunity'
  return 'immunity'
}

export function challengeContestantIds(run: Run): string[] {
  if (run.phase !== 'immunity' && run.phase !== 'safety' && run.phase !== 'final-challenge')
    return []
  return run.seats
    .filter(({ id, exit }) => {
      const available = fatiguedChallenge(run, id)
      return (
        !exit &&
        (run.phase !== 'safety' || run.immunityId !== id) &&
        (!available || run.phase === 'final-challenge' || available === run.phase)
      )
    })
    .map(({ id }) => id)
}

function rank(run: Run, scores: readonly RankedScore[]): RankedScore[] {
  const salt = run.phase === 'safety' ? 33 : run.phase === 'immunity' ? 72 : 99
  const random = mulberry32(run.publicSeed ^ Math.imul(run.day, 2654435761) ^ salt)
  // A game can report its winner and last place without ordering the middle of the field.
  const unreportedPlacement = scores.length - 0.5
  const withTieDraw = [...scores]
    .sort((a, b) => a.contestantId.localeCompare(b.contestantId))
    .map((result) => ({ result, draw: random() }))
  return withTieDraw
    .sort((left, right) => {
      const a = left.result
      const b = right.result
      return (
        Number(Boolean(a.forfeited)) - Number(Boolean(b.forfeited)) ||
        (a.placement ?? unreportedPlacement) - (b.placement ?? unreportedPlacement) ||
        (b.rankScore ?? b.score) - (a.rankScore ?? a.score) ||
        (a.tieBreak ?? Infinity) - (b.tieBreak ?? Infinity) ||
        left.draw - right.draw
      )
    })
    .map(({ result }) => result)
}

export function resolveChallenge(
  run: Run,
  token: CommandToken,
  scores: readonly RankedScore[],
  gameKey?: string,
  publicResults = false
): Run {
  if (!isCurrentCommand(run, token)) return run
  const expected = new Set(challengeContestantIds(run))
  if (expected.size === 0 || scores.length !== expected.size) return run
  for (const score of scores) {
    if (
      !expected.delete(score.contestantId) ||
      !Number.isFinite(score.score) ||
      (score.rankScore !== undefined && !Number.isFinite(score.rankScore)) ||
      (score.tieBreak !== undefined && !Number.isFinite(score.tieBreak)) ||
      (score.placement !== undefined &&
        (!Number.isInteger(score.placement) ||
          score.placement < 1 ||
          score.placement > scores.length)) ||
      !Number.isFinite(score.potContribution) ||
      score.potContribution < 0 ||
      score.potContribution > 1
    )
      return run
  }

  const standings = rank(run, scores)
  const cap = run.phase === 'final-challenge' ? 2000 : 1000
  const contribution = standings.reduce(
    (total, result) => total + (result.forfeited ? 0 : result.potContribution),
    0
  )
  const pot = run.pot + Math.round((cap * contribution) / standings.length)
  const revision = run.revision + 1
  let afterChallenge: Run = {
    ...run,
    pot,
    revision,
    ...(gameKey
      ? {
          challengeHistory: [
            ...(run.challengeHistory ?? []).filter((key) => key !== gameKey),
            gameKey,
          ],
        }
      : {}),
    socialWallets: walletsAfterChallenge(run, standings),
  }
  const tired = run.private.castleRoles?.find(({ roleId }) => roleId === 'fatigued')
  if (
    run.phase !== 'final-challenge' &&
    tired &&
    eligibleCastleRole(run, tired.guestId, 'fatigued') &&
    standings.some(({ contestantId }) => contestantId === tired.guestId)
  ) {
    const challenge = run.phase === 'immunity' ? 'immunity' : 'safety'
    afterChallenge = recordCastleRoleUse(afterChallenge, tired, {
      roleId: 'fatigued',
      day: run.day,
      challenge,
    })
  }
  if (run.phase === 'immunity') {
    const next: Run = {
      ...afterChallenge,
      phase: 'after-immunity',
      immunityId: standings[0].contestantId,
    }
    return recordBetrayalsChallengeRewards(
      run,
      openCastleMoment(next.options.publicMode ? next : prepareVotePlans(next), 'lunch'),
      standings
    )
  }
  if (run.phase === 'safety') {
    const nightShieldIds = standings
      .slice(0, NIGHT_SHIELD_COUNT)
      .map(({ contestantId }) => contestantId)
    const awarded = recordClairvoyantResults(
      {
        ...afterChallenge,
        phase: 'shield-deals',
        private: {
          ...afterChallenge.private,
          nightShieldIds,
          nightShieldAwardIds: undefined,
          safetyStandings: {
            day: run.day,
            publicResults,
            rows: standings.map(({ contestantId, score, forfeited }) => ({
              contestantId,
              score,
              forfeited,
            })),
          },
        },
      },
      nightShieldIds,
      publicResults
    )
    const next = openCastleMoment(openShieldDeals(awarded), 'supper')
    return recordBetrayalsChallengeRewards(run, next, standings)
  }
  return recordBetrayalsChallengeRewards(
    run,
    { ...afterChallenge, phase: 'final-banishment' },
    standings
  )
}

export function safetyResultsFor(run: Run, actorId: string | null) {
  const standings = run.private.safetyStandings
  if (!standings || standings.day !== run.day) return []
  const view = viewFor(run, actorId)
  const activeViewer = view.seats.some(({ id, exit }) => id === actorId && !exit)
  const names = new Map(view.seats.map(({ id, name }) => [id, name]))
  const reading = castleRoleFor(run, actorId)?.used
  const privatelyKnown =
    activeViewer &&
    castleRoleFor(run, actorId)?.clairvoyantUses &&
    reading?.roleId === 'clairvoyant' &&
    reading.day === run.day
      ? new Set(reading.shieldIds)
      : new Set<string>()
  return standings.rows.map(({ contestantId, score, forfeited }, index) => {
    const own = activeViewer && contestantId === actorId
    const shield = index < NIGHT_SHIELD_COUNT
    const revealName =
      standings.publicResults ||
      own ||
      (shield && (view.teammateIds.includes(contestantId) || privatelyKnown.has(contestantId)))
    return {
      name: revealName ? (names.get(contestantId) ?? null) : null,
      own,
      score,
      place: index + 1,
      forfeited: Boolean(forfeited),
      shield: revealName ? shield : undefined,
      ...(shield && privatelyKnown.has(contestantId) && { clairvoyant: true }),
    }
  })
}
