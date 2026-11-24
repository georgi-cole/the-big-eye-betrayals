import { useEffect, useMemo, useRef, useState } from 'react'
import GameBackButton from '../components/ui/GameBackButton/GameBackButton'
import { usePacedReveal } from '../hooks/usePacedReveal'
import { usePresentationReducedMotion } from '../services/presentation/usePresentationReducedMotion'
import { tableDiscussion, tableTargets } from './table'
import type { Run, Seat, TableSway } from './run'
import { leadForPlayer } from './intel'
import { RoundTableShot } from './RoundTableShot'
import { PortraitGallery } from './PortraitGallery'
import { WitnessLeadCard } from './WitnessLeadCard'
import { caseReports } from './investigationEvidence'
import { InvestigationAccountCard } from './InvestigationAccountCard'
import { InvestigationButton, type InvestigationControls } from './BetrayalsGuestProfile'
import { BetrayalsPremiumButton } from './BetrayalsPremiumButton'
import { canUseBetrayalsTableSway } from './premiumAccess'
import './betrayals-pulse.css'
import './RoundTableDiscussion.css'

type Props = {
  run: Run
  open: boolean
  art: string
  shieldName?: string
  reducedMotion?: boolean
  hasRealityMode?: boolean
  onUpgrade?: () => void
  onBack: () => void
  onAskWitness: () => void
  investigation?: Pick<InvestigationControls, 'act' | 'reason'>
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
  hasRealityMode = false,
  onUpgrade,
  onBack,
  onAskWitness,
  investigation,
  onSway,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const caseHeading = useRef<HTMLHeadingElement>(null)
  const followLatest = useRef(true)
  const speeches = useMemo(() => tableDiscussion(run), [run])
  const [caseOpen, setCaseOpen] = useState(false)
  const lead = hasRealityMode ? leadForPlayer(run) : undefined
  const [targetId, setTargetId] = useState(
    () =>
      lead?.suspectId ??
      (hasRealityMode
        ? caseReports(run).find(({ report }) =>
            tableTargets(run, run.humanId).includes(report.guestId)
          )?.report.guestId
        : undefined) ??
      ''
  )
  const [behind, setBehind] = useState(false)
  const prefersReducedMotion = usePresentationReducedMotion()
  const motionReduced = reducedMotion || prefersReducedMotion
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const previewLength = Math.min(4, speeches.length)
  const preview = usePacedReveal(previewLength, {
    firstDelay: 250,
    stepDelay: 1120,
    immediate: motionReduced,
  })
  const visible = transcriptOpen || motionReduced ? speeches.length : preview.visible
  const complete = visible >= speeches.length
  const seats = new Map(run.seats.map((seat) => [seat.id, seat]))
  const featuredIds = speeches.slice(0, 4).map(({ speakerId }) => speakerId)
  const speakerId = !transcriptOpen && visible > 0 ? speeches[visible - 1]?.speakerId : undefined
  const candidates = tableTargets(run, run.humanId)
  const target = candidates.includes(targetId) ? seats.get(targetId) : undefined
  const accounts = hasRealityMode && target ? caseReports(run, target.id) : []
  const name = (id: string) => seats.get(id)?.name ?? 'Guest'

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

  function chooseSway(choice: TableSway | null) {
    if (canUseBetrayalsTableSway(choice, hasRealityMode)) onSway(choice)
    else onUpgrade?.()
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
      <div className="round-table-room__frame" data-case={caseOpen || undefined}>
        <div className="round-table-room__camera" aria-hidden="true">
          <img src={art} alt="" />
        </div>
        <header className="round-table-room__head">
          <div className="round-table-room__topline">
            <span>Day {run.day}</span>
            <GameBackButton
              className="round-table-room__back"
              label="Back to castle"
              onClick={onBack}
            />
          </div>
          <h2 id="round-table-room-title">Round Table</h2>
          {shieldName && <p>{shieldName} holds the Public Shield.</p>}
        </header>

        {!caseOpen && (
          <div className="round-table-room__shot">
            <RoundTableShot
              cast={run.seats}
              featuredIds={featuredIds}
              focusId={speakerId}
              close={Boolean(speakerId)}
              reducedMotion={motionReduced}
            />
          </div>
        )}

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
              {!hasRealityMode && (
                <BetrayalsPremiumButton
                  title="Reality Mode at the Round Table"
                  detail="Present accounts, call witnesses, defend a guest and press harder."
                  onClick={onUpgrade}
                />
              )}
              {lead && candidates.includes(lead.suspectId) && (
                <WitnessLeadCard lead={lead} onAsk={onAskWitness} />
              )}
              <h3 ref={caseHeading} tabIndex={-1}>
                Who do you want to discuss?
              </h3>
              <PortraitGallery
                guests={run.seats.filter(({ id }) => candidates.includes(id))}
                target={target}
                reducedMotion={motionReduced}
                onSelect={setTargetId}
              />
              {target && accounts.length > 0 && (
                <details className="round-table-accounts">
                  <summary>Present an account ({accounts.length})</summary>
                  <div>
                    {accounts.map(({ report, witness, witnessAsked }) => (
                      <InvestigationAccountCard key={report.id} account={report} name={name}>
                        <button
                          type="button"
                          onClick={() =>
                            chooseSway({
                              targetId,
                              tone: 'careful',
                              investigation: { reportId: report.id },
                            })
                          }
                        >
                          Cite account
                        </button>
                        {witness &&
                          (witnessAsked?.accepted ? (
                            <button
                              type="button"
                              onClick={() =>
                                chooseSway({
                                  targetId,
                                  tone: 'careful',
                                  investigation: { reportId: report.id, witness: true },
                                })
                              }
                            >
                              Call {name(witness)}
                            </button>
                          ) : witnessAsked ? (
                            <small>{name(witness)} declined to speak.</small>
                          ) : (
                            investigation && (
                              <InvestigationButton
                                investigation={investigation}
                                action={{ kind: 'witness', reportId: report.id }}
                              >{`Ask ${name(witness)} to testify · 1 Energy`}</InvestigationButton>
                            )
                          ))}
                      </InvestigationAccountCard>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </section>

        <footer className="round-table-room__footer">
          {caseOpen && target && (
            <>
              <p>
                How do you want to handle <strong>{target.name}</strong>?
              </p>
              <div className="round-table-room__stances">
                {lead && targetId === lead.suspectId && target && (
                  <>
                    {lead.promised && (
                      <button
                        type="button"
                        onClick={() =>
                          chooseSway({ targetId, tone: 'careful', evidence: 'call-witness' })
                        }
                      >
                        Call {lead.witness}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        chooseSway({ targetId, tone: 'careful', evidence: 'name-source' })
                      }
                    >
                      Name {lead.source} as your source
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => chooseSway({ targetId, tone: 'careful', stance: 'question' })}
                >
                  Ask for a reason
                </button>
                <button
                  type="button"
                  data-premium-locked={!hasRealityMode || undefined}
                  onClick={() => chooseSway({ targetId, tone: 'careful', stance: 'defend' })}
                >
                  Defend{!hasRealityMode && <span> · VIP</span>}
                </button>
                <button type="button" onClick={() => chooseSway({ targetId, tone: 'careful' })}>
                  Make a case
                </button>
                <button
                  type="button"
                  data-premium-locked={!hasRealityMode || undefined}
                  onClick={() => chooseSway({ targetId, tone: 'forceful' })}
                >
                  Press hard{!hasRealityMode && <span> · VIP</span>}
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
            <button
              className="round-table-room__vote"
              type="button"
              onClick={() => chooseSway(null)}
            >
              Go to vote
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  )
}
