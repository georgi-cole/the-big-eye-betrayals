import { eligibleBanishmentTargets, isCurrentCommand } from './run.ts'
import type { CommandToken, Phase, Run, SocialEntry, SocialReaction } from './run.ts'
import { intendsToEnd } from './settlement.ts'
import {
  missingSocialResource,
  socialMoveCost,
  socialWalletFor,
  walletAfterSocialMove,
} from './socialResources.ts'

export type SocialMove = Omit<SocialEntry, 'day' | 'accepted' | 'reaction'>

const checkIn = ['rapport'] as const
const makePeace = ['rapport', 'mend-fences'] as const
const compareNotes = [...makePeace, 'question', 'ask-about'] as const
const discussSuspicions = [...compareNotes, 'share-suspicion', 'defend-guest'] as const
const prepareForTable = [...discussSuspicions, 'vote-plan'] as const
const phaseMoves: Record<Phase, readonly SocialEntry['kind'][]> = {
  'role-reveal': checkIn,
  dawn: [...discussSuspicions, 'alliance', 'debrief'],
  social: [...prepareForTable, 'alliance'],
  immunity: prepareForTable,
  safety: prepareForTable,
  'round-table': prepareForTable,
  'table-reveal': makePeace,
  night: [...makePeace, 'alliance', 'debrief'],
  'night-resolved': checkIn,
  'final-challenge': compareNotes,
  'final-banishment': compareNotes,
  'end-vote': [...compareNotes, 'ask-end'],
  settled: [],
}

export function socialMoveKinds(
  run: Pick<Run, 'phase' | 'result' | 'tableCount' | 'runoffIds' | 'lastTable'>
): readonly SocialEntry['kind'][] {
  if (run.result || run.phase === 'settled') return []
  if (run.tableCount || run.runoffIds) return makePeace
  const moves = phaseMoves[run.phase]
  return run.lastTable?.blind === false ? moves : moves.filter((kind) => kind !== 'debrief')
}

export function choosesSocialSubject(kind: SocialEntry['kind']): boolean {
  return (
    kind === 'vote-plan' ||
    kind === 'ask-about' ||
    kind === 'share-suspicion' ||
    kind === 'defend-guest'
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

export function discussedToday(
  entries: readonly SocialEntry[],
  move: SocialMove,
  day: number
): boolean {
  if (move.kind === 'rapport' || move.kind === 'alliance' || move.kind === 'vote-plan') return false
  return entries.some(
    (entry) =>
      entry.kind === move.kind &&
      entry.day === day &&
      entry.actorId === move.actorId &&
      entry.recipientId === move.recipientId &&
      (!choosesSocialSubject(move.kind) || entry.suspectId === move.suspectId)
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
  let balance = 0
  for (const entry of entries) {
    if (!between(entry, actorId, peerId)) continue
    if (entry.kind === 'rapport') balance += 0.12
    if (entry.reaction === 'backfired') balance -= 0.12
    if (entry.reaction === 'repaired') balance += 0.16
  }
  return Math.max(0, Math.min(0.6, balance)) + (hasAlliance(entries, actorId, peerId) ? 0.24 : 0)
}

export function hasSocialStrain(entries: readonly SocialEntry[], actorId: string, peerId: string) {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index]
    if (!between(entry, actorId, peerId)) continue
    if (entry.reaction === 'backfired' || entry.reaction === 'repaired') {
      return entry.reaction === 'backfired'
    }
  }
  return false
}

function responseToMove(run: Run, move: SocialMove): SocialReaction | undefined {
  const { actorId, kind, recipientId, suspectId } = move
  if (
    !['ask-about', 'share-suspicion', 'defend-guest', 'mend-fences', 'debrief', 'ask-end'].includes(
      kind
    )
  )
    return
  const trust = rapport(run.social, actorId, recipientId)
  const subjectTrust = suspectId ? rapport(run.social, recipientId, suspectId) : 0
  const previousVote = run.lastTable?.blind === false ? run.lastTable : undefined
  const votes = suspectId ? (previousVote?.tally[suspectId] ?? 0) : 0
  switch (kind) {
    case 'ask-about':
      if (trust < 0.12) return 'held-back'
      if (subjectTrust >= 0.24) return 'trusts'
      return votes >= 2 ? 'wary' : 'uncertain'
    case 'share-suspicion':
      if (subjectTrust - trust >= 0.2) return 'backfired'
      return trust >= 0.12 || votes >= 2 ? 'landed' : 'unmoved'
    case 'defend-guest':
      if (votes >= 3 && subjectTrust + trust < 0.24) return 'backfired'
      return subjectTrust + trust >= 0.12 ? 'landed' : 'unmoved'
    case 'mend-fences':
      return run.social.some(
        (entry) => entry.kind === 'rapport' && between(entry, actorId, recipientId)
      ) || trust > 0
        ? 'repaired'
        : 'held-back'
    case 'debrief':
      if (trust < 0.12) return 'held-back'
      return previousVote?.tiedByDraw ? 'wary' : 'landed'
    case 'ask-end':
      if (trust < 0.24) return 'held-back'
      return intendsToEnd(run, recipientId) ? 'end' : 'banish'
  }
}

export function applySocialMove(run: Run, token: CommandToken, move: SocialMove): Run {
  if (!socialMoveKinds(run).includes(move.kind) || !isCurrentCommand(run, token)) return run

  const active = new Set(run.seats.filter(({ exit }) => !exit).map(({ id }) => id))
  if (
    move.actorId === move.recipientId ||
    !active.has(move.actorId) ||
    !active.has(move.recipientId)
  )
    return run
  if (
    (choosesSocialSubject(move.kind) || move.kind === 'question') &&
    (!move.suspectId ||
      !active.has(move.suspectId) ||
      move.suspectId === move.actorId ||
      move.suspectId === move.recipientId)
  )
    return run
  if (
    move.kind === 'vote-plan' &&
    !eligibleBanishmentTargets(run, move.recipientId).includes(move.suspectId ?? '')
  )
    return run

  const { actorId, recipientId, kind, suspectId } = move
  const { social, day } = run
  const cost = socialMoveCost(kind, run.options.realityMode)
  if (missingSocialResource(socialWalletFor(run, actorId), cost)) return run
  if (
    discussedToday(social, move, day) ||
    (kind === 'mend-fences' && !hasSocialStrain(social, actorId, recipientId)) ||
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
  if (choosesSocialSubject(kind) || kind === 'question') {
    entry.suspectId = suspectId
  }
  if (kind === 'vote-plan' || kind === 'alliance') {
    entry.accepted = rapport(social, actorId, recipientId) >= 0.12
  }
  const reaction = responseToMove(run, move)
  if (reaction) entry.reaction = reaction

  return {
    ...run,
    revision: run.revision + 1,
    social: [...social, entry],
    socialWallets: walletAfterSocialMove(run, entry, cost),
  }
}
