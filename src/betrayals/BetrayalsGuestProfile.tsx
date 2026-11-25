import '../components/RealityLedger/RealityLedger.css'
import type { GuestProfile } from './pulseView'
import './betrayals-pulse.css'

export function BetrayalsGuestProfile({
  profile,
  locked = false,
  onUnlock,
}: {
  profile: GuestProfile
  locked?: boolean
  onUnlock?: () => void
}) {
  return (
    <details className="sp2-focus__full-read guest-profile">
      <summary>Profile traits</summary>
      <div className="guest-profile__body">
        <section className="guest-profile__metrics" aria-label={`${profile.name} profile traits`}>
          {profile.metrics
            .filter((metric) => metric.label !== 'Openness')
            .map(({ label, value, level }) => (
              <div className="guest-profile__metric" key={label} data-locked={locked || undefined}>
                <div className="guest-profile__metric-row">
                  <span>{label}</span>
                  <span
                    className={
                      locked
                        ? 'reality-ledger__relationship-meter guest-profile__locked-meter'
                        : 'reality-ledger__relationship-meter'
                    }
                    role={!locked && level !== undefined ? 'meter' : undefined}
                    aria-hidden={locked || level === undefined ? true : undefined}
                    aria-label={locked ? undefined : label}
                    aria-valuemin={locked ? undefined : 0}
                    aria-valuemax={locked ? undefined : 100}
                    aria-valuenow={locked ? undefined : level}
                    aria-valuetext={locked ? undefined : value}
                  >
                    {!locked && level !== undefined && (
                      <span
                        className="reality-ledger__relationship-meter-fill"
                        style={{ width: `${level}%` }}
                      />
                    )}
                  </span>
                  {locked ? (
                    <span
                      className="guest-profile__lock-icon"
                      role="img"
                      aria-label={`${label}, locked for Reality Mode or VIP`}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M7 10V7.5a5 5 0 0 1 10 0V10" />
                        <rect x="4.5" y="10" width="15" height="11" rx="2.6" />
                        <path d="M8.5 15.5s1.35-1.55 3.5-1.55 3.5 1.55 3.5 1.55-1.35 1.55-3.5 1.55-3.5-1.55-3.5-1.55Z" />
                        <circle cx="12" cy="15.5" r="0.7" />
                      </svg>
                    </span>
                  ) : (
                    <small>{value ?? 'Too little to tell'}</small>
                  )}
                </div>
              </div>
            ))}
          {locked ? (
            <small className="guest-profile__locked-note">
              {onUnlock && (
                <button type="button" onClick={onUnlock}>
                  Unlock with Reality Mode or VIP
                </button>
              )}
              {!onUnlock && 'Available with Reality Mode or VIP'}
            </small>
          ) : (
            <small>Based on what you’ve seen so far.</small>
          )}
        </section>
      </div>
    </details>
  )
}
