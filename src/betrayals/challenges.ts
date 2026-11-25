import { mulberry32 } from '../store/rng.ts'
import { isCurrentCommand, viewFor } from './run.ts'
import type { CommandToken, Run } from './run.ts'
import { openShieldDeals } from './dayAftermath.ts'
import { prepareVotePlans } from './votePlans.ts'
import { walletsAfterChallenge } from './socialResources.ts'
import { addAudienceEvents, openAudienceEpisode } from './audienceSeason.ts'
import { openCastleMoment } from './castleLife.ts'
import { recordBetrayalsChallengeRewards } from './economy.ts'
import { NIGHT_SHIELD_COUNT } from './seasonPhases.ts'

export type RankedScore = {
  contestantId: string
  score: number
  rankScore?: number
  tieBreak?: number
  placement?: number
  potContribution: number
  forfeited?: boolean
}

export function challengeContestantIds(run: Run): string[] {
  if (run.phase !== 'immunity' && run.phase !== 'safety' && run.phase !== 'final-challenge')
    return []
  return run.seats
    .filter(({ id, exit }) => !exit && (run.phase !== 'safety' || run.immunityId !== id))
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
  const afterChallenge = {
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
  if (run.phase === 'immunity') {
    const next: Run = {
      ...afterChallenge,
      phase: 'after-immunity',
      immunityId: standings[0].contestantId,
    }
    const prepared = next.options.publicMode
      ? addAudienceEvents(openAudienceEpisode(next), [
          { kind: 'immunity', actorId: standings[0].contestantId },
        ])
      : prepareVotePlans(next)
    return recordBetrayalsChallengeRewards(run, openCastleMoment(prepared, 'lunch'), standings)
  }
  if (run.phase === 'safety') {
    const nightShieldIds = standings
      .slice(0, NIGHT_SHIELD_COUNT)
      .map(({ contestantId }) => contestantId)
    const next = openCastleMoment(
      openShieldDeals({
        ...afterChallenge,
        phase: 'shield-deals',
        private: {
          ...run.private,
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
      }),
      'supper'
    )
    const aired = publicResults
      ? addAudienceEvents(
          next,
          nightShieldIds.map((actorId) => ({ kind: 'safety', actorId }))
        )
      : next
    return recordBetrayalsChallengeRewards(run, aired, standings)
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
  return standings.rows.map(({ contestantId, score, forfeited }, index) => {
    const own = activeViewer && contestantId === actorId
    const shield = index < NIGHT_SHIELD_COUNT
    const revealName =
      standings.publicResults || own || (shield && view.teammateIds.includes(contestantId))
    return {
      name: revealName ? (names.get(contestantId) ?? null) : null,
      own,
      score,
      place: index + 1,
      forfeited: Boolean(forfeited),
      shield,
    }
  })
}
