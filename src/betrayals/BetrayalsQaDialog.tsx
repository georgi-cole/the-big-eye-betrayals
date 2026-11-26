import { useLayoutEffect, useRef, useState } from 'react'
import { CASTLE_ROLE_CATALOG, castleRoleFor } from './castleRoles'
import type { QaAdvance } from './castleQa'
import type { Run } from './run'
import { phaseLabel } from './seasonPhases'
import './ceremonyActions.css'

export function BetrayalsQaDialog({
  run,
  onClose,
  onSimulate,
}: {
  run: Run
  onClose: () => void
  onSimulate: (advance: QaAdvance) => Promise<string>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const role = castleRoleFor(run, run.humanId)

  useLayoutEffect(() => {
    const element = dialog.current
    if (!element) return
    element.showModal?.()
    if (!element.open) element.setAttribute('open', '')
    return () => element.close?.()
  }, [])

  async function simulate(advance: QaAdvance) {
    setBusy(true)
    try {
      setStatus(await onSimulate(advance))
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog
      ref={dialog}
      className="betrayals-utility-dialog betrayals-leave"
      aria-labelledby="betrayals-qa-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <div className="betrayals-utility-dialog__inner">
        <header className="betrayals-utility-dialog__header">
          <h2 id="betrayals-qa-title">Castle QA</h2>
          <button
            type="button"
            className="betrayals-utility-dialog__close"
            aria-label="Close QA"
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <p>
          Day {run.day} · {phaseLabel[run.phase]} · {run.seats.filter(({ exit }) => !exit).length}{' '}
          guests left
        </p>
        <p>
          Your role is{' '}
          {role
            ? CASTLE_ROLE_CATALOG[role.roleId].title
            : run.private.betrayers.includes(run.humanId)
              ? 'Betrayer'
              : 'Loyal'}
          .
        </p>
        <details>
          <summary>Inspect cast roles</summary>
          <ul>
            {run.seats.map(({ id, name, exit }) => {
              const card = castleRoleFor(run, id)
              const faction = run.private.betrayers.includes(id) ? 'Betrayer' : 'Loyal'
              return (
                <li key={id}>
                  {name} · {faction}
                  {card ? ` · ${CASTLE_ROLE_CATALOG[card.roleId].title}` : ''}
                  {exit ? ` · Left on Day ${exit.day}` : ''}
                </li>
              )
            })}
          </ul>
        </details>
        <p>Simulation saves this season’s progress. Optional player powers are skipped.</p>
        {status && <p role="status">{status}</p>}
        <div
          className="betrayals-leave__actions betrayals-leave__actions--stacked"
          aria-busy={busy || undefined}
        >
          <button
            type="button"
            className="betrayals-ceremony-action--primary"
            disabled={busy || Boolean(run.result)}
            onClick={() => void simulate('day')}
          >
            Simulate full day
          </button>
          <button
            type="button"
            className="betrayals-ceremony-action--secondary"
            disabled={busy || Boolean(run.result)}
            onClick={() => void simulate('phase')}
          >
            Simulate next phase
          </button>
          <button
            type="button"
            className="betrayals-ceremony-action--secondary"
            disabled={busy || Boolean(run.result)}
            onClick={() => void simulate('season')}
          >
            Simulate to season result
          </button>
        </div>
      </div>
    </dialog>
  )
}
