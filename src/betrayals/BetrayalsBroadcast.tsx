import type { ReactNode } from 'react'
import './BetrayalsBroadcast.css'

export interface BetrayalsBroadcastProps {
  title: string
  message?: ReactNode
  detail?: ReactNode
  cueKey?: string | number
  mode?: 'default' | 'ceremony' | 'night' | 'daybreak' | 'immunity' | 'safety' | 'finale'
  art?: string
  opener?: ReactNode
  interactive?: boolean
}

export function BetrayalsBroadcast({
  title,
  message,
  detail,
  cueKey,
  mode = 'default',
  art,
  opener,
  interactive = false,
}: BetrayalsBroadcastProps) {
  return (
    <section
      className="betrayals-broadcast"
      data-mode={mode}
      data-interactive={interactive || undefined}
      aria-label="Faux TV"
    >
      <div className="betrayals-broadcast__glass">
        {art && <img key={art} className="betrayals-broadcast__art" src={art} alt="" />}
        <div className="betrayals-broadcast__grain" aria-hidden="true" />
        <span className="betrayals-broadcast__lamp" aria-hidden="true" />
        {opener}
        <div
          key={cueKey ?? title}
          className="betrayals-broadcast__readout"
          aria-live={interactive ? undefined : 'polite'}
          aria-atomic={interactive ? undefined : true}
          tabIndex={0}
        >
          <div className="betrayals-broadcast__transmission">
            <h1 className="betrayals-broadcast__title">{title}</h1>
            {message && <div className="betrayals-broadcast__message">{message}</div>}
            {detail && <div className="betrayals-broadcast__detail">{detail}</div>}
          </div>
        </div>
      </div>
      <div className="betrayals-broadcast__vents" aria-hidden="true" />
    </section>
  )
}
