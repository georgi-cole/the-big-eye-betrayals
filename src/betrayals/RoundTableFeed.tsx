import { useEffect, useRef, useState } from 'react'
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

const pageSize = 5

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
  const [page, setPage] = useState(0)
  const revealed = ballots.slice(0, visible)
  const { rows: leaders, hiddenTie } = tableLeaderboard(revealed, pageSize)
  const remaining = complete ? tableLeaderboard(revealed, Infinity).rows.slice(leaders.length) : []
  const lastPage = Math.ceil(remaining.length / pageSize)
  const rows = page === 0 ? leaders : remaining.slice((page - 1) * pageSize, page * pageSize)
  const lastTarget = visible > 0 && !complete ? ballots[visible - 1].targetId : undefined

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
        {!complete && (
          <button type="button" className="round-table-feed__utility" onClick={revealAll}>
            Show full count
          </button>
        )}
      </div>
      <div className="round-table-feed__lineup">
        {rows.length > 0 && (
          <ol
            className="round-table-feed__leaders"
            aria-label={page === 0 ? 'Current vote leaders' : 'More vote totals'}
          >
            {rows.map(({ id, votes }) => {
              const seat = seats.find((guest) => guest.id === id)
              const name = seat?.name ?? 'Contestant'
              return (
                <li key={id} data-counted={id === lastTarget || undefined}>
                  <span className="round-table-feed__portrait" aria-hidden="true">
                    {seat?.portrait ? <img src={seat.portrait} alt="" /> : name.slice(0, 1)}
                  </span>
                  <span className="round-table-feed__name" title={name}>
                    {name}
                  </span>
                  <strong key={votes} aria-label={`${votes} ${votes === 1 ? 'vote' : 'votes'}`}>
                    {votes}
                  </strong>
                </li>
              )
            })}
          </ol>
        )}
        {!rows.length && hiddenTie && (
          <p className="round-table-feed__tie">{hiddenTie.size}-way tie for the lead</p>
        )}
      </div>
      <div className="round-table-feed__footer">
        <p className="round-table-feed__summary" role="status">
          {complete
            ? tiedIds.length === 0
              ? 'The count is complete.'
              : round >= MAX_TABLE_ROUNDS
                ? `Draw among ${tiedIds.length} tied guests`
                : `Runoff among ${tiedIds.length} tied guests`
            : hiddenTie && rows.length
              ? `${hiddenTie.size} guests tied below the leaders`
              : ''}
        </p>
        {lastPage > 0 && (
          <div className="round-table-feed__pages" role="group" aria-label="Browse vote totals">
            <button
              type="button"
              aria-label="Previous vote totals"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              ‹
            </button>
            <span aria-live="polite">
              {page + 1} / {lastPage + 1}
            </span>
            <button
              type="button"
              aria-label="Next vote totals"
              disabled={page === lastPage}
              onClick={() => setPage(page + 1)}
            >
              ›
            </button>
          </div>
        )}
      </div>
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
