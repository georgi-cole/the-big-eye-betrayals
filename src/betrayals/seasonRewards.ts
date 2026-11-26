import type { Run } from './run.ts'
import {
  CLAIRVOYANT_MAX_USES,
  clairvoyantUsesRemaining,
  doctorSelfWardUsed,
} from './castleRoles.ts'

type Checkpoint = Omit<Run, 'seasonRewards'>

export type SeasonRewards = {
  day?: Checkpoint
  table?: Checkpoint
  finaleRevealed?: boolean
  rewindDeclined?: boolean
}

function isDayStart(run: Run) {
  return run.phase === 'dawn' || run.phase === 'final-challenge'
}

function isTableStart(run: Run) {
  return (
    (run.phase === 'round-table' || run.phase === 'final-banishment') &&
    !run.runoffIds?.length &&
    !run.tableCount &&
    run.tableSway === undefined &&
    !run.tableArguments?.length
  )
}

function humanElimination(run: Run): { cause: 'banished' | 'night'; day: number } | undefined {
  const human = run.seats.find(({ id }) => id === run.humanId)
  if (human?.exit) return human.exit
  if (
    run.phase === 'night-resolved' &&
    run.private.pendingNight?.targetId === run.humanId &&
    !run.private.pendingNight.blocked
  ) {
    return { cause: 'night', day: run.day }
  }
}

function snapshot(run: Run): Checkpoint {
  const state = { ...run }
  delete state.seasonRewards
  delete state.presentation
  delete state.economy
  delete state.pendingAdBreak
  return state
}

/** Keep two clean snapshots, atomically alongside the season save. */
export function recordSeasonCheckpoints(previous: Run | null, next: Run): Run {
  const before = previous?.id === next.id ? previous : null
  const rewards = next.seasonRewards
  let day = rewards?.day
  let table = rewards?.table

  if (before && !humanElimination(before)) {
    if (day?.day !== before.day && isDayStart(before)) day = snapshot(before)
    if (table?.day !== before.day && isTableStart(before)) table = snapshot(before)
  }

  // Once out, retain the checkpoints for the player's elimination even when the season continues.
  if (!humanElimination(next)) {
    if (isDayStart(next) && (!before || next.day !== before.day || day?.day !== next.day)) {
      if (next.phase === 'dawn' || !before || next.day !== before.day) day = snapshot(next)
    }
    if (isTableStart(next) && (!before || before.phase !== next.phase)) table = snapshot(next)
  }

  if (day === rewards?.day && table === rewards?.table) return next
  return { ...next, seasonRewards: { ...rewards, day, table } }
}

export function validSeasonCheckpoint(candidate: Checkpoint, current: Run, type: 'day' | 'table') {
  return (
    candidate.id === current.id &&
    candidate.seasonNumber === current.seasonNumber &&
    candidate.humanId === current.humanId &&
    candidate.day <= current.day &&
    candidate.revision <= current.revision &&
    candidate.seats.length === current.seats.length &&
    candidate.seats.every(({ id }, index) => current.seats[index].id === id) &&
    candidate.seats.some(({ id, exit }) => id === current.humanId && !exit) &&
    (type === 'day' ? isDayStart(candidate) : isTableStart(candidate))
  )
}

export function rewindOffer(run: Run) {
  if (run.seasonRewards?.finaleRevealed || run.seasonRewards?.rewindDeclined) return
  const loss = humanElimination(run)
  if (!loss) return
  const type = loss.cause === 'night' ? 'day' : 'table'
  const checkpoint = run.seasonRewards?.[type]
  if (!checkpoint || checkpoint.day !== loss.day || !validSeasonCheckpoint(checkpoint, run, type)) {
    return
  }
  return { type, checkpoint } as const
}

export function rewindSeason(run: Run): Run | undefined {
  const offer = rewindOffer(run)
  if (!offer) return
  const { checkpoint, type } = offer
  const human = run.seats.find(({ id }) => id === run.humanId)
  const doctor = run.private.castleRoles?.find(({ roleId }) => roleId === 'doctor')
  const clairvoyant = run.private.castleRoles?.find(({ roleId }) => roleId === 'clairvoyant')
  const knownReadings = clairvoyant
    ? CLAIRVOYANT_MAX_USES - clairvoyantUsesRemaining(clairvoyant)
    : 0
  const castleRoles = checkpoint.private.castleRoles?.map((card) => {
    if (card.guestId === doctor?.guestId && doctorSelfWardUsed(doctor))
      return { ...card, selfWardUsed: true as const }
    if (card.guestId === clairvoyant?.guestId && knownReadings > 0)
      return { ...card, clairvoyantUses: knownReadings }
    return card
  })
  return {
    ...checkpoint,
    revision: run.revision + 1,
    economy: run.economy,
    private: castleRoles ? { ...checkpoint.private, castleRoles } : checkpoint.private,
    pendingAdBreak: undefined,
    seats: human
      ? checkpoint.seats.map((seat) =>
          seat.id === human.id ? { ...seat, name: human.name, portrait: human.portrait } : seat
        )
      : checkpoint.seats,
    seasonRewards: {
      day: type === 'day' ? checkpoint : run.seasonRewards?.day,
      table: type === 'table' ? checkpoint : undefined,
    },
  }
}
