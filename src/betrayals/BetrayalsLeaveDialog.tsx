import { useEffect, useRef, useState } from 'react'

export function BetrayalsLeaveDialog({
  onClose,
  onLeave,
  motion,
}: {
  onClose: () => void
  onLeave: (abandon: boolean) => Promise<string | undefined>
  motion?: 'reduced'
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const save = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState(false)
  const [issue, setIssue] = useState<string>()

  useEffect(() => {
    const node = dialog.current
    if (!node) return
    node.showModal()
    save.current?.focus()
    return () => node.close()
  }, [])

  async function leave(abandon: boolean) {
    setBusy(true)
    setIssue(await onLeave(abandon))
    setBusy(false)
  }

  return (
    <dialog
      ref={dialog}
      className="betrayals-utility-dialog betrayals-leave"
      aria-labelledby="betrayals-leave-title"
      aria-describedby="betrayals-leave-description"
      data-betrayals-motion={motion}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
      onClick={(event) => {
        if (!busy && event.target === event.currentTarget) onClose()
      }}
    >
      <div className="betrayals-utility-dialog__inner">
        <header className="betrayals-utility-dialog__header">
          <h2 id="betrayals-leave-title">Leave the castle?</h2>
          <button
            type="button"
            className="betrayals-utility-dialog__close"
            aria-label="Stay in the castle"
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <p id="betrayals-leave-description">
          Save to pick up where you left off. Abandoning ends this season and sends you back to Day
          1 in a new season.
        </p>
        {issue && <p role="alert">{issue}</p>}
        <div className="betrayals-leave__actions betrayals-leave__actions--stacked">
          <button
            ref={save}
            type="button"
            className="betrayals-primary"
            disabled={busy}
            onClick={() => void leave(false)}
          >
            Save for later
          </button>
          <button
            type="button"
            className="betrayals-inline-action"
            disabled={busy}
            onClick={() => void leave(true)}
          >
            Abandon the castle
          </button>
        </div>
      </div>
    </dialog>
  )
}
