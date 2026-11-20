import { isCurrentCommand } from './run.ts'
import type { CommandToken, Run, SocialEntry } from './run.ts'

const DAILY_ACTIONS = 3

export type SocialMove = Omit<SocialEntry, 'day' | 'accepted'>

export function remainingActions(run: Run, actorId: string): number {
  return Math.max(
    0,
    DAILY_ACTIONS -
      run.social.filter((entry) => entry.day === run.day && entry.actorId === actorId).length
  )
}

export function getSocialView(run: Run, actorId: string | null): SocialEntry[] {
  return run.social
    .filter((entry) => entry.actorId === actorId || entry.recipientId === actorId)
    .map((entry) => ({ ...entry }))
}

export function rapport(entries: readonly SocialEntry[], actorId: string, peerId: string): number {
  const positive = entries.filter(
    (entry) =>
      (entry.kind === 'rapport' || (entry.kind === 'alliance' && entry.accepted)) &&
      ((entry.actorId === actorId && entry.recipientId === peerId) ||
        (entry.recipientId === actorId && entry.actorId === peerId))
  ).length
  return Math.min(0.6, positive * 0.12)
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

  const entry: SocialEntry = {
    actorId: move.actorId,
    recipientId: move.recipientId,
    kind: move.kind,
    day: run.day,
  }
  if (move.kind === 'vote-plan' || move.kind === 'question') {
    entry.suspectId = move.suspectId
  }
  if (move.kind === 'vote-plan' || move.kind === 'alliance') {
    entry.accepted =
      rapport(getSocialView(run, move.recipientId), move.recipientId, move.actorId) >= 0.12
  }

  return { ...run, revision: run.revision + 1, social: [...run.social, entry] }
}
