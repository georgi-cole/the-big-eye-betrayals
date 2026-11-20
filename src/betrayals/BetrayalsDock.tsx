import type { ReactNode } from 'react'
import './BetrayalsDock.css'

const assetRoot = `${import.meta.env.BASE_URL}assets/`
const icons = {
  social: 'clean_glassy_dock/fab_icon_social_clean.svg',
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
  social?: DockAction
  roster?: DockAction
  settings?: DockAction
  utility?: ReactNode
}

function DockButton({
  target,
  label,
  action,
}: {
  target: keyof typeof icons
  label: string
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
      disabled={disabled}
    >
      <span className="betrayals-dock__icon-frame" aria-hidden="true">
        <img src={assetRoot + icons[target]} alt="" draggable={false} />
        {count > 0 && <span className="betrayals-dock__count">{Math.min(count, 99)}</span>}
      </span>
      <span aria-hidden="true">{label}</span>
    </button>
  )
}

export function BetrayalsDock({ play, social, roster, settings, utility }: BetrayalsDockProps) {
  return (
    <nav className="betrayals-dock" aria-label="Season actions">
      {utility && <div className="betrayals-dock__utility">{utility}</div>}
      <div className="betrayals-dock__shell">
        <div className="betrayals-dock__side-bank">
          {social && <DockButton target="social" label="Social" action={social} />}
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
            <span aria-hidden="true">{play.faceLabel ?? 'Play'}</span>
          </button>
        )}
        <div className="betrayals-dock__side-bank">
          {roster && <DockButton target="roster" label="Roster" action={roster} />}
          {settings && <DockButton target="settings" label="Settings" action={settings} />}
        </div>
      </div>
    </nav>
  )
}
