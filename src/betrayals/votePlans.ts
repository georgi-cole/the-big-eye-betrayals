import { mulberry32 } from '../store/rng.ts'
import { hasAlliance, rapport } from './perception.ts'
import { eligibleBanishmentTargets } from './run.ts'
import type { Run } from './run.ts'
import { latestPact } from './social.ts'
import { chooseTarget, resolutionPerspective } from './strategy.ts'

type Contact = { speakerId: string; targetId?: string }

export type VotePlans = {
  day: number
  kind: 'change' | 'offers' | 'check-in'
  previousTargetId?: string
  contacts: Contact[]
}

export function prepareVotePlans(run: Run): Run {
  if (
    run.votePlans?.day === run.day ||
    !run.seats.some(({ id, exit }) => id === run.humanId && !exit)
  ) {
    return run
  }

  const random = mulberry32(run.publicSeed ^ Math.imul(run.day, 14621))
  const contacts = run.seats
    .filter(({ id, exit }) => !exit && id !== run.humanId)
    .map(({ id }) => ({
      id,
      priority:
        rapport(run.social, id, run.humanId) +
        (hasAlliance(run.social, id, run.humanId) ? 0.6 : 0) +
        random() * 0.22,
    }))
    .sort((first, second) => second.priority - first.priority)
  const playerTargets = new Set(eligibleBanishmentTargets(run, run.humanId))

  function offer(speakerId: string) {
    const targets = eligibleBanishmentTargets(run, speakerId).filter((id) => playerTargets.has(id))
    return chooseTarget(resolutionPerspective(run, speakerId, targets), 'table')
  }

  const protectedGuests = new Set([
    run.immunityId,
    run.publicShield?.day === run.day ? run.publicShield.id : undefined,
  ])
  for (const { id } of contacts) {
    const previous = latestPact(run.social, run.humanId, id, run.day)?.suspectId
    if (!previous || !protectedGuests.has(previous)) continue
    const targetId = offer(id)
    if (targetId) {
      return {
        ...run,
        votePlans: {
          day: run.day,
          kind: 'change',
          previousTargetId: previous,
          contacts: [{ speakerId: id, targetId }],
        },
      }
    }
  }

  const proposals: Contact[] = []
  const candidates = run.dayFlow
    ? contacts.filter(
        ({ id }) =>
          rapport(run.social, id, run.humanId) >= 0.12 ||
          run.social.some(
            ({ day, actorId, recipientId }) =>
              day === run.day &&
              ((actorId === id && recipientId === run.humanId) ||
                (actorId === run.humanId && recipientId === id))
          )
      )
    : contacts
  for (const { id } of candidates.slice(0, 5)) {
    const targetId = offer(id)
    if (!targetId || proposals.some((proposal) => proposal.targetId === targetId)) continue
    proposals.push({ speakerId: id, targetId })
    if (proposals.length === 2) {
      return { ...run, votePlans: { day: run.day, kind: 'offers', contacts: proposals } }
    }
  }

  const speakerId = candidates[0]?.id
  return speakerId
    ? {
        ...run,
        votePlans: {
          day: run.day,
          kind: 'check-in',
          contacts: [{ speakerId, targetId: run.dayFlow ? offer(speakerId) : undefined }],
        },
      }
    : run
}

/** A guest with no agreement here can try to move their proposal elsewhere before Safety. */
export function settleUnansweredVoteOffers(run: Run): Run {
  if (!run.dayFlow || run.votePlans?.day !== run.day) return run
  const redirects = run.votePlans.contacts.flatMap(({ speakerId, targetId }, index) => {
    if (!targetId || run.incomingResponses?.[voteOfferId(run, index)] === 'engage') return []
    const pact = latestPact(run.social, run.humanId, speakerId, run.day)
    if (pact?.suspectId && eligibleBanishmentTargets(run, speakerId).includes(pact.suspectId))
      return []
    const recipientId = run.seats
      .filter(({ id, exit }) => !exit && id !== run.humanId && id !== speakerId && id !== targetId)
      .sort(
        (a, b) => rapport(run.social, speakerId, b.id) - rapport(run.social, speakerId, a.id)
      )[0]?.id
    if (!recipientId) return []
    const accepted = rapport(run.social, recipientId, speakerId) >= 0.12
    return [
      {
        day: run.day,
        actorId: speakerId,
        recipientId,
        suspectId: targetId,
        kind: accepted ? ('vote-plan' as const) : ('question' as const),
        accepted,
      },
    ]
  })
  return redirects.length ? { ...run, social: [...run.social, ...redirects] } : run
}

export function voteOfferId(run: Pick<Run, 'day'>, index: number) {
  return `${run.day}:after-immunity:${index + 1}`
}
