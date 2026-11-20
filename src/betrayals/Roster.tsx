import type { viewFor } from './run'
import './roster.css'

type CastView = ReturnType<typeof viewFor>
type Props = {
  view: CastView
  selectedId?: string
  humanId: string
  fullCast?: boolean
  onSelect: (id: string) => void
}

export function Roster({ view, selectedId, fullCast, humanId, onSelect }: Props) {
  const seats = fullCast ? view.seats : view.seats.filter((seat) => !seat.exit)
  return (
    <ul className="betrayals-roster" aria-label={fullCast ? 'Full cast' : 'Active contestants'}>
      {seats.map((seat) => {
        const hasNightShield = seat.id === humanId && view.hasNightShield
        const status = [
          seat.fullImmunity && 'Full Immunity',
          seat.publicShield && 'Public Shield',
          hasNightShield && 'Night Shield',
          seat.exit?.cause === 'night' && 'Eliminated at Night',
          seat.exit?.cause === 'banished' && 'Banished',
          seat.exit?.revealedRole,
        ].filter(Boolean)
        const label = [seat.name, ...status].join(', ')
        return (
          <li key={seat.id}>
            <button
              type="button"
              className="betrayals-roster__seat"
              aria-label={label}
              aria-pressed={seat.id === selectedId}
              data-departed={seat.exit ? 'true' : undefined}
              onClick={() => onSelect(seat.id)}
            >
              {seat.portrait ? (
                <img src={seat.portrait} alt="" decoding="async" />
              ) : (
                <span aria-hidden="true" className="betrayals-roster__initial">
                  {seat.name[0]}
                </span>
              )}
              <span className="betrayals-roster__name">{seat.name}</span>
              {(seat.fullImmunity || seat.publicShield || hasNightShield) && (
                <span className="betrayals-roster__protections" aria-hidden="true">
                  {seat.fullImmunity && <span title="Full Immunity">◆</span>}
                  {seat.publicShield && <span title="Public Shield">◉</span>}
                  {hasNightShield && <span title="Night Shield">☾</span>}
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
