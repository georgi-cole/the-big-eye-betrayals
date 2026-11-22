import { useEffect, useRef } from 'react'

import type { GameLogEntry } from './gameLog'

export function BetrayalsGameLog({
  entries,
  onClose,
}: {
  entries: readonly GameLogEntry[]
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (typeof element.showModal === 'function') {
      element.showModal()
      return () => element.close()
    }
    element.setAttribute('open', '')
    return () => element.removeAttribute('open')
  }, [])

  return (
    <dialog
      ref={dialog}
      className="betrayals-log"
      aria-labelledby="betrayals-log-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="betrayals-log__sheet">
        <header className="betrayals-log__header">
          <h2 id="betrayals-log-title">Game Log</h2>
          <button
            type="button"
            className="betrayals-log__close"
            aria-label="Close game log"
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m7 7 10 10M17 7 7 17" />
            </svg>
          </button>
        </header>
        {entries.length ? (
          <ol className="betrayals-log__entries">
            {entries.map((entry, index) => (
              <li key={entry.day + ':' + index} data-kind={entry.kind}>
                {entry.day !== entries[index - 1]?.day && (
                  <span className="betrayals-log__day">Day {entry.day}</span>
                )}
                <p>{entry.text}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="betrayals-log__empty">No events yet.</p>
        )}
      </div>
    </dialog>
  )
}
