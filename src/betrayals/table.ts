import { mulberry32, seededPick } from '../store/rng.ts'
import { isCurrentCommand } from './run.ts'
import type { CommandToken, Run, TableReceipt } from './run.ts'
import { settleRun } from './settlement.ts'

export type Ballot = { voterId: string; targetId: string }

export function canVoteAtTable(run: Run, id: string): boolean {
  return (
    (run.phase === 'round-table' || run.phase === 'final-banishment') &&
    run.seats.some((seat) => seat.id === id && !seat.exit) &&
    !run.runoffIds?.includes(id)
  )
}

export function tableTargets(run: Run, voterId: string): string[] {
  if (!canVoteAtTable(run, voterId)) return []
  const shieldId = run.publicShield?.day === run.day ? run.publicShield.id : undefined
  return run.seats
    .filter(
      ({ id, exit }) =>
        !exit &&
        id !== voterId &&
        (run.phase === 'final-banishment' || (id !== run.immunityId && id !== shieldId)) &&
        (!run.runoffIds || run.runoffIds.includes(id))
    )
    .map(({ id }) => id)
}

export function resolveTable(run: Run, token: CommandToken, ballots: readonly Ballot[]): Run {
  if (
    !isCurrentCommand(run, token) ||
    (run.phase !== 'round-table' && run.phase !== 'final-banishment')
  )
    return run
  const eligible = new Map(
    run.seats.map(({ id }) => [id, tableTargets(run, id)] as const).filter(([, ids]) => ids.length)
  )
  if (eligible.size !== ballots.length) return run
  const tallied = new Map<string, number>()
  for (const { voterId, targetId } of ballots) {
    if (!eligible.get(voterId)?.includes(targetId)) return run
    eligible.delete(voterId)
    tallied.set(targetId, (tallied.get(targetId) ?? 0) + 1)
  }
  const topCount = Math.max(0, ...tallied.values())
  const tied =
    topCount > 0
      ? [...tallied.keys()].filter((id) => tallied.get(id) === topCount).sort()
      : (run.runoffIds ?? [])
  if (tied.length === 0) return run

  const revision = run.revision + 1
  if (tied.length > 1 && !run.runoffIds) {
    return { ...run, revision, runoffIds: tied }
  }

  const random = mulberry32(run.publicSeed ^ Math.imul(run.day, 547) ^ revision)
  const receipt: TableReceipt = {
    banishedId: seededPick(random, tied),
    blind: run.phase === 'final-banishment',
    tally: Object.fromEntries(tallied),
    tiedByDraw: tied.length > 1,
  }
  return {
    ...run,
    phase: 'table-reveal',
    revision,
    runoffIds: undefined,
    private: { ...run.private, pendingTable: receipt },
  }
}

export function revealTable(run: Run, token: CommandToken): Run {
  const outcome = run.private.pendingTable
  if (run.phase !== 'table-reveal' || !isCurrentCommand(run, token) || !outcome) return run
  const seats = run.seats.map((seat) => {
    if (seat.id !== outcome.banishedId) return seat
    const revealedRole = run.private.betrayers.includes(seat.id) ? 'betrayer' : 'loyal'
    return {
      ...seat,
      exit: {
        cause: 'banished' as const,
        day: run.day,
        revealedRole: outcome.blind ? undefined : (revealedRole as 'betrayer' | 'loyal'),
      },
    }
  })
  const active = seats.filter(({ exit }) => !exit)
  const lastBetrayer =
    !outcome.blind && !active.some(({ id }) => run.private.betrayers.includes(id))
  const phase = lastBetrayer
    ? 'settled'
    : outcome.blind
      ? 'end-vote'
      : active.length === 5
        ? 'final-challenge'
        : 'night'
  const revealed: Run = {
    ...run,
    phase,
    revision: run.revision + 1,
    seats,
    lastTable: outcome,
    immunityId: phase === 'night' ? run.immunityId : undefined,
    private: {
      ...run.private,
      pendingTable: undefined,
      nightShieldIds: phase === 'night' ? run.private.nightShieldIds : [],
    },
  }
  if (lastBetrayer) return settleRun(revealed, 'last-betrayer')
  if (outcome.blind && active.length === 2) return settleRun(revealed, 'final-two')
  return revealed
}
