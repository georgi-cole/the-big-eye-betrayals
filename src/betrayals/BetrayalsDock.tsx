import type { ReactNode } from 'react'
import './BetrayalsDock.css'

type DockTarget = 'home' | 'social' | 'incoming' | 'settings'

type DockAction = {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  count?: number
  unread?: number
  attentionKey?: string
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

function Glyph({ target }: { target: DockTarget | 'play' }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      {target === 'home' && (
        <>
          <path d="M7 27V15c0-6 4-9 9-12 5 3 9 6 9 12v12M4 27h24M12 26V15c0-3 2-5 4-7 2 2 4 4 4 7v11" />
          <path d="m16 15 2 3-2 3-2-3z" className="betrayals-dock__metal-inlay" />
        </>
      )}
      {target === 'social' && (
        <>
          <path d="M4 25c4-1 5-4 5-8a5 5 0 0 1 10 0c0 4 1 7 5 8H4Zm14-17a5 5 0 0 1 7 5c0 4 1 7 4 8h-6" />
          <path d="m14 15 2 2-2 2-2-2zM22 5v5m-2.5-2.5h5" className="betrayals-dock__metal-inlay" />
        </>
      )}
      {target === 'incoming' && (
        <>
          <path d="M6 7h17v4l3 3v10H9V12C9 9 8 7 6 7H4v5h5m3 1 6 4 6-4m-11 8 4-3m7 3-4-3" />
          <path d="m18 16 2 2-2 2-2-2z" className="betrayals-dock__metal-inlay" />
        </>
      )}
      {target === 'settings' && (
        <>
          <path d="m16 3 4 4 5 1 1 5 3 3-3 3-1 5-5 1-4 4-4-4-5-1-1-5-3-3 3-3 1-5 5-1z" />
          <circle cx="16" cy="16" r="6" />
          <path d="m16 11 2 5-2 5-2-5z" className="betrayals-dock__metal-inlay" />
        </>
      )}
      {target === 'play' && (
        <>
          <path d="M12 4 6 10v12l6 6m8-24 6 6v12l-6 6M16 3v2m0 22v2" />
          <path d="m13 10 9 6-9 6z" className="betrayals-dock__metal-inlay" />
        </>
      )}
    </svg>
  )
}

function DockButton({
  target,
  label,
  faceLabel = label,
  action,
}: {
  target: DockTarget
  label: string
  faceLabel?: string
  action: DockAction
}) {
  const { onClick, active, disabled, count = 0, unread = 0, attentionKey } = action

  return (
    <button
      className="betrayals-dock__side"
      type="button"
      onClick={onClick}
      aria-label={count > 0 ? `${label} (${count})` : label}
      aria-description={unread > 0 ? `${unread} unread` : undefined}
      aria-expanded={active}
      aria-haspopup={target !== 'home' ? 'dialog' : undefined}
      disabled={disabled}
      data-target={target}
      data-unread={unread > 0 || undefined}
    >
      {unread > 0 && (
        <span key={attentionKey} className="betrayals-dock__spotlight" aria-hidden="true" />
      )}
      <span className="betrayals-dock__icon-frame" aria-hidden="true">
        <Glyph target={target} />
        {count > 0 && <span className="betrayals-dock__count">{Math.min(count, 99)}</span>}
      </span>
      <span className="betrayals-dock__label" aria-hidden="true">
        {faceLabel}
      </span>
    </button>
  )
}

export function BetrayalsDock({
  play,
  home,
  social,
  incoming,
  settings,
  utility,
}: BetrayalsDockProps) {
  return (
    <nav className="betrayals-dock" aria-label="Season actions">
      {utility && <div className="betrayals-dock__utility">{utility}</div>}
      <div className="betrayals-dock__shell">
        {home && <DockButton target="home" label="Home" action={home} />}
        {social && <DockButton target="social" label="Social" action={social} />}
        {play && (
          <button
            className="betrayals-dock__play"
            type="button"
            onClick={play.onClick}
            aria-label={play.label}
            title={play.label}
            disabled={play.disabled}
          >
            <span className="betrayals-dock__play-glyph">
              <Glyph target="play" />
            </span>
            <span className="betrayals-dock__label" aria-hidden="true">
              {play.faceLabel ?? 'Play'}
            </span>
          </button>
        )}
        {incoming && (
          <DockButton target="incoming" label="Inbox" faceLabel="Inbox" action={incoming} />
        )}
        {settings && <DockButton target="settings" label="Settings" action={settings} />}
      </div>
    </nav>
  )
}
