import { isCurrentCommand } from './run.ts'
import type { CommandToken, Run, SocialEntry } from './run.ts'

export const DAILY_ACTIONS = 3

export type SocialMove = Omit<SocialEntry, 'day' | 'accepted'>

export function remainingActions(run: Run, actorId: string): number {
  return Math.max(
    0,
    DAILY_ACTIONS -
      run.social.filter((entry) => entry.day === run.day && entry.actorId === actorId).length
  )
}

export function getSocialView(run: Run, actorId: string | null): SocialEntry[] {
  if (actorId === null) return []
  return run.social
    .filter((entry) => entry.actorId === actorId || entry.recipientId === actorId)
    .map((entry) => ({ ...entry }))
}

function between(entry: SocialEntry, actorId: string, peerId: string): boolean {
  return (
    (entry.actorId === actorId && entry.recipientId === peerId) ||
    (entry.actorId === peerId && entry.recipientId === actorId)
  )
}

export function hasAlliance(entries: readonly SocialEntry[], actorId: string, peerId: string) {
  return entries.some(
    (entry) => entry.kind === 'alliance' && entry.accepted && between(entry, actorId, peerId)
  )
}

export function askedToday(
  entries: readonly SocialEntry[],
  actorId: string,
  peerId: string,
  day: number
) {
  return entries.some(
    (entry) =>
      entry.kind === 'question' &&
      entry.day === day &&
      entry.actorId === actorId &&
      entry.recipientId === peerId
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

export function rapport(entries: readonly SocialEntry[], actorId: string, peerId: string): number {
  const exchanges = entries.filter(
    (entry) => entry.kind === 'rapport' && between(entry, actorId, peerId)
  ).length
  return Math.min(0.6, exchanges * 0.12) + (hasAlliance(entries, actorId, peerId) ? 0.24 : 0)
}

export function applySocialMove(run: Run, token: CommandToken, move: SocialMove): Run {
  if (
    run.phase !== 'social' ||
    !isCurrentCommand(run, token) ||
    remainingActions(run, move.actorId) === 0
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
    (move.kind === 'vote-plan' || move.kind === 'question') &&
    (!move.suspectId ||
      !active.has(move.suspectId) ||
      move.suspectId === move.actorId ||
      move.suspectId === move.recipientId)
  )
    return run

  const { actorId, recipientId, kind, suspectId } = move
  const { social, day } = run
  if (
    (kind === 'question' && askedToday(social, actorId, recipientId, day)) ||
    (kind === 'alliance' && hasAlliance(social, actorId, recipientId)) ||
    (kind === 'vote-plan' && latestPact(social, actorId, recipientId, day)?.suspectId === suspectId)
  )
    return run

  const entry: SocialEntry = {
    actorId,
    recipientId,
    kind,
    day,
  }
  if (kind === 'vote-plan' || kind === 'question') {
    entry.suspectId = suspectId
  }
  if (kind === 'vote-plan' || kind === 'alliance') {
    entry.accepted = rapport(social, actorId, recipientId) >= 0.12
  }

  return { ...run, revision: run.revision + 1, social: [...social, entry] }
}
