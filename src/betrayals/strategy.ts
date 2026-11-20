import { mulberry32 } from '../store/rng.ts'
import type { Phase, Role, SocialEntry } from './run.ts'
import { hasAlliance, rapport } from './social.ts'

type Perspective = {
  actorId: string
  role: Role
  teammates: readonly string[]
  day: number
  phase?: Phase
  seed: number
  ownConversations: readonly SocialEntry[]
  publicTally: Readonly<Record<string, number>>
  eligibleIds: readonly string[]
  tableRound?: number
  tablePressure?: ReadonlyMap<string, number>
}

function hashId(id: string): number {
  return Array.from(id).reduce(
    (hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) | 0,
    0
  )
}

function socialPressure({ actorId, day, ownConversations }: Perspective) {
  const pledges = new Map<string, string>()
  const suspicions = new Map<string, string>()

  for (const entry of ownConversations) {
    if (entry.day !== day || !entry.suspectId) continue
    const incoming = entry.recipientId === actorId
    if (!incoming && entry.actorId !== actorId) continue

    if (entry.kind === 'vote-plan' && entry.accepted)
      pledges.set(incoming ? entry.actorId : entry.recipientId, entry.suspectId)
    if (entry.kind === 'question' && incoming) suspicions.set(entry.actorId, entry.suspectId)
  }

  const pressure = new Map<string, number>()
  for (const [, suspectId] of suspicions) {
    pressure.set(suspectId, Math.min(0.2, (pressure.get(suspectId) ?? 0) + 0.1))
  }
  for (const [peerId, suspectId] of pledges) {
    const weight = hasAlliance(ownConversations, actorId, peerId) ? 0.72 : 0.55
    pressure.set(suspectId, Math.min(0.85, (pressure.get(suspectId) ?? 0) + weight))
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
  if (night) return uncertainty - trust * 0.6 - targetPressure * 0.2
  const teammateCost = role === 'betrayer' && teammates.includes(id) ? 0.75 : 0
  return uncertainty - trust - teammateCost + targetPressure + pressure
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

export function wantsToEnd(perspective: Perspective, publiclyRevealedBetrayers: number): boolean {
  const random = mulberry32(perspective.seed ^ hashId(perspective.actorId) ^ (perspective.day * 97))
  if (perspective.role === 'betrayer') return random() >= 0.18
  const pressure = Math.max(0, ...Object.values(perspective.publicTally))
  const confidence = Math.min(0.9, 0.13 + publiclyRevealedBetrayers * 0.16 - pressure * 0.035)
  return random() < confidence
}
