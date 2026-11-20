import {
  CAST_SIZE,
  INCOMING_ANSWERS,
  MAX_TABLE_ROUNDS,
  PHASES,
  PRESENTATION_CUES,
  RULES_VERSION,
} from './run.ts'
import type { Run, Seat } from './run.ts'

const SAVE_PREFIX = 'big-eye:betrayals:season:'

type StorageAdapter = Pick<Storage, 'getItem' | 'setItem'>
type Restore = { status: 'ready'; run: Run } | { status: 'empty' | 'incompatible' | 'unavailable' }

function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function validSeat(seat: unknown): seat is Seat {
  const item = asObject(seat)
  if (!item || typeof item.id !== 'string' || !item.id || typeof item.name !== 'string') {
    return false
  }
  if (item.portrait !== undefined && typeof item.portrait !== 'string') return false
  if (item.exit === undefined) return true
  const exit = asObject(item.exit)
  return Boolean(
    exit &&
    (exit.cause === 'banished' || exit.cause === 'night') &&
    typeof exit.day === 'number' &&
    Number.isSafeInteger(exit.day) &&
    exit.day > 0 &&
    (exit.revealedRole === undefined ||
      exit.revealedRole === 'loyal' ||
      exit.revealedRole === 'betrayer') &&
    (exit.cause !== 'night' || exit.revealedRole === undefined)
  )
}

function validIds(value: unknown, seats: Set<string>, min: number, max: number): boolean {
  return (
    Array.isArray(value) &&
    value.length >= min &&
    value.length <= max &&
    new Set(value).size === value.length &&
    value.every((id) => typeof id === 'string' && seats.has(id))
  )
}

function validTableRound(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_TABLE_ROUNDS
  )
}

function validTableCount(value: unknown, ids: Set<string>): boolean {
  if (value === undefined) return true
  const count = asObject(value)
  if (
    !count ||
    !validTableRound(count.round) ||
    !validIds(count.tiedIds, ids, 0, CAST_SIZE) ||
    !Array.isArray(count.ballots) ||
    count.ballots.length === 0
  ) {
    return false
  }
  const voters = new Set<string>()
  for (const value of count.ballots) {
    const ballot = asObject(value)
    if (
      !ballot ||
      typeof ballot.voterId !== 'string' ||
      typeof ballot.targetId !== 'string' ||
      !ids.has(ballot.voterId) ||
      !ids.has(ballot.targetId) ||
      voters.has(ballot.voterId) ||
      ballot.voterId === ballot.targetId
    ) {
      return false
    }
    voters.add(ballot.voterId)
  }
  return true
}

function validSafetyStandings(value: unknown, ids: Set<string>, day: number): boolean {
  if (value === undefined) return true
  const standings = asObject(value)
  if (
    !standings ||
    typeof standings.day !== 'number' ||
    !Number.isSafeInteger(standings.day) ||
    standings.day < 1 ||
    standings.day > day ||
    !Array.isArray(standings.rows)
  ) {
    return false
  }
  const rowIds = []
  for (const value of standings.rows) {
    const row = asObject(value)
    if (
      !row ||
      typeof row.score !== 'number' ||
      !Number.isFinite(row.score) ||
      (row.forfeited !== undefined && typeof row.forfeited !== 'boolean')
    ) {
      return false
    }
    rowIds.push(row.contestantId)
  }
  return validIds(rowIds, ids, 1, CAST_SIZE)
}

function validIncomingResponses(value: unknown, day: number): boolean {
  if (value === undefined) return true
  const responses = asObject(value)
  return Boolean(
    responses &&
    Object.entries(responses).every(([id, answer]) => {
      const match = /^([1-9]\d*):(social:[12]|round-table:1)$/.exec(id)
      return match && Number(match[1]) <= day && INCOMING_ANSWERS.some((valid) => answer === valid)
    })
  )
}

function isRun(value: unknown): value is Run {
  const item = asObject(value)
  if (!item || item.edition !== 'betrayals' || item.version !== RULES_VERSION) return false
  if (
    typeof item.id !== 'string' ||
    !item.id ||
    typeof item.revision !== 'number' ||
    !Number.isSafeInteger(item.revision) ||
    item.revision < 0 ||
    typeof item.day !== 'number' ||
    !Number.isSafeInteger(item.day) ||
    item.day < 1 ||
    !PHASES.some((phase) => phase === item.phase) ||
    !Number.isSafeInteger(item.publicSeed) ||
    typeof item.pot !== 'number' ||
    !Number.isSafeInteger(item.pot) ||
    item.pot < 0 ||
    !Array.isArray(item.social) ||
    !Array.isArray(item.seats) ||
    item.seats.length !== CAST_SIZE ||
    !item.seats.every(validSeat)
  ) {
    return false
  }

  const ids = new Set(item.seats.map(({ id }) => id))
  const options = asObject(item.options)
  const hidden = asObject(item.private)
  const shield = asObject(item.publicShield)
  const pendingTable = asObject(hidden?.pendingTable)
  const pendingNight = asObject(hidden?.pendingNight)
  const sway = asObject(item.tableSway)
  return Boolean(
    ids.size === CAST_SIZE &&
    typeof item.humanId === 'string' &&
    ids.has(item.humanId) &&
    options &&
    typeof options.publicMode === 'boolean' &&
    ['off', 'casual', 'tv', 'adult'].some((preset) => preset === options.realityMode) &&
    hidden &&
    validIds(hidden.betrayers, ids, 3, 4) &&
    (hidden.hiddenBetrayerIds === undefined ||
      validIds(hidden.hiddenBetrayerIds, new Set(hidden.betrayers as string[]), 0, 4)) &&
    validIds(hidden.nightShieldIds, ids, 0, 2) &&
    (item.runoffIds === undefined || validIds(item.runoffIds, ids, 2, CAST_SIZE)) &&
    (item.tableRound === undefined || validTableRound(item.tableRound)) &&
    validTableCount(item.tableCount, ids) &&
    (item.tableSway == null ||
      (sway &&
        typeof sway.targetId === 'string' &&
        ids.has(sway.targetId) &&
        (sway.tone === 'careful' || sway.tone === 'forceful'))) &&
    validSafetyStandings(hidden.safetyStandings, ids, item.day) &&
    validIncomingResponses(item.incomingResponses, item.day) &&
    (item.presentation === undefined ||
      (Array.isArray(item.presentation) &&
        item.presentation.length > 0 &&
        item.presentation.length <= 4 &&
        item.presentation.every((cue) => PRESENTATION_CUES.some((valid) => valid === cue)))) &&
    (item.phase === 'table-reveal'
      ? pendingTable &&
        typeof pendingTable.banishedId === 'string' &&
        ids.has(pendingTable.banishedId) &&
        typeof pendingTable.blind === 'boolean' &&
        typeof pendingTable.tiedByDraw === 'boolean' &&
        asObject(pendingTable.tally)
      : hidden.pendingTable === undefined) &&
    (item.phase === 'night-resolved'
      ? pendingNight &&
        typeof pendingNight.blocked === 'boolean' &&
        (pendingNight.byDraw === undefined || typeof pendingNight.byDraw === 'boolean') &&
        (pendingNight.targetId === null ||
          (typeof pendingNight.targetId === 'string' && ids.has(pendingNight.targetId)))
      : hidden.pendingNight === undefined) &&
    (item.immunityId === undefined ||
      (typeof item.immunityId === 'string' && ids.has(item.immunityId))) &&
    (item.publicShield === undefined ||
      (shield &&
        typeof shield.id === 'string' &&
        ids.has(shield.id) &&
        typeof shield.day === 'number' &&
        Number.isSafeInteger(shield.day) &&
        shield.day >= 1 &&
        shield.day <= item.day))
  )
}

export function saveRun(storage: StorageAdapter, profileId: string, run: Run): void {
  storage.setItem(SAVE_PREFIX + profileId, JSON.stringify(run))
}

export function restoreRun(storage: StorageAdapter, profileId: string): Restore {
  let value: string | null
  try {
    value = storage.getItem(SAVE_PREFIX + profileId)
  } catch {
    return { status: 'unavailable' }
  }
  if (value === null) return { status: 'empty' }
  try {
    const candidate: unknown = JSON.parse(value)
    return isRun(candidate) ? { status: 'ready', run: candidate } : { status: 'incompatible' }
  } catch {
    return { status: 'incompatible' }
  }
}
