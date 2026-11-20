import { mulberry32, seededPick } from '../store/rng.ts'
import { isCurrentCommand } from './run.ts'
import type { CommandToken, Run } from './run.ts'
import type { Ballot } from './table.ts'

export function nightTargets(run: Run, actorId: string): string[] {
  if (
    run.phase !== 'night' ||
    !run.private.betrayers.includes(actorId) ||
    !run.seats.some(({ id, exit }) => id === actorId && !exit)
  )
    return []
  return run.seats
    .filter(({ id, exit }) => !exit && id !== run.immunityId && !run.private.betrayers.includes(id))
    .map(({ id }) => id)
}

export function resolveNight(run: Run, token: CommandToken, choices: readonly Ballot[]): Run {
  if (run.phase !== 'night' || !isCurrentCommand(run, token)) return run
  const electorate = new Map(
    run.private.betrayers
      .map((id) => [id, nightTargets(run, id)] as const)
      .filter(([, targets]) => targets.length)
  )
  if (choices.length !== electorate.size) return run

  const tally = new Map<string, number>()
  for (const { voterId, targetId } of choices) {
    if (!electorate.get(voterId)?.includes(targetId)) return run
    electorate.delete(voterId)
    tally.set(targetId, (tally.get(targetId) ?? 0) + 1)
  }
  const top = Math.max(0, ...tally.values())
  const tied = [...tally.keys()].filter((id) => tally.get(id) === top).sort()
  const random = mulberry32(run.publicSeed ^ Math.imul(run.day, 1229))
  const targetId = tied.length > 0 ? seededPick(random, tied) : null
  return {
    ...run,
    revision: run.revision + 1,
    phase: 'night-resolved',
    private: {
      ...run.private,
      pendingNight: {
        targetId,
        blocked: Boolean(targetId && run.private.nightShieldIds.includes(targetId)),
      },
    },
  }
}

export function revealDawn(run: Run, token: CommandToken): Run {
  const night = run.private.pendingNight
  if (run.phase !== 'night-resolved' || !isCurrentCommand(run, token) || !night) return run
  const eliminatedId = night.blocked ? null : night.targetId
  const seats = run.seats.map((seat) =>
    seat.id === eliminatedId ? { ...seat, exit: { cause: 'night' as const, day: run.day } } : seat
  )
  const day = run.day + 1
  return {
    ...run,
    seats,
    day,
    lastDawn: { day, eliminatedId },
    revision: run.revision + 1,
    phase: seats.filter(({ exit }) => !exit).length === 5 ? 'final-challenge' : 'dawn',
    immunityId: undefined,
    private: { ...run.private, nightShieldIds: [], pendingNight: undefined },
  }
}
