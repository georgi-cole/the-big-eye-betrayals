import { useEffect, useRef, useState } from 'react'
import { usePresentationReducedMotion } from '../services/presentation/usePresentationReducedMotion'
import type { Ballot, Run, Seat, TableCount } from './run'
import { MAX_TABLE_ROUNDS } from './run'
import { tableLeaderboard, tableSwayResponse } from './table'
import { RoundTableShot } from './RoundTableShot'
import './RoundTableFeed.css'

type RoundTableFeedProps = {
  run: Run
  reducedMotion?: boolean
  onCountComplete?: () => void
}

const visibleLeaders = 5

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
  const [shot, setShot] = useState(0)
  const [reviewOpen, setReviewOpen] = useState(false)
  const complete = Boolean(reducedMotion) || shot > shots || !shots
  const visible = complete ? ballots.length : Math.min(shot * perShot, ballots.length)
  const notified = useRef(false)
  const revealed = ballots.slice(0, visible)
  const { rows: leaders, hiddenTie } = tableLeaderboard(revealed, visibleLeaders)
  const totals = reviewOpen ? tableLeaderboard(ballots, Infinity).rows : []

  const cast = new Map(seats.map((seat) => [seat.id, seat]))
  const featured = Array.from({ length: shots }, (_, index) =>
    featuredBallot(ballots, index * perShot, Math.min((index + 1) * perShot, ballots.length))
  )
  const ballot = featured[shot - 1]
  const featuredIds = featured.map(({ voterId }) => voterId)
  const voter = ballot && cast.get(ballot.voterId)
  const nominee = ballot && cast.get(ballot.targetId)
  const dialog = useRef<HTMLDialogElement>(null)
  const dialogOpen = !complete || reviewOpen

  function viewAllVotes() {
    setShot(shots + 1)
    setReviewOpen(true)
  }

  useEffect(() => {
    const element = dialog.current
    if (!dialogOpen || !element) return
    element.showModal?.()
    if (!element.open) element.setAttribute('open', '')
    return () => {
      element.close?.()
      element.removeAttribute('open')
    }
  }, [dialogOpen])

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
      <div className="round-table-feed__lineup">
        {leaders.length > 0 && (
          <ol className="round-table-feed__leaders" aria-label="Current vote leaders">
            {leaders.map(({ id, votes }) => {
              const seat = seats.find((guest) => guest.id === id)
              const name = seat?.name ?? 'Contestant'
              return (
                <li key={id}>
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
        {!leaders.length && hiddenTie && (
          <p className="round-table-feed__tie">{hiddenTie.size}-way tie for the lead</p>
        )}
      </div>
      <div className="round-table-feed__footer">
        <p className="round-table-feed__summary" role="status">
          {complete && tiedIds.length > 0
            ? round >= MAX_TABLE_ROUNDS
              ? `Draw among ${tiedIds.length} tied guests`
              : leaders.length
                ? `Runoff among ${tiedIds.length} tied guests`
                : 'Runoff'
            : null}
          {complete && tiedIds.length === 0 && (
            <span className="round-table-feed__sr-only">The count is complete.</span>
          )}
        </p>
        {complete && (
          <button type="button" className="round-table-feed__utility" onClick={viewAllVotes}>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M5 3h10v14H5zM8 7h4m-4 3h4m-4 3h4" />
            </svg>
            View all votes
          </button>
        )}
      </div>
      {dialogOpen && (
        <dialog
          ref={dialog}
          className="round-table-ballot"
          aria-label={reviewOpen ? 'All Round Table votes' : 'Round Table ballot reveal'}
          onCancel={(event) => {
            event.preventDefault()
            if (reviewOpen) setReviewOpen(false)
            else setShot(shots + 1)
          }}
        >
          {reviewOpen ? (
            <div className="round-table-ballot__frame round-table-ballot__frame--review">
              <header className="round-table-ballot__header">
                <span>Round {round} votes</span>
                <strong>{ballots.length} counted</strong>
              </header>
              <div className="round-table-ballot__ledger" tabIndex={0}>
                <ul className="round-table-ballot__ranking" aria-label="All vote totals">
                  {totals.map(({ id, votes }) => (
                    <li key={id}>
                      <span>{cast.get(id)?.name ?? 'Contestant'}</span>
                      <strong aria-label={`${votes} ${votes === 1 ? 'vote' : 'votes'}`}>
                        {votes}
                      </strong>
                    </li>
                  ))}
                </ul>
                <ol className="round-table-ballot__votes" aria-label="All ballots">
                  {ballots.map(({ voterId, targetId }) => (
                    <li key={voterId}>
                      <strong>{cast.get(voterId)?.name ?? 'Contestant'}</strong>
                      <span>voted for</span>
                      <strong>{cast.get(targetId)?.name ?? 'Contestant'}</strong>
                    </li>
                  ))}
                </ol>
              </div>
              <button
                type="button"
                className="round-table-feed__utility"
                onClick={() => setReviewOpen(false)}
              >
                Return to vote totals
              </button>
            </div>
          ) : (
            <div className="round-table-ballot__frame">
              <div className="round-table-ballot__camera">
                <RoundTableShot
                  cast={seats}
                  featuredIds={featuredIds}
                  focusId={voter?.id}
                  close={Boolean(voter)}
                />
              </div>
              <header className="round-table-ballot__header">
                <span>{round > 1 ? 'Runoff' : 'Round Table'}</span>
                <strong>
                  {visible} / {ballots.length}
                </strong>
              </header>
              <div className="round-table-ballot__lower-third">
                {voter && nominee ? (
                  <div className="round-table-ballot__card" key={shot} aria-live="polite">
                    <p>
                      <strong>{voter.name}</strong> voted for <strong>{nominee.name}</strong>
                    </p>
                  </div>
                ) : (
                  <p className="round-table-ballot__sealed">The ballots are sealed.</p>
                )}
                <div className="round-table-ballot__actions">
                  <button
                    type="button"
                    className="round-table-feed__utility"
                    onClick={viewAllVotes}
                  >
                    View all votes
                  </button>
                  <button
                    type="button"
                    className="round-table-ballot__advance"
                    onClick={() => setShot(shot + 1)}
                  >
                    {shot === 0
                      ? 'Reveal first votes'
                      : shot < shots
                        ? 'Next votes'
                        : 'Show vote totals'}
                  </button>
                </div>
              </div>
            </div>
          )}
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
