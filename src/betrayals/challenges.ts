import { mulberry32 } from '../store/rng.ts'
import { isCurrentCommand, viewFor } from './run.ts'
import type { CommandToken, Run } from './run.ts'
import { walletsAfterChallenge } from './socialResources.ts'

export type RankedScore = {
  contestantId: string
  score: number
  tieBreak?: number
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
  const withTieDraw = [...scores]
    .sort((a, b) => a.contestantId.localeCompare(b.contestantId))
    .map((result) => ({ result, draw: random() }))
  return withTieDraw
    .sort((left, right) => {
      const a = left.result
      const b = right.result
      return (
        Number(Boolean(a.forfeited)) - Number(Boolean(b.forfeited)) ||
        b.score - a.score ||
        (a.tieBreak ?? Infinity) - (b.tieBreak ?? Infinity) ||
        left.draw - right.draw
      )
    })
    .map(({ result }) => result)
}

export function resolveChallenge(
  run: Run,
  token: CommandToken,
  scores: readonly RankedScore[]
): Run {
  if (!isCurrentCommand(run, token)) return run
  const expected = new Set(challengeContestantIds(run))
  if (expected.size === 0 || scores.length !== expected.size) return run
  for (const score of scores) {
    if (
      !expected.delete(score.contestantId) ||
      !Number.isFinite(score.score) ||
      (score.tieBreak !== undefined && !Number.isFinite(score.tieBreak)) ||
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
    socialWallets: walletsAfterChallenge(run, standings),
  }
  if (run.phase === 'immunity') {
    return { ...afterChallenge, phase: 'safety', immunityId: standings[0].contestantId }
  }
  if (run.phase === 'safety') {
    const nightShieldIds = standings.slice(0, 2).map(({ contestantId }) => contestantId)
    return {
      ...afterChallenge,
      phase: 'round-table',
      private: {
        ...run.private,
        nightShieldIds,
        safetyStandings: {
          day: run.day,
          rows: standings.map(({ contestantId, score, forfeited }) => ({
            contestantId,
            score,
            forfeited,
          })),
        },
      },
    }
  }
  return { ...afterChallenge, phase: 'final-banishment' }
}

export function safetyResultsFor(run: Run, actorId: string | null) {
  const standings = run.private.safetyStandings
  if (!standings || standings.day !== run.day) return []
  const view = viewFor(run, actorId)
  const activeViewer = view.seats.some(({ id, exit }) => id === actorId && !exit)
  const names = new Map(view.seats.map(({ id, name }) => [id, name]))
  return standings.rows.map(({ contestantId, score, forfeited }, index) => {
    const own = activeViewer && contestantId === actorId
    const revealName = own || view.knownNightShieldIds.includes(contestantId)
    return {
      name: revealName ? (names.get(contestantId) ?? null) : null,
      own,
      score,
      place: index + 1,
      forfeited: Boolean(forfeited),
      shield: run.private.nightShieldIds.includes(contestantId),
    }
  })
}
