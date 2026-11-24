import { describe, expect, it } from 'vitest'
import { arrangeConclaveSeats, getCamera, stageLayers } from './conclaveSet'
import type { StageAssets, StageDirection } from './conclaveSet'

const cast = [
  { id: 'viewer', slot: 2, human: true },
  { id: 'ash', slot: 1 },
  { id: 'guest', slot: 3 },
]
const assets: StageAssets = Object.fromEntries(
  ['chamber', 'oak', 'base', 'hood', 'lift', 'rear', 'quarter', 'entry', 'art:ash'].map((key) => [
    key,
    { width: 400, height: 560 },
  ])
)
function layers(frame: StageDirection['frame'], t: number, still = false) {
  const shot = { frame, still, discussion: false, revealed: new Set(['ash']) }
  return stageLayers(390, 844, getCamera(shot, cast), cast, assets, shot, 0, t)
}
describe('Conclave seating edit', () => {
  it('uses one camera plate for the entrance and cuts to seated guests', () => {
    for (const progress of [0, 0.5, 1]) {
      expect(layers('entry', progress)).toEqual([
        expect.objectContaining({ kind: 'image', src: 'entry' }),
      ])
    }
    const table = layers('table', 0)
    expect(table.some((l) => l.kind === 'flash')).toBe(false)
    expect(table.some((l) => l.kind === 'image' && l.src === 'base')).toBe(true)
    expect(table.some((l) => l.kind === 'image' && l.src === 'art:ash')).toBe(true)
  })
  it('balances two or three surviving guests even with missing original slots', () => {
    const [front, left, right] = arrangeConclaveSeats(cast)
    expect(front).toMatchObject({ id: 'viewer', angle: 0 })
    expect(left.angle).toBe(-right.angle)
    expect(right.angle).toBeCloseTo((2 * Math.PI) / 3)
    const pair = arrangeConclaveSeats(cast.slice(1))
    expect(pair[1].angle - pair[0].angle).toBeCloseTo(Math.PI)
  })
  it('covers the identity change and draws one opaque body per rear seat', () => {
    const shot = {
      frame: 'portrait' as const,
      focusId: 'ash',
      discussion: false,
      still: false,
      revealed: new Set(['ash']),
    }
    for (const t of [0.115, 0.125]) {
      const view = stageLayers(390, 844, getCamera(shot, cast), cast, assets, shot, 0, t)
      expect(view.at(-1)).toMatchObject({ kind: 'flash', opacity: 1 })
      expect(view.some((l) => l.kind === 'image' && l.src === 'art:ash')).toBe(t > 0.12)
    }
    for (const l of layers('table', 0.6))
      if (l.kind === 'image' && ['quarter', 'rear'].includes(l.src)) expect(l.opacity).toBe(1)
  })
  it('preserves the aspect ratio of the wax envelope', () => {
    const shot = {
      frame: 'sealed' as const,
      discussion: false,
      still: false,
      revealed: new Set<string>(),
    }
    const view = stageLayers(
      390,
      844,
      getCamera(shot, cast),
      cast,
      { ...assets, letter: { width: 750, height: 520 } },
      shot,
      0,
      1
    )
    const letter = view.find((l) => l.kind === 'image' && l.src === 'letter')!
    expect(letter.w / letter.h).toBeCloseTo(750 / 520, 6)
  })
})
