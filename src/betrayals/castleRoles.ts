import { seededPick } from '../store/rng.ts'
import type { Role, Run } from './run.ts'
import { FINALE_CAST_SIZE } from './seasonPhases.ts'

type CastleRoleDetails = { title: string; description: string; faction: Role }

export const MAYOR_MAX_USES = 2
export const INFLUENCE_ROLE_MAX_USES = 2
export const MAYOR_LAST_DAY = 10
export const COLUMBUS_GROUP_SIZE = 5
export const ROLE_IMPACT_MIN_CAST = 8
export const CLAIRVOYANT_MAX_USES = 3
export const SECRET_BETRAYER_CAST = 17
export const CHANGE_OF_HEART_CAST = 13
export const DRAMA_ROLE_ODDS = { special: 85, betrayer: 10, loyal: 5 } as const

export const CASTLE_ROLE_CATALOG = {
  'secret-betrayer': {
    title: 'Secret Betrayer',
    description:
      'While hidden, choose the murder target from a sealed shortlist. Join the Conclave when seventeen guests remain.',
    faction: 'betrayer',
  },
  doctor: {
    title: 'Doctor',
    description: 'Protect one guest per night. You can protect yourself once per season.',
    faction: 'loyal',
  },
  medium: {
    title: 'Medium',
    description: 'At dawn, speak to one murdered guest and bring them back once per season.',
    faction: 'loyal',
  },
  extrasense: {
    title: 'Extrasense',
    description: 'Check whether one other guest holds a Castle Role each night.',
    faction: 'loyal',
  },
  mayor: {
    title: 'Mayor',
    description: `Double your first ballot at up to ${MAYOR_MAX_USES} Round Tables through Day ${MAYOR_LAST_DAY}.`,
    faction: 'loyal',
  },
  'last-will': {
    title: 'Last Will',
    description: 'Upon leaving, reveal the current allegiance and role of one remaining guest.',
    faction: 'loyal',
  },
  cursed: {
    title: 'Cursed',
    description:
      'Join the Betrayers at dawn if the Conclave deliberately targets you and the letter would have killed you.',
    faction: 'loyal',
  },
  'alpha-betrayer': {
    title: 'Alpha Betrayer',
    description: 'Double your opening nomination at up to two separate Conclaves.',
    faction: 'betrayer',
  },
  'bad-witch': {
    title: 'Bad Witch',
    description:
      'As a Betrayer, put the guests to sleep once and cancel that Round Table before voting.',
    faction: 'betrayer',
  },
  'good-witch': {
    title: 'Good Witch',
    description:
      'Once per season, put the Betrayers to sleep before the Conclave and prevent a murder.',
    faction: 'loyal',
  },
  illusionist: {
    title: 'Illusionist',
    description:
      'Once per season, redirect the letter to a different guest at random. Immunity and shields still protect them.',
    faction: 'loyal',
  },
  kamikaze: {
    title: 'Kamikaze',
    description: 'Upon leaving, try to take one remaining guest with you.',
    faction: 'loyal',
  },
  columbus: {
    title: 'Columbus',
    description:
      'Once per season, check five other guests and learn whether at least one is a Betrayer. You don’t learn which guest or how many.',
    faction: 'loyal',
  },
  introvert: {
    title: 'Introvert',
    description:
      'Social is closed every even-numbered day until the Final Five. You can still reply in the Inbox and vote.',
    faction: 'loyal',
  },
  fatigued: {
    title: 'The Fatigued',
    description:
      'Choose between the Immunity Trial and the Shield Trial each day. You can compete in one of them.',
    faction: 'loyal',
  },
  diva: {
    title: 'The Diva',
    description:
      'Get one private, truthful answer per day about a guest’s own shield or most recent vote.',
    faction: 'loyal',
  },
  politician: {
    title: 'The Politician',
    description: 'Direct one other guest’s first ballot at up to two separate Round Tables.',
    faction: 'loyal',
  },
  'dark-angel': {
    title: 'The Dark Angel',
    description: 'Block one secretly bound Betrayer from targeting you at one Conclave.',
    faction: 'loyal',
  },
  'change-of-heart': {
    title: 'Change of Heart',
    description: 'Receive a private offer to turn after the cast reaches thirteen guests.',
    faction: 'loyal',
  },
  clairvoyant: {
    title: 'Clairvoyant',
    description:
      'Privately see who won Night Shields on up to three Shield Trial results screens before the Final Five.',
    faction: 'loyal',
  },
} as const satisfies Record<string, CastleRoleDetails>

export type CastleRoleId = keyof typeof CASTLE_ROLE_CATALOG
export const CASTLE_ROLE_PLAYTEST = Object.keys(CASTLE_ROLE_CATALOG) as CastleRoleId[]
export type CastleRolePreview = CastleRoleId | 'loyal' | 'betrayer'
export type NightPower = 'good-witch' | 'illusionist'

export type CastleRoleUse =
  | { roleId: 'doctor'; day: number; targetId: string }
  | { roleId: 'extrasense'; day: number; targetId: string; hasRole: boolean }
  | { roleId: 'columbus'; day: number; guestIds: readonly string[]; hasBetrayer: boolean }
  | { roleId: 'clairvoyant'; day: number; shieldIds: readonly string[] }
  | { roleId: 'mayor' | 'cursed' | NightPower; day: number }
  | { roleId: 'secret-betrayer' | 'alpha-betrayer' | 'bad-witch' | 'change-of-heart'; day: number }
  | { roleId: 'fatigued'; day: number; challenge: 'immunity' | 'safety' }
  | { roleId: 'medium'; day: number; targetId: string; rememberedVote?: string }
  | { roleId: 'dark-angel'; day: number; targetId: string }
  | { roleId: 'politician'; day: number; voterId: string; targetId: string }
  | {
      roleId: 'diva'
      day: number
      targetId: string
      fact: 'shield' | 'ballot' | 'quiet'
      subjectId?: string
    }
  | {
      roleId: 'last-will'
      day: number
      targetId: string
      allegiance: Role
      revealedRole?: CastleRoleId
    }
  | { roleId: 'kamikaze'; day: number; targetId: string; blocked: boolean }

type CastleRoleChoice =
  | { roleId: 'doctor' | 'extrasense'; targetId: string }
  | { roleId: 'columbus'; guestIds: readonly string[] }
  | { roleId: 'mayor' | NightPower }

export type CastleRoleCard = {
  roleId: CastleRoleId
  guestId: string
  status: 'ready' | 'used' | 'retired'
  used?: CastleRoleUse
  passedDay?: number
  selfWardUsed?: true
  mayorUses?: number
  influenceUses?: number
  clairvoyantUses?: number
  boundBetrayerId?: string
}

const CASTLE_ROLE_COUNT = 3
const incompatible: readonly (readonly [CastleRoleId, CastleRoleId])[] = [
  ['cursed', 'change-of-heart'],
  ['mayor', 'politician'],
  ['good-witch', 'bad-witch'],
  ['last-will', 'columbus'],
  ['introvert', 'fatigued'],
]
const visibleEffects: ReadonlySet<CastleRoleId> = new Set([
  'medium',
  'mayor',
  'last-will',
  'cursed',
  'bad-witch',
  'good-witch',
  'illusionist',
  'kamikaze',
  'change-of-heart',
])
const lateEffects: ReadonlySet<CastleRoleId> = new Set([
  'extrasense',
  'columbus',
  'introvert',
  'fatigued',
  'diva',
  'clairvoyant',
])

export function isCastleRoleId(roleId: unknown): roleId is CastleRoleId {
  return typeof roleId === 'string' && Object.hasOwn(CASTLE_ROLE_CATALOG, roleId)
}

export function compatibleCastleRoleTrio(roles: readonly CastleRoleId[]): boolean {
  return (
    roles.length === CASTLE_ROLE_COUNT &&
    new Set(roles).size === CASTLE_ROLE_COUNT &&
    roles.filter((roleId) => CASTLE_ROLE_CATALOG[roleId].faction === 'betrayer').length <= 1 &&
    roles.some((roleId) => visibleEffects.has(roleId)) &&
    incompatible.every(([left, right]) => !roles.includes(left) || !roles.includes(right))
  )
}

export function castleRoleTrios(
  pool: readonly CastleRoleId[] = Object.keys(CASTLE_ROLE_CATALOG) as CastleRoleId[]
): CastleRoleId[][] {
  return pool.flatMap((first, index) =>
    pool.slice(index + 1).flatMap((second, offset) =>
      pool
        .slice(index + offset + 2)
        .map((third) => [first, second, third])
        .filter(compatibleCastleRoleTrio)
    )
  )
}

export function dealCastleRoles(
  random: () => number,
  guestIds: readonly string[],
  betrayers: readonly string[],
  player: { guestId: string; roleId?: CastleRoleId }
): CastleRoleCard[] {
  const trios = castleRoleTrios(CASTLE_ROLE_PLAYTEST)
  const playerRole = player.roleId
  const roles = seededPick(
    random,
    playerRole ? trios.filter((trio) => trio.includes(playerRole)) : trios
  )
  const available = guestIds.filter((id) => id !== player.guestId)
  return roles.map((roleId) => {
    const faction = CASTLE_ROLE_CATALOG[roleId].faction
    const eligible = available.filter((id) => betrayers.includes(id) === (faction === 'betrayer'))
    const guestId = roleId === playerRole ? player.guestId : seededPick(random, eligible)
    const index = available.indexOf(guestId)
    if (index >= 0) available.splice(index, 1)
    return {
      roleId,
      guestId,
      status: 'ready',
      ...(roleId === 'dark-angel' && { boundBetrayerId: seededPick(random, betrayers) }),
    }
  })
}

export function castleRoleFor(run: Run, actorId: string | null): CastleRoleCard | undefined {
  return run.private.castleRoles?.find(({ guestId }) => guestId === actorId)
}

export function isConcealedSecretBetrayer(run: Run, actorId: string): boolean {
  return (
    castleRoleFor(run, actorId)?.roleId === 'secret-betrayer' &&
    run.private.hiddenBetrayerIds?.includes(actorId) === true
  )
}

export function mayorUsesRemaining(card: CastleRoleCard): number {
  // Older saves recorded the only available Mayor use in `used`.
  return MAYOR_MAX_USES - (card.mayorUses ?? (card.used?.roleId === 'mayor' ? 1 : 0))
}

export function clairvoyantUsesRemaining(card: CastleRoleCard): number {
  return (
    CLAIRVOYANT_MAX_USES - (card.clairvoyantUses ?? (card.used?.roleId === 'clairvoyant' ? 1 : 0))
  )
}

export function influenceUsesRemaining(card: CastleRoleCard): number {
  return (
    INFLUENCE_ROLE_MAX_USES - (card.influenceUses ?? (card.used?.roleId === card.roleId ? 1 : 0))
  )
}

function hasRoleUseAvailable(card: CastleRoleCard, day: number): boolean {
  if (card.status === 'retired' || card.used?.day === day) return false
  if (card.roleId === 'mayor') return day <= MAYOR_LAST_DAY && mayorUsesRemaining(card) > 0
  if (card.roleId === 'clairvoyant') return clairvoyantUsesRemaining(card) > 0
  if (card.roleId === 'alpha-betrayer' || card.roleId === 'politician')
    return influenceUsesRemaining(card) > 0
  return (
    card.status === 'ready' ||
    card.roleId === 'doctor' ||
    card.roleId === 'extrasense' ||
    card.roleId === 'diva' ||
    card.roleId === 'fatigued'
  )
}

export function eligibleCastleRole(run: Run, actorId: string, roleId: CastleRoleId): boolean {
  const card = castleRoleFor(run, actorId)
  return (
    run.options.castleRoles === true &&
    card?.roleId === roleId &&
    hasRoleUseAvailable(card, run.day) &&
    run.private.betrayers.includes(actorId) ===
      (CASTLE_ROLE_CATALOG[roleId].faction === 'betrayer') &&
    run.seats.some(({ id, exit }) => id === actorId && !exit) &&
    run.phase !== 'final-challenge' &&
    run.phase !== 'final-banishment' &&
    run.phase !== 'end-vote' &&
    run.phase !== 'settled' &&
    run.seats.filter(({ exit }) => !exit).length >=
      (lateEffects.has(roleId) ? FINALE_CAST_SIZE + 1 : ROLE_IMPACT_MIN_CAST)
  )
}

export function doctorSelfWardUsed(card: CastleRoleCard): boolean {
  return Boolean(
    card.selfWardUsed || (card.used?.roleId === 'doctor' && card.used.targetId === card.guestId)
  )
}

export function replaceCastleRole(run: Run, card: CastleRoleCard): Run {
  return {
    ...run,
    private: {
      ...run.private,
      castleRoles: run.private.castleRoles?.map((current) =>
        current.guestId === card.guestId ? card : current
      ),
    },
  }
}

export function recordCastleRoleUse(run: Run, card: CastleRoleCard, used: CastleRoleUse): Run {
  const influence = used.roleId === 'alpha-betrayer' || used.roleId === 'politician'
  return replaceCastleRole(run, {
    ...card,
    status: 'used',
    used,
    ...(influence && { influenceUses: INFLUENCE_ROLE_MAX_USES - influenceUsesRemaining(card) + 1 }),
  })
}

export function recordClairvoyantResults(
  run: Run,
  shieldIds: readonly string[],
  publicResults: boolean
): Run {
  if (publicResults || shieldIds.length === 0) return run
  const card = run.private.castleRoles?.find(({ roleId }) => roleId === 'clairvoyant')
  if (!card || !eligibleCastleRole(run, card.guestId, 'clairvoyant')) return run
  return recordCastleRoleUse(
    run,
    {
      ...card,
      clairvoyantUses: CLAIRVOYANT_MAX_USES - clairvoyantUsesRemaining(card) + 1,
    },
    { roleId: 'clairvoyant', day: run.day, shieldIds: [...shieldIds] }
  )
}

export function introvertDay(run: Run, id: string): boolean {
  return run.day % 2 === 0 && eligibleCastleRole(run, id, 'introvert')
}

export function retireCastleRole(run: Run, actorId: string): Run {
  const card = castleRoleFor(run, actorId)
  if (!card || card.status === 'retired' || CASTLE_ROLE_CATALOG[card.roleId].faction !== 'loyal') {
    return run
  }
  return replaceCastleRole(run, { ...card, status: 'retired' })
}

export function turnCursedGuest(run: Run, actorId: string): Run {
  const card = castleRoleFor(run, actorId)
  if (
    run.phase !== 'night-resolved' ||
    run.private.pendingNight?.castleEffect?.kind !== 'cursed' ||
    run.private.pendingNight.targetId !== actorId ||
    card?.roleId !== 'cursed' ||
    !eligibleCastleRole(run, actorId, 'cursed')
  )
    return run
  return replaceCastleRole(
    { ...run, private: { ...run.private, betrayers: [...run.private.betrayers, actorId] } },
    { ...card, status: 'retired', used: { roleId: 'cursed', day: run.day } }
  )
}

function canChooseCastleRole(run: Run, card: CastleRoleCard): boolean {
  if (card.passedDay === run.day || !eligibleCastleRole(run, card.guestId, card.roleId)) {
    return false
  }
  if (card.roleId === 'mayor') {
    return (
      run.phase === 'round-table' &&
      !run.tableCount &&
      !run.runoffIds &&
      (run.tableRound ?? 1) === 1
    )
  }
  return (
    (card.roleId === 'extrasense' ||
      card.roleId === 'doctor' ||
      card.roleId === 'good-witch' ||
      card.roleId === 'illusionist' ||
      card.roleId === 'columbus') &&
    run.phase === 'night' &&
    (card.roleId === 'illusionist' || !run.private.conclaveVote) &&
    !run.private.humanRecruitmentOffered
  )
}

export function spendCastleRole(run: Run, actorId: string, choice: CastleRoleChoice): Run {
  const card = castleRoleFor(run, actorId)
  if (!card || card.roleId !== choice.roleId || !canChooseCastleRole(run, card)) return run

  const { day } = run
  let used: CastleRoleUse
  if ('targetId' in choice) {
    const { roleId, targetId } = choice
    if (!run.seats.some(({ id, exit }) => id === targetId && !exit)) return run
    if (roleId === 'extrasense' && actorId === targetId) return run
    if (roleId === 'doctor' && actorId === targetId && doctorSelfWardUsed(card)) return run
    const targetCard = castleRoleFor(run, targetId)
    used =
      roleId === 'doctor'
        ? { roleId, day, targetId }
        : { roleId, day, targetId, hasRole: Boolean(targetCard && targetCard.status !== 'retired') }
  } else if (choice.roleId === 'columbus') {
    const { guestIds } = choice
    if (
      guestIds.length !== COLUMBUS_GROUP_SIZE ||
      new Set(guestIds).size !== COLUMBUS_GROUP_SIZE ||
      guestIds.some(
        (id) => id === actorId || !run.seats.some((seat) => seat.id === id && !seat.exit)
      )
    )
      return run
    used = {
      roleId: choice.roleId,
      day,
      guestIds: [...guestIds],
      hasBetrayer: guestIds.some((id) => run.private.betrayers.includes(id)),
    }
  } else used = { roleId: choice.roleId, day }

  return replaceCastleRole(
    { ...run, revision: run.revision + 1 },
    {
      ...card,
      status: 'used',
      used,
      ...(used.roleId === 'mayor'
        ? { mayorUses: MAYOR_MAX_USES - mayorUsesRemaining(card) + 1 }
        : {}),
      ...(used.roleId === 'doctor' && (used.targetId === actorId || doctorSelfWardUsed(card))
        ? { selfWardUsed: true }
        : {}),
    }
  )
}

export function passCastleRole(run: Run, actorId: string): Run {
  const card = castleRoleFor(run, actorId)
  if (!card || !canChooseCastleRole(run, card)) return run
  return replaceCastleRole({ ...run, revision: run.revision + 1 }, { ...card, passedDay: run.day })
}
