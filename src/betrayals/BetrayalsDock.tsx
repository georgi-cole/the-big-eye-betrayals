import type { ReactNode } from 'react'
import './BetrayalsDock.css'

const assetRoot = `${import.meta.env.BASE_URL}assets/`
const icons = {
  home: 'updated_nav_fab_bar/home_approved_final.svg',
  social: 'clean_glassy_dock/fab_icon_social_clean.svg',
  incoming: 'clean_glassy_dock/fab_icon_inbox_clean.svg',
  roster: 'updated_nav_fab_bar/profile_approved_final.svg',
  settings: 'updated_nav_fab_bar/settings_approved_final.svg',
} as const

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
  roster?: DockAction
  settings?: DockAction
  utility?: ReactNode
}

function DockButton({
  target,
  label,
  faceLabel = label,
  action,
}: {
  target: keyof typeof icons
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
      aria-haspopup={target !== 'home' && target !== 'roster' ? 'dialog' : undefined}
      disabled={disabled}
      data-target={target}
    >
      <span className="betrayals-dock__icon-frame" aria-hidden="true">
        <img src={assetRoot + icons[target]} alt="" draggable={false} />
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
  roster,
  settings,
  utility,
}: BetrayalsDockProps) {
  return (
    <nav className="betrayals-dock" aria-label="Season actions">
      {utility && <div className="betrayals-dock__utility">{utility}</div>}
      <div className="betrayals-dock__shell" data-play={Boolean(play)}>
        <div className="betrayals-dock__wing">
          {social && <DockButton target="social" label="Social" action={social} />}
          {incoming && (
            <DockButton
              target="incoming"
              label="Incoming requests"
              faceLabel="Inbox"
              action={incoming}
            />
          )}
        </div>
        {play && (
          <button
            className="betrayals-dock__play"
            type="button"
            onClick={play.onClick}
            aria-label={play.label}
            title={play.label}
            disabled={play.disabled}
          >
            <span className="betrayals-dock__play-glyph" aria-hidden="true" />
            <span className="betrayals-dock__label" aria-hidden="true">
              {play.faceLabel ?? 'Play'}
            </span>
          </button>
        )}
        <div className="betrayals-dock__wing">
          {home && <DockButton target="home" label="Home" action={home} />}
          {roster && <DockButton target="roster" label="Roster" action={roster} />}
          {settings && <DockButton target="settings" label="Settings" action={settings} />}
        </div>
      </div>
    </nav>
  )
}
