import { getSocialPersonality } from '../social/socialPersonalityBank.ts'
import { mulberry32 } from '../store/rng.ts'
import { incidentPressure } from './intel.ts'
import { nightShieldReads } from './nightShields.ts'
import { getSocialView, hasAlliance, relationship } from './perception.ts'
import { hashId, viewFor } from './run.ts'
import type { Ballot, Phase, Role, Run, SocialEntry, TableArgument } from './run.ts'

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
  campaigns?: readonly TableArgument[]
  dawnClue?: string
  eligibleIds: readonly string[]
  evidence?: ReadonlyMap<string, number>
  tableRound?: number
  tablePressure?: ReadonlyMap<string, number>
  shieldReads?: ReturnType<typeof nightShieldReads>
}

export function resolutionPerspective(
  run: Run,
  actorId: string,
  eligibleIds: readonly string[]
): Perspective {
  const view = viewFor(run, actorId)
  const morningExit = run.lastDawn?.day === run.day && run.lastDawn.eliminatedId
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
    campaigns: run.lastTable?.campaigns,
    dawnClue: morningExit
      ? run.lastTable?.revealedBallots?.find(({ voterId }) => voterId === morningExit)?.targetId
      : undefined,
    evidence: incidentPressure(run, actorId),
    shieldReads: run.phase === 'night' ? nightShieldReads(run, actorId) : undefined,
  }
}

function privateSignals({ actorId, day, ownConversations }: Perspective) {
  const activePacts = new Map<string, string>()
  const caseFor = new Map<string, number>()
  const caseAgainst = new Map<string, number>()
  const rumors = new Map<string, Set<string>>()
  for (const entry of ownConversations) {
    const { suspectId, kind, recipientId, actorId: speaker } = entry
    if (!suspectId) continue
    const incoming = recipientId === actorId
    if (
      (incoming || speaker === actorId) &&
      kind === 'vote-plan' &&
      entry.day === day &&
      entry.accepted &&
      !entry.pledgeResult
    ) {
      activePacts.set(incoming ? speaker : recipientId, suspectId)
    }
    if (!incoming || entry.day < day - 1) continue
    if (kind === 'question' || (kind === 'share-suspicion' && entry.reaction === 'landed')) {
      const speakers = rumors.get(suspectId) ?? new Set<string>()
      speakers.add(speaker)
      rumors.set(suspectId, speakers)
    }
    if (entry.reaction !== 'landed') continue
    const today = entry.day === day
    // A theory remains one weak signal even if it travels through several guests.
    if (kind === 'share-suspicion') {
      caseFor.set(suspectId, Math.max(caseFor.get(suspectId) ?? 0, today ? 0.2 : 0.1))
    } else if (kind === 'defend-guest') {
      caseAgainst.set(suspectId, Math.max(caseAgainst.get(suspectId) ?? 0, today ? 0.2 : 0.1))
    }
  }

  const pactSupport = new Map<string, number>()
  for (const [peerId, suspectId] of activePacts) {
    const { reliability } = relationship(ownConversations, actorId, peerId)
    const weight =
      (hasAlliance(ownConversations, actorId, peerId) ? 0.64 : 0.48) + reliability * 0.25
    pactSupport.set(suspectId, Math.min(0.85, (pactSupport.get(suspectId) ?? 0) + weight))
  }
  return { caseFor, caseAgainst, rumors, pactSupport }
}

type TargetContext = 'case' | 'table' | 'night'

function scoreChoice(
  perspective: Perspective,
  id: string,
  context: TargetContext,
  signals: ReturnType<typeof privateSignals>
): number {
  const { actorId, day, role, seed, teammates, publicTally, ownConversations } = perspective
  const roundSalt =
    context === 'table' && perspective.tableRound ? Math.imul(perspective.tableRound, 229) : 0
  const random = mulberry32(seed ^ Math.imul(day, 1021) ^ hashId(actorId + ':' + id) ^ roundSalt)
  const uncertainty = random() * 0.64
  const { bond } = relationship(ownConversations, actorId, id)
  const personality = getSocialPersonality(actorId)
  const publicHeat = Math.min(0.55, (publicTally[id] ?? 0) / 12)
  if (context === 'night') {
    const rivalVote = perspective.revealedBallots?.find(({ voterId }) => voterId === id)?.targetId
    const againstUs = (targetId?: string) =>
      targetId === actorId || (targetId !== undefined && teammates.includes(targetId))
    const ledCase = perspective.campaigns?.some(
      (claim) => claim.speakerId === id && againstUs(claim.targetId)
    )
    const threat = ledCase ? 0.56 : againstUs(rivalVote) ? 0.34 : 0
    const obvious = ledCase ? threat * personality.strategicCalculation * 0.24 : 0
    const read = perspective.shieldReads?.get(id)
    const confidence = read?.conflicting ? 0.5 : 1
    const shieldRisk = read ? Math.max(0, read.protected - read.exposed * 0.65) : 0
    const opportunity = read ? Math.max(0, read.exposed - read.protected) : 0
    return (
      uncertainty -
      bond * 0.62 -
      publicHeat * 0.6 +
      threat -
      obvious +
      confidence * (opportunity * 0.22 - shieldRisk * (1.07 - personality.riskTolerance * 0.38))
    )
  }

  const publicArgument = perspective.tablePressure?.get(id) ?? 0
  const privateCase = (signals.caseFor.get(id) ?? 0) - (signals.caseAgainst.get(id) ?? 0)
  const weightOfCase =
    Math.max(0, privateCase, publicArgument) + Math.min(0, privateCase, publicArgument)
  const evidence =
    (perspective.evidence?.get(id) ?? 0) * (0.86 + 0.36 * personality.strategicCalculation)
  const dawnClue = perspective.dawnClue === id ? 0.08 : 0
  const suspicion = evidence + weightOfCase + dawnClue
  const teammateCost =
    role === 'betrayer' && teammates.includes(id)
      ? Math.max(
          0.15,
          0.48 + personality.loyalty * 0.36 - (publicHeat + Math.max(0, suspicion)) * 0.52
        )
      : 0
  const read = uncertainty + suspicion - teammateCost - bond * (0.22 + personality.loyalty * 0.28)
  if (context === 'case') return read

  const rumorSupport = Math.min(0.16, (signals.rumors.get(id)?.size ?? 0) * 0.065)
  const momentum = (publicHeat + rumorSupport) * (0.7 + (1 - personality.riskTolerance) * 0.4)
  const pact = perspective.phase === 'final-banishment' ? 0 : (signals.pactSupport.get(id) ?? 0)
  const danger = Math.min(1, (publicTally[actorId] ?? 0) / 4)
  const viability = Math.min(1, momentum + pact + Math.max(0, suspicion))
  const selfPreservation = viability * danger * (0.12 + 0.23 * personality.strategicCalculation)
  return read + momentum + pact + selfPreservation - bond * 0.22
}

export function chooseTarget(perspective: Perspective, context: TargetContext): string | undefined {
  const signals = privateSignals(perspective)
  const ranked = perspective.eligibleIds.map((id) => ({
    id,
    score: scoreChoice(perspective, id, context, signals),
  }))
  ranked.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
  return ranked[0]?.id
}

/** Finale decisions need the best case the guest can actually make. */
export function strongestCase(perspective: Perspective) {
  const signals = privateSignals(perspective)
  return Math.max(
    0,
    ...perspective.eligibleIds.map(
      (id) =>
        (perspective.evidence?.get(id) ?? 0) +
        (signals.caseFor.get(id) ?? 0) -
        (signals.caseAgainst.get(id) ?? 0) +
        (perspective.dawnClue === id ? 0.08 : 0)
    )
  )
}
