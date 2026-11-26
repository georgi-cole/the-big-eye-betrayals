import { getSocialPersonality } from '../social/socialPersonalityBank.ts'
import { mulberry32 } from '../store/rng.ts'
import { CASTLE_ROLE_CATALOG, castleRoleFor, introvertDay } from './castleRoles.ts'
import { hasAlliance, rapport } from './perception.ts'
import { hashId, isCurrentCommand } from './run.ts'
import type { CommandToken, Run, SocialEntry } from './run.ts'

export function revealableCastleRole(run: Run) {
  if (
    !run.options.castleRoles ||
    introvertDay(run, run.humanId) ||
    run.result ||
    run.phase === 'role-reveal' ||
    run.phase === 'settled' ||
    run.presentation?.length ||
    run.tableCount ||
    run.runoffIds ||
    run.private.betrayers.includes(run.humanId) ||
    !run.seats.some(({ id, exit }) => id === run.humanId && !exit)
  )
    return
  const card = castleRoleFor(run, run.humanId)
  if (
    card &&
    card.roleId !== 'clairvoyant' &&
    card.roleId !== 'diva' &&
    card.status !== 'retired' &&
    CASTLE_ROLE_CATALOG[card.roleId].faction === 'loyal'
  )
    return card.roleId
}

export function revealCastleRole(
  run: Run,
  token: CommandToken,
  recipientId: string,
  hasDramaMode: boolean
): Run {
  if (!hasDramaMode || !isCurrentCommand(run, token)) return run
  const role = revealableCastleRole(run)
  if (
    !role ||
    recipientId === run.humanId ||
    !run.seats.some(({ id, exit }) => id === recipientId && !exit) ||
    run.social.some(
      (entry) =>
        entry.kind === 'reveal-castle-role' &&
        entry.actorId === run.humanId &&
        entry.recipientId === recipientId
    )
  )
    return run

  const disclosure: SocialEntry = {
    kind: 'reveal-castle-role',
    day: run.day,
    actorId: run.humanId,
    recipientId,
    disclosedRole: role,
  }
  const entries = [...run.social, disclosure]
  const traits = getSocialPersonality(recipientId)
  const trust = rapport(run.social, recipientId, run.humanId)
  const allied = hasAlliance(run.social, recipientId, run.humanId)
  const roll = mulberry32(
    run.publicSeed ^ hashId(recipientId + ':castle-role') ^ Math.imul(run.day, 941)
  )
  const leakChance = Math.min(
    0.9,
    Math.max(
      0.05,
      0.2 +
        traits.gossipPropensity * 0.65 -
        traits.loyalty * 0.25 -
        trust * 0.35 -
        (allied ? 0.15 : 0)
    )
  )
  if (roll() < leakChance) {
    const informed = new Set(
      entries
        .filter(({ kind }) => kind === 'reveal-castle-role' || kind === 'castle-role-rumor')
        .map(({ recipientId }) => recipientId)
    )
    const confidant = run.seats
      .filter(({ id, exit }) => id !== run.humanId && !exit && !informed.has(id))
      .map(({ id }) => ({
        id,
        trust:
          rapport(run.social, recipientId, id) +
          (hasAlliance(run.social, recipientId, id) ? 0.35 : 0) +
          roll() * 0.18,
      }))
      .sort((a, b) => b.trust - a.trust)[0]
    if (confidant) {
      entries.push({
        kind: 'castle-role-rumor',
        day: run.day,
        actorId: recipientId,
        recipientId: confidant.id,
        suspectId: run.humanId,
        disclosedRole: role,
      })
    }
  }
  return { ...run, revision: run.revision + 1, social: entries }
}
