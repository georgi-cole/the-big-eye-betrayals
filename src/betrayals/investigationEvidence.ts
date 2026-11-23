import { getSocialPersonality } from '../social/socialPersonalityBank.ts'
import { mulberry32 } from '../store/rng.ts'
import {
  describeClaim,
  firsthandAt,
  guestName,
  investigationFor,
  isActiveGuest,
  isVoteClaim,
} from './investigationRecords.ts'
import type { IntelReport } from './investigationRecords.ts'
import { getSocialView, relationship } from './perception.ts'
import { hashId } from './run.ts'
import type { Run, TableArgument } from './run.ts'

export type InvestigationCase = { reportId: string; witness?: true }

export function caseReports(run: Run, guestId?: string) {
  const { reports, witnesses } = investigationFor(run)
  return reports
    .flatMap((report) => {
      if (
        (guestId && report.guestId !== guestId) ||
        !isVoteClaim(report.claim) ||
        report.claim.denies ||
        report.claim.day < run.day - 2 ||
        report.access === 'statement' ||
        report.method === 'source'
      )
        return []
      const witness =
        report.speakerId && isActiveGuest(run, report.speakerId) && report.access === 'firsthand'
          ? report.speakerId
          : undefined
      const witnessAsked = witnesses.find(
        ({ day, reportId }) => day === run.day && reportId === report.id
      )
      return [{ report, witness, witnessAsked }]
    })
    .reverse()
}

export function canPresentInvestigation(run: Run, targetId: string, choice: InvestigationCase) {
  const found = caseReports(run, targetId).find(({ report }) => report.id === choice.reportId)
  return Boolean(
    found &&
    (choice.witness === undefined ||
      (choice.witness === true && found.witness && found.witnessAsked?.accepted))
  )
}

/** Knowledge here comes from a guest's own access, never from the player's journal or the full cast. */
export function investigationPressure(run: Run, listenerId: string): ReadonlyMap<string, number> {
  const { incidents, reports, shares } = investigationFor(run)
  const byIncident = new Map<string, { guestId: string; weight: number }>()
  for (const incident of incidents) {
    const { id, fact, guestId } = incident
    if (fact.day < run.day - 2 || guestId === listenerId || !isVoteClaim(fact)) continue
    if (firsthandAt(incident, listenerId) || incident.relayIds.includes(listenerId)) {
      byIncident.set(id, { guestId, weight: firsthandAt(incident, listenerId) ? 0.05 : 0.018 })
    }
  }
  for (const share of shares) {
    if (share.listenerId !== listenerId || share.day < run.day - 2) continue
    const report = reports.find(({ id }) => id === share.reportId)
    if (!report || report.guestId === listenerId || !isVoteClaim(report.claim)) continue
    const key = report.incidentId ?? report.id
    const existing = byIncident.get(key)
    if (existing) continue
    const trust = relationship(getSocialView(run, listenerId), listenerId, run.humanId)
    const weight = share.mode === 'attribute' ? 0.045 : 0.025
    byIncident.set(key, {
      guestId: report.guestId,
      weight:
        (share.mode === 'challenge' || report.claim.denies ? -1 : 1) * weight * (0.65 + trust.bond),
    })
  }
  const result = new Map<string, number>()
  for (const { guestId, weight } of byIncident.values()) {
    result.set(guestId, Math.max(-0.1, Math.min(0.16, (result.get(guestId) ?? 0) + weight)))
  }
  return result
}

export function publicCaseWeight(run: Run, listenerId: string, argument: TableArgument) {
  if (
    !argument.investigation ||
    listenerId === argument.speakerId ||
    listenerId === argument.targetId
  )
    return 0
  const { reportId, witness } = argument.investigation
  const { reports, incidents } = investigationFor(run)
  const report = reports.find(({ id }) => id === reportId)
  if (!report || (witness && report.speakerId === listenerId)) return 0
  const social = getSocialView(run, listenerId)
  const speaker = relationship(
    social,
    listenerId,
    witness && report.speakerId ? report.speakerId : run.humanId
  )
  const subject = relationship(social, listenerId, argument.targetId)
  const event = incidents.find(({ id }) => id === report.incidentId)
  const hasOwnAccount = event && firsthandAt(event, listenerId)
  const interested = getSocialPersonality(listenerId).strategicCalculation
  const attention = mulberry32(
    run.publicSeed ^ hashId(`${run.day}:${listenerId}:${argument.targetId}:account`)
  )()
  // Public testimony can reinforce a case. Most unconnected listeners still have other priorities.
  const receptiveness =
    0.13 + (witness ? 0.095 : 0) + interested * 0.08 + speaker.bond * 0.42 - subject.bond * 0.31
  if (!hasOwnAccount && attention > receptiveness) return 0
  const weight = witness ? 0.1 : report.access === 'observed' ? 0.065 : 0.035
  const crowded = run.seats.filter(({ exit }) => !exit).length > 14
  return Math.max(
    0,
    Math.min(
      0.16,
      weight * (crowded ? 0.74 : 1) +
        speaker.bond * 0.075 +
        speaker.reliability * 0.17 -
        subject.bond * 0.2 -
        (hasOwnAccount ? 0.034 : 0)
    )
  )
}

function sameVoteConversation(first: IntelReport, other: IntelReport) {
  return (
    first.guestId === other.guestId &&
    isVoteClaim(first.claim) &&
    isVoteClaim(other.claim) &&
    first.claim.day === other.claim.day &&
    first.claim.behavior === other.claim.behavior &&
    first.claim.topicId === other.claim.topicId
  )
}

export function compareReportAccounts(first: IntelReport, other: IntelReport) {
  if (first.guestId !== other.guestId) return 'These accounts concern different guests.'
  if (!first.claim || !other.claim) return 'These accounts do not describe the same moment.'
  if (first.claim.day !== other.claim.day) {
    if (first.claim.contactId && first.claim.contactId === other.claim.contactId)
      return 'The same guests appear together on two different days.'
    if (
      isVoteClaim(first.claim) &&
      isVoteClaim(other.claim) &&
      !first.claim.denies &&
      !other.claim.denies &&
      first.claim.behavior === other.claim.behavior &&
      first.claim.topicId === other.claim.topicId
    )
      return 'The same position on that guest came up on two different days.'
    return 'These accounts describe different days.'
  }
  const firstSource = first.sourceId ?? (first.access === 'firsthand' ? first.speakerId : undefined)
  const otherSource = other.sourceId ?? (other.access === 'firsthand' ? other.speakerId : undefined)
  const sameConversation = sameVoteConversation(first, other)
  if (sameConversation && first.claim.denies !== other.claim.denies)
    return 'The accounts disagree about the same vote conversation.'
  if (firstSource && firstSource === otherSource)
    return 'Both accounts trace back to the same person.'
  if (sameConversation) {
    if ([first, other].some(({ access, sourceId }) => access === 'hearsay' && !sourceId))
      return 'The details match. The source of at least one account is still unknown.'
    return 'The accounts agree about the same vote conversation.'
  }
  if (first.claim.contactId && first.claim.contactId === other.claim.contactId)
    return 'Both accounts place the same guests together.'
  return 'These details could fit more than one version of events.'
}

export function investigationSpeech(run: Run, tableArguments: readonly TableArgument[]) {
  const argument = tableArguments.find((item) => item.investigation)
  if (!argument?.investigation) return []
  const reports = investigationFor(run).reports
  const report = reports.find(({ id }) => id === argument.investigation?.reportId)
  if (!isVoteClaim(report?.claim)) return []
  const name = (id: string) => guestName(run.seats, id)
  const { targetId } = argument
  const account = describeClaim(report.claim, name(targetId), name)
  const witness = argument.investigation.witness ? report.speakerId : undefined
  const statement = reports
    .filter((item) => item.method === 'confront' && sameVoteConversation(report, item))
    .at(-1)
  return [
    {
      speakerId: argument.speakerId,
      targetId,
      verb: 'questions',
      argument: witness
        ? `${name(witness)}, will you tell the room what you heard on Day ${report.claim.day}?`
        : `About Day ${report.claim.day}: ${account} What was behind that?`,
    },
    ...(witness
      ? [{ speakerId: witness, targetId, verb: 'on', argument: `I was there. ${account}` }]
      : []),
    {
      speakerId: targetId,
      targetId: report.claim.topicId,
      verb: 'on',
      argument: statement?.claim?.denies
        ? report.claim.behavior === 'defended'
          ? `I stand by what I said. I didn't ask anyone to keep them.`
          : `I stand by what I said. I didn't ask for that vote.`
        : 'We were talking through our options. You can ask what I said, but that alone will not tell you why.',
    },
  ]
}
