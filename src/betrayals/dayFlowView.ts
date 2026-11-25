import { knownShieldDonors, nightAccount, shieldBrokerTarget } from './dayFlow'
import { caseReports } from './investigationEvidence'
import { waitingShieldWitnesses } from './investigationRecords'
import type { Run } from './run'

export function daySocialContext(run: Run) {
  if (!run.dayFlow) return
  const donors =
    run.phase === 'shield-deals' && !run.dayFlow.shields
      ? knownShieldDonors(run).map(({ id }) => ({ id, voteTargetId: shieldBrokerTarget(run, id) }))
      : []
  const witnesses = ['social', 'immunity', 'after-immunity', 'safety', 'shield-deals'].includes(
    run.phase
  )
    ? caseReports(run).flatMap(({ report, witness, witnessAsked }) =>
        witness && (witnessAsked?.accepted || witnessAsked?.shield === 'pending')
          ? [{ reportId: report.id, suspectId: report.guestId, witness }]
          : []
      )
    : []
  return {
    immunityId: run.immunityId,
    donors,
    witnesses,
    waitingForShield: waitingShieldWitnesses(run),
    account:
      (run.phase === 'night' || run.phase === 'cocktail') && !run.dayFlow.night
        ? nightAccount(run)
        : undefined,
  }
}
