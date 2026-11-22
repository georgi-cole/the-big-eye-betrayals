import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { CinematicCastMember } from './CinematicScene'
import type { ConclaveShot, mountConclave } from './conclaveWorld'
import './ConclaveFilm.css'

const art = import.meta.env.BASE_URL + 'assets/betrayals/conclave/'

type Props = Omit<ConclaveShot, 'uncoveringId'> & {
  cast: readonly CinematicCastMember[]
  unmaskingId?: string
  interactive?: boolean
  onSurfaceReady?: () => void
}

export function ConclaveFilm({
  cast,
  unmaskingId,
  interactive = false,
  onSurfaceReady,
  ...direction
}: Props) {
  const surface = useRef<HTMLCanvasElement>(null)
  const world = useRef<ReturnType<typeof mountConclave>>(null)
  const pointer = useRef<{ id: number; x: number }>(undefined)
  const castKey = cast
    .map(({ id, concealed, portrait }) => [id, concealed, portrait].join('|'))
    .join(';')
  const shot: ConclaveShot = { ...direction, uncoveringId: unmaskingId }
  const latest = useRef({ cast, shot, onSurfaceReady })
  const [readyKey, setReadyKey] = useState<string>()
  const ready = readyKey === castKey
  const canLook = interactive && !shot.reducedMotion && ready

  useLayoutEffect(() => {
    latest.current = { cast, shot, onSurfaceReady }
    world.current?.setShot(shot)
  })

  useEffect(() => {
    const canvas = surface.current
    let mounted = true
    const unavailable = () => {
      if (!mounted) return
      setReadyKey(undefined)
      latest.current.onSurfaceReady?.()
    }
    if (!canvas || typeof ResizeObserver === 'undefined') {
      queueMicrotask(unavailable)
      return () => {
        mounted = false
      }
    }
    void import('./conclaveWorld')
      .then(({ mountConclave: mount }) => {
        if (!mounted) return
        const active = latest.current
        world.current = mount(
          canvas,
          active.cast,
          active.shot,
          () => {
            setReadyKey(castKey)
            latest.current.onSurfaceReady?.()
          },
          unavailable
        )
        if (!world.current) unavailable()
      })
      .catch(unavailable)
    return () => {
      mounted = false
      world.current?.dispose()
      world.current = null
    }
  }, [castKey])

  return (
    <div
      className="conclave-film"
      data-group={cast.length}
      data-entering={shot.entering || undefined}
      data-focus={unmaskingId ?? shot.focusId ?? shot.speakerId}
      data-painted={ready || undefined}
    >
      {!ready && (
        <div className="conclave-film__fallback" aria-hidden="true">
          <img
            className="conclave-film__backdrop"
            src={art + (shot.entering ? 'entry-room.webp' : 'room.webp')}
            alt=""
          />
          {shot.entering &&
            cast.map((member, index) => (
              <img
                key={member.id}
                className="conclave-film__fallback-figure"
                src={art + `walk-back-${index + 1}.webp`}
                alt=""
                style={{ '--figure-index': index, '--figure-total': cast.length } as CSSProperties}
              />
            ))}
        </div>
      )}
      <canvas
        key={castKey}
        ref={surface}
        className="conclave-film__canvas"
        role={canLook ? 'group' : undefined}
        aria-label={
          canLook
            ? 'Conclave camera. Drag or use the arrow keys to pan across the table.'
            : undefined
        }
        aria-hidden={canLook ? undefined : true}
        tabIndex={canLook ? 0 : undefined}
        data-interactive={canLook || undefined}
        onPointerDown={(event) => {
          if (!canLook || !event.isPrimary || event.button !== 0) return
          pointer.current = { id: event.pointerId, x: event.clientX }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const drag = pointer.current
          if (!drag || drag.id !== event.pointerId) return
          world.current?.look((drag.x - event.clientX) * 0.009)
          drag.x = event.clientX
        }}
        onLostPointerCapture={() => {
          pointer.current = undefined
        }}
        onKeyDown={(event) => {
          if (!canLook || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
          event.preventDefault()
          world.current?.look(event.key === 'ArrowLeft' ? -0.28 : 0.28)
        }}
      />
    </div>
  )
}
