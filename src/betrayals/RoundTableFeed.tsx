import { useEffect, useRef, useState } from 'react'
import { usePacedReveal } from '../hooks/usePacedReveal'
import { usePresentationReducedMotion } from '../services/presentation/usePresentationReducedMotion'
import type { Ballot, Run, Seat, TableCount } from './run'
import { MAX_TABLE_ROUNDS } from './run'
import { tableLeaderboard, tableSwayResponse } from './table'
import './RoundTableFeed.css'

type RoundTableFeedProps = {
  run: Run
  reducedMotion?: boolean
  onCountComplete?: () => void
}

const pageSize = 5
const council = import.meta.env.BASE_URL + 'assets/betrayals/council.jpg'

function BallotPortrait({ seat }: { seat?: Seat }) {
  return (
    <span className="round-table-ballot__portrait" aria-hidden="true">
      {seat?.portrait ? <img src={seat.portrait} alt="" /> : (seat?.name[0] ?? '?')}
    </span>
  )
}

function featuredBallot(ballots: readonly Ballot[], start: number, stop: number) {
  const leadersAt = (end: number) => {
    const rows = tableLeaderboard(ballots.slice(0, end), Infinity).rows
    return rows
      .filter((row) => row.votes === rows[0].votes)
      .map(({ id }) => id)
      .join(',')
  }
  for (let end = stop; end > start; end--) {
    if (leadersAt(end) !== leadersAt(end - 1)) return ballots[end - 1]
  }
  return ballots[stop - 1]
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
  const perShot = Math.ceil(ballots.length / 4)
  const shots = Math.ceil(ballots.length / Math.max(1, perShot))
  const { visible: shot, revealAll } = usePacedReveal(shots ? shots + 1 : 0, {
    firstDelay: 500,
    stepDelay: 620,
    immediate: reducedMotion,
  })
  const complete = shot > shots || !shots
  const visible = Math.min(shot * perShot, ballots.length)
  const notified = useRef(false)
  const [page, setPage] = useState(0)
  const revealed = ballots.slice(0, visible)
  const { rows: leaders, hiddenTie } = tableLeaderboard(revealed, pageSize)
  const remaining = complete ? tableLeaderboard(revealed, Infinity).rows.slice(leaders.length) : []
  const lastPage = Math.ceil(remaining.length / pageSize)
  const rows = page === 0 ? leaders : remaining.slice((page - 1) * pageSize, page * pageSize)
  const lastTarget = visible > 0 && !complete ? ballots[visible - 1].targetId : undefined

  const cast = new Map(seats.map((seat) => [seat.id, seat]))
  const ballot = visible > 0 ? featuredBallot(ballots, (shot - 1) * perShot, visible) : undefined
  const voter = ballot && cast.get(ballot.voterId)
  const nominee = ballot && cast.get(ballot.targetId)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = dialog.current
    if (complete || !element) return
    element.showModal?.()
    if (!element.open) element.setAttribute('open', '')
    return () => {
      element.close?.()
      element.removeAttribute('open')
    }
  }, [complete])

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
      {!complete && (
        <dialog
          ref={dialog}
          className="round-table-ballot"
          aria-label="Round Table ballot reveal"
          onCancel={(event) => {
            event.preventDefault()
            revealAll()
          }}
        >
          <div className="round-table-ballot__frame" data-shot={shot % 3}>
            <img className="round-table-ballot__room" src={council} alt="" />
            <header className="round-table-ballot__header">
              <span>{round > 1 ? 'Runoff' : 'Round Table'}</span>
              <strong>
                {visible} / {ballots.length}
              </strong>
            </header>
            <div className="round-table-ballot__seats" aria-hidden="true">
              {seats
                .filter(({ exit }) => !exit)
                .slice(0, 10)
                .map((seat) => (
                  <BallotPortrait key={seat.id} seat={seat} />
                ))}
            </div>
            {voter && nominee ? (
              <div className="round-table-ballot__card" key={shot}>
                <div aria-hidden="true">
                  <BallotPortrait seat={voter} />
                  <span>→</span>
                  <BallotPortrait seat={nominee} />
                </div>
                <p aria-live="polite">
                  <strong>{voter.name}</strong> voted for <strong>{nominee.name}</strong>
                </p>
              </div>
            ) : (
              <p className="round-table-ballot__sealed">The ballots are sealed.</p>
            )}
            <button type="button" className="round-table-feed__utility" onClick={revealAll}>
              Show full count
            </button>
          </div>
        </dialog>
      )}
    </section>
  )
}

export function RoundTableFeed(props: RoundTableFeedProps) {
  const { run, reducedMotion, onCountComplete } = props
  const systemReducedMotion = usePresentationReducedMotion()
  const immediate = reducedMotion || systemReducedMotion
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
  const action =
    run.tableSway?.stance === 'defend'
      ? 'defended'
      : run.tableSway?.stance === 'question'
        ? 'asked about'
        : 'challenged'
  return response ? (
    <p className="round-table-feed__call" role="status">
      {challenged && (
        <strong>
          You {action} {challenged.name}.{' '}
        </strong>
      )}
      {response}
    </p>
  ) : null
}
