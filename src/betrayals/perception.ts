import { getSocialPersonality } from '../social/socialPersonalityBank.ts'
import type { Run, SocialEntry, TableArgument } from './run.ts'
import { castleAlliances, socialEntryVisibleTo } from './allianceRecords.ts'

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

export function getSocialView(run: Run, actorId: string | null): SocialEntry[] {
  if (actorId === null) return []
  return run.social
    .filter((entry) => socialEntryVisibleTo(entry, actorId))
    .map((entry) => ({ ...entry }))
}

export function between(entry: SocialEntry, actorId: string, peerId: string): boolean {
  return (
    (entry.actorId === actorId && entry.recipientId === peerId) ||
    (entry.actorId === peerId && entry.recipientId === actorId)
  )
}

export function hasPersonalAlliance(
  entries: readonly SocialEntry[],
  actorId: string,
  peerId: string
) {
  if (actorId === peerId) return false
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index]
    if (!between(entry, actorId, peerId)) continue
    if (entry.kind === 'end-pact') return false
    if (entry.kind === 'alliance' && entry.accepted) return true
  }
  return false
}

export function hasAlliance(entries: readonly SocialEntry[], actorId: string, peerId: string) {
  return (
    actorId !== peerId &&
    (hasPersonalAlliance(entries, actorId, peerId) ||
      castleAlliances(entries).some(
        ({ memberIds }) => memberIds.includes(actorId) && memberIds.includes(peerId)
      ))
  )
}

/** Bonds and the reliability of a promise can move in opposite directions. */
export function relationship(entries: readonly SocialEntry[], observerId: string, peerId: string) {
  let connection = 0
  let reliability = 0
  let receivedShield = false
  for (const entry of entries) {
    if (!between(entry, observerId, peerId)) continue
    if (entry.kind === 'rapport') connection += 0.12
    if (entry.kind === 'group-chat') connection += 0.08
    if (entry.kind === 'shield-gift' && entry.recipientId === observerId) receivedShield = true
    if (
      entry.kind === 'shield-gift' &&
      entry.reaction === 'backfired' &&
      entry.recipientId === observerId
    )
      reliability = clamp(reliability - 0.1, -0.36, 0.24)
    const heardClaim = entry.kind === 'ask-shield' ? entry.actorId : entry.recipientId
    if (entry.reaction === 'backfired' && heardClaim === observerId) connection -= 0.08
    if (entry.reaction === 'repaired') connection += 0.16
    if (entry.pledgeResult && entry.pledgeResult !== 'void') {
      const followed =
        entry.actorId === peerId ? entry.pledgeResult.actor : entry.pledgeResult.recipient
      reliability = clamp(reliability + (followed ? 0.08 : -0.18), -0.36, 0.24)
    }
  }
  const bond =
    clamp(connection + (receivedShield ? 0.14 : 0), 0, 0.6) +
    (hasAlliance(entries, observerId, peerId) ? 0.24 : 0)
  return { bond, reliability }
}

export function rapport(entries: readonly SocialEntry[], observerId: string, peerId: string) {
  const { bond, reliability } = relationship(entries, observerId, peerId)
  return clamp(bond + reliability, 0, 0.84)
}

/** Only public reveals of an actively campaigned target can add a review. */
export function trackRecord(run: Pick<Run, 'day' | 'caseReviews'>, speakerId: string) {
  let record = 0
  for (const review of run.caseReviews ?? []) {
    if (review.speakerId !== speakerId) continue
    const recency = 1 - (run.day - review.day) / 5
    if (recency <= 0) continue
    record += (review.result === 'caught' ? 0.07 : -0.09) * recency
  }
  return clamp(record, -0.24, 0.15)
}

export function argumentBasis(
  run: Pick<Run, 'lastTable' | 'day'>,
  conversations: readonly SocialEntry[],
  speakerId: string,
  targetId: string
): TableArgument['basis'] {
  if (
    (run.lastTable?.tally[targetId] ?? 0) >= 2 ||
    run.lastTable?.revealedBallots?.some(
      ({ voterId, targetId: votedFor }) => voterId === targetId && votedFor === speakerId
    )
  )
    return 'record'
  return conversations.some(
    (entry) =>
      entry.recipientId === speakerId &&
      entry.suspectId === targetId &&
      entry.day >= run.day - 1 &&
      (entry.kind === 'question' ||
        (entry.kind === 'share-suspicion' && entry.reaction === 'landed') ||
        (entry.kind === 'vote-plan' && entry.accepted))
  )
    ? 'conversation'
    : 'impression'
}

/**
 * The listener judges the argument from their information and relationships. Dismissing
 * an argument never becomes evidence about the speaker's role.
 */
export function hearArgument(
  run: Pick<Run, 'day' | 'caseReviews' | 'social' | 'lastTable'>,
  listenerId: string,
  argument: TableArgument
) {
  const { speakerId, targetId, tone, stance, basis } = argument
  if (listenerId === speakerId || listenerId === targetId) return 0
  const personality = getSocialPersonality(listenerId)
  const speaker = relationship(run.social, listenerId, speakerId)
  const subject = relationship(run.social, listenerId, targetId)
  const pastVote = run.lastTable?.revealedBallots?.find(({ voterId }) => voterId === targetId)
  const heard = basis === 'conversation' ? 0.1 : basis === 'record' ? 0.08 : 0.03
  const corroboration = pastVote?.targetId === listenerId ? 0.1 : 0
  const loyalty = subject.bond * (0.45 + personality.loyalty * 0.5)
  const confidence =
    0.08 +
    speaker.bond * 0.55 +
    speaker.reliability * 0.25 +
    trackRecord(run, speakerId) +
    heard +
    (stance === 'defend' ? loyalty * 0.65 : corroboration - loyalty)
  if (stance === 'question') return Math.min(0.06, Math.max(0, confidence) * 0.25)
  const threshold =
    tone === 'forceful' ? 0.095 + (1 - personality.publicConflictComfort) * 0.08 : 0.07
  const strength = clamp((confidence - threshold) * (tone === 'forceful' ? 1.55 : 1.1), 0, 0.34)
  return stance === 'defend' ? -strength : strength
}
