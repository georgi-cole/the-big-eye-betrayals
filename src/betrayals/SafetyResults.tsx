import { useEffect, useRef } from 'react'
import type { safetyResultsFor } from './challenges'
import './safety-results.css'

const score = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })

export function SafetyResults({
  rows,
  onComplete,
}: {
  rows: ReturnType<typeof safetyResultsFor>
  onComplete: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (typeof dialog.showModal === 'function') {
      dialog.showModal()
      return () => dialog.close()
    }
    dialog.setAttribute('open', '')
  }, [])

  return (
    <dialog
      ref={ref}
      className="betrayals-safety-results"
      aria-labelledby="betrayals-safety-results-title"
      onCancel={(event) => {
        event.preventDefault()
        onComplete()
      }}
    >
      <header>
        <h2 id="betrayals-safety-results-title">Safety Challenge results</h2>
        <p>Scores and placements are public. Most contestant names are hidden.</p>
      </header>
      <div className="betrayals-safety-results__scores" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col">Contestant</th>
              <th scope="col">Place</th>
              <th scope="col">Score</th>
              <th scope="col">Shield</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.place} data-own={row.own || undefined}>
                <th scope="row">{row.name ?? <span aria-label="Hidden">✦✦✦</span>}</th>
                <td>{row.forfeited ? '—' : row.place}</td>
                <td>{row.forfeited ? 'Forfeit' : score.format(row.score)}</td>
                <td>{row.shield ? 'Won' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer>
        <button className="betrayals-primary" type="button" onClick={onComplete}>
          Continue
        </button>
      </footer>
    </dialog>
  )
}
