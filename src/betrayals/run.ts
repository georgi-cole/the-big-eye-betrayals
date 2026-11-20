import { mulberry32, seededPickN } from '../store/rng.ts'

export const CAST_SIZE = 25
export const RULES_VERSION = 1
export const PHASES = [
  'role-reveal',
  'dawn',
  'social',
  'immunity',
  'safety',
  'round-table',
  'table-reveal',
  'night',
  'night-resolved',
  'final-challenge',
  'final-banishment',
  'end-vote',
  'settled',
] as const

export type Phase = (typeof PHASES)[number]
export type Role = 'loyal' | 'betrayer'
export type RealityPreset = 'off' | 'casual' | 'tv' | 'adult'
export type Contestant = {
  id: string
  name: string
  portrait?: string
}

export type Seat = Contestant & {
  exit?: { cause: 'banished' | 'night'; day: number; revealedRole?: Role }
}

export type RunOptions = { publicMode: boolean; realityMode: RealityPreset }
export type SocialEntry = {
  day: number
  actorId: string
  recipientId: string
  kind: 'rapport' | 'question' | 'vote-plan'
  suspectId?: string
  accepted?: boolean
}

export type TableReceipt = {
  banishedId: string
  blind: boolean
  tally: Record<string, number>
  tiedByDraw: boolean
}

export type Run = {
  edition: 'betrayals'
  version: typeof RULES_VERSION
  id: string
  revision: number
  phase: Phase
  day: number
  humanId: string
  options: RunOptions
  seats: Seat[]
  private: {
    betrayers: string[]
    nightShieldIds: string[]
    pendingTable?: TableReceipt
    pendingNight?: { targetId: string | null; blocked: boolean }
  }
  publicSeed: number
  pot: number
  social: SocialEntry[]
  immunityId?: string
  publicShield?: { id: string; day: number }
  publicShieldDecisionDay?: number
  runoffIds?: string[]
  lastTable?: TableReceipt
  lastDawn?: { day: number; eliminatedId: string | null }
  result?: {
    reason: 'last-betrayer' | 'unanimous' | 'final-two'
    winningRole: Role
    payouts: Record<string, number>
  }
}

export type CommandToken = { runId: string; revision: number; phase: Phase }

export function commandToken(run: Run): CommandToken {
  return { runId: run.id, revision: run.revision, phase: run.phase }
}

export function isCurrentCommand(run: Run, token: CommandToken): boolean {
  return token.runId === run.id && token.revision === run.revision && token.phase === run.phase
}

export function startRun(
  human: Contestant,
  aiPool: readonly Contestant[],
  options: RunOptions,
  entropy: { id: string; roleSeed: number; publicSeed: number }
): Run {
  if (!human.id.trim() || !human.name.trim() || !entropy.id.trim()) {
    throw new Error('A run needs a valid human contestant and ID.')
  }

  const eligible = new Map<string, Contestant>()
  for (const entry of aiPool) {
    if (entry.id !== human.id && entry.id.trim() && entry.name.trim() && !eligible.has(entry.id)) {
      eligible.set(entry.id, entry)
    }
  }
  if (eligible.size < CAST_SIZE - 1) {
    throw new Error('Betrayals requires 24 distinct AI contestants.')
  }

  const castRandom = mulberry32(entropy.publicSeed)
  const roster = seededPickN(castRandom, [...eligible.values()], CAST_SIZE - 1)
  const privateRandom = mulberry32(entropy.roleSeed)
  const betrayerCount = privateRandom() < 0.5 ? 3 : 4
  const seats = [human, ...roster].map(({ id, name, portrait }) => ({ id, name, portrait }))

  return {
    edition: 'betrayals',
    version: RULES_VERSION,
    id: entropy.id,
    revision: 0,
    phase: 'role-reveal',
    day: 1,
    humanId: human.id,
    options: { ...options },
    seats,
    private: {
      betrayers: seededPickN(privateRandom, seats, betrayerCount).map(({ id }) => id),
      nightShieldIds: [],
    },
    publicSeed: entropy.publicSeed,
    pot: 0,
    social: [],
  }
}

export function acknowledgeRole(run: Run, token: CommandToken): Run {
  if (run.phase !== 'role-reveal' || !isCurrentCommand(run, token)) return run
  return { ...run, phase: 'dawn', revision: run.revision + 1 }
}

export function advancePreparation(run: Run, token: CommandToken): Run {
  if (!isCurrentCommand(run, token)) return run
  if (run.phase === 'dawn') return { ...run, phase: 'social', revision: run.revision + 1 }
  if (run.phase === 'social') return { ...run, phase: 'immunity', revision: run.revision + 1 }
  return run
}

export function viewFor(run: Run, actorId: string | null) {
  const actor = actorId ? run.seats.find(({ id }) => id === actorId) : undefined
  const role: Role | null = actor
    ? run.private.betrayers.includes(actor.id)
      ? 'betrayer'
      : 'loyal'
    : null
  const activeActor = actor && !actor.exit

  return {
    phase: run.phase,
    day: run.day,
    role,
    teammateIds:
      activeActor && role === 'betrayer'
        ? run.seats
            .filter(
              ({ id, exit }) => !exit && id !== actor.id && run.private.betrayers.includes(id)
            )
            .map(({ id }) => id)
        : [],
    hasNightShield: Boolean(activeActor && run.private.nightShieldIds.includes(actor.id)),
    seats: run.seats.map(({ id, name, portrait, exit }) => ({
      id,
      name,
      portrait,
      exit: exit ? { ...exit } : undefined,
      finaleRole: run.result
        ? run.private.betrayers.includes(id)
          ? 'betrayer'
          : 'loyal'
        : undefined,
      fullImmunity: !exit && id === run.immunityId,
      publicShield:
        !exit &&
        (run.phase === 'round-table' ||
          (run.phase === 'table-reveal' && !run.private.pendingTable?.blind)) &&
        run.day === run.publicShield?.day &&
        id === run.publicShield.id,
    })),
  }
}
