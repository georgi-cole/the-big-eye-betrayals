import { useEffect, useEffectEvent, useId, useRef, useState } from 'react'
import type { CinematicCastMember } from './CinematicScene'
import { ConclaveFilm } from './ConclaveFilm'
import { conclaveOpeningBeats } from './conclaveDirection'
import type { ConclaveLine, ConclaveView } from './night'
import './BetrayalsConclave.css'

export function BetrayalsConclave({
  line,
  vote,
  selectedName,
}: {
  line?: ConclaveLine
  vote: ConclaveView
  selectedName?: string
}) {
  return (
    <section className="betrayals-conclave" aria-label="Private Conclave" aria-live="polite">
      {line ? (
        <div className="betrayals-conclave__voice">
          {line.portrait ? <img src={line.portrait} alt="" /> : <span aria-hidden="true" />}
          <div>
            <p className="betrayals-conclave__speaker">
              <strong>{line.speakerName}</strong>
              {line.nomineeName && (
                <>
                  {' '}
                  nominates <strong>{line.nomineeName}</strong>
                </>
              )}
            </p>
            <p>{line.argument}</p>
          </div>
        </div>
      ) : (
        <>
          {vote.runoff && <p className="betrayals-conclave__count">First ballot · {vote.runoff}</p>}
          <p className="betrayals-conclave__choice">
            {selectedName ? (
              <>
                Your vote is for <strong>{selectedName}</strong>.
              </>
            ) : vote.runoff ? (
              'No majority. Highest count decides the runoff.'
            ) : (
              'Choose your nominee from the roster.'
            )}
          </p>
          {selectedName && vote.ownArgument && <p>{vote.ownArgument}</p>}
        </>
      )}
    </section>
  )
}

export function ConclaveDiscussion({
  cast,
  candidates,
  vote,
  line,
  step,
  total,
  selectedId,
  onSelect,
  onAdvance,
  onBack,
  onSkip,
  opening,
  verdict,
  playEffect,
  onFinishFilm,
}: {
  cast: readonly CinematicCastMember[]
  candidates: readonly CinematicCastMember[]
  vote?: ConclaveView
  line?: ConclaveLine
  step: number
  total: number
  selectedId?: string
  onSelect: (id: string) => void
  onAdvance: () => void
  onBack: () => void
  onSkip: () => void
  opening?: 'first' | 'return'
  verdict?: string
  playEffect?: (key: string, volume?: number) => void
  onFinishFilm: (completion: 'played' | 'skipped') => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [openingStep, setOpeningStep] = useState(0)
  const [surfaceReady, setSurfaceReady] = useState(false)
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (typeof element.showModal === 'function') {
      element.showModal()
      return () => element.close()
    }
    element.setAttribute('open', '')
  }, [])
  const selected = candidates.find(({ id }) => id === selectedId)
  const actors = cast.filter(({ concealed }) => !concealed)
  const cameraBeat = opening
    ? conclaveOpeningBeats(cast, opening === 'first')[openingStep]
    : undefined
  const hold = cameraBeat?.hold
  const cue = cameraBeat?.cue
  const playCue = useEffectEvent((sound: string) => playEffect?.('tv:ceremony_' + sound, 0.58))
  useEffect(() => {
    if (!surfaceReady) return
    if (cue) playCue(cue)
    if (!hold) return
    const timer = window.setTimeout(() => setOpeningStep((index) => index + 1), hold)
    return () => window.clearTimeout(timer)
  }, [cue, hold, openingStep, surfaceReady])
  const revealed = new Set(
    actors.slice(0, cameraBeat?.visibleCount ?? actors.length).map(({ id }) => id)
  )
  const filmStage = opening ? 'opening' : verdict ? 'verdict' : line ? 'discussion' : 'ballot'
  const skip = () => (opening ? onFinishFilm('skipped') : line && onSkip())

  return (
    <dialog
      ref={dialog}
      className="betrayals-conclave-dialog"
      aria-labelledby={titleId}
      data-ballot={filmStage === 'ballot' || undefined}
      data-stage={filmStage}
      onCancel={(event) => {
        event.preventDefault()
        skip()
      }}
    >
      <div className="betrayals-conclave-dialog__shot">
        <ConclaveFilm
          cast={cast}
          entering={cameraBeat?.entering}
          revealed={revealed}
          unmaskingId={cameraBeat?.unmaskingId}
          focusId={cameraBeat?.focusId}
          speakerId={opening || verdict ? undefined : line?.speakerId}
          emphasize={filmStage === 'discussion' && step === total - 1 && Boolean(line?.nomineeName)}
          letter={verdict ? 'sealed' : undefined}
          interactive={filmStage === 'discussion'}
          onSurfaceReady={() => setSurfaceReady(true)}
          reducedMotion={false}
        />
      </div>
      <header>
        <h1 id={titleId}>The Conclave</h1>
        {(opening || (line && !verdict)) && (
          <button type="button" className="betrayals-secondary" onClick={skip}>
            {opening ? 'Skip cinematic' : 'Skip to ballot'}
          </button>
        )}
      </header>
      {opening || verdict ? (
        <div className="betrayals-conclave-dialog__ceremony" aria-live="polite">
          <h2>{cameraBeat?.title ?? 'The Conclave adjourns'}</h2>
          {verdict && <p>{verdict}</p>}
        </div>
      ) : line ? (
        <div className="betrayals-conclave-dialog__caption" aria-live="polite">
          <p>
            <strong>{line.speakerName}</strong>
            {line.nomineeName && (
              <>
                {' '}
                nominates <strong>{line.nomineeName}</strong>
              </>
            )}
          </p>
          <blockquote>{line.argument}</blockquote>
        </div>
      ) : (
        vote && (
          <section
            className="betrayals-conclave-dialog__ballot"
            aria-label={vote.runoff ? 'Runoff ballot' : 'Night ballot'}
          >
            <h2>{vote.runoff ? 'Runoff ballot' : 'Who do you nominate?'}</h2>
            {vote.runoff && <p>First ballot · {vote.runoff}. Highest count decides the runoff.</p>}
            <div className="betrayals-conclave-dialog__candidates">
              {candidates.map(({ id, name, portrait }) => (
                <button
                  type="button"
                  key={id}
                  aria-pressed={selected?.id === id}
                  onClick={() => onSelect(id)}
                >
                  {portrait && <img src={portrait} alt="" loading="lazy" />}
                  <span>{name}</span>
                </button>
              ))}
            </div>
            {selected && vote.ownArgument && <p aria-live="polite">{vote.ownArgument}</p>}
          </section>
        )
      )}
      <footer>
        {!opening && !verdict && step > 0 && !vote?.runoff && (
          <button type="button" className="betrayals-secondary" onClick={onBack}>
            Back
          </button>
        )}
        {opening || verdict ? (
          <button
            type="button"
            className="betrayals-primary"
            disabled={Boolean(hold)}
            onClick={() => onFinishFilm('played')}
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            className="betrayals-primary"
            disabled={!line && candidates.length > 0 && !selected}
            onClick={onAdvance}
          >
            {line
              ? step + 1 < total
                ? 'Next speaker'
                : 'Open ballot'
              : vote?.runoff
                ? 'Lock runoff vote'
                : 'Lock Night choice'}
          </button>
        )}
      </footer>
    </dialog>
  )
}
