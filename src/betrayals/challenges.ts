import { mulberry32 } from '../store/rng.ts'
import { isCurrentCommand } from './run.ts'
import type { CommandToken, Run } from './run.ts'

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
  if (run.phase === 'immunity') {
    return { ...run, pot, revision, phase: 'safety', immunityId: standings[0].contestantId }
  }
  if (run.phase === 'safety') {
    const nightShieldIds = standings.slice(0, 2).map(({ contestantId }) => contestantId)
    return {
      ...run,
      pot,
      revision,
      phase: 'round-table',
      private: { ...run.private, nightShieldIds },
    }
  }
  return { ...run, pot, revision, phase: 'final-banishment' }
}
