import {
  eligibleBanishmentTargets,
  isCurrentCommand,
  NIGHT_SHIELD_MOVES,
  nightShieldWinners,
  publicShieldPending,
} from './run.ts'
import type { Ballot, CommandToken, Phase, Run, SocialEntry, SocialReaction } from './run.ts'
import { applyDaySocialMove, DAY_SOCIAL_MOVES, recordBreakfast } from './dayFlow.ts'
import { caseReports } from './investigationEvidence.ts'
import { intendsToEnd } from './settlement.ts'
import {
  firsthandShieldReports,
  isNightShieldMove,
  nightShieldWindowOpen,
  reactionToShieldClaim,
  reactionToShieldGift,
  shieldReplyFor,
  shieldTalkBlockedAfterGift,
} from './nightShields.ts'
import {
  argumentBasis,
  between,
  getSocialView,
  hasPersonalAlliance,
  hearArgument,
  rapport,
} from './perception.ts'

import {
  missingSocialResource,
  socialMoveCost,
  socialWalletFor,
  walletAfterSocialMove,
} from './socialResources.ts'

export { getSocialView, hasAlliance, rapport } from './perception.ts'

export type SocialMove = Omit<
  SocialEntry,
  'day' | 'accepted' | 'reaction' | 'pledgeResult' | 'shieldReply' | 'shieldPlan'
> & { offerVoteFor?: string }

const checkIn = ['rapport'] as const
const makePeace = ['rapport', 'mend-fences'] as const
const compareNotes = [...makePeace, 'question', 'ask-about'] as const
const discussSuspicions = [...compareNotes, 'share-suspicion', 'defend-guest'] as const
const prepareForTable = [...discussSuspicions, 'vote-plan'] as const
const personalPacts = ['alliance', 'end-pact'] as const
const talkBeforeVote = [...prepareForTable, ...personalPacts] as const
const phaseMoves: Record<Phase, readonly SocialEntry['kind'][]> = {
  'role-reveal': checkIn,
  dawn: [...discussSuspicions, ...personalPacts, 'debrief'],
  social: talkBeforeVote,
  immunity: talkBeforeVote,
  'after-immunity': talkBeforeVote,
  safety: talkBeforeVote,
  'shield-deals': talkBeforeVote,
  'round-table': compareNotes,
  'table-reveal': makePeace,
  cocktail: [...discussSuspicions, ...personalPacts, 'debrief'],
  night: [...makePeace, 'debrief'],
  'night-resolved': checkIn,
  'final-challenge': compareNotes,
  'final-banishment': compareNotes,
  'end-vote': [...compareNotes, 'ask-end'],
  settled: [],
}

export function socialMoveKinds(
  run: Pick<Run, 'phase' | 'result' | 'tableCount' | 'runoffIds' | 'lastTable'> &
    Partial<
      Pick<
        Run,
        | 'private'
        | 'options'
        | 'day'
        | 'publicShieldDecisionDay'
        | 'dayFlow'
        | 'immunityId'
        | 'humanId'
      >
    >
): readonly SocialEntry['kind'][] {
  if (run.result || run.phase === 'settled') return []
  if (run.tableCount || run.runoffIds) return makePeace
  const ordinary =
    run.phase === 'after-immunity' &&
    run.options?.publicMode &&
    run.publicShieldDecisionDay !== run.day
      ? talkBeforeVote.filter((kind) => kind !== 'vote-plan')
      : run.phase === 'dawn' && run.dayFlow?.castleDay
        ? [...talkBeforeVote, 'debrief' as const]
        : phaseMoves[run.phase]
  const moves = nightShieldWindowOpen(run) ? [...ordinary, ...NIGHT_SHIELD_MOVES] : ordinary
  const available =
    run.lastTable?.blind === false ? moves : moves.filter((kind) => kind !== 'debrief')
  const flow = run.dayFlow
  if (!flow) return available
  if (
    (run.phase === 'safety' || (run.phase === 'social' && flow.castleDay)) &&
    !flow.safety &&
    run.humanId !== run.immunityId
  )
    return [...available, 'promise-shield', 'ask-to-cover']
  if (run.phase === 'shield-deals' && !flow.shields && nightShieldWindowOpen(run))
    return [...available, 'broker-shield']
  if (
    (run.phase === 'night' || run.phase === 'cocktail') &&
    !flow.night &&
    run.humanId &&
    !run.private?.betrayers.includes(run.humanId)
  )
    return [...available, 'arrange-breakfast', 'leave-account']
  return available
}

export function choosesSocialSubject(kind: SocialEntry['kind']): boolean {
  return (
    kind === 'vote-plan' ||
    kind === 'ask-about' ||
    kind === 'share-suspicion' ||
    kind === 'defend-guest' ||
    kind === 'shield-tip' ||
    kind === 'broker-shield'
  )
}

export function discussedToday(
  entries: readonly SocialEntry[],
  move: SocialMove,
  day: number
): boolean {
  if (
    move.kind === 'rapport' ||
    move.kind === 'alliance' ||
    move.kind === 'vote-plan' ||
    move.kind === 'shield-gift'
  )
    return false
  return entries.some(
    (entry) =>
      entry.kind === move.kind &&
      entry.day === day &&
      entry.actorId === move.actorId &&
      entry.recipientId === move.recipientId &&
      (!choosesSocialSubject(move.kind) || entry.suspectId === move.suspectId)
  )
}

export function latestPact(
  entries: readonly SocialEntry[],
  actorId: string,
  peerId: string,
  day: number
) {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index]
    if (
      entry.kind === 'vote-plan' &&
      entry.accepted &&
      entry.day === day &&
      between(entry, actorId, peerId)
    )
      return entry
  }
}

export function settleVotePacts(run: Run, ballots: readonly Ballot[]): SocialEntry[] {
  const received = new Map(ballots.map(({ voterId, targetId }) => [voterId, targetId]))
  const openTable: Run = { ...run, phase: 'round-table', runoffIds: undefined }
  return run.social.map((entry) => {
    const { actorId, recipientId, suspectId } = entry
    if (
      entry.kind !== 'vote-plan' ||
      !entry.accepted ||
      entry.day !== run.day ||
      entry.pledgeResult ||
      entry !== latestPact(run.social, actorId, recipientId, run.day)
    )
      return entry
    const valid = (id: string) =>
      received.has(id) && eligibleBanishmentTargets(openTable, id).includes(suspectId ?? '')
    return {
      ...entry,
      pledgeResult:
        valid(actorId) &&
        valid(recipientId) &&
        (!entry.witnessReportId ||
          run.tableArguments?.some(
            ({ investigation }) =>
              investigation?.witness && investigation.reportId === entry.witnessReportId
          ))
          ? {
              actor: received.get(actorId) === suspectId,
              recipient: received.get(recipientId) === suspectId,
            }
          : 'void',
    }
  })
}

export function hasSocialStrain(entries: readonly SocialEntry[], actorId: string, peerId: string) {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index]
    if (!between(entry, actorId, peerId)) continue
    const result = entry.pledgeResult
    if (
      result &&
      result !== 'void' &&
      !(entry.actorId === peerId ? result.actor : result.recipient)
    )
      return true
    if (entry.reaction === 'backfired' || entry.reaction === 'repaired') {
      return entry.reaction === 'backfired'
    }
  }
  return false
}

function responseToMove(run: Run, move: SocialMove): SocialReaction | undefined {
  const { actorId, kind, recipientId, suspectId } = move
  if (
    !['ask-about', 'share-suspicion', 'defend-guest', 'mend-fences', 'debrief', 'ask-end'].includes(
      kind
    )
  )
    return
  const trust = rapport(run.social, recipientId, actorId)
  const subjectTrust = suspectId ? rapport(run.social, recipientId, suspectId) : 0
  const previousVote = run.lastTable?.blind === false ? run.lastTable : undefined
  const votes = suspectId ? (previousVote?.tally[suspectId] ?? 0) : 0
  switch (kind) {
    case 'ask-about':
      if (trust < 0.12) return 'held-back'
      if (subjectTrust >= 0.24) return 'trusts'
      return votes >= 2 ? 'wary' : 'uncertain'
    case 'share-suspicion':
    case 'defend-guest': {
      if (!suspectId) return 'unmoved'
      const defending = kind === 'defend-guest'
      const effect = hearArgument(run, recipientId, {
        speakerId: actorId,
        targetId: suspectId,
        tone: 'careful',
        stance: defending ? 'defend' : undefined,
        basis: argumentBasis(run, getSocialView(run, actorId), actorId, suspectId),
      })
      if (!defending && subjectTrust - trust >= 0.23 && effect < 0.07) return 'backfired'
      return Math.abs(effect) >= 0.11 ? 'landed' : 'unmoved'
    }
    case 'mend-fences':
      return run.social.some(
        (entry) => entry.kind === 'rapport' && between(entry, actorId, recipientId)
      ) || trust > 0
        ? 'repaired'
        : 'held-back'
    case 'debrief':
      if (trust < 0.12) return 'held-back'
      return previousVote?.tiedByDraw ? 'wary' : 'landed'
    case 'ask-end':
      if (trust < 0.24) return 'held-back'
      return intendsToEnd(run, recipientId) ? 'end' : 'banish'
  }
}

export function applySocialMove(
  run: Run,
  token: CommandToken,
  move: SocialMove,
  replying = false
): Run {
  if (
    (!replying && introvertDay(run, move.actorId)) ||
    !socialMoveKinds(run).includes(move.kind) ||
    !isCurrentCommand(run, token) ||
    run.presentation?.length
  )
    return run

  const active = new Set(run.seats.filter(({ exit }) => !exit).map(({ id }) => id))
  if (
    move.actorId === move.recipientId ||
    !active.has(move.actorId) ||
    !active.has(move.recipientId)
  )
    return run
  if (
    (choosesSocialSubject(move.kind) || move.kind === 'question') &&
    (!move.suspectId ||
      !active.has(move.suspectId) ||
      (move.suspectId === move.actorId && move.kind !== 'broker-shield') ||
      move.suspectId === move.recipientId)
  )
    return run
  if (
    move.kind === 'vote-plan' &&
    (publicShieldPending(run) ||
      !eligibleBanishmentTargets(run, move.recipientId).includes(move.suspectId ?? ''))
  )
    return run

  const { actorId, recipientId, kind, suspectId } = move
  const { social, day } = run
  const cost = socialMoveCost(kind, run.options.realityMode)
  if (missingSocialResource(socialWalletFor(run, actorId), cost)) return run
  if (DAY_SOCIAL_MOVES.some((dayMove) => dayMove === kind)) return applyDaySocialMove(run, move)
  if (
    move.witnessReportId &&
    (kind !== 'vote-plan' ||
      actorId !== run.humanId ||
      !caseReports(run, suspectId).some(
        ({ report, witnessAsked, witness }) =>
          report.id === move.witnessReportId &&
          witness &&
          (witnessAsked?.accepted || witnessAsked?.shield === 'pending')
      ))
  )
    return run
  if (
    discussedToday(social, move, day) ||
    shieldTalkBlockedAfterGift(social, move, day) ||
    (kind === 'mend-fences' && !hasSocialStrain(social, actorId, recipientId)) ||
    (kind === 'alliance' && hasPersonalAlliance(social, actorId, recipientId)) ||
    (kind === 'end-pact' && !hasPersonalAlliance(social, actorId, recipientId)) ||
    (kind === 'vote-plan' && latestPact(social, actorId, recipientId, day)?.suspectId === suspectId)
  )
    return run

  const entry: SocialEntry = {
    actorId,
    recipientId,
    kind,
    day,
  }
  if (choosesSocialSubject(kind) || kind === 'question') {
    entry.suspectId = suspectId
  }
  if (kind === 'debrief' && run.lastTable?.blind === false) {
    entry.suspectId = run.lastTable.revealedBallots?.find(
      ({ voterId }) => voterId === recipientId
    )?.targetId
  }
  if (kind === 'shield-gift') {
    const owners = run.private.nightShieldIds
    const slot = owners.indexOf(actorId)
    if (slot === -1) return run
    const reaction = reactionToShieldGift(run, entry)
    if (reaction) entry.reaction = reaction
    return {
      ...run,
      revision: run.revision + 1,
      private: {
        ...run.private,
        nightShieldAwardIds: nightShieldWinners(run).slice(),
        nightShieldIds: owners.map((id, index) => (index === slot ? recipientId : id)),
      },
      social: [...social, entry],
    }
  }
  if (kind === 'ask-shield') {
    if (recipientId === run.humanId) return run
    entry.shieldReply = shieldReplyFor(run, recipientId, actorId)
  }
  if (kind === 'shield-tip') {
    const report = firsthandShieldReports(social, actorId, day).get(suspectId ?? '')
    if (!report) return run
    entry.shieldReply = report.claim
    if (
      report.changedStory ||
      (!report.witnessedGift && rapport(social, actorId, suspectId ?? '') < 0.16)
    ) {
      entry.reaction = 'uncertain'
    }
  }
  if (kind === 'vote-plan' || kind === 'alliance') {
    const trust = rapport(social, recipientId, actorId)
    const protectingAlly = Boolean(
      kind === 'vote-plan' && suspectId && rapport(social, recipientId, suspectId) > trust + 0.22
    )
    entry.accepted = trust >= 0.12 && !protectingAlly
    if (kind === 'vote-plan') entry.witnessReportId = move.witnessReportId
  }
  const reaction = isNightShieldMove(kind)
    ? reactionToShieldClaim(run, entry)
    : responseToMove(run, move)
  if (reaction) entry.reaction = reaction

  const next = {
    ...run,
    revision: run.revision + 1,
    social: [...social, entry],
    socialWallets: walletAfterSocialMove(run, entry, cost),
  }
  return run.phase === 'dawn' && kind === 'rapport' && actorId === run.humanId
    ? recordBreakfast(next, recipientId)
    : next
}
import { introvertDay } from './castleRoles.ts'
