import type { ReactNode } from 'react'
import './BetrayalsDock.css'

type DockTarget = 'home' | 'social' | 'incoming' | 'settings'
type DockAction = {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  count?: number
}

export interface BetrayalsDockProps {
  play?: {
    label: string
    faceLabel?: string
    onClick: () => void
    disabled?: boolean
  }
  home?: DockAction
  social?: DockAction
  incoming?: DockAction
  settings?: DockAction
  utility?: ReactNode
}

function Glyph({ target }: { target: DockTarget }) {
  if (target === 'home') {
    return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="m5 14 11-9 11 9v13H5V14Z" /><path d="M12 27V17h8v10M16 17v-4M16 13c-3-2-3-4 0-6 3 2 3 4 0 6Z" /></svg>
  }
  if (target === 'social') {
    return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 7.5h18v13H15l-7 5v-5H7v-13Z" /><path d="M12 14h.1M16 14h.1M20 14h.1" /><path d="M22 5c3 2 4 5 3 8" /></svg>
  }
  if (target === 'incoming') {
    return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 21c2-2 2-4 2-8a6 6 0 0 1 12 0c0 4 0 6 2 8l2 2H6l2-2Z" /><path d="M13 26a3.2 3.2 0 0 0 6 0M16 4V2M25 7l2-2" /><circle cx="25" cy="8" r="1.3" className="betrayals-dock__glyph-star" /></svg>
  }
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 4 19 8l5-1 .6 5 4.4 2-2 4.5 2 4.5-4.4 2-.6 5-5-1-3 4-4-3-5 1-.6-5-4.4-2 2-4.5-2-4.5 4.4-2 .6-5 5 1 3-4Z" transform="translate(0 -3)" /><circle cx="16" cy="16" r="4.5" /><path d="M16 11V8M21 16h3" /></svg>
}

function DockButton({ target, label, faceLabel = label, action }: {
  target: DockTarget
  label: string
  faceLabel?: string
  action: DockAction
}) {
  const { onClick, active, disabled, count = 0 } = action
  return (
    <button
      className="betrayals-dock__side"
      type="button"
      onClick={onClick}
      aria-label={count > 0 ? `${label} (${count})` : label}
      aria-expanded={active}
      aria-haspopup={target !== 'home' ? 'dialog' : undefined}
      disabled={disabled}
      data-target={target}
    >
      <span className="betrayals-dock__icon-frame" aria-hidden="true">
        <Glyph target={target} />
        {count > 0 && <span className="betrayals-dock__count">{Math.min(count, 99)}</span>}
      </span>
      <span className="betrayals-dock__label" aria-hidden="true">{faceLabel}</span>
    </button>
  )
}

export function BetrayalsDock({ play, home, social, incoming, settings, utility }: BetrayalsDockProps) {
  return (
    <nav className="betrayals-dock" aria-label="Season actions">
      {utility && <div className="betrayals-dock__utility">{utility}</div>}
      <div className="betrayals-dock__shell">
        {home && <DockButton target="home" label="Home" action={home} />}
        {social && <DockButton target="social" label="Social" action={social} />}
        {play && (
          <button className="betrayals-dock__play" type="button" onClick={play.onClick} aria-label={play.label} title={play.label} disabled={play.disabled}>
            <span className="betrayals-dock__play-glyph" aria-hidden="true"><i /><i /></span>
            <span className="betrayals-dock__label" aria-hidden="true">{play.faceLabel ?? 'Play'}</span>
          </button>
        )}
        {incoming && <DockButton target="incoming" label="Inbox" action={incoming} />}
        {settings && <DockButton target="settings" label="Settings" action={settings} />}
      </div>
    </nav>
  )
}
