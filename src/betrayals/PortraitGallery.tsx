import { useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { appearanceFromAssetUrl, getAppearanceAsset } from '../appearance/catalog'
import type { Seat } from './run'
import './PortraitGallery.css'

const base = import.meta.env.BASE_URL

function Painting({ guest }: { guest: Seat }) {
  const formal = getAppearanceAsset(appearanceFromAssetUrl(guest.portrait), 'formal')
  const [fallback, setFallback] = useState(false)
  const portrait = formal && !fallback ? base + formal : guest.portrait
  return (
    <div className="betrayals-painting">
      {portrait ? (
        <img src={portrait} alt="" draggable={false} onError={() => setFallback(true)} />
      ) : (
        <span aria-hidden="true">{guest.name[0]}</span>
      )}
      <span className="betrayals-painting__plaque">{guest.name}</span>
    </div>
  )
}

export function PortraitGallery({
  guests,
  target,
  reducedMotion,
  onSelect,
}: {
  guests: readonly Seat[]
  target?: Seat
  reducedMotion: boolean
  onSelect: (id: string) => void
}) {
  const gallery = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLUListElement>(null)
  const selectedButton = useRef<HTMLButtonElement>(null)
  const drag = useRef<{ x: number; scroll: number; moved: boolean } | null>(null)
  const [origin, setOrigin] = useState<CSSProperties>()

  function focusPainting(guest: Seat, button: HTMLButtonElement) {
    const wall = gallery.current?.getBoundingClientRect()
    if (wall) {
      const picture = button.getBoundingClientRect()
      setOrigin({
        '--portrait-x': picture.left + picture.width / 2 - (wall.left + wall.width / 2) + 'px',
        '--portrait-y': picture.top + picture.height / 2 - (wall.top + wall.height / 2) + 'px',
        '--portrait-scale': 0.64,
      } as CSSProperties)
    }
    selectedButton.current = button
    onSelect(guest.id)
  }

  function moveWall(event: PointerEvent<HTMLUListElement>) {
    const start = drag.current
    if (!start) return
    if (event.buttons !== 1) {
      drag.current = null
      return
    }
    if (!start.moved && Math.abs(event.clientX - start.x) > 6) {
      start.moved = true
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    if (start.moved) event.currentTarget.scrollLeft = start.scroll + start.x - event.clientX
  }

  function browseAgain() {
    onSelect('')
    window.requestAnimationFrame(() => selectedButton.current?.focus({ preventScroll: true }))
  }

  return (
    <div className="betrayals-gallery" ref={gallery} data-focused={Boolean(target) || undefined}>
      <ul
        className="betrayals-gallery__track"
        ref={track}
        aria-label="Eligible contestants"
        inert={Boolean(target)}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && event.button === 0) {
            drag.current = {
              x: event.clientX,
              scroll: event.currentTarget.scrollLeft,
              moved: false,
            }
          }
        }}
        onPointerMove={moveWall}
        onPointerUp={() => {
          if (drag.current?.moved) window.setTimeout(() => (drag.current = null), 0)
          else drag.current = null
        }}
        onPointerCancel={() => (drag.current = null)}
        onClickCapture={(event) => {
          if (drag.current?.moved) event.stopPropagation()
        }}
      >
        {guests.map((guest) => (
          <li key={guest.id}>
            <button type="button" onClick={(event) => focusPainting(guest, event.currentTarget)}>
              <Painting guest={guest} />
            </button>
          </li>
        ))}
      </ul>
      {target ? (
        <div className="betrayals-gallery__focus">
          <div key={target.id} className="betrayals-gallery__subject" style={origin}>
            <Painting guest={target} />
          </div>
          <button
            ref={(button) => button?.focus({ preventScroll: true })}
            className="betrayals-gallery__return"
            type="button"
            onClick={browseAgain}
          >
            Choose another guest
          </button>
        </div>
      ) : (
        <div className="betrayals-gallery__nav">
          {[-1, 1].map((direction) => (
            <button
              key={direction}
              type="button"
              aria-label={direction < 0 ? 'Scroll portraits left' : 'Scroll portraits right'}
              onClick={() =>
                track.current?.scrollBy({
                  left: direction * track.current.clientWidth * 0.68,
                  behavior: reducedMotion ? 'instant' : 'smooth',
                })
              }
            >
              <span aria-hidden="true">{direction < 0 ? '‹' : '›'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
