import { getSocialPersonality } from '../social/socialPersonalityBank.ts'
import { seededPick } from '../store/rng.ts'
import {
  castleRoleFor,
  CHANGE_OF_HEART_CAST,
  eligibleCastleRole,
  isConcealedSecretBetrayer,
  recordCastleRoleUse,
  replaceCastleRole,
  SECRET_BETRAYER_CAST,
} from './castleRoles.ts'
import { hasPaidNightShield } from './economy.ts'
import { rapport } from './perception.ts'
import { shieldRoll } from './nightShields.ts'
import { eligibleBanishmentTargets, isCurrentCommand } from './run.ts'
import type { CommandToken, Run } from './run.ts'
import { settleRun } from './settlement.ts'
import { chooseTarget, resolutionPerspective } from './strategy.ts'

type DayPower = 'medium' | 'diva' | 'change-of-heart'

export function dayCastleRole(
  run: Run,
  actorId: string
): { roleId: DayPower; targets: string[] } | undefined {
  const { roleId } = castleRoleFor(run, actorId) ?? {}
  if (!roleId || run.presentation?.length || !eligibleCastleRole(run, actorId, roleId)) return
  if (roleId === 'medium' && run.phase === 'dawn') {
    const targets = run.seats.filter(({ exit }) => exit?.cause === 'night' && exit.day < run.day)
    if (targets.length) return { roleId, targets: targets.map(({ id }) => id) }
  }
  if (
    roleId === 'change-of-heart' &&
    run.phase === 'dawn' &&
    run.seats.filter(({ exit }) => !exit).length <= CHANGE_OF_HEART_CAST
  )
    return { roleId, targets: [] }
  if (roleId === 'diva' && run.phase === 'social')
    return {
      roleId,
      targets: run.seats.filter(({ id, exit }) => !exit && id !== actorId).map(({ id }) => id),
    }
}

function applyDayRole(run: Run, actorId: string, roleId: DayPower, targetId?: string): Run {
  const card = castleRoleFor(run, actorId)
  const prompt = dayCastleRole(run, actorId)
  if (!card || prompt?.roleId !== roleId) return run
  const { day } = run
  if (roleId === 'change-of-heart') {
    const turned = replaceCastleRole(run, { ...card, status: 'retired', used: { roleId, day } })
    return {
      ...turned,
      private: { ...turned.private, betrayers: [...turned.private.betrayers, actorId] },
    }
  }
  if (!targetId || !prompt.targets.includes(targetId)) return run
  if (roleId === 'medium') {
    const rememberedVote =
      [...(run.investigation?.votes ?? [])]
        .reverse()
        .flatMap(({ ballots }) =>
          ballots.filter(({ voterId }) => voterId === targetId).map(({ targetId: vote }) => vote)
        )[0] ??
      run.lastTable?.revealedBallots?.find(({ voterId }) => voterId === targetId)?.targetId
    const used = recordCastleRoleUse(run, card, { roleId, day, targetId, rememberedVote })
    return {
      ...used,
      seats: used.seats.map((seat) => (seat.id === targetId ? { ...seat, exit: undefined } : seat)),
    }
  }
  const shield = run.private.nightShieldIds.includes(targetId)
  const votedFor = run.lastTable?.revealedBallots?.find(
    ({ voterId }) => voterId === targetId
  )?.targetId
  return recordCastleRoleUse(run, card, {
    roleId,
    day,
    targetId,
    fact: shield ? 'shield' : votedFor ? 'ballot' : 'quiet',
    ...(!shield && votedFor && { subjectId: votedFor }),
  })
}

export function resolveDayCastleRole(
  run: Run,
  token: CommandToken,
  roleId: DayPower,
  targetId?: string
): Run {
  if (!isCurrentCommand(run, token)) return run
  const next = applyDayRole(run, run.humanId, roleId, targetId)
  return next === run ? run : { ...next, revision: run.revision + 1 }
}

export function prepareDayCastleRoles(run: Run): Run {
  let next = run
  for (const { guestId } of run.private.castleRoles ?? []) {
    if (guestId === run.humanId) continue
    const prompt = dayCastleRole(next, guestId)
    if (!prompt) continue
    const risk = getSocialPersonality(guestId).riskTolerance
    if (prompt.roleId === 'change-of-heart') {
      if (shieldRoll(next, guestId, 20449) < 0.35 + risk * 0.5)
        next = applyDayRole(next, guestId, prompt.roleId)
    } else if (prompt.roleId === 'diva') {
      next = applyDayRole(
        next,
        guestId,
        prompt.roleId,
        chooseTarget(resolutionPerspective(next, guestId, prompt.targets), 'case')
      )
    } else {
      const target = [...prompt.targets].sort(
        (a, b) => rapport(next.social, guestId, b) - rapport(next.social, guestId, a)
      )[0]
      if (
        target &&
        (rapport(next.social, guestId, target) >= 0.15 ||
          next.seats.filter(({ exit }) => !exit).length <= 12)
      )
        next = applyDayRole(next, guestId, prompt.roleId, target)
    }
  }
  return next
}

export function unsealSecretBetrayer(run: Run): Run {
  const secretId = run.private.hiddenBetrayerIds?.find((id) => isConcealedSecretBetrayer(run, id))
  const card = secretId && castleRoleFor(run, secretId)
  if (
    !card ||
    run.seats.filter(({ exit }) => !exit).length > SECRET_BETRAYER_CAST ||
    !run.seats.some(({ id, exit }) => id === secretId && !exit)
  )
    return run
  const used = recordCastleRoleUse(run, card, { roleId: 'secret-betrayer', day: run.day })
  return {
    ...used,
    private: {
      ...used.private,
      hiddenBetrayerIds: used.private.hiddenBetrayerIds?.filter((id) => id !== secretId),
    },
  }
}

export function afterCastleDeparture(before: Run, after: Run, guestId: string): Run {
  const card = castleRoleFor(before, guestId)
  if (
    !card ||
    (card.roleId !== 'last-will' && card.roleId !== 'kamikaze') ||
    !eligibleCastleRole(before, guestId, card.roleId)
  )
    return after
  const protectedIds = after.seats
    .filter(
      ({ id, exit }) =>
        !exit &&
        (id === before.immunityId ||
          before.private.nightShieldIds.includes(id) ||
          hasPaidNightShield(before, id) ||
          before.private.castleRoles?.some(
            ({ used }) =>
              used?.roleId === 'doctor' && used.day === before.day && used.targetId === id
          ))
    )
    .map(({ id }) => id)
  const queued: Run = {
    ...after,
    private: { ...after.private, departurePower: { roleId: card.roleId, guestId, protectedIds } },
  }
  if (guestId === before.humanId) return queued
  const targets = after.seats.filter(({ exit }) => !exit).map(({ id }) => id)
  const target = chooseTarget(resolutionPerspective(after, guestId, targets), 'case')
  return applyDeparturePower(queued, target)
}

function applyDeparturePower(run: Run, targetId?: string): Run {
  const pending = run.private.departurePower
  if (!pending) return run
  const card = castleRoleFor(run, pending.guestId)
  if (!card || (targetId && !run.seats.some(({ id, exit }) => id === targetId && !exit))) return run
  const next: Run = { ...run, private: { ...run.private, departurePower: undefined } }
  if (!targetId) return next
  if (pending.roleId === 'last-will') {
    const targetRole = castleRoleFor(run, targetId)
    return recordCastleRoleUse(next, card, {
      roleId: 'last-will',
      day: run.day,
      targetId,
      allegiance: run.private.betrayers.includes(targetId) ? 'betrayer' : 'loyal',
      ...(targetRole && targetRole.status !== 'retired' && { revealedRole: targetRole.roleId }),
    })
  }
  const blocked = pending.protectedIds.includes(targetId)
  const used = recordCastleRoleUse(next, card, {
    roleId: 'kamikaze',
    day: run.day,
    targetId,
    blocked,
  })
  if (blocked) return used
  const day = run.phase === 'dawn' ? run.day - 1 : run.day
  const seats = used.seats.map((seat) =>
    seat.id === targetId ? { ...seat, exit: { day, cause: 'night' as const } } : seat
  )
  const resolved: Run = { ...used, seats }
  return seats.some(({ id, exit }) => !exit && run.private.betrayers.includes(id))
    ? afterCastleDeparture(run, resolved, targetId)
    : settleRun(resolved, 'last-betrayer')
}

export function resolveDeparturePower(run: Run, token: CommandToken, targetId?: string): Run {
  if (
    !isCurrentCommand(run, token) ||
    run.presentation?.length ||
    run.private.departurePower?.guestId !== run.humanId
  )
    return run
  const next = applyDeparturePower(run, targetId)
  return next === run ? run : { ...next, revision: run.revision + 1 }
}

export function politicianOrder(run: Run, voterId: string) {
  if (run.phase !== 'round-table' || run.runoffIds || run.tableCount) return
  const order = run.private.castleRoles?.find(({ roleId }) => roleId === 'politician')?.used
  if (
    order?.roleId === 'politician' &&
    order.day === run.day &&
    order.voterId === voterId &&
    eligibleBanishmentTargets(run, voterId).includes(order.targetId)
  )
    return order
}

export function resolvePolitician(
  run: Run,
  token: CommandToken,
  voterId: string,
  targetId: string
): Run {
  if (!isCurrentCommand(run, token) || !roleTableOpen(run)) return run
  const card = castleRoleFor(run, run.humanId)
  if (
    !card ||
    !eligibleCastleRole(run, run.humanId, 'politician') ||
    voterId === run.humanId ||
    !run.seats.some(({ id, exit }) => id === voterId && !exit) ||
    !eligibleBanishmentTargets(run, voterId).includes(targetId)
  )
    return run
  return recordCastleRoleUse({ ...run, revision: run.revision + 1 }, card, {
    roleId: 'politician',
    day: run.day,
    voterId,
    targetId,
  })
}

export function preparePolitician(run: Run): Run {
  if (!roleTableOpen(run)) return run
  const card = run.private.castleRoles?.find(({ roleId }) => roleId === 'politician')
  if (
    !card ||
    card.guestId === run.humanId ||
    !eligibleCastleRole(run, card.guestId, 'politician') ||
    (run.day < 4 && shieldRoll(run, card.guestId, 11929) > 0.22)
  )
    return run
  const targets = eligibleBanishmentTargets(run, card.guestId)
  const targetId = chooseTarget(resolutionPerspective(run, card.guestId, targets), 'table')
  if (!targetId) return run
  const candidates = run.seats.filter(
    ({ id, exit }) =>
      !exit && id !== card.guestId && eligibleBanishmentTargets(run, id).includes(targetId)
  )
  if (!candidates.length) return run
  const voter = seededPick(() => shieldRoll(run, card.guestId, 4019), candidates)
  return recordCastleRoleUse(run, card, {
    roleId: 'politician',
    day: run.day,
    voterId: voter.id,
    targetId,
  })
}

export function roleTableOpen(run: Run): boolean {
  return (
    run.phase === 'round-table' && !run.tableCount && !run.runoffIds && (run.tableRound ?? 1) === 1
  )
}
