import { mulberry32 } from '../store/rng.ts'
import { hashId, viewFor } from './run.ts'
import { getSocialPersonality } from '../social/socialPersonalityBank.ts'
import { incidentPressure } from './intel.ts'
import type { Ballot, Phase, Role, Run, SocialEntry } from './run.ts'
import { getSocialView, hasAlliance, rapport } from './social.ts'

type Perspective = {
  actorId: string
  role: Role
  teammates: readonly string[]
  day: number
  phase?: Phase
  seed: number
  ownConversations: readonly SocialEntry[]
  publicTally: Readonly<Record<string, number>>
  revealedBallots?: readonly Ballot[]
  eligibleIds: readonly string[]
  evidence?: ReadonlyMap<string, number>
  tableRound?: number
  tablePressure?: ReadonlyMap<string, number>
}

export function resolutionPerspective(
  run: Run,
  actorId: string,
  eligibleIds: readonly string[]
): Perspective {
  const view = viewFor(run, actorId)
  return {
    actorId,
    role: view.role ?? 'loyal',
    teammates: view.teammateIds,
    day: run.day,
    phase: run.phase,
    seed: run.publicSeed,
    eligibleIds,
    ownConversations: getSocialView(run, actorId),
    publicTally: run.lastTable?.tally ?? {},
    revealedBallots: run.lastTable?.revealedBallots,
    evidence: incidentPressure(run, actorId),
  }
}

function socialPressure({ actorId, day, ownConversations }: Perspective) {
  const pledges = new Map<string, string>()
  const suspicions = new Map<string, string>()
  const argumentsHeard = new Map<string, SocialEntry>()

  for (const entry of ownConversations) {
    if (entry.day !== day || !entry.suspectId) continue
    const incoming = entry.recipientId === actorId
    if (!incoming && entry.actorId !== actorId) continue

    if (entry.kind === 'vote-plan' && entry.accepted && !entry.pledgeResult)
      pledges.set(incoming ? entry.actorId : entry.recipientId, entry.suspectId)
    if (entry.kind === 'question' && incoming) suspicions.set(entry.actorId, entry.suspectId)
    if (incoming && (entry.kind === 'share-suspicion' || entry.kind === 'defend-guest')) {
      argumentsHeard.set(JSON.stringify([entry.actorId, entry.suspectId]), entry)
    }
  }

  const pressure = new Map<string, number>()
  for (const [, suspectId] of suspicions) {
    pressure.set(suspectId, Math.min(0.2, (pressure.get(suspectId) ?? 0) + 0.1))
  }
  for (const [peerId, suspectId] of pledges) {
    const weight = hasAlliance(ownConversations, actorId, peerId) ? 0.72 : 0.55
    pressure.set(suspectId, Math.min(0.85, (pressure.get(suspectId) ?? 0) + weight))
  }
  for (const { actorId: speaker, suspectId, kind, reaction } of argumentsHeard.values()) {
    if (reaction === 'backfired') {
      pressure.set(speaker, Math.min(0.85, (pressure.get(speaker) ?? 0) + 0.24))
    } else if (reaction === 'landed' && suspectId) {
      const weight = kind === 'defend-guest' ? -0.27 : 0.28
      const prior = pressure.get(suspectId) ?? 0
      pressure.set(suspectId, Math.min(0.85, Math.max(-0.5, prior + weight)))
    }
  }
  return pressure
}

function scoreChoice(
  perspective: Perspective,
  id: string,
  night: boolean,
  pressure: number
): number {
  const { actorId, day, role, seed, teammates, publicTally, ownConversations } = perspective
  const roundSalt = !night && perspective.tableRound ? Math.imul(perspective.tableRound, 229) : 0
  const random = mulberry32(seed ^ Math.imul(day, 1021) ^ hashId(actorId + ':' + id) ^ roundSalt)
  const uncertainty = random() * 0.8
  const trust = rapport(ownConversations, actorId, id)
  const targetPressure = (publicTally[id] ?? 0) / 12
  const personality = getSocialPersonality(actorId)
  if (night) {
    const rivalVote = perspective.revealedBallots?.find(({ voterId }) => voterId === id)?.targetId
    const threat =
      rivalVote === actorId ? 0.5 : rivalVote && teammates.includes(rivalVote) ? 0.32 : 0
    return uncertainty - trust * 0.65 - targetPressure * 0.55 + threat
  }
  const evidence =
    (perspective.evidence?.get(id) ?? 0) * (0.8 + 0.4 * personality.strategicCalculation)
  const teammateCost =
    role === 'betrayer' && teammates.includes(id)
      ? Math.max(0.2, 0.75 - (targetPressure + evidence) * 0.45)
      : 0
  // A contested voter has more to gain by joining a plausible alternative.
  const danger = Math.min(1, (publicTally[actorId] ?? 0) / 4)
  const viability = Math.min(1, targetPressure + Math.max(0, pressure) + Math.max(0, evidence))
  const defensiveVote = viability * danger * (0.18 + 0.24 * personality.riskTolerance)
  return uncertainty - trust - teammateCost + targetPressure + pressure + evidence + defensiveVote
}

export function chooseTarget(
  perspective: Perspective,
  context: 'table' | 'night'
): string | undefined {
  const night = context === 'night'
  const pressure =
    !night && perspective.phase !== 'final-banishment' ? socialPressure(perspective) : undefined
  const ranked = perspective.eligibleIds.map((id) => ({
    id,
    score: scoreChoice(
      perspective,
      id,
      night,
      (pressure?.get(id) ?? 0) + (night ? 0 : (perspective.tablePressure?.get(id) ?? 0))
    ),
  }))
  ranked.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
  return ranked[0]?.id
}
