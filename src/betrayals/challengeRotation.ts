import { getCompetitionProfile } from '../data/houseguests'
import { simulateQuickTapAiScore } from '../ai/competition/quickTapSimulation'
import { simulateColorMatchAiRoundScore } from '../components/ColorMatchComp/colorMatchUtils'
import { challengeContestantIds } from './challenges'
import type { RankedScore } from './challenges'
import type { Run } from './run'

export function challengeGame(run: Run): 'quick-tap' | 'color-match' {
  if (run.phase === 'final-challenge') return 'color-match'
  const quickTap = run.phase === 'immunity' ? run.day % 2 === 1 : run.day % 2 === 0
  return quickTap ? 'quick-tap' : 'color-match'
}

export function challengeSeed(run: Run): number {
  return (run.publicSeed ^ Math.imul(run.day, 1193) ^ Math.imul(run.revision, 71)) >>> 0 || 1
}

export function scoreField(run: Run, human?: { score: number; tieBreak?: number }): RankedScore[] {
  const game = challengeGame(run)
  const seed = challengeSeed(run)
  const target = game === 'quick-tap' ? 300 : 100
  return challengeContestantIds(run).map((contestantId, participantIndex) => {
    if (contestantId === run.humanId) {
      const score = human?.score ?? 0
      return {
        contestantId,
        score,
        tieBreak: human?.tieBreak,
        potContribution: Math.max(0, Math.min(1, score / target)),
        forfeited: !human,
      }
    }
    const profile = getCompetitionProfile(contestantId)
    const score =
      game === 'quick-tap'
        ? simulateQuickTapAiScore({ seed, playerId: contestantId, participantIndex, profile })
        : Array.from({ length: 5 }, (_, index) =>
            simulateColorMatchAiRoundScore(
              {
                id: contestantId,
                participantIndex,
                precomputedScore: profile.precision,
              },
              index + 1,
              seed
            )
          ).reduce((sum, points) => sum + points, 0) / 5
    return { contestantId, score, potContribution: Math.max(0, Math.min(1, score / target)) }
  })
}
