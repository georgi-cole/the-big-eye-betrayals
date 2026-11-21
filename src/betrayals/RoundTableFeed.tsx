import { useEffect, useRef, useState } from 'react'
import { preload } from 'react-dom'
import { usePacedReveal } from '../hooks/usePacedReveal'
import { usePresentationReducedMotion } from '../services/presentation/usePresentationReducedMotion'
import type { Ballot, Run, Seat, TableCount } from './run'
import { MAX_TABLE_ROUNDS } from './run'
import { tableLeaderboard, tableSwayResponse } from './table'
import { ceremonyArt, seatedArt, tableShots } from './ceremonyArtwork'
import './RoundTableFeed.css'

type RoundTableFeedProps = {
  run: Run
  reducedMotion?: boolean
  onCountComplete?: () => void
}

const pageSize = 5

function TableCast({
  cast,
  voter,
  nominee,
  angle,
}: {
  cast: readonly Seat[]
  voter?: Seat
  nominee?: Seat
  angle: number
}) {
  const active = cast.filter(({ exit }) => !exit)
  const focus = voter ? active.findIndex(({ id }) => id === voter.id) : 0
  const count = Math.min(angle === 0 ? 7 : angle === 3 ? 3 : 5, active.length)
  const center = Math.floor(count / 2)
  const window = Array.from(
    { length: count },
    (_, index) => active[(focus - center + index + active.length) % active.length]
  )
  return (
    <div className="round-table-ballot__people" aria-hidden="true">
      {window.map((seat, index) => (
        <figure
          key={seat.id}
          data-contestant={seat.id}
          data-speaking={seat.id === voter?.id || undefined}
          data-nominated={seat.id === nominee?.id || undefined}
          style={{
            left:
              (angle === 1 ? 61 : angle === 2 ? 39 : 50) +
              (index - center) * (angle === 0 ? 12.2 : angle === 3 ? 29 : 16.4) +
              '%',
            bottom: 43 + (index - center) * (angle === 1 ? 0.7 : angle === 2 ? -0.7 : 0) + '%',
          }}
        >
          <img src={seatedArt(seat)} alt="" draggable={false} />
          <figcaption>{seat.name}</figcaption>
        </figure>
      ))}
    </div>
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
    firstDelay: 720,
    stepDelay: 830,
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
  const voter = ballot ? cast.get(ballot.voterId) : undefined
  const nominee = ballot ? cast.get(ballot.targetId) : undefined
  const dialog = useRef<HTMLDialogElement>(null)
  const angle = shot === 0 ? 0 : ((shot + round - 2) % 3) + 1

  useEffect(() => {
    if (reducedMotion) return
    for (const shot of tableShots) preload(ceremonyArt + shot + '.webp', { as: 'image' })
  }, [reducedMotion])

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
            <span className="round-table-feed__page" aria-live="polite">
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
          <div className="round-table-ballot__frame" data-shot={angle}>
            <div className="round-table-ballot__shot">
              <img
                key={angle}
                className="round-table-ballot__room"
                src={ceremonyArt + tableShots[angle] + '.webp'}
                alt=""
              />
              <TableCast cast={seats} voter={voter} nominee={nominee} angle={angle} />
            </div>

            <header className="round-table-ballot__header">
              <span>{round > 1 ? 'Runoff' : 'Round Table'}</span>
              <strong>
                {visible} / {ballots.length}
              </strong>
            </header>
            {voter && nominee ? (
              <div className="round-table-ballot__names" key={shot}>
                <p aria-live="polite">
                  <b>{voter.name}</b> voted for <strong>{nominee.name}</strong>
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
  return response ? (
    <p className="round-table-feed__call" role="status">
      {challenged && <strong>You challenged {challenged.name}. </strong>}
      {response}
    </p>
  ) : null
}
