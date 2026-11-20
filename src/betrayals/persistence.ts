import { CAST_SIZE, PHASES, RULES_VERSION } from './run.ts'
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
  return Boolean(
    ids.size === CAST_SIZE &&
    typeof item.humanId === 'string' &&
    ids.has(item.humanId) &&
    options &&
    typeof options.publicMode === 'boolean' &&
    ['off', 'casual', 'tv', 'adult'].some((preset) => preset === options.realityMode) &&
    hidden &&
    validIds(hidden.betrayers, ids, 3, 4) &&
    validIds(hidden.nightShieldIds, ids, 0, 2) &&
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
