import { isCurrentCommand, publicShieldPending } from './run.ts'
import type { CommandToken, Run } from './run.ts'
import { hasRequiredIncoming } from './incoming.ts'
import { finishShieldConversations, prepareShieldConversations } from './shieldSocial.ts'
import { hasAlliance, rapport } from './perception.ts'
import { resolveSafetyPledge } from './dayFlow.ts'
import { settleDayWitnesses } from './investigation.ts'
import { prepareVotePlans, settleUnansweredVoteOffers } from './votePlans.ts'
import { openAfternoonInvestigation } from './castleIncidents.ts'
import { closeCastleMoment, openCastleMoment } from './castleLife.ts'

export function openShieldDeals(run: Run): Run {
  const next = prepareShieldConversations(run)
  const standings = next.private.safetyStandings
  if (!standings || !next.private.nightShieldIds.includes(next.humanId)) return next

  const requestId = next.seats
    .filter(
      ({ id, exit }) =>
        !exit &&
        id !== next.humanId &&
        id !== next.immunityId &&
        !next.private.nightShieldIds.includes(id) &&
        hasAlliance(next.social, id, next.humanId)
    )
    .sort(
      (first, second) =>
        rapport(next.social, second.id, next.humanId) - rapport(next.social, first.id, next.humanId)
    )[0]?.id

  return requestId
    ? { ...next, private: { ...next.private, safetyStandings: { ...standings, requestId } } }
    : next
}

export function advanceDayAftermath(run: Run, token: CommandToken): Run {
  if (!isCurrentCommand(run, token) || run.presentation?.length || hasRequiredIncoming(run))
    return run
  if (run.phase === 'cocktail') {
    const next = closeCastleMoment(run)
    return { ...next, revision: next.revision + 1, phase: 'night' }
  }
  if (run.phase === 'after-immunity' && !publicShieldPending(run)) {
    if (run.dayFlow?.castleDay) {
      const previous = prepareVotePlans(closeCastleMoment(run))
      const afternoon: Run = { ...previous, revision: previous.revision + 1, phase: 'social' }
      return openCastleMoment(openAfternoonInvestigation(afternoon), 'afternoon')
    }
    const next = settleUnansweredVoteOffers(run)
    return { ...next, revision: run.revision + 1, phase: 'safety' }
  }

  if (run.phase === 'shield-deals') {
    const next = settleDayWitnesses(
      resolveSafetyPledge(finishShieldConversations(closeCastleMoment(run)))
    )
    const standings = next.private.safetyStandings
    return {
      ...next,
      revision: run.revision + 1,
      phase: 'round-table',
      private: {
        ...next.private,
        safetyStandings: standings && { ...standings, dealsClosed: true },
      },
    }
  }

  return run
}
