import { getSocialPersonality } from '../social/socialPersonalityBank.ts'
import { waitingShieldWitnesses } from './investigationRecords.ts'
import {
  firsthandShieldReports,
  nightExposure,
  nightShieldReads,
  nightShieldWindowOpen,
  shieldReplyFor,
  shieldRoll,
} from './nightShields.ts'
import { hasAlliance, rapport } from './perception.ts'
import { commandToken, knownTeammateIds, nightShieldWinners } from './run.ts'
import type { NightShieldPlan, Run, SocialEntry } from './run.ts'
import { applySocialMove } from './social.ts'
import type { SocialMove } from './social.ts'

function send(
  run: Run,
  actorId: string,
  recipientId: string,
  kind: SocialMove['kind'],
  suspectId?: string
) {
  return applySocialMove(run, commandToken(run), { actorId, recipientId, kind, suspectId })
}

function giftTarget(
  run: Run,
  actorId: string,
  candidateIds: readonly string[],
  salt: number,
  requested = false
) {
  const teammates = knownTeammateIds(run, actorId)
  const reports = nightShieldReads(run, actorId)
  const loyalty = getSocialPersonality(actorId).loyalty
  const personalRisk =
    run.private.betrayers.includes(actorId) || actorId === run.immunityId
      ? 0
      : nightExposure(run, actorId)
  const spare = run.private.nightShieldIds.filter((id) => id === actorId).length > 1
  const best = candidateIds
    .filter(
      (id) =>
        id !== actorId &&
        id !== run.immunityId &&
        !teammates.includes(id) &&
        (reports.get(id)?.protected ?? 0) < 0.5
    )
    .map((id) => ({ id, trust: rapport(run.social, actorId, id) }))
    .filter(({ trust }) => trust >= (requested ? 0.16 : 0.24))
    .map(({ id, trust }) => ({
      id,
      value:
        trust * 0.5 +
        loyalty * 0.3 +
        (nightExposure(run, id) - personalRisk) * 0.55 +
        (spare ? 0.22 : 0) +
        (requested ? 0.2 : 0),
    }))
    .sort((a, b) => b.value - a.value)[0]
  if (best && best.value > 0.32 && shieldRoll(run, actorId, salt) < best.value) return best.id
}

export type ShieldFollowUpAction = 'request-shield' | 'ask-shield-plans'

export function shieldFollowUpFor(run: Run, speakerId: string) {
  const replies = run.social.filter(
    ({ day, actorId, recipientId }) =>
      day === run.day && actorId === run.humanId && recipientId === speakerId
  )
  const requestAccepted = replies.find(({ kind }) => kind === 'shield-request')?.accepted
  const plan = replies.find(({ kind }) => kind === 'shield-plans')?.shieldPlan
  // Everyone can follow up on a claim, even if it was a bluff.
  const open =
    nightShieldWindowOpen(run) &&
    run.seats.some(({ id, exit }) => id === speakerId && !exit) &&
    run.seats.some(({ id, exit }) => id === run.humanId && !exit)

  return {
    canRequest: open && requestAccepted === undefined,
    canAskPlans: open && plan === undefined,
    requestAccepted,
    plan,
  }
}

function shieldPlanFor(run: Run, speakerId: string): NightShieldPlan {
  const trust = rapport(run.social, speakerId, run.humanId)
  if (
    !run.private.nightShieldIds.includes(speakerId) ||
    trust < 0.16 ||
    shieldRoll(run, speakerId, 6456) > 0.52 + trust * 0.4
  ) {
    return 'private'
  }

  const guests = run.seats.filter(({ exit }) => !exit).map(({ id }) => id)
  return giftTarget(run, speakerId, guests, 6460) ||
    giftTarget(run, speakerId, [run.humanId], 6460, true)
    ? 'open-to-gift'
    : 'keep'
}

export function respondToShieldFollowUp(
  run: Run,
  speakerId: string,
  action: ShieldFollowUpAction
): Run {
  const claimed = run.social.some(
    ({ day, actorId, recipientId, kind }) =>
      day === run.day &&
      actorId === speakerId &&
      recipientId === run.humanId &&
      kind === 'shield-claim'
  )
  if (!claimed || speakerId === run.humanId) return run

  const followUp = shieldFollowUpFor(run, speakerId)
  const participants = { day: run.day, actorId: run.humanId, recipientId: speakerId }
  let next = run
  let entry: SocialEntry
  if (action === 'request-shield') {
    if (!followUp.canRequest) return run
    if (
      run.private.nightShieldIds.includes(speakerId) &&
      !run.private.nightShieldIds.includes(run.humanId) &&
      giftTarget(run, speakerId, [run.humanId], 6460, true)
    ) {
      next = send(run, speakerId, run.humanId, 'shield-gift')
    }
    entry = { ...participants, kind: 'shield-request', accepted: next !== run }
  } else {
    if (!followUp.canAskPlans) return run
    entry = { ...participants, kind: 'shield-plans', shieldPlan: shieldPlanFor(run, speakerId) }
  }

  return { ...next, revision: run.revision + 1, social: [...next.social, entry] }
}

/** Initial choices happen once, when Safety awards the two shields. */
export function prepareShieldConversations(run: Run): Run {
  const guests = run.seats.filter(({ exit }) => !exit)
  if (!nightShieldWindowOpen(run) || (guests.length <= 6 && !run.dayFlow)) return run
  let next = run
  const winners = nightShieldWinners(run)

  for (const actorId of winners) {
    if (actorId === run.humanId) continue
    const safety = next.dayFlow?.safety
    if (
      next.dayFlow &&
      safety?.kind === 'request' &&
      safety.guestId === actorId &&
      safety.accepted
    ) {
      const humanId = run.humanId
      const profile = getSocialPersonality(actorId)
      const trust = rapport(run.social, actorId, humanId)
      const risk = run.private.betrayers.includes(actorId) ? 0 : nightExposure(run, actorId)
      const honors =
        shieldRoll(next, actorId, 21351) <
        0.76 + trust * 0.42 + profile.loyalty * 0.19 - risk * 0.39
      const gifted = honors ? send(next, actorId, humanId, 'shield-gift') : next
      const kept = gifted !== next
      next = {
        ...gifted,
        dayFlow: { ...next.dayFlow, safety: { ...safety, result: kept ? 'kept' : 'broken' } },
        social: [
          ...gifted.social,
          {
            day: run.day,
            actorId,
            recipientId: humanId,
            kind: 'shield-request',
            accepted: kept,
            reaction: kept ? 'repaired' : 'backfired',
          },
        ],
      }
      continue
    }
    const personality = getSocialPersonality(actorId)
    const teammates = knownTeammateIds(next, actorId)
    const recipient = giftTarget(
      next,
      actorId,
      guests.map(({ id }) => id),
      5311
    )
    if (recipient) {
      next = send(next, actorId, recipient, 'shield-gift')
      continue
    }

    const contacts = guests
      .filter(({ id }) => id !== actorId && !teammates.includes(id))
      .map(({ id }) => ({
        id,
        trust: rapport(next.social, actorId, id),
        initiative: shieldRoll(next, `${actorId}:${id}`, 6732),
      }))
      .sort((a, b) => b.trust - a.trust || b.initiative - a.initiative)
    const confidant = contacts.find(({ trust }) => trust >= 0.16)
    if (
      confidant &&
      shieldRoll(next, actorId, 5312) < 0.14 + personality.warmth * 0.38 + confidant.trust * 0.48
    ) {
      const reply = shieldReplyFor(next, actorId, confidant.id)
      if (reply === 'has' || reply === 'none') {
        next = send(next, actorId, confidant.id, reply === 'has' ? 'shield-claim' : 'shield-deny')
        continue
      }
    }
    const outsider = contacts.find(({ trust }) => trust < 0.16)
    if (outsider && shieldRoll(next, actorId, 5313) < personality.deceptionComfort * 0.42) {
      next = send(next, actorId, outsider.id, 'shield-deny')
    }
  }

  const bluff = guests
    .filter(
      ({ id }) =>
        id !== run.humanId &&
        id !== run.immunityId &&
        !winners.includes(id) &&
        !next.private.nightShieldIds.includes(id) &&
        !next.private.betrayers.includes(id)
    )
    .map(({ id }) => {
      const personality = getSocialPersonality(id)
      return {
        id,
        initiative:
          personality.deceptionComfort * nightExposure(next, id) -
          shieldRoll(next, id, 1291) * 0.65,
      }
    })
    .sort((a, b) => b.initiative - a.initiative)[0]
  if (bluff && bluff.initiative > 0.35 && shieldRoll(next, bluff.id, 5135) < 0.52) {
    const contact = guests
      .filter(({ id }) => id !== bluff.id && rapport(next.social, bluff.id, id) < 0.24)
      .sort(
        (a, b) =>
          rapport(next.social, bluff.id, b.id) - rapport(next.social, bluff.id, a.id) ||
          shieldRoll(next, `${bluff.id}:${b.id}`, 458) -
            shieldRoll(next, `${bluff.id}:${a.id}`, 458)
      )[0]
    if (contact) next = send(next, bluff.id, contact.id, 'shield-claim')
  }
  return next
}

/** Finish private handoffs and whispers before the ballot seals the room. */
export function finishShieldConversations(run: Run): Run {
  if (!nightShieldWindowOpen(run)) return run
  const active = run.seats.filter(({ exit }) => !exit)
  if (active.length <= 6) return run
  let next = run
  const handoffs = run.social.filter(({ day, kind }) => day === run.day && kind === 'shield-gift')
  const donors = new Set(handoffs.map(({ actorId }) => actorId))
  const latestGivers = new Map(handoffs.map(({ actorId, recipientId }) => [recipientId, actorId]))
  const witnesses = new Set(waitingShieldWitnesses(run))
  for (const { id } of active) {
    if (
      id === run.humanId ||
      !next.private.nightShieldIds.includes(id) ||
      donors.has(id) ||
      witnesses.has(id)
    )
      continue
    const giver = latestGivers.get(id)
    if (!giver) continue
    // A late gift to the human would leave them without a chance to pass it on.
    const recipients = active.filter(({ id }) => id !== giver && id !== run.humanId)
    const recipient = giftTarget(
      next,
      id,
      recipients.map(({ id }) => id),
      2089
    )
    if (recipient) next = send(next, id, recipient, 'shield-gift')
  }

  const beforeRumors = next
  for (const { id: actorId } of active) {
    if (actorId === run.humanId) continue
    const reports = firsthandShieldReports(beforeRumors.social, actorId, run.day)
    const subjectId = [...reports]
      .filter(([id]) => active.some((guest) => guest.id === id))
      .sort(
        ([, a], [, b]) =>
          Number(b.claim === 'has' && !b.changedStory) -
          Number(a.claim === 'has' && !a.changedStory)
      )[0]?.[0]
    if (!subjectId) continue
    const personality = getSocialPersonality(actorId)
    const teammates = knownTeammateIds(run, actorId)
    const contact = active
      .filter(({ id }) => id !== actorId && id !== subjectId)
      .map(({ id }) => ({
        id,
        confidence: rapport(run.social, actorId, id) + (teammates.includes(id) ? 0.65 : 0),
      }))
      .sort((a, b) => b.confidence - a.confidence)[0]
    if (!contact || contact.confidence < 0.18) continue
    const loyaltyToSource = rapport(run.social, actorId, subjectId)
    const discretion =
      personality.loyalty *
      (0.29 * loyaltyToSource + (hasAlliance(run.social, actorId, subjectId) ? 0.27 : 0))
    const willingness =
      0.09 + personality.gossipPropensity * 0.55 + contact.confidence * 0.2 - discretion
    if (shieldRoll(run, actorId, 3462) < willingness) {
      next = send(next, actorId, contact.id, 'shield-tip', subjectId)
    }
  }
  return next
}
