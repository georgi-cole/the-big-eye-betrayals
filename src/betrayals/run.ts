import { mulberry32, seededPickN } from '../store/rng.ts'
import { initializeSocialWallets } from './socialResources.ts'
import type { SocialWallet } from './socialResources.ts'
import { hasPaidNightShield } from './economy.ts'
import { MAX_BETRAYERS, MIN_BETRAYERS, NIGHT_SHIELD_COUNT } from './seasonPhases.ts'

export const CAST_SIZE = 25
export const MAX_TABLE_ROUNDS = 3
export const RULES_VERSION = 1
export const PHASES = [
  'role-reveal',
  'dawn',
  'social',
  'immunity',
  'after-immunity',
  'safety',
  'shield-deals',
  'round-table',
  'table-reveal',
  'cocktail',
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
export const INCOMING_ANSWERS = ['engage', 'listen', 'dismiss'] as const
export type IncomingAnswer = (typeof INCOMING_ANSWERS)[number]
export const NIGHT_SHIELD_MOVES = [
  'shield-gift',
  'shield-claim',
  'shield-deny',
  'ask-shield',
  'shield-tip',
] as const
export type NightShieldClaim = 'has' | 'none'
export type NightShieldPlan = 'keep' | 'open-to-gift' | 'private'

export type SocialReaction =
  | 'wary'
  | 'trusts'
  | 'uncertain'
  | 'held-back'
  | 'landed'
  | 'unmoved'
  | 'backfired'
  | 'repaired'
  | 'end'
  | 'banish'

export type CastleAlliance = {
  id: string
  name: string
  leaderId: string
  memberIds: string[]
  closed?: boolean
}

export type SocialEntry = {
  day: number
  actorId: string
  recipientId: string
  kind:
    | 'rapport'
    | 'question'
    | 'alliance'
    | 'end-pact'
    | 'vote-plan'
    | 'ask-about'
    | 'share-suspicion'
    | 'defend-guest'
    | 'mend-fences'
    | 'debrief'
    | 'ask-end'
    | 'group-chat'
    | 'lay-low'
    | 'explore-castle'
    | 'eavesdrop'
    | 'found-alliance'
    | 'consult-alliance'
    | 'alliance-update'
    | 'shield-request'
    | 'shield-plans'
    | 'promise-shield'
    | 'ask-to-cover'
    | 'broker-shield'
    | 'arrange-breakfast'
    | 'leave-account'
    | (typeof NIGHT_SHIELD_MOVES)[number]
  suspectId?: string
  witnessReportId?: string
  shieldReply?: NightShieldClaim | 'private'
  shieldPlan?: NightShieldPlan
  accepted?: boolean
  alliance?: CastleAlliance
  allianceChange?: 'invite' | 'leave' | 'rename' | 'remove' | 'dissolve'
  declinedIds?: string[]
  reaction?: SocialReaction
  pledgeResult?: { actor: boolean; recipient: boolean } | 'void'
}

export type TableReceipt = {
  banishedId: string
  blind: boolean
  tally: Record<string, number>
  tiedByDraw: boolean
  revealedBallots?: Ballot[]
  campaigns?: TableArgument[]
  witnesses?: { speakerId: string; targetId: string }[]
  defenses?: { speakerId: string; targetId: string }[]
}

export const PRESENTATION_CUES = [
  'conclave-arrival',
  'conclave-shadow',
  'conclave-seal',
  'sunrise',
  'awakening',
  'shield',
  'safety-results',
  'death-letter',
  'round-table',
  'departure',
  'elimination',
  'sunset',
  'interlude',
  'finale',
] as const

export type PresentationCue = (typeof PRESENTATION_CUES)[number]

export type SafetyStanding = { contestantId: string; score: number; forfeited?: boolean }

export type Ballot = { voterId: string; targetId: string }
export type TableCount = { round: number; ballots: Ballot[]; tiedIds: string[] }
export type TableSway = {
  targetId: string
  tone: 'careful' | 'forceful'
  evidence?: import('./intel.ts').TableEvidence
  investigation?: import('./investigationEvidence.ts').InvestigationCase
  stance?: 'question' | 'defend'
}

export type TableArgument = TableSway & {
  speakerId: string
  basis: 'impression' | 'conversation' | 'record'
}

export type CaseReview = {
  day: number
  speakerId: string
  targetId: string
  result: 'caught' | 'missed'
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
    hiddenBetrayerIds?: string[]
    // One owner per awarded shield. Two shields may be held by the same guest.
    nightShieldIds: string[]
    nightShieldAwardIds?: string[]
    lastShieldSave?: { day: number; id: string }
    safetyStandings?: {
      day: number
      publicResults?: boolean
      rows: SafetyStanding[]
      requestId?: string
      dealsClosed?: true
    }
    pendingTable?: TableReceipt
    conclaveVote?: { nominations: Ballot[]; runoff?: Ballot[] }
    recruitmentSeed?: number
    humanRecruitmentOffered?: true
    pendingNight?: {
      targetId: string | null
      blocked: boolean
      byDraw?: boolean
      filmPlayed?: boolean
      recruitedId?: string
    }
  }
  publicSeed: number
  pot: number
  challengeHistory?: string[]
  seasonRewards?: import('./seasonRewards.ts').SeasonRewards
  economy?: import('./economy.ts').BetrayalsEconomy
  pendingAdBreak?: import('./adBreakPolicy.ts').BetrayalsAdBreakEvent
  social: SocialEntry[]
  activity?: import('./gameLog.ts').GameLogEntry[]
  investigation?: import('./investigationRecords.ts').Investigation
  witnessLead?: import('./intel.ts').WitnessLead
  socialWallets?: Record<string, SocialWallet>
  incomingResponses?: Record<string, IncomingAnswer>
  presentation?: PresentationCue[]
  immunityId?: string
  publicShield?: { id: string; day: number }
  publicShieldDecisionDay?: number
  votePlans?: import('./votePlans.ts').VotePlans
  audienceApproval?: Record<string, number>
  dayFlow?: import('./dayFlowState.ts').DayFlow
  castleMoments?: import('./castleLifeBank.ts').CastleMoment[]
  runoffIds?: string[]
  tableRound?: number
  tableCount?: TableCount
  tableSway?: TableSway | null
  tableArguments?: TableArgument[]
  caseReviews?: CaseReview[]
  lastTable?: TableReceipt
  lastDawn?: { day: number; eliminatedId: string | null }
  result?: {
    reason: 'last-betrayer' | 'unanimous' | 'final-two'
    winningRole: Role
    payouts: Record<string, number>
  }
}

export type CommandToken = { runId: string; revision: number; phase: Phase }

export function hashId(id: string): number {
  return Array.from(id).reduce(
    (hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) | 0,
    0
  )
}

export function eligibleBanishmentTargets(run: Run, voterId: string): string[] {
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

export function publicShieldPending(
  run: Pick<Run, 'phase' | 'day' | 'options' | 'publicShieldDecisionDay'>
) {
  return (
    (run.phase === 'after-immunity' || run.phase === 'round-table') &&
    run.options.publicMode &&
    run.publicShieldDecisionDay !== run.day
  )
}

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
    throw new Error(`Betrayals requires ${CAST_SIZE - 1} distinct AI contestants.`)
  }

  const castRandom = mulberry32(entropy.publicSeed)
  const roster = seededPickN(castRandom, [...eligible.values()], CAST_SIZE - 1)
  const privateRandom = mulberry32(entropy.roleSeed)
  const betrayerCount = privateRandom() < 0.5 ? MIN_BETRAYERS : MAX_BETRAYERS
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
      recruitmentSeed: Math.floor(privateRandom() * 2 ** 32),
    },
    publicSeed: entropy.publicSeed,
    pot: 0,
    social: [],
    socialWallets: initializeSocialWallets(seats, 1, options.realityMode),
  }
}

export function acknowledgeRole(run: Run, token: CommandToken): Run {
  if (run.phase !== 'role-reveal' || !isCurrentCommand(run, token)) return run
  return { ...run, phase: 'dawn', revision: run.revision + 1 }
}

export function advancePreparation(run: Run, token: CommandToken): Run {
  if (!isCurrentCommand(run, token)) return run
  if (run.phase === 'dawn')
    return {
      ...run,
      phase: run.dayFlow?.castleDay ? 'immunity' : 'social',
      revision: run.revision + 1,
    }
  if (run.phase === 'social')
    return {
      ...run,
      phase: run.dayFlow?.castleDay ? 'safety' : 'immunity',
      revision: run.revision + 1,
    }
  return run
}

export function knownTeammateIds(run: Run, actorId: string | null): string[] {
  if (
    !actorId ||
    !run.private.betrayers.includes(actorId) ||
    !run.seats.some(({ id, exit }) => id === actorId && !exit)
  )
    return []
  return run.seats
    .filter(
      ({ id, exit }) =>
        !exit &&
        id !== actorId &&
        run.private.betrayers.includes(id) &&
        !run.private.hiddenBetrayerIds?.includes(id)
    )
    .map(({ id }) => id)
}

export function nightShieldWinners(run: Run): readonly string[] {
  const standings = run.private.safetyStandings
  return standings?.day === run.day
    ? standings.rows.slice(0, NIGHT_SHIELD_COUNT).map(({ contestantId }) => contestantId)
    : (run.private.nightShieldAwardIds ?? run.private.nightShieldIds)
}

export function publicNightShieldWinners(run: Run): readonly string[] {
  const standings = run.private.safetyStandings
  return standings?.day === run.day && standings.publicResults ? nightShieldWinners(run) : []
}

export function viewFor(run: Run, actorId: string | null) {
  const actor = actorId ? run.seats.find(({ id }) => id === actorId) : undefined
  const role: Role | null = actor
    ? run.private.betrayers.includes(actor.id)
      ? 'betrayer'
      : 'loyal'
    : null
  const activeActor = actor && !actor.exit
  const teammateIds = knownTeammateIds(run, actorId)
  const nightShieldCount = activeActor
    ? run.private.nightShieldIds.filter((id) => id === actor.id).length
    : 0
  const purchasedNightShieldActive = Boolean(activeActor && hasPaidNightShield(run, actor.id))
  // Teammates see who won at Safety, but don't get updates about private handoffs.
  const shieldCycle =
    run.phase === 'shield-deals' ||
    run.phase === 'round-table' ||
    (run.phase === 'table-reveal' && !run.private.pendingTable?.blind) ||
    run.phase === 'cocktail' ||
    run.phase === 'night' ||
    run.phase === 'night-resolved'
  const publicNightShieldWinnerIds = shieldCycle ? publicNightShieldWinners(run) : []
  const knownNightShieldIds = new Set(publicNightShieldWinnerIds)
  if (shieldCycle) {
    for (const id of nightShieldWinners(run)) {
      if (teammateIds.includes(id)) knownNightShieldIds.add(id)
    }
  }
  if (activeActor && (nightShieldCount || purchasedNightShieldActive))
    knownNightShieldIds.add(actor.id)

  return {
    phase: run.phase,
    day: run.day,
    role,
    teammateIds,
    knownNightShieldIds: [...knownNightShieldIds],
    publicNightShieldWinnerIds,
    hasNightShield: nightShieldCount > 0 || purchasedNightShieldActive,
    nightShieldCount,
    purchasedNightShieldActive,
    seats: run.seats.map(({ id, name, portrait, exit }) => ({
      id,
      name,
      portrait,
      exit: exit ? { ...exit } : undefined,
      finaleRole:
        run.result && run.seasonRewards?.finaleRevealed
          ? run.private.betrayers.includes(id)
            ? 'betrayer'
            : 'loyal'
          : undefined,
      fullImmunity: !exit && id === run.immunityId,
      publicShield:
        !exit &&
        (run.phase === 'after-immunity' ||
          run.phase === 'safety' ||
          run.phase === 'shield-deals' ||
          run.phase === 'round-table' ||
          (run.phase === 'table-reveal' && !run.private.pendingTable?.blind)) &&
        run.day === run.publicShield?.day &&
        id === run.publicShield.id,
    })),
  }
}
