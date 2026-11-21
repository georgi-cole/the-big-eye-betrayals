import { statusBadgeImageSrc } from '../utils/statusBadges'
import houseguestGridStyles from '../components/HouseguestGrid/HouseguestGrid.module.css'
import type { viewFor } from './run'
import './roster.css'
import './sleep-mask.css'

type CastView = ReturnType<typeof viewFor>
type Props = {
  view: CastView
  selectedId?: string
  humanId: string
  sleeping?: boolean
  selectableIds?: readonly string[]
  onSelect: (id: string) => void
}

export function Roster({ view, selectedId, humanId, sleeping, selectableIds, onSelect }: Props) {
  return (
    <ul className="betrayals-roster" aria-label="Contestant roster">
      {view.seats.map((seat) => {
        const asleep = sleeping && !seat.exit
        const hasNightShield = !seat.exit && view.knownNightShieldIds.includes(seat.id)
        const selectable = !selectableIds || selectableIds.includes(seat.id)
        const confirmedRole = seat.exit?.revealedRole ?? seat.finaleRole
        const roleLabel = confirmedRole && (confirmedRole === 'betrayer' ? 'Betrayer' : 'Loyal')
        const exitLabel =
          seat.exit && (seat.exit.cause === 'banished' ? 'Banished' : 'Eliminated at Night')
        const status = [
          seat.fullImmunity && 'Full Immunity',
          seat.publicShield && 'Public Shield',
          hasNightShield && 'Night Shield',
          asleep && 'Asleep',
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
              data-you={seat.id === humanId || undefined}
              data-exit={seat.exit?.cause}
              data-role={confirmedRole}
              data-asleep={asleep || undefined}
              onClick={selectable ? () => onSelect(seat.id) : undefined}
            >
              <span className="betrayals-roster__portrait" aria-hidden="true">
                {seat.portrait ? (
                  <img src={seat.portrait} alt="" decoding="async" draggable={false} />
                ) : (
                  <span className="betrayals-roster__initial">{seat.name[0]}</span>
                )}
                {asleep && (
                  <span
                    className="betrayals-sleep-mask"
                    data-symbolic={!seat.portrait || undefined}
                  />
                )}
                {seat.exit && (
                  <span
                    className="betrayals-roster__seal"
                    data-seal={seat.exit.cause}
                    title={exitLabel || undefined}
                  >
                    {seat.exit.cause === 'night' ? (
                      <svg viewBox="0 0 40 40" aria-hidden="true">
                        <path
                          className="betrayals-roster__seal-face"
                          d="M20 6.5c7.2 0 12.3 5.8 12.3 13.3 0 8.1-5.5 12.7-12.3 12.7S7.7 27.9 7.7 19.8C7.7 12.3 12.8 6.5 20 6.5Z"
                        />
                        <path
                          className="betrayals-roster__seal-mark"
                          d="M10 13.5 30 26.8M13.2 9.4 8.8 14M30.8 26l-4.2 5"
                        />
                        <path
                          className="betrayals-roster__seal-drip"
                          d="M20 32v4M25.7 30.5l1.6 3"
                        />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 40 40" aria-hidden="true">
                        <path
                          className="betrayals-roster__seal-house"
                          d="m6.5 18 13.5-11 13.5 11v14.5h-27V18Z"
                        />
                        <path
                          className="betrayals-roster__seal-house"
                          d="M16 32.5V22h8v10.5M10.5 20h19"
                        />
                        <path className="betrayals-roster__seal-mark" d="m8.5 30 23-22" />
                      </svg>
                    )}
                  </span>
                )}
                <span className={houseguestGridStyles.nameOverlay}>{seat.name}</span>
              </span>
              {confirmedRole && (
                <span
                  className="betrayals-roster__role"
                  data-role-sigil={confirmedRole}
                  aria-hidden="true"
                  title={roleLabel || undefined}
                >
                  {confirmedRole === 'betrayer' ? (
                    <svg viewBox="0 0 40 32">
                      <path
                        d="M4 27c.5-7 3.3-10.5 8-10.5s7.5 3.5 8 10.5H4Zm16 0c.5-8.2 3.7-12.4 10-12.4S39.5 18.8 40 27H20Z"
                        transform="translate(-2)"
                      />
                      <path d="M6 15 10 5l7 8-1 4M23 12 30 2l7 12-2 4M14 27c.3-7.7 2.3-12 6-12s5.7 4.3 6 12" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 32 32">
                      <path
                        d="M16 3.5 19 9l6.5-1 1 6.5 5.5 3-3.5 5.5 1 6.5-6.5 1-3 5.5-5.5-3-6.5 1-1-6.5-5.5-3 3.5-5.5-1-6.5 6.5-1 3-5.5Z"
                        transform="translate(1 -3)"
                      />
                      <circle cx="16" cy="16" r="4.5" />
                    </svg>
                  )}
                </span>
              )}
              {(seat.fullImmunity || seat.publicShield || hasNightShield) && (
                <span className="betrayals-roster__protections" aria-hidden="true">
                  {seat.fullImmunity && (
                    <span title="Full Immunity" data-protection="immunity">
                      <img src={statusBadgeImageSrc('loh')} alt="" />
                    </span>
                  )}
                  {seat.publicShield && (
                    <span title="Public Shield" data-protection="public">
                      <img src={statusBadgeImageSrc('pos')} alt="" />
                    </span>
                  )}
                  {hasNightShield && (
                    <span title="Night Shield" data-protection="night">
                      <img src={statusBadgeImageSrc('pos')} alt="" />
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
