import { getSocialPersonality } from '../social/socialPersonalityBank.ts'
import { mulberry32 } from '../store/rng.ts'
import { openAudienceEpisode } from './audienceSeason.ts'
import { openInvestigationDay } from './castleIncidents.ts'
import { openCastleMoment } from './castleLife.ts'
import type { DayFlow } from './dayFlowState.ts'
import {
  addIntelReport,
  firsthandAt,
  investigationFor,
  isActiveGuest,
  isVoteClaim,
} from './investigationRecords.ts'
import { firsthandShieldReports, nightExposure, shieldRoll } from './nightShields.ts'
import { getSocialView, rapport } from './perception.ts'
import {
  commandToken,
  eligibleBanishmentTargets,
  hashId,
  isCurrentCommand,
  publicNightShieldWinners,
} from './run.ts'
import type { CommandToken, Run, SocialEntry } from './run.ts'
import { applySocialMove } from './social.ts'
import type { SocialMove } from './social.ts'
import { chooseTarget, resolutionPerspective } from './strategy.ts'

/** Adopt the revised rules at a day boundary so an open ballot or handoff can finish. */
export function openDayFlow(run: Run): Run {
  if (run.phase === 'role-reveal' || run.phase === 'final-challenge') {
    return run.dayFlow ? run : { ...run, dayFlow: { day: run.day } }
  }
  if (run.phase !== 'dawn') return run
  const flow = run.dayFlow?.day === run.day ? run.dayFlow : { day: run.day }
  const next: Run = { ...run, dayFlow: { ...flow, castleDay: true } }
  return openCastleMoment(openAudienceEpisode(openInvestigationDay(next)), 'breakfast')
}

/** A normal check-in can uncover a real conversation the contact was part of. */
export function recordBreakfast(run: Run, contactId: string): Run {
  if (!run.dayFlow || run.dayFlow.breakfast) return run
  const state = investigationFor(run)
  const meeting = run.dayFlow.delivery
  const mayConfide =
    !run.dayFlow.castleDay || (meeting?.kind === 'meeting' && meeting.guestId === contactId)
  const incident = mayConfide
    ? state.incidents.find(
        (entry) =>
          entry.fact.day === run.day && isVoteClaim(entry.fact) && firsthandAt(entry, contactId)
      )
    : undefined
  const investigation = incident
    ? addIntelReport(state, {
        day: run.day,
        method: 'ask',
        access: 'firsthand',
        speakerId: contactId,
        guestId: incident.guestId,
        claim: { ...incident.fact },
        incidentId: incident.id,
      })
    : state
  const breakfast = {
    guestId: contactId,
    reportId: incident ? investigation.reports.at(-1)?.id : undefined,
  }
  return { ...run, investigation, dayFlow: { ...run.dayFlow, breakfast } }
}

export const DAY_SOCIAL_MOVES = [
  'promise-shield',
  'ask-to-cover',
  'broker-shield',
  'arrange-breakfast',
  'leave-account',
] as const

function addSocial(run: Run, entry: Omit<SocialEntry, 'day'>): Run {
  return { ...run, social: [...run.social, { day: run.day, ...entry }] }
}

function makeShieldArrangement(run: Run, flow: DayFlow, move: SocialMove): Run {
  const { actorId, recipientId, kind } = move
  if (flow.safety || recipientId === run.immunityId || actorId === run.immunityId) return run
  const requesting = kind === 'ask-to-cover'
  const personality = getSocialPersonality(recipientId)
  const interest =
    0.22 + rapport(run.social, recipientId, actorId) * 0.83 + personality.loyalty * 0.21
  const random = mulberry32(run.publicSeed ^ hashId(`${run.day}:safety promise ${recipientId}`))
  const accepted = !requesting || random() < interest
  const next = addSocial(run, { actorId, recipientId, kind, accepted })
  return {
    ...next,
    revision: run.revision + 1,
    dayFlow: {
      ...flow,
      safety: { kind: requesting ? 'request' : 'promise', guestId: recipientId, accepted },
    },
  }
}

export function knownShieldDonors(run: Run) {
  const reports = firsthandShieldReports(getSocialView(run, run.humanId), run.humanId, run.day)
  const publicWinners = publicNightShieldWinners(run)
  const arrangement = run.dayFlow?.safety
  return run.seats.filter(
    ({ id, exit }) =>
      !exit &&
      id !== run.humanId &&
      (reports.get(id)?.claim === 'has' ||
        publicWinners.includes(id) ||
        (arrangement?.kind === 'request' && arrangement.accepted && arrangement.guestId === id))
  )
}

export function shieldBrokerTarget(run: Run, donorId: string) {
  const eligible = eligibleBanishmentTargets(run, donorId).filter((id) =>
    eligibleBanishmentTargets(run, run.humanId).includes(id)
  )
  const prior = run.dayFlow?.provisional?.[donorId]
  return prior && eligible.includes(prior)
    ? prior
    : chooseTarget(resolutionPerspective(run, donorId, eligible), 'table')
}

function brokerNightShield(run: Run, flow: DayFlow, move: SocialMove): Run {
  const { actorId, recipientId: donorId, suspectId: guestId, offerVoteFor } = move
  if (
    flow.shields ||
    !guestId ||
    guestId === run.immunityId ||
    !knownShieldDonors(run).some(({ id }) => id === donorId) ||
    (offerVoteFor && offerVoteFor !== shieldBrokerTarget(run, donorId))
  )
    return run

  const trust = rapport(run.social, donorId, actorId) + rapport(run.social, donorId, guestId)
  const risk = run.private.betrayers.includes(donorId) ? 0 : nightExposure(run, donorId)
  const loyalty = getSocialPersonality(donorId).loyalty
  const willingness = 0.35 + trust * 0.44 + loyalty * 0.23 - risk * 0.38 + (offerVoteFor ? 0.26 : 0)
  const transfer =
    shieldRoll(run, `${donorId}:${guestId}`, 11383) < willingness
      ? applySocialMove(run, commandToken(run), {
          actorId: donorId,
          recipientId: guestId,
          kind: 'shield-gift',
        })
      : run
  const accepted = transfer !== run
  let next = addSocial(transfer, {
    actorId,
    recipientId: donorId,
    kind: 'broker-shield',
    suspectId: guestId,
    accepted,
  })
  if (accepted && guestId !== actorId) {
    next = addSocial(next, { actorId, recipientId: guestId, kind: 'group-chat' })
  }
  if (accepted && offerVoteFor) {
    next = addSocial(next, {
      actorId,
      recipientId: donorId,
      kind: 'vote-plan',
      suspectId: offerVoteFor,
      accepted: true,
    })
  }
  return {
    ...next,
    revision: run.revision + 1,
    dayFlow: {
      ...flow,
      shields: {
        kind: 'broker',
        guestId,
        donorId,
        result: accepted ? 'gifted' : 'declined',
        voteTargetId: accepted ? offerVoteFor : undefined,
      },
    },
  }
}

export function resolveSafetyPledge(run: Run): Run {
  const safety = run.dayFlow?.safety
  if (!run.dayFlow || !safety || safety.result || safety.kind !== 'promise' || !safety.guestId)
    return run
  const day = run.day
  const pledged =
    run.private.safetyStandings?.day === day &&
    run.private.safetyStandings.rows
      .slice(0, 2)
      .some(({ contestantId }) => contestantId === run.humanId)
  const honored = run.social.some(
    (entry) =>
      entry.day === day &&
      entry.kind === 'shield-gift' &&
      entry.actorId === run.humanId &&
      entry.recipientId === safety.guestId
  )
  const result = pledged ? (honored ? 'kept' : 'broken') : 'void'
  const social =
    result === 'void'
      ? run.social
      : run.social.map(
          (entry): SocialEntry =>
            entry.day === day &&
            entry.actorId === run.humanId &&
            entry.recipientId === safety.guestId &&
            entry.kind === 'promise-shield'
              ? { ...entry, reaction: honored ? 'repaired' : 'backfired' }
              : entry
        )
  return { ...run, social, dayFlow: { ...run.dayFlow, safety: { ...safety, result } } }
}

export function nightAccount(run: Run) {
  return investigationFor(run)
    .reports.filter(
      ({ claim, guestId, access }) =>
        access !== 'statement' &&
        isVoteClaim(claim) &&
        !claim.denies &&
        claim.day >= run.day - 1 &&
        isActiveGuest(run, guestId)
    )
    .at(-1)
}

function leaveNightInstructions(run: Run, flow: DayFlow, move: SocialMove): Run {
  if (flow.night || run.private.betrayers.includes(run.humanId)) return run
  const sealing = move.kind === 'leave-account'
  const account = sealing ? nightAccount(run) : undefined
  if (
    sealing &&
    (!account || move.recipientId === account.guestId || move.recipientId === account.speakerId)
  )
    return run
  const next = addSocial(run, {
    actorId: move.actorId,
    recipientId: move.recipientId,
    kind: move.kind,
  })
  return {
    ...next,
    revision: run.revision + 1,
    dayFlow: {
      ...flow,
      night: {
        kind: sealing ? 'account' : 'meeting',
        guestId: move.recipientId,
        reportId: account?.id,
      },
    },
  }
}

export function applyDaySocialMove(run: Run, move: SocialMove): Run {
  const flow = run.dayFlow
  if (!flow || flow.day !== run.day || run.humanId !== move.actorId) return run
  if (run.phase === 'safety' || (run.phase === 'social' && flow.castleDay))
    return makeShieldArrangement(run, flow, move)
  if (run.phase === 'shield-deals') return brokerNightShield(run, flow, move)
  if (run.phase === 'night' || run.phase === 'cocktail')
    return leaveNightInstructions(run, flow, move)
  return run
}

export function deliverNightDecision(previous: Run, next: Run): Run {
  const order = previous.dayFlow?.night
  if (!previous.dayFlow) return next
  const survived = isActiveGuest(next, next.humanId)
  const delivered =
    order && isActiveGuest(next, order.guestId) && (order.kind === 'account' ? !survived : survived)
      ? order
      : undefined
  const result = { ...next, dayFlow: { day: next.day, delivery: delivered } }
  if (!delivered?.reportId) return result
  const investigation = investigationFor(next)
  return {
    ...result,
    investigation: {
      ...investigation,
      shares: [
        ...investigation.shares,
        {
          day: next.day,
          listenerId: delivered.guestId,
          reportId: delivered.reportId,
          mode: 'attribute',
        },
      ],
    },
  }
}

export function finaleMemory(run: Run, id: string) {
  const commitments = getSocialView(run, run.humanId).filter(
    ({ kind, actorId, recipientId, pledgeResult }) =>
      kind === 'vote-plan' &&
      (actorId === id || recipientId === id) &&
      Boolean(pledgeResult && pledgeResult !== 'void')
  )
  const kept = commitments.filter(
    (entry) =>
      entry.pledgeResult &&
      entry.pledgeResult !== 'void' &&
      (entry.actorId === id ? entry.pledgeResult.actor : entry.pledgeResult.recipient)
  ).length
  const againstYou = investigationFor(run).votes.filter(({ ballots }) =>
    ballots.some(({ voterId, targetId }) => voterId === id && targetId === run.humanId)
  ).length
  return { kept, broke: commitments.length - kept, againstYou }
}

export function recordFinalePosition(
  run: Run,
  token: CommandToken,
  guestId: string,
  stance: 'trust' | 'doubt'
): Run {
  if (
    !isCurrentCommand(run, token) ||
    run.phase !== 'final-banishment' ||
    !run.dayFlow ||
    run.dayFlow.finale ||
    run.tableCount ||
    run.runoffIds ||
    run.presentation?.length ||
    !isActiveGuest(run, run.humanId) ||
    !eligibleBanishmentTargets(run, run.humanId).includes(guestId)
  )
    return run
  return {
    ...run,
    revision: run.revision + 1,
    dayFlow: { ...run.dayFlow, finale: { guestId, stance } },
  }
}
