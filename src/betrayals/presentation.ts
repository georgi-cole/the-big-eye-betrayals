import type { CinematicSceneData } from './CinematicScene'
import { getConclaveVerdict } from './night'
import { knownTeammateIds } from './run'
import type { PresentationCue, Run } from './run'

export function presentationAfter(before: Run, after: Run): PresentationCue[] {
  if (before.id !== after.id || before.phase === after.phase) return []

  if (after.phase === 'settled') {
    return before.phase === 'table-reveal' ? ['departure', 'finale'] : ['finale']
  }

  switch (before.phase) {
    case 'role-reveal':
      return ['sunrise']
    case 'immunity':
      return ['shield']
    case 'safety':
      return after.day === 1 ? ['safety-results', 'round-table'] : ['safety-results']
    case 'final-challenge':
      return ['round-table']
    case 'table-reveal':
      return after.phase === 'night' && after.day === 1
        ? ['departure', 'conclave-arrival']
        : ['departure']
    case 'night': {
      const decision = after.private.pendingNight
      if (decision?.targetId === after.humanId && !decision.blocked) return ['death-letter']
      const participating = after.seats.some(({ id, exit }) => id === after.humanId && !exit)
      return participating && after.private.betrayers.includes(after.humanId)
        ? ['conclave-seal']
        : []
    }
    case 'night-resolved':
      return ['awakening']
    default:
      return []
  }
}

const weather = ['clear', 'mist', 'rain'] as const

export function castleWeather(run: Run, day = run.day): (typeof weather)[number] {
  return weather[((run.publicSeed ^ Math.imul(day, 3851)) >>> 0) % weather.length]
}

export function cinematicFor(
  run: Run,
  cue: Exclude<PresentationCue, 'safety-results'>,
  actorId: string | null,
  castleExterior: string
): CinematicSceneData {
  const scene = { kind: cue, id: [run.id, run.day, run.revision, cue].join(':') }
  const seat = (id?: string | null) => run.seats.find((contestant) => contestant.id === id)
  const victim = run.lastDawn?.day === run.day ? run.lastDawn.eliminatedId : null
  const cast = run.seats.filter(({ exit }) => !exit)
  const guests = (members: typeof run.seats) =>
    members.map((member) => ({ ...member, human: member.id === run.humanId }))
  switch (cue) {
    case 'conclave-arrival': {
      const inside = actorId !== null && run.private.betrayers.includes(actorId)
      const known = knownTeammateIds(run, actorId)
      const guestsInRoom = inside
        ? guests(cast.filter(({ id }) => id === actorId || known.includes(id)))
        : []
      return {
        ...scene,
        cast: guestsInRoom,
        backdrop: guestsInRoom.length
          ? undefined
          : import.meta.env.BASE_URL + 'assets/betrayals/night.jpg',
        title: guestsInRoom.length ? 'The Conclave' : 'Lights out',
      }
    }
    case 'conclave-seal': {
      const verdict = getConclaveVerdict(run, actorId)
      return {
        ...scene,
        repeat: run.day > 1,
        subtitle: verdict?.targetId
          ? (seat(verdict.targetId)?.name ?? 'A guest') +
            (verdict.byDraw ? ' was chosen by draw.' : ' was chosen by the Conclave.')
          : 'The decision stays behind closed doors.',
      }
    }
    case 'sunrise':
      return {
        ...scene,
        backdrop: castleExterior,
        weather: castleWeather(run, run.day + Number(run.phase === 'night-resolved')),
      }
    case 'sunset':
      return { ...scene, backdrop: castleExterior, weather: castleWeather(run), cast }
    case 'awakening':
      return {
        ...scene,
        cast: guests(run.seats),
        repeat: !victim,
        weather: castleWeather(run),
        darkSeatId: victim ?? undefined,
        subtitle: victim ? seat(victim)?.name + ' is missing.' : 'Everyone returned.',
      }
    case 'shield':
      return { ...scene, subject: seat(run.immunityId) }
    case 'death-letter':
      return { ...scene, subject: seat(run.phase === 'night-resolved' ? run.humanId : victim) }
    case 'elimination':
      return { ...scene, subject: seat(victim) }
    case 'departure': {
      const banished = seat(run.lastTable?.banishedId)
      const subject = banished?.exit?.day === run.day ? banished : undefined
      const role = subject?.exit?.revealedRole
      return {
        ...scene,
        subject: subject ? guests([subject])[0] : undefined,
        repeat:
          run.day > 1 && role !== 'betrayer' && !run.lastTable?.blind && !run.lastTable?.tiedByDraw,
        angle: run.day % 2 === 0 ? 'door' : 'hall',
        role: role ? (role === 'loyal' ? 'Loyal' : 'Betrayer') : undefined,
      }
    }
    case 'round-table':
      return {
        ...scene,
        cast,
        title: run.phase === 'final-banishment' ? 'Final banishment' : undefined,
      }
    case 'finale': {
      const result = run.result
      const winners = Object.entries(result?.payouts ?? {}).map(([id, amount]) => ({
        name: seat(id)?.name ?? 'Contestant',
        amount,
      }))
      return {
        ...scene,
        title: result?.winningRole === 'loyal' ? 'The Loyals win' : 'The Betrayers win',
        winners,
        pot: run.pot,
        verdict: result?.winningRole,
      }
    }
    case 'interlude':
      return { ...scene, title: 'Social' }
  }
}
