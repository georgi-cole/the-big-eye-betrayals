import { WAGER_BONUS } from './audienceSeason'
import type { HotSeatAnswer } from './audienceSeason'
import { knownShieldDonors, nightAccount, shieldBrokerTarget } from './dayFlow'
import { caseReports } from './investigationEvidence'
import { guestName, waitingShieldWitnesses } from './investigationRecords'
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

const audienceTitles = {
  wager: 'Vote Promise',
  'hot-seat': 'Hot Seat',
  save: 'Audience Save',
} as const
export function audienceAnnouncement(run: Run) {
  const episode = run.audience?.episode
  if (episode?.day !== run.day || run.phase === 'final-challenge') return undefined
  return audienceTitles[episode.kind]
}

export function answerText(answer: HotSeatAnswer, influenceName?: string) {
  if (answer === 'own') return 'I changed my mind. I stand by my vote.'
  if (answer === 'name' && influenceName) return `${influenceName}'s case made me reconsider.`
  return 'I heard them out, then made my call.'
}

export function audienceResult(run: Run): string | undefined {
  const episode = run.audience?.episode
  if (episode?.day !== run.day) return
  const decision = episode.decision
  if (decision?.kind === 'save') {
    const winner = decision.shares[0]
    return winner
      ? `${guestName(run.seats, winner.guestId)} won the Audience Save with ${winner.percent}%.`
      : 'No guest qualified for the Audience Save.'
  }
  if (decision?.kind === 'hot-seat' && episode.hotSeat) {
    const { speakerId, influenceId } = episode.hotSeat
    return `${guestName(run.seats, speakerId)} on air - "${answerText(decision.answer, influenceId ? guestName(run.seats, influenceId) : undefined)}"`
  }
  if (decision?.kind === 'wager') {
    if (decision.result === 'kept') return `Vote Promise kept. +${WAGER_BONUS} to the shared pot.`
    if (decision.result === 'switched')
      return 'The volunteer changed their vote. The pot stays the same.'
    if (decision.result === 'void')
      return 'The promise ended when the pledged vote became unavailable.'
    return decision.volunteerId && decision.targetId
      ? `${guestName(run.seats, decision.volunteerId)} pledged on air to vote for ${guestName(run.seats, decision.targetId)}.`
      : 'Nobody volunteered to make a Vote Promise.'
  }
}

export function audienceReadout(run: Run, participating: boolean, selected?: string) {
  const episode = run.audience?.episode
  if (episode?.day !== run.day) return
  if (episode.decision) {
    if (episode.decision.kind === 'hot-seat' && episode.hotSeat)
      return `${guestName(run.seats, episode.hotSeat.speakerId)} answered the Hot Seat.`
    return audienceResult(run)
  }
  if (episode.kind === 'hot-seat' && episode.hotSeat) {
    const { speakerId, defendedId } = episode.hotSeat
    const defended = guestName(run.seats, defendedId)
    return speakerId === run.humanId && participating
      ? `You defended ${defended}, then voted for them.`
      : `${guestName(run.seats, speakerId)} defended ${defended}, then voted for them.`
  }
  if (episode.kind === 'save') {
    return participating && !selected
      ? 'Tap a portrait to endorse. The Save protects at this Table.'
      : 'Viewers award protection at this Table.'
  }
  return participating && !selected
    ? `Tap a portrait to pledge. Keeping your first vote adds ${WAGER_BONUS} to the pot.`
    : `Keep the promise on the first ballot to add ${WAGER_BONUS} to the pot. You can still change your vote.`
}
