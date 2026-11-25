import { mulberry32, seededPick } from '../store/rng.ts'
import { isCurrentCommand, publicShieldPending } from './run.ts'
import type { CommandToken, Run } from './run.ts'
import { prepareVotePlans } from './votePlans.ts'

export function awardPublicShield(
  run: Run,
  token: CommandToken,
  approval: Readonly<Record<string, number>>
): Run {
  if (!isCurrentCommand(run, token) || !publicShieldPending(run)) return run

  const yesterday = run.publicShield?.day === run.day - 1 ? run.publicShield.id : undefined
  const ratings = run.seats
    .filter(({ id, exit }) => !exit && id !== run.immunityId && id !== yesterday)
    .map(({ id }) => ({ id, rating: Number.isFinite(approval[id]) ? approval[id] : 50 }))
  const best = Math.max(-Infinity, ...ratings.map(({ rating }) => rating))
  const candidates = ratings
    .filter(({ rating }) => rating === best)
    .map(({ id }) => id)
    .sort()
  const random = mulberry32(run.publicSeed ^ Math.imul(run.day, 10853))

  const next = {
    ...run,
    revision: run.revision + 1,
    publicShieldDecisionDay: run.day,
    publicShield: candidates.length
      ? { day: run.day, id: seededPick(random, candidates) }
      : run.publicShield,
  }
  return next.phase === 'after-immunity' ? prepareVotePlans(next) : next
}
