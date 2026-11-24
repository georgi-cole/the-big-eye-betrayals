import { useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { appearanceFromAssetUrl, getAppearanceAsset } from '../appearance/catalog'
import { ANTIQUE_PORTRAIT_FRAME_URL } from '../appearance/portraitFraming'
import type { Seat } from './run'
import './PortraitGallery.css'

type GalleryGuest = Pick<Seat, 'id' | 'name' | 'portrait'>

const base = import.meta.env.BASE_URL

function Painting({ guest, captionBelow }: { guest: GalleryGuest; captionBelow?: boolean }) {
  const formal = getAppearanceAsset(appearanceFromAssetUrl(guest.portrait), 'formal')
  const [fallback, setFallback] = useState(false)
  const portrait = formal && !fallback ? base + formal : guest.portrait
  return (
    <div className="betrayals-painting" data-caption-below={captionBelow || undefined}>
      <div className="betrayals-painting__art">
        <div className="betrayals-painting__window" aria-hidden="true">
          {portrait ? (
            <img src={portrait} alt="" draggable={false} onError={() => setFallback(true)} />
          ) : (
            <span>{guest.name[0]}</span>
          )}
        </div>
        <img
          className="betrayals-painting__frame"
          src={ANTIQUE_PORTRAIT_FRAME_URL}
          alt=""
          draggable={false}
        />
      </div>
      <span
        className={
          captionBelow
            ? 'betrayals-ceremony-action--secondary betrayals-painting__caption'
            : 'betrayals-painting__plaque'
        }
      >
        {guest.name}
      </span>
    </div>
  )
}

export function PortraitGallery({
  guests,
  target,
  reducedMotion,
  onSelect,
  variant,
}: {
  guests: readonly GalleryGuest[]
  target?: GalleryGuest
  reducedMotion: boolean
  onSelect: (id: string) => void
  variant?: 'conclave'
}) {
  const swipeOnly = variant === 'conclave'
  const focus = swipeOnly ? undefined : target
  const gallery = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLUListElement>(null)
  const selectedButton = useRef<HTMLButtonElement>(null)
  const drag = useRef<{ x: number; scroll: number; moved: boolean } | null>(null)
  const [origin, setOrigin] = useState<CSSProperties>()

  function focusPainting(guest: GalleryGuest, button: HTMLButtonElement) {
    if (swipeOnly) {
      onSelect(target?.id === guest.id ? '' : guest.id)
      return
    }
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
    <div
      className="betrayals-gallery"
      data-motion={reducedMotion ? 'reduced' : undefined}
      ref={gallery}
      data-focused={Boolean(focus) || undefined}
      data-variant={variant}
    >
      <ul
        className="betrayals-gallery__track"
        ref={track}
        aria-label="Eligible contestants"
        inert={Boolean(focus)}
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
            <button
              type="button"
              aria-label={guest.name}
              aria-pressed={swipeOnly ? guest.id === target?.id : undefined}
              onClick={(event) => focusPainting(guest, event.currentTarget)}
            >
              <Painting guest={guest} captionBelow={swipeOnly} />
            </button>
          </li>
        ))}
      </ul>
      {focus ? (
        <div className="betrayals-gallery__focus">
          <div key={focus.id} className="betrayals-gallery__subject" style={origin}>
            <Painting guest={focus} />
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
      ) : !swipeOnly ? (
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
      ) : null}
    </div>
  )
}
