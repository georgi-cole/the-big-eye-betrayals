import { useEffect, useRef } from 'react'
import { usePacedReveal } from '../hooks/usePacedReveal'
import type { Run, Seat, TableCount } from './run'
import { MAX_TABLE_ROUNDS } from './run'
import { tableLeaderboard, tableSwayResponse } from './table'
import './RoundTableFeed.css'

type RoundTableFeedProps = {
  run: Run
  reducedMotion?: boolean
  onCountComplete?: () => void
}

function CountFeed({
  count,
  seats,
  reducedMotion,
  onComplete,
}: {
  count: TableCount
  seats: readonly Seat[]
  reducedMotion?: boolean
  onComplete?: () => void
}) {
  const { ballots, round, tiedIds } = count
  const { visible, revealAll } = usePacedReveal(ballots.length, {
    firstDelay: 600,
    stepDelay: 280,
    immediate: reducedMotion,
  })
  const complete = visible >= ballots.length
  const notified = useRef(false)
  const { rows, hiddenTie } = tableLeaderboard(ballots.slice(0, visible))

  useEffect(() => {
    if (!complete || notified.current) return
    notified.current = true
    onComplete?.()
  }, [complete, onComplete])

  return (
    <section
      className="round-table-feed round-table-feed--count"
      aria-label="Round Table vote count"
    >
      <div className="round-table-feed__count-heading">
        <strong>Round {round}</strong>
        <span>
          {visible} / {ballots.length} counted
        </span>
      </div>
      {rows.length > 0 && (
        <ol className="round-table-feed__leaders" aria-label="Current vote leaders">
          {rows.map(({ id, votes }) => (
            <li key={id}>
              <span>{seats.find((seat) => seat.id === id)?.name ?? 'Contestant'}</span>
              <strong>{votes}</strong>
            </li>
          ))}
        </ol>
      )}
      {hiddenTie && (
        <p className="round-table-feed__tie">
          {hiddenTie.size}-way tie{' '}
          {hiddenTie.position === 1 ? 'for the lead' : 'below the displayed leaders'}
        </p>
      )}
      {complete ? (
        <p className="round-table-feed__call" role="status">
          {tiedIds.length === 0
            ? 'The count is complete.'
            : round >= MAX_TABLE_ROUNDS
              ? 'The vote remains tied. The castle will draw a name from the tied contestants.'
              : `Only the ${tiedIds.length} tied leaders can receive votes in the next round.`}
        </p>
      ) : (
        <button type="button" className="round-table-feed__utility" onClick={revealAll}>
          Show full count
        </button>
      )}
    </section>
  )
}

export function RoundTableFeed(props: RoundTableFeedProps) {
  const { run, reducedMotion, onCountComplete } = props
  const immediate =
    reducedMotion ||
    (typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  if (run.tableCount) {
    return (
      <CountFeed
        key={`${run.id}:${run.day}:${run.phase}:${run.tableCount.round}`}
        count={run.tableCount}
        seats={run.seats}
        reducedMotion={immediate}
        onComplete={onCountComplete}
      />
    )
  }
  const response = tableSwayResponse(run)
  const challenged = run.seats.find(({ id }) => id === run.tableSway?.targetId)
  return response ? (
    <p className="round-table-feed__call" role="status">
      {challenged && <strong>You challenged {challenged.name}. </strong>}
      {response}
    </p>
  ) : null
}
