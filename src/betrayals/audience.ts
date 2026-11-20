import { getEffectivePublicApproval } from '../publicOpinion/publicApproval'
import { computeCycleDeltas } from '../publicOpinion/PublicOpinionService'
import { mulberry32 } from '../store/rng'
import type { Run } from './run'

export function currentAudienceApproval(run: Run): Record<string, number> {
  const cursor = mulberry32(run.publicSeed ^ 6137)
  const changes = computeCycleDeltas(
    run.immunityId ? [{ type: 'hoh_win', playerId: run.immunityId, week: run.day }] : []
  )
  return Object.fromEntries(
    run.seats.map(({ id }) => {
      const initial = 46 + Math.round(cursor() * 10)
      const previousApproval = run.audienceApproval?.[id] ?? initial
      const delta = changes.find((entry) => entry.playerId === id)?.delta ?? 0
      return [
        id,
        getEffectivePublicApproval(
          {
            playerId: id,
            approval: previousApproval + delta,
            previousApproval,
            seasonApprovals: [],
            completedDirectionCount: 0,
            cumulativePositiveDelta: 0,
          },
          run.day
        ),
      ]
    })
  )
}
