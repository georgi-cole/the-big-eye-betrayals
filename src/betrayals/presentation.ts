import type { CinematicSceneData } from './CinematicScene'
import { conclaveGuests, describeConclaveVerdict } from './night'
import type { PresentationCue, Run } from './run'

export function presentationAfter(
  before: Run,
  after: Run,
  playNightFilm = true
): PresentationCue[] {
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
      return ['safety-results']
    case 'shield-deals':
      return after.day === 1 ? ['round-table'] : []
    case 'final-challenge':
      return ['round-table']
    case 'table-reveal':
      return after.phase === 'night' &&
        playNightFilm &&
        after.private.betrayers.includes(after.humanId) &&
        after.seats.some(({ id, exit }) => id === after.humanId && !exit)
        ? ['departure', 'conclave-arrival']
        : ['departure']
    case 'cocktail':
      return playNightFilm && conclaveGuests(after, after.humanId).length
        ? ['conclave-arrival']
        : []
    case 'night': {
      const decision = after.private.pendingNight
      if (after.dayFlow?.castleDay) {
        const cue: PresentationCue = conclaveGuests(after, after.humanId).length
          ? 'conclave-seal'
          : 'conclave-shadow'
        const cues: PresentationCue[] = playNightFilm ? [cue] : []
        if (decision?.targetId && !decision.blocked) cues.push('death-letter')
        return cues
      }
      if (decision?.targetId === after.humanId && !decision.blocked)
        return playNightFilm ? ['death-letter'] : []
      const participating = after.seats.some(({ id, exit }) => id === after.humanId && !exit)
      return playNightFilm && participating && after.private.betrayers.includes(after.humanId)
        ? ['conclave-seal']
        : []
    }
    case 'night-resolved': {
      const victim = after.lastDawn?.eliminatedId
      if (!victim || before.private.pendingNight?.filmPlayed) return []
      return playNightFilm && victim !== after.humanId
        ? ['death-letter', 'awakening']
        : ['awakening']
    }
    default:
      return []
  }
}

const weather = ['clear', 'mist', 'rain', 'snow'] as const
export type CastleWeather = (typeof weather)[number]

const nightSkies = ['crescent', 'quarter', 'gibbous', 'full', 'waning', 'storm'] as const
export type NightRoom = {
  sky: (typeof nightSkies)[number]
  silhouette: 'narrow' | 'broad'
}

const dawnLossLines = [
  (name: string) => `Everyone looked around. ${name} was nowhere to be found.`,
  (name: string) => `The sun came up, but ${name} didn’t.`,
  (name: string) => `The guests gathered at dawn. ${name}’s chair stayed empty.`,
  (name: string) => `Morning light reached the castle. ${name} never walked through the door.`,
]

export function dawnBroadcast(run: Pick<Run, 'lastDawn' | 'seats' | 'publicSeed'>) {
  if (!run.lastDawn) return 'The observatory opens.'
  const { day, eliminatedId } = run.lastDawn
  if (!eliminatedId) return 'Everyone returned.'
  const guest = run.seats.find(({ id }) => id === eliminatedId)
  if (!guest) return 'One guest was missing when the castle woke.'
  // Keep the broadcast consistent if the player reloads or revisits this morning.
  const variant = ((run.publicSeed >>> 0) + day) % dawnLossLines.length
  return dawnLossLines[variant](guest.name)
}

const nightLines = [
  'Everyone is trying to sleep. However, evil never sleeps.',
  'The castle has gone quiet. Somewhere, a door opens.',
  'The lights are out. Behind one door, the night is just beginning.',
  'Most of the castle is asleep. Footsteps still echo below.',
]

export function nightBroadcast(run: Pick<Run, 'day' | 'publicSeed'>) {
  return nightLines[((run.publicSeed >>> 0) + run.day - 1) % nightLines.length]
}

export function castleWeather(run: Run, day = run.day): CastleWeather {
  const mix = Math.imul(run.publicSeed ^ Math.imul(day, 3851), 0x45d9f3b)
  return weather[((mix ^ (mix >>> 16)) >>> 0) % weather.length]
}

export function cinematicFor(
  run: Run,
  cue: Exclude<PresentationCue, 'safety-results' | 'sunrise'>,
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
    case 'conclave-shadow':
      return { ...scene, subtitle: 'Whispers drift through the dark.' }
    case 'conclave-arrival': {
      const guestsInRoom = conclaveGuests(run, actorId)
      return {
        ...scene,
        cast: guestsInRoom,
        conclaveOpening: run.day === 1,
        backdrop: guestsInRoom.length
          ? undefined
          : import.meta.env.BASE_URL + 'assets/betrayals/night.jpg',
        title: guestsInRoom.length ? 'The Conclave' : 'Lights out',
      }
    }
    case 'conclave-seal': {
      return {
        ...scene,
        cast: conclaveGuests(run, actorId),
        subtitle:
          describeConclaveVerdict(run, actorId) ?? 'The decision stays behind closed doors.',
      }
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
    case 'death-letter': {
      const beforeDawn = run.phase === 'night-resolved'
      const subject = seat(beforeDawn ? run.private.pendingNight?.targetId : victim)
      const night = Math.max(1, run.day - Number(!beforeDawn))
      const skyIndex = (run.publicSeed >>> 0) + night - 1
      const skyCycle = Math.floor(skyIndex / nightSkies.length)
      return {
        ...scene,
        subject: subject ? guests([subject])[0] : undefined,
        openingTitle: beforeDawn ? undefined : 'What happened during the night…',
        // The same night always gets the same view, independent of the victim.
        nightRoom: {
          sky: nightSkies[skyIndex % nightSkies.length],
          silhouette: (night + skyCycle) % 2 === 0 ? 'narrow' : 'broad',
        },
      }
    }
    case 'elimination':
      return { ...scene, subject: seat(victim) }
    case 'departure': {
      const banished = seat(run.lastTable?.banishedId)
      const subject = banished?.exit?.day === run.day ? banished : undefined
      const role = subject?.exit?.revealedRole
      return {
        ...scene,
        subject: subject ? guests([subject])[0] : undefined,
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
