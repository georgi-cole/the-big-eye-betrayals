import type { viewFor } from './run'
import './roster.css'

type CastView = ReturnType<typeof viewFor>
type Props = {
  view: CastView
  selectedId?: string
  humanId: string
  selectableIds?: readonly string[]
  onSelect: (id: string) => void
}

export function Roster({ view, selectedId, humanId, selectableIds, onSelect }: Props) {
  return (
    <ul className="betrayals-roster" aria-label="Contestant roster">
      {view.seats.map((seat) => {
        const hasNightShield = !seat.exit && seat.id === humanId && view.hasNightShield
        const selectable = !selectableIds || selectableIds.includes(seat.id)
        const confirmedRole = seat.exit?.revealedRole ?? seat.finaleRole
        const roleLabel = confirmedRole && (confirmedRole === 'betrayer' ? 'Betrayer' : 'Loyal')
        const exitLabel =
          seat.exit && (seat.exit.cause === 'banished' ? 'Banished' : 'Eliminated at Night')
        const status = [
          seat.fullImmunity && 'Full Immunity',
          seat.publicShield && 'Public Shield',
          hasNightShield && 'Night Shield',
          exitLabel,
          roleLabel,
        ].filter(Boolean)
        const label = [seat.name, ...status].join(', ')
        return (
          <li key={seat.id}>
            <button
              type="button"
              className="betrayals-roster__seat"
              aria-label={label}
              aria-pressed={seat.id === selectedId}
              aria-disabled={!selectable || undefined}
              data-seat-id={seat.id}
              data-exit={seat.exit?.cause}
              data-role={confirmedRole}
              onClick={selectable ? () => onSelect(seat.id) : undefined}
            >
              <span className="betrayals-roster__portrait" aria-hidden="true">
                {seat.portrait ? (
                  <img src={seat.portrait} alt="" decoding="async" />
                ) : (
                  <span className="betrayals-roster__initial">{seat.name[0]}</span>
                )}
                {seat.exit && (
                  <span className="betrayals-roster__seal" title={exitLabel || undefined} />
                )}
              </span>
              <span className="betrayals-roster__name">{seat.name}</span>
              {confirmedRole && (
                <span
                  className="betrayals-roster__role"
                  aria-hidden="true"
                  title={roleLabel || undefined}
                >
                  {confirmedRole === 'betrayer' ? '✦' : '◇'}
                </span>
              )}
              {(seat.fullImmunity || seat.publicShield || hasNightShield) && (
                <span className="betrayals-roster__protections" aria-hidden="true">
                  {seat.fullImmunity && (
                    <span title="Full Immunity" data-protection="immunity">
                      ◆
                    </span>
                  )}
                  {seat.publicShield && (
                    <span title="Public Shield" data-protection="public">
                      ◉
                    </span>
                  )}
                  {hasNightShield && (
                    <span title="Night Shield" data-protection="night">
                      ☾
                    </span>
                  )}
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
