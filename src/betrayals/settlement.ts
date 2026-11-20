import { mulberry32, seededPickN } from '../store/rng.ts'
import { isCurrentCommand } from './run.ts'
import type { CommandToken, Role, Run } from './run.ts'

type Reason = NonNullable<Run['result']>['reason']
type EndVote = { voterId: string; choice: 'end' | 'banish' }

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
    private: { ...run.private, nightShieldIds: [] },
    result: { reason, winningRole, payouts },
  }
}

export function resolveEndVote(run: Run, token: CommandToken, votes: readonly EndVote[]): Run {
  if (run.phase !== 'end-vote' || !isCurrentCommand(run, token) || run.result) return run
  const voting = new Set(run.seats.filter(({ exit }) => !exit).map(({ id }) => id))
  if (voting.size < 3 || votes.length !== voting.size) return run
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
