import { CastSigil } from './CastSigil'
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
  runoffIds?: readonly string[]
  onSelect: (id: string) => void
}

export function Roster({
  view,
  selectedId,
  humanId,
  sleeping,
  selectableIds,
  runoffIds,
  onSelect,
}: Props) {
  return (
    <ul className="betrayals-roster" aria-label="Contestant roster">
      {view.seats.map((seat) => {
        const cause = seat.exit?.cause
        const asleep = sleeping && !cause
        const nightShield =
          !seat.exit &&
          view.knownNightShieldIds.includes(seat.id) &&
          (seat.id !== humanId
            ? 'Won a Night Shield'
            : view.nightShieldCount > 1
              ? '2 Night Shields'
              : 'Night Shield')
        const selectable = !selectableIds || selectableIds.includes(seat.id)
        const tied = runoffIds?.includes(seat.id)
        const confirmedRole = seat.exit?.revealedRole ?? seat.finaleRole
        const roleLabel = confirmedRole && (confirmedRole === 'betrayer' ? 'Betrayer' : 'Loyal')
        const exitLabel = cause && (cause === 'banished' ? 'Banished' : 'Eliminated at Night')
        const status = [
          tied && 'Tied in the runoff',
          seat.fullImmunity && 'Full Immunity',
          seat.publicShield && 'Public Shield',
          nightShield,
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
              data-exit={cause}
              data-role={confirmedRole}
              data-asleep={asleep || undefined}
              data-runoff={runoffIds?.length ? (tied ? 'tied' : 'other') : undefined}
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
                {cause && (
                  <span
                    className="betrayals-roster__seal"
                    data-seal={cause}
                    title={exitLabel || undefined}
                  >
                    <CastSigil kind={cause} />
                  </span>
                )}
                <span className={houseguestGridStyles.nameOverlay}>{seat.name}</span>
              </span>
              {tied && (
                <span className="betrayals-roster__runoff-mark" aria-hidden="true">
                  Tied
                </span>
              )}
              {confirmedRole && (
                <span
                  className="betrayals-roster__role"
                  data-role-sigil={confirmedRole}
                  aria-hidden="true"
                  title={roleLabel || undefined}
                >
                  <CastSigil kind={confirmedRole === 'betrayer' ? 'betrayer' : 'loyal'} />
                </span>
              )}
              {(seat.fullImmunity || seat.publicShield || nightShield) && (
                <span className="betrayals-roster__protections" aria-hidden="true">
                  {seat.fullImmunity && (
                    <span title="Full Immunity" data-protection="immunity">
                      <CastSigil kind="immunity" />
                    </span>
                  )}
                  {seat.publicShield && (
                    <span title="Public Shield" data-protection="public">
                      <CastSigil kind="public" />
                    </span>
                  )}
                  {nightShield && (
                    <span title={nightShield} data-protection="night">
                      <CastSigil kind="shield-night" />
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
