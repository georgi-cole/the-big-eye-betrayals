import type { ReactNode } from 'react'
import './BetrayalsBroadcast.css'

export interface BetrayalsBroadcastProps {
  phase: string
  title: string
  message?: ReactNode
  detail?: ReactNode
  cueKey?: string | number
  mode?: 'default' | 'ceremony' | 'night' | 'daybreak'
  art?: string
}

export function BetrayalsBroadcast({
  phase,
  title,
  message,
  detail,
  cueKey,
  mode = 'default',
  art,
}: BetrayalsBroadcastProps) {
  return (
    <section className="betrayals-broadcast" data-mode={mode} aria-label="Faux TV">
      <div className="betrayals-broadcast__glass">
        {art && <img className="betrayals-broadcast__art" src={art} alt="" aria-hidden="true" />}
        <div className="betrayals-broadcast__grain" aria-hidden="true" />
        <div className="betrayals-broadcast__readout" aria-live="polite" aria-atomic="true">
          <div className="betrayals-broadcast__transmission" key={cueKey ?? title}>
            <header className="betrayals-broadcast__signal">
              <span className="betrayals-broadcast__lamp" aria-hidden="true" />
              {phase !== title && <span>{phase}</span>}
            </header>
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
