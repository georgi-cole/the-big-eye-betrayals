import { mulberry32 } from '../store/rng.ts'
import type { Role, SocialEntry } from './run.ts'
import { rapport } from './social.ts'

type Perspective = {
  actorId: string
  role: Role
  teammates: readonly string[]
  day: number
  seed: number
  ownConversations: readonly SocialEntry[]
  publicTally: Readonly<Record<string, number>>
  eligibleIds: readonly string[]
}

function hashId(id: string): number {
  return Array.from(id).reduce(
    (hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) | 0,
    0
  )
}

function dealWeight(perspective: Perspective, id: string): number {
  return (
    perspective.ownConversations.filter(
      (entry) =>
        entry.day === perspective.day &&
        ((entry.kind === 'vote-plan' && entry.accepted) || entry.kind === 'question') &&
        entry.suspectId === id
    ).length * 0.55
  )
}

function scoreChoice(perspective: Perspective, id: string, night: boolean): number {
  const { actorId, day, role, seed, teammates, publicTally, ownConversations } = perspective
  const random = mulberry32(seed ^ Math.imul(day, 1021) ^ hashId(actorId + ':' + id))
  const uncertainty = random() * 0.8
  const trust = rapport(ownConversations, actorId, id)
  const targetPressure = (publicTally[id] ?? 0) / 12
  if (night) return uncertainty - trust * 0.6 - targetPressure * 0.2
  const teammateCost = role === 'betrayer' && teammates.includes(id) ? 0.75 : 0
  return uncertainty - trust - teammateCost + targetPressure + dealWeight(perspective, id)
}

export function chooseTarget(
  perspective: Perspective,
  context: 'table' | 'night'
): string | undefined {
  const ranked = perspective.eligibleIds.map((id) => ({
    id,
    score: scoreChoice(perspective, id, context === 'night'),
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
