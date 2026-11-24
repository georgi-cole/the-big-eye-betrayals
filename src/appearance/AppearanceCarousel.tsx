import { useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode, Ref } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { joinPublicAssetPath } from '../utils/avatar'
import {
  getAppearanceAsset,
  SELECTABLE_LOOKS,
  type AppearanceLook,
  type AppearanceRole,
} from './catalog'
import { warmAppearanceRole } from './preloadAppearance'
import arrowLeft from './assets/arrow-left.svg'
import arrowRight from './assets/arrow-right.svg'
import './AppearanceCarousel.css'

interface AppearanceCarouselProps {
  selectedId: string
  onSelect: (lookId: string) => void
  onConfirm?: () => void
  confirmLabel?: string
  accessText?: string
  accessContent?: ReactNode
  figureRef?: Ref<HTMLImageElement>
  looks?: readonly AppearanceLook[]
  backdrop?: string
  figureRole?: 'casual' | 'formal'
}

function lookAt(looks: readonly AppearanceLook[], index: number) {
  return looks[(index + looks.length) % looks.length]
}

function figureUrl(look: AppearanceLook, role: AppearanceRole) {
  const asset = getAppearanceAsset(
    { kind: 'catalog', lookId: look.id, revision: look.revision },
    role
  )
  return asset ? joinPublicAssetPath(asset) : ''
}

export default function AppearanceCarousel({
  selectedId,
  onSelect,
  onConfirm,
  confirmLabel = 'Choose this look',
  accessText,
  accessContent,
  figureRef,
  looks = SELECTABLE_LOOKS,
  backdrop = 'assets/dressing-room/dressing-room-mobile.webp',
  figureRole = 'casual',
}: AppearanceCarouselProps) {
  const reducedMotion = useReducedMotion()
  const touchStartX = useRef<number | null>(null)
  const currentIndex = Math.max(
    0,
    looks.findIndex((look) => look.id === selectedId)
  )
  const current = lookAt(looks, currentIndex)
  const previous = lookAt(looks, currentIndex - 1)
  const next = lookAt(looks, currentIndex + 1)

  useEffect(() => {
    if (!current) return
    for (const look of [previous, current, next]) {
      if (look)
        void warmAppearanceRole(
          { kind: 'catalog', lookId: look.id, revision: look.revision },
          figureRole
        )
    }
  }, [current, next, previous, figureRole])

  if (!current) return <p className="appearance-carousel__empty">No looks are available yet.</p>

  function move(offset: number) {
    const target = lookAt(looks, currentIndex + offset)
    if (target) onSelect(target.id)
  }

  return (
    <div
      className="appearance-carousel"
      tabIndex={0}
      role="group"
      aria-label="Choose your character look"
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault()
          move(event.key === 'ArrowLeft' ? -1 : 1)
        }
      }}
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null
      }}
      onTouchEnd={(event) => {
        if (touchStartX.current === null) return
        const delta =
          (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current
        touchStartX.current = null
        if (Math.abs(delta) >= 45) move(delta < 0 ? 1 : -1)
      }}
    >
      <div
        className="appearance-carousel__stage"
        style={{
          backgroundImage: `url("${joinPublicAssetPath(backdrop)}")`,
        }}
      >
        <motion.img
          ref={figureRef}
          key={current.id}
          className="appearance-carousel__figure"
          src={figureUrl(current, figureRole)}
          alt={current.label}
          style={
            {
              '--appearance-center-offset': `${current.footCenterXPercent}%`,
              '--appearance-foot-bottom-offset': `${current.footBottomPercent * 0.86}%`,
            } as CSSProperties
          }
          initial={reducedMotion ? false : { opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.24 }}
          draggable={false}
        />
        <button
          type="button"
          className="appearance-carousel__arrow appearance-carousel__arrow--left"
          onClick={() => move(-1)}
          aria-label="Previous look"
        >
          <img className="appearance-carousel__arrow-icon" src={arrowLeft} alt="" />
        </button>
        <button
          type="button"
          className="appearance-carousel__arrow appearance-carousel__arrow--right"
          onClick={() => move(1)}
          aria-label="Next look"
        >
          <img className="appearance-carousel__arrow-icon" src={arrowRight} alt="" />
        </button>
      </div>
      <div className="appearance-carousel__caption" aria-live="polite">
        <strong>{current.label}</strong>
        {accessText && <span className="appearance-carousel__access">{accessText}</span>}
        {accessContent}
      </div>
      {onConfirm && (
        <button type="button" className="appearance-carousel__confirm" onClick={onConfirm}>
          {confirmLabel}
        </button>
      )}
    </div>
  )
}
