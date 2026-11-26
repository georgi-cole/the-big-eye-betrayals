import type { CinematicCastMember } from './CinematicScene'

export type ConclaveFrame =
  | 'corridor'
  | 'latch'
  | 'entry'
  | 'table'
  | 'hood'
  | 'portrait'
  | 'sealed'

export const conclaveTableHold = 1400
export const sealedVoteHold = 1800

type OpeningBeat = {
  frame: ConclaveFrame
  title: string
  hold?: number
  cue?: string
  focusId?: string
  visibleCount?: number
}

export const sealedBallotOpening: readonly OpeningBeat[] = [
  { frame: 'latch', title: '', hold: 1080, cue: 'door' },
  { frame: 'table', title: '', hold: 1350, cue: 'conclave_steps' },
  { frame: 'sealed', title: 'The shortlist is waiting.', hold: 1300 },
]

export function conclaveOpeningBeats(
  cast: readonly CinematicCastMember[],
  first: boolean
): OpeningBeat[] {
  const end = { frame: 'table', title: 'The Conclave' } as const
  if (!first) return [{ frame: 'table', title: '', hold: 700 }, end]

  const guests = cast.filter(({ concealed, human }) => !concealed && !human)
  const entrance: OpeningBeat[] = [
    { frame: 'corridor', title: '', hold: 1700, cue: 'conclave_steps', visibleCount: 0 },
    { frame: 'latch', title: '', hold: 1020, cue: 'door', visibleCount: 0 },
    { frame: 'entry', title: '', hold: 2600, cue: 'conclave_steps', visibleCount: 0 },
    { frame: 'table', title: '', hold: 1850, cue: 'conclave_chair', visibleCount: 0 },
  ]
  if (!guests.length) return [...entrance, end]

  return [
    ...entrance,
    {
      frame: 'hood',
      title: '',
      hold: 2150,
      focusId: guests[0].id,
      visibleCount: 0,
    },
    ...guests.map(
      ({ id, name }, index): OpeningBeat => ({
        frame: 'portrait',
        title: name,
        focusId: id,
        hold: index === 0 ? 2550 : 2600,
        visibleCount: index + 1,
      })
    ),
    end,
  ]
}

export function conclaveRevealed(
  cast: readonly CinematicCastMember[],
  visibleCount?: number
): ReadonlySet<string> {
  const guests = cast.filter(({ concealed }) => !concealed)
  const player = guests.filter(({ human }) => human)
  const others = guests.filter(({ human }) => !human).slice(0, visibleCount)
  return new Set([...player, ...others].map(({ id }) => id))
}

export function conclaveCueVolume(cue?: string) {
  return cue === 'door' ? 0.29 : 0.43
}
