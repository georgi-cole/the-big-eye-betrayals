import { useEffect, useRef, useState } from 'react'
import { usePacedReveal } from '../hooks/usePacedReveal'
import type { Run, Seat, TableCount, TableSway } from './run'
import { MAX_TABLE_ROUNDS } from './run'
import {
  tableDiscussion,
  tableDiscussionOpen,
  tableLeaderboard,
  tableSwayResponse,
  tableTargets,
} from './table'
import './RoundTableFeed.css'

type RoundTableFeedProps = {
  run: Run
  reducedMotion?: boolean
  onSway?: (choice: TableSway) => void
  onCountComplete?: () => void
}

function DiscussionFeed({ run, reducedMotion, onSway }: RoundTableFeedProps) {
  const [speeches] = useState(() => tableDiscussion(run))
  const chatRef = useRef<HTMLDivElement>(null)
  const followLatest = useRef(true)
  const [targetId, setTargetId] = useState('')
  const { visible, revealAll } = usePacedReveal(speeches.length, {
    firstDelay: 550,
    stepDelay: 680,
    immediate: reducedMotion,
  })
  const candidates = tableTargets(run, run.humanId)
  const seats = new Map(run.seats.map((seat) => [seat.id, seat]))
  const complete = visible >= speeches.length

  useEffect(() => {
    const chat = chatRef.current
    if (chat && followLatest.current) chat.scrollTop = chat.scrollHeight
  }, [visible])

  return (
    <div className="round-table-feed">
      <div
        className="round-table-feed__chat"
        role="log"
        aria-label="Round Table conversation"
        tabIndex={0}
        ref={chatRef}
        onScroll={(event) => {
          const chat = event.currentTarget
          followLatest.current = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 35
        }}
      >
        {speeches.slice(0, visible).map(({ speakerId, targetId: nomination, argument }) => {
          const speaker = seats.get(speakerId)
          return (
            <article className="round-table-feed__speech" key={speakerId}>
              {speaker?.portrait ? (
                <img src={speaker.portrait} alt="" width="34" height="34" />
              ) : (
                <span className="round-table-feed__initial" aria-hidden="true">
                  {speaker?.name.slice(0, 1)}
                </span>
              )}
              <div>
                <strong>{speaker?.name}</strong>
                <p>
                  <b>{seats.get(nomination)?.name}.</b> {argument}
                </p>
              </div>
            </article>
          )
        })}
        {!complete && <p className="round-table-feed__waiting">The guests are speaking…</p>}
      </div>
      {!complete && (
        <button
          type="button"
          className="round-table-feed__utility"
          onClick={() => {
            followLatest.current = false
            if (chatRef.current) chatRef.current.scrollTop = 0
            revealAll()
          }}
        >
          Show all arguments
        </button>
      )}
      {complete && Boolean(candidates.length) && onSway && (
        <div className="round-table-feed__sway">
          <label>
            Who do you want the table to consider?
            <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
              <option value="">Choose a contestant</option>
              {candidates.map((id) => (
                <option key={id} value={id}>
                  {seats.get(id)?.name}
                </option>
              ))}
            </select>
          </label>
          <div className="round-table-feed__sway-actions">
            <button
              type="button"
              disabled={!candidates.includes(targetId)}
              onClick={() => onSway({ targetId, tone: 'careful' })}
            >
              Make a case
            </button>
            <button
              type="button"
              disabled={!candidates.includes(targetId)}
              onClick={() => onSway({ targetId, tone: 'forceful' })}
            >
              Press hard
            </button>
          </div>
          <p>A harder push can move more votes and draw suspicion toward you.</p>
        </div>
      )}
    </div>
  )
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
  if (tableDiscussionOpen(run)) {
    return <DiscussionFeed key={`${run.id}:${run.day}`} {...props} reducedMotion={immediate} />
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
