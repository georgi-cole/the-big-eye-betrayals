import { useEffect, useRef, useState } from 'react'
import { usePacedReveal } from '../hooks/usePacedReveal'
import { usePresentationReducedMotion } from '../services/presentation/usePresentationReducedMotion'
import { tableDiscussion, tableTargets } from './table'
import type { Run, Seat, TableSway } from './run'
import { leadForPlayer } from './intel'
import { WitnessLeadCard } from './WitnessLeadCard'
import './RoundTableDiscussion.css'

type Props = {
  run: Run
  open: boolean
  art: string
  shieldName?: string
  reducedMotion?: boolean
  onBack: () => void
  onAskWitness: () => void
  onSway: (choice: TableSway | null) => void
}

function Portrait({ guest }: { guest?: Seat }) {
  return guest?.portrait ? (
    <img src={guest.portrait} alt="" decoding="async" />
  ) : (
    <span className="round-table-room__initial" aria-hidden="true">
      {guest?.name.slice(0, 1)}
    </span>
  )
}

export function RoundTableDiscussion({
  run,
  open,
  art,
  shieldName,
  reducedMotion,
  onBack,
  onAskWitness,
  onSway,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const caseHeading = useRef<HTMLHeadingElement>(null)
  const followLatest = useRef(true)
  const [speeches] = useState(() => tableDiscussion(run))
  const [caseOpen, setCaseOpen] = useState(false)
  const lead = leadForPlayer(run)
  const [targetId, setTargetId] = useState(() => lead?.suspectId ?? '')
  const [behind, setBehind] = useState(false)
  const prefersReducedMotion = usePresentationReducedMotion()
  const motionReduced = reducedMotion || prefersReducedMotion
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const previewLength = Math.min(4, speeches.length)
  const preview = usePacedReveal(previewLength, {
    firstDelay: 250,
    stepDelay: 750,
    immediate: motionReduced,
  })
  const visible = transcriptOpen || motionReduced ? speeches.length : preview.visible
  const complete = visible >= speeches.length
  const seats = new Map(run.seats.map((seat) => [seat.id, seat]))
  const candidates = tableTargets(run, run.humanId)
  const target = candidates.includes(targetId) ? seats.get(targetId) : undefined

  useEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog) return
    if (typeof dialog.showModal === 'function') {
      dialog.showModal()
      return () => dialog.close()
    }
    dialog.setAttribute('open', '')
    return () => dialog.removeAttribute('open')
  }, [open])

  useEffect(() => {
    const transcript = transcriptRef.current
    if (open && !caseOpen && transcript && followLatest.current) {
      transcript.scrollTop = transcript.scrollHeight
    }
  }, [caseOpen, open, visible])

  useEffect(() => {
    if (caseOpen && open) caseHeading.current?.focus()
  }, [caseOpen, open])

  function catchUp() {
    followLatest.current = true
    const transcript = transcriptRef.current
    if (transcript) transcript.scrollTop = transcript.scrollHeight
    setBehind(false)
  }

  return (
    <dialog
      ref={dialogRef}
      className="round-table-room"
      aria-labelledby="round-table-room-title"
      data-motion={motionReduced ? 'reduced' : undefined}
      onCancel={(event) => {
        event.preventDefault()
        onBack()
      }}
    >
      <div className="round-table-room__frame">
        <div className="round-table-room__camera" aria-hidden="true">
          <img src={art} alt="" />
        </div>
        <header className="round-table-room__head">
          <div className="round-table-room__topline">
            <span>Day {run.day}</span>
            <button type="button" onClick={onBack}>
              Back to castle
            </button>
          </div>
          <h2 id="round-table-room-title">Round Table</h2>
          {shieldName && <p>{shieldName} holds the Public Shield.</p>}
        </header>

        <section className="round-table-room__body" aria-label="Round Table proceedings">
          <div className="round-table-room__status">
            <span>{caseOpen ? 'The floor is yours' : 'Discussion'}</span>
            {!caseOpen && (
              <span>
                {visible} / {speeches.length} heard
              </span>
            )}
          </div>
          <div
            ref={transcriptRef}
            className="round-table-room__transcript"
            role="log"
            aria-label="Round Table conversation"
            aria-live={motionReduced || complete ? 'off' : 'polite'}
            tabIndex={0}
            hidden={caseOpen}
            onScroll={(event) => {
              const log = event.currentTarget
              const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 42
              followLatest.current = atEnd
              setBehind(!atEnd)
            }}
          >
            {speeches
              .slice(0, visible)
              .map(({ speakerId, targetId: nomination, argument, verb }, index) => (
                <article
                  key={speakerId + ':' + index}
                  data-current={index === visible - 1 || undefined}
                >
                  <Portrait guest={seats.get(speakerId)} />
                  <div>
                    <header>
                      <strong>{seats.get(speakerId)?.name}</strong>
                      <span>
                        {' '}
                        {verb ?? 'names'} {seats.get(nomination)?.name}
                      </span>
                    </header>
                    <p>{argument}</p>
                  </div>
                </article>
              ))}
            {visible < previewLength && (
              <p className="round-table-room__waiting">A guest takes the floor…</p>
            )}
            {!speeches.length && <p className="round-table-room__waiting">The room is silent.</p>}
          </div>

          {caseOpen && (
            <div className="round-table-room__case">
              {lead && candidates.includes(lead.suspectId) && (
                <WitnessLeadCard lead={lead} onAsk={onAskWitness} />
              )}
              <h3 ref={caseHeading} tabIndex={-1}>
                Whose name do you put forward?
              </h3>
              <ul className="round-table-room__candidates" aria-label="Eligible contestants">
                {candidates.map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      aria-pressed={targetId === id}
                      onClick={() => setTargetId(id)}
                    >
                      <Portrait guest={seats.get(id)} />
                      <span>{seats.get(id)?.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <footer className="round-table-room__footer">
          {caseOpen && (
            <>
              <p>
                {target ? (
                  <>
                    You put <strong>{target.name}</strong> forward. Pressing hard can draw suspicion
                    back to you.
                  </>
                ) : (
                  'Choose a guest from the table.'
                )}
              </p>
              <div className="round-table-room__stances">
                {lead && targetId === lead.suspectId && target && (
                  <>
                    {lead.promised && (
                      <button
                        type="button"
                        onClick={() =>
                          onSway({ targetId, tone: 'careful', evidence: 'call-witness' })
                        }
                      >
                        Call {lead.witness}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onSway({ targetId, tone: 'careful', evidence: 'name-source' })}
                    >
                      Name {lead.source} as your source
                    </button>
                  </>
                )}
                <button
                  type="button"
                  disabled={!target}
                  onClick={() => onSway({ targetId, tone: 'careful' })}
                >
                  Make a case
                </button>
                <button
                  type="button"
                  disabled={!target}
                  onClick={() => onSway({ targetId, tone: 'forceful' })}
                >
                  Press hard
                </button>
              </div>
            </>
          )}
          <div className="round-table-room__navigation">
            {caseOpen ? (
              <button type="button" onClick={() => setCaseOpen(false)}>
                Review discussion
              </button>
            ) : (
              <>
                {!complete && (
                  <button type="button" onClick={() => setTranscriptOpen(true)}>
                    Read all
                  </button>
                )}
                {behind && (
                  <button type="button" onClick={catchUp}>
                    Latest
                  </button>
                )}
                {Boolean(candidates.length) && (
                  <button type="button" onClick={() => setCaseOpen(true)}>
                    Take the floor
                  </button>
                )}
              </>
            )}
            <button className="round-table-room__vote" type="button" onClick={() => onSway(null)}>
              Go to vote
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  )
}
