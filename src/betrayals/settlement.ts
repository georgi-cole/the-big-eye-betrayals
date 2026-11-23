import { getSocialPersonality } from '../social/socialPersonalityBank.ts'
import { mulberry32, seededPickN } from '../store/rng.ts'
import { hashId, isCurrentCommand } from './run.ts'
import { getSocialView, relationship } from './perception.ts'
import type { CommandToken, Role, Run } from './run.ts'
import { resolutionPerspective, strongestCase } from './strategy.ts'
import { FINAL_SURVIVOR_COUNT } from './seasonPhases.ts'

type Reason = NonNullable<Run['result']>['reason']
type EndVote = { voterId: string; choice: 'end' | 'banish' }

export function intendsToEnd(run: Run, voterId: string): boolean {
  const roll = mulberry32(run.publicSeed ^ hashId(voterId) ^ (run.day * 97))()
  const tally = run.lastTable?.tally ?? {}
  const danger = Math.min(1, (tally[voterId] ?? 0) / 4)
  if (run.private.betrayers.includes(voterId)) return roll >= 0.1 - danger * 0.08
  const revealed = run.seats.filter(({ exit }) => exit?.revealedRole === 'betrayer').length
  const contenders = run.seats.filter(({ id, exit }) => id !== voterId && !exit)
  const rivalIds = contenders.map(({ id }) => id)
  const perspective = resolutionPerspective(run, voterId, rivalIds)
  const uncertainty = strongestCase(perspective)
  const conversations = getSocialView(run, voterId)
  const personalTrust =
    contenders.reduce((sum, { id }) => sum + relationship(conversations, voterId, id).bond, 0) /
    Math.max(1, contenders.length)
  const riskTolerance = getSocialPersonality(voterId).riskTolerance
  const privateCase = conversations.some(
    (entry) =>
      entry.recipientId === voterId &&
      entry.day >= run.day - 1 &&
      rivalIds.includes(entry.suspectId ?? '') &&
      (entry.kind === 'question' ||
        (entry.kind === 'share-suspicion' && entry.reaction === 'landed'))
  )
  const rivalPressure = Math.max(0, ...contenders.map(({ id }) => tally[id] ?? 0))
  const confidence =
    0.12 +
    revealed * 0.16 +
    danger * 0.18 +
    personalTrust * 0.19 +
    (riskTolerance - 0.5) * 0.13 -
    rivalPressure * 0.045 -
    uncertainty * 0.5 -
    (privateCase ? 0.09 : 0)
  return roll < Math.max(0.03, Math.min(0.92, confidence))
}

export function settleRun(run: Run, reason: Reason): Run {
  if (run.result) return run
  const active = run.seats.filter(({ exit }) => !exit).map(({ id }) => id)
  const betrayers = active.filter((id) => run.private.betrayers.includes(id))
  const winningRole: Role = betrayers.length ? 'betrayer' : 'loyal'
  const ids = betrayers.length ? betrayers : active
  const sequence = seededPickN(mulberry32(run.publicSeed ^ 50827), ids, ids.length)
  const share = Math.floor(run.pot / ids.length)
  const remainder = run.pot % ids.length
  const payouts = Object.fromEntries(sequence.map((id, i) => [id, share + Number(i < remainder)]))
  return {
    ...run,
    phase: 'settled',
    immunityId: undefined,
    private: { ...run.private, nightShieldIds: [], nightShieldAwardIds: undefined },
    result: { reason, winningRole, payouts },
  }
}

export function resolveEndVote(run: Run, token: CommandToken, votes: readonly EndVote[]): Run {
  if (run.phase !== 'end-vote' || !isCurrentCommand(run, token) || run.result) return run
  const voting = new Set(run.seats.filter(({ exit }) => !exit).map(({ id }) => id))
  if (voting.size <= FINAL_SURVIVOR_COUNT || votes.length !== voting.size) return run
  if (
    votes.some(
      ({ voterId, choice }) => !voting.delete(voterId) || (choice !== 'end' && choice !== 'banish')
    )
  )
    return run
  const next = { ...run, revision: run.revision + 1 }
  if (votes.every(({ choice }) => choice === 'end')) return settleRun(next, 'unanimous')
  return { ...next, phase: 'final-banishment' }
}
