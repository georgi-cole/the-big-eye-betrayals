import type { CSSProperties } from 'react'
import { cinematicLookId, seatedCutout } from './cinematicCast'
import './RoundTableShot.css'

type Guest = {
  id: string
  portrait?: string
  human?: boolean
  exit?: object
  concealed?: boolean
}

const art = import.meta.env.BASE_URL + 'assets/betrayals/round-table/'
const room = art + 'observatory.webp'
const anchors = [
  { x: 0.132, top: 0.395 },
  { x: 0.322, top: 0.382 },
  { x: 0.501, top: 0.376 },
  { x: 0.681, top: 0.382 },
  { x: 0.869, top: 0.395 },
]
const seatOrder = [[], [2], [1, 3], [1, 2, 3], [0, 1, 3, 4], [0, 1, 2, 3, 4]]

/** Ordered coverage for a scene. The same guest stays in the same chair as the camera moves. */
function roundTableCast(cast: readonly Guest[], focusIds: readonly string[] = []) {
  const active = new Map(
    cast.filter(({ exit, concealed }) => !exit && !concealed).map((guest) => [guest.id, guest])
  )
  const order = [...new Set([...focusIds.filter((id) => active.has(id)), ...active.keys()])]
  return order.slice(0, anchors.length).map((id) => active.get(id)!)
}

export function RoundTableShot({
  cast,
  featuredIds,
  focusId,
  angle = 'center',
  close = false,
  reducedMotion,
}: {
  cast: readonly Guest[]
  featuredIds?: readonly string[]
  focusId?: string
  angle?: 'left' | 'center' | 'right'
  close?: boolean
  reducedMotion?: boolean
}) {
  const guests = roundTableCast(cast, featuredIds)
  const chairs = seatOrder[guests.length]
  const focusedChair = chairs[guests.findIndex(({ id }) => id === focusId)]
  const focus = focusedChair === undefined ? undefined : anchors[focusedChair]
  const x = focus?.x ?? (angle === 'left' ? 0.3 : angle === 'right' ? 0.7 : 0.5)
  const zoom = close && !reducedMotion ? (focus ? 1.46 : 1.16) : 1

  return (
    <div
      className="round-table-shot"
      data-motion={reducedMotion ? 'reduced' : undefined}
      style={
        {
          '--shot-x': reducedMotion ? 0.5 : x,
          '--shot-y': close && !reducedMotion ? 0.49 : 0.51,
          '--shot-zoom': zoom,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <div className="round-table-shot__plate">
        <img className="round-table-shot__room" src={room} alt="" draggable={false} />
        {guests.map((guest, index) => {
          const anchor = anchors[chairs[index]]
          const lookId = cinematicLookId(guest)
          const cutout = lookId ? seatedCutout(lookId) : undefined
          const src = cutout?.src ?? guest.portrait
          if (!src) return null
          return (
            <div
              key={guest.id}
              className="round-table-shot__figure"
              data-guest={guest.id}
              data-cutout-crop={cutout?.crop ? 'bust' : undefined}
              data-portrait={!cutout || undefined}
              style={{ left: anchor.x * 100 + '%', top: anchor.top * 100 + '%' }}
            >
              <img src={src} alt="" draggable={false} />
            </div>
          )
        })}
        <img className="round-table-shot__table" src={room} alt="" draggable={false} />
      </div>
    </div>
  )
}
