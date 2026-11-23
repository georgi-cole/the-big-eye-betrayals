import type { CinematicCastMember } from './CinematicScene'

type OpeningBeat = {
  title: string
  hold?: number
  cue?: string
  entering?: boolean
  unmaskingId?: string
  focusId?: string
  visibleCount: number
}

export function conclaveOpeningBeats(
  cast: readonly CinematicCastMember[],
  first: boolean
): OpeningBeat[] {
  const known = cast.filter(({ concealed }) => !concealed)
  const end = { title: 'The Conclave', visibleCount: known.length }
  if (!first)
    return [
      { title: 'Behind closed doors', hold: 1800, cue: 'door', visibleCount: known.length },
      end,
    ]
  return [
    { title: 'After dark', hold: 3450, cue: 'door', entering: true, visibleCount: 0 },
    { title: 'The guests take their places', hold: 970, cue: 'suspense', visibleCount: 0 },
    ...known.flatMap(({ id, name }, index) => [
      {
        title: 'The hoods come down',
        hold: 1980,
        unmaskingId: id,
        focusId: id,
        visibleCount: index,
      },
      { title: name, hold: 1120, cue: 'reveal', focusId: id, visibleCount: index + 1 },
    ]),
    end,
  ]
}
