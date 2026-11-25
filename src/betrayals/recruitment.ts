import { mulberry32 } from '../store/rng.ts'
import { pendingPaidNightShieldPurchase } from './economy.ts'
import { getSocialView, relationship } from './perception.ts'
import { hashId, isCurrentCommand } from './run.ts'
import type { CommandToken, Run } from './run.ts'
import { FINALE_CAST_SIZE } from './seasonPhases.ts'

export const RECRUITMENT_END_DAY = 5

export function requiredRecruiterId(run: Run) {
  if (run.phase !== 'night' || run.day >= RECRUITMENT_END_DAY) return
  const active = run.seats.filter(({ exit }) => !exit)
  if (active.length <= FINALE_CAST_SIZE) return
  const survivors = active.filter(({ id }) => run.private.betrayers.includes(id))
  if (survivors.length === 1) return survivors[0].id
}

function eligibleLoyals(run: Run) {
  return run.seats
    .filter(({ id, exit }) => !exit && id !== run.immunityId && !run.private.betrayers.includes(id))
    .map(({ id }) => id)
}

type RecruitmentView =
  | { kind: 'choose'; targetIds: string[] }
  | { kind: 'offer'; shielded: boolean }

export function recruitmentFor(run: Run, actorId: string | null): RecruitmentView | undefined {
  const recruiter = requiredRecruiterId(run)
  if (!actorId || !recruiter || actorId !== run.humanId) return
  const targets = eligibleLoyals(run)
  if (recruiter === actorId) return { kind: 'choose', targetIds: targets }
  if (run.private.humanRecruitmentOffered && targets.includes(actorId)) {
    return { kind: 'offer', shielded: run.private.nightShieldIds.includes(actorId) }
  }
}

function chooseRecruit(run: Run, recruiterId: string, targets: readonly string[], backup = false) {
  const conversations = getSocialView(run, recruiterId)
  const ballots = new Map(
    run.lastTable?.revealedBallots?.map(({ voterId, targetId }) => [voterId, targetId])
  )
  const recruiterVote = ballots.get(recruiterId)
  const weighted = targets.map((id) => {
    const { bond, reliability } = relationship(conversations, recruiterId, id)
    const vote = ballots.get(id)
    const alignment =
      vote === recruiterId ? -0.15 : recruiterVote && vote === recruiterVote ? 0.2 : 0
    // Public suspicion makes only a small difference, and every eligible guest can be drawn.
    const suspicion = Math.min(0.06, (run.lastTable?.tally[id] ?? 0) * 0.012)
    return { id, weight: 1 + bond * 0.9 + reliability * 0.6 + alignment - suspicion }
  })
  const seed =
    (run.private.recruitmentSeed ?? hashId(run.id)) ^
    hashId(recruiterId) ^
    Math.imul(run.day, 3943) ^
    (backup ? 15331 : 0)
  let roll = mulberry32(seed)() * weighted.reduce((sum, { weight }) => sum + weight, 0)
  for (const { id, weight } of weighted) {
    roll -= weight
    if (roll < 0) return id
  }
  return weighted.at(-1)?.id
}

function completeRecruitment(
  run: Run,
  recruiterId: string,
  recruitedId: string,
  declined = false
): Run {
  return {
    ...run,
    phase: 'night-resolved',
    revision: run.revision + 1,
    private: {
      ...run.private,
      betrayers: [...run.private.betrayers, recruitedId],
      hiddenBetrayerIds: run.private.hiddenBetrayerIds?.filter((id) => id !== recruiterId),
      conclaveVote: undefined,
      humanRecruitmentOffered: undefined,
      pendingNight: {
        targetId: declined ? run.humanId : null,
        blocked: declined && run.private.nightShieldIds.includes(run.humanId),
        recruitedId,
      },
    },
  }
}

export function resolveRecruitment(run: Run, token: CommandToken, humanTargetId?: string): Run {
  if (
    !isCurrentCommand(run, token) ||
    run.presentation?.length ||
    run.private.humanRecruitmentOffered ||
    pendingPaidNightShieldPurchase(run)
  )
    return run
  const recruiterId = requiredRecruiterId(run)
  if (!recruiterId) return run
  const targets = eligibleLoyals(run)
  const target =
    recruiterId === run.humanId ? humanTargetId : chooseRecruit(run, recruiterId, targets)
  if (!target || !targets.includes(target)) return run
  if (target === run.humanId) {
    return {
      ...run,
      revision: run.revision + 1,
      private: { ...run.private, humanRecruitmentOffered: true },
    }
  }
  return completeRecruitment(run, recruiterId, target)
}

export function answerRecruitment(run: Run, token: CommandToken, accept: boolean): Run {
  if (
    !isCurrentCommand(run, token) ||
    run.presentation?.length ||
    recruitmentFor(run, run.humanId)?.kind !== 'offer' ||
    pendingPaidNightShieldPurchase(run)
  )
    return run
  const recruiterId = requiredRecruiterId(run)
  if (!recruiterId) return run
  if (accept) return completeRecruitment(run, recruiterId, run.humanId)
  const backup = chooseRecruit(
    run,
    recruiterId,
    eligibleLoyals(run).filter((id) => id !== run.humanId),
    true
  )
  return backup ? completeRecruitment(run, recruiterId, backup, true) : run
}
