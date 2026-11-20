import type { CinematicSceneData } from './CinematicScene'
import { getConclaveVerdict } from './night'
import { knownTeammateIds } from './run'
import type { PresentationCue, Run } from './run'

export function presentationAfter(before: Run, after: Run): PresentationCue[] {
  if (before.id !== after.id || before.phase === after.phase) return []

  switch (before.phase) {
    case 'role-reveal':
      return ['sunrise']
    case 'dawn':
      return ['interlude']
    case 'immunity':
      return ['shield']
    case 'safety':
      return ['safety-results', 'round-table']
    case 'final-challenge':
      return ['round-table']
    case 'table-reveal':
      return after.phase === 'night' ? ['departure', 'sunset', 'conclave-arrival'] : ['departure']
    case 'night':
      return [
        'conclave-seal',
        ...(after.private.pendingNight?.targetId === after.humanId &&
        !after.private.pendingNight.blocked
          ? (['death-letter'] as const)
          : []),
        'sunrise',
      ]
    case 'night-resolved': {
      const victim = after.lastDawn?.eliminatedId
      if (!victim) return ['awakening']
      return victim === after.humanId
        ? ['awakening', 'elimination']
        : ['awakening', 'death-letter', 'elimination']
    }
    case 'end-vote':
      return after.phase === 'final-banishment' ? ['round-table'] : []
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
  const hoods = run.private.betrayers.filter((id) => cast.some((member) => member.id === id))
  switch (cue) {
    case 'conclave-arrival': {
      const known = knownTeammateIds(run, actorId)
      return {
        ...scene,
        cast: hoods.map((id, index) =>
          id === actorId || known.includes(id)
            ? cast.find((member) => member.id === id)!
            : { id: 'hood-' + index, name: 'Hooded figure', concealed: true }
        ),
      }
    }
    case 'conclave-seal': {
      const verdict = getConclaveVerdict(run, actorId)
      return {
        ...scene,
        castCount: hoods.length,
        subject: seat(verdict?.targetId),
        subtitle: verdict?.targetId
          ? (seat(verdict.targetId)?.name ?? 'A guest') +
            (verdict.byDraw ? ' was chosen by draw.' : ' was chosen by the Conclave.')
          : undefined,
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
        cast: run.seats.filter(({ id, exit }) => !exit || id === victim),
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
        subject,
        role: role ? (role === 'loyal' ? 'Loyal' : 'Betrayer') : undefined,
      }
    }
    case 'round-table':
      return {
        ...scene,
        cast,
        title: run.phase === 'final-banishment' ? 'Final banishment' : undefined,
      }
    case 'interlude':
      return {
        ...scene,
        title: 'Between the walls',
        subtitle: 'The corridors fill with whispers before the next challenge.',
      }
  }
}
