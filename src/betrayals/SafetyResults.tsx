import { useEffect, useRef } from 'react'
import { formatTiltLabyrinthScore } from '../components/TiltLabyrinthComp/formatTiltLabyrinthScore'
import type { safetyResultsFor } from './challenges'
import './safety-results.css'

const score = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })

export function SafetyResults({
  rows,
  publicResults,
  gameKey,
  onComplete,
}: {
  rows: ReturnType<typeof safetyResultsFor>
  publicResults: boolean
  gameKey?: string
  onComplete: () => void
}) {
  const timed = gameKey === 'tiltLabyrinth'
  const formatScore = timed ? formatTiltLabyrinthScore : score.format
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
        <p>
          {publicResults
            ? 'These standings show who won the Night Shields. Players can pass them on privately before the first vote.'
            : 'Night Shields can be passed on in Social before the first vote.'}
        </p>
        {!publicResults && rows.some((row) => row.clairvoyant) && (
          <p>Your Clairvoyant reading privately reveals the shield winners.</p>
        )}
      </header>
      <div
        className="betrayals-safety-results__scores"
        role="region"
        aria-label="Standings"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th scope="col">Contestant</th>
              <th scope="col">Place</th>
              <th scope="col">{timed ? 'Adjusted time' : 'Score'}</th>
              <th scope="col">Shield</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.place} data-own={row.own || undefined}>
                <th scope="row">{row.name ?? <span aria-label="Hidden">✦✦✦</span>}</th>
                <td>{row.forfeited ? '—' : row.place}</td>
                <td>{row.forfeited ? 'Forfeit' : formatScore(row.score)}</td>
                <td aria-label={row.shield === undefined ? 'Shield result hidden' : undefined}>
                  {row.shield ? 'Won' : '—'}
                </td>
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
