import { useEffect, useEffectEvent, useId, useRef, useState } from 'react'
import CinematicSkipButton from '../components/CinematicSkipButton/CinematicSkipButton'
import GameBackButton from '../components/ui/GameBackButton/GameBackButton'
import { BetrayalsPlayButton } from './BetrayalsDock'
import type { CinematicCastMember } from './CinematicScene'
import { ConclaveFilm } from './ConclaveFilm'
import { conclaveOpeningBeats } from './conclaveDirection'
import type { ConclaveLine, ConclaveView } from './night'
import { Roster } from './Roster'
import type { viewFor } from './run'
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
  view,
  humanId,
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
  view: ReturnType<typeof viewFor>
  humanId: string
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
    element.showModal?.()
    if (!element.open) element.setAttribute('open', '')
    return () => {
      element.close?.()
      element.removeAttribute('open')
    }
  }, [])
  const candidates = view.seats.filter(({ id }) => vote?.targetIds.includes(id))
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
  const advanceLabel =
    opening || verdict
      ? 'Continue'
      : line
        ? step + 1 < total
          ? 'Next speaker'
          : 'Open ballot'
        : vote?.runoff
          ? 'Lock runoff vote'
          : 'Lock Night choice'

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
          <CinematicSkipButton
            ariaLabel={opening ? 'Skip cinematic' : 'Skip to ballot'}
            label={opening ? 'Skip' : 'Skip to ballot'}
            indicator={opening ? 'close' : 'forward'}
            onClick={skip}
          />
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
              <Roster
                view={{ ...view, seats: candidates }}
                humanId={humanId}
                selectedId={selected?.id}
                onSelect={onSelect}
              />
            </div>
            {selected && vote.ownArgument && <p aria-live="polite">{vote.ownArgument}</p>}
          </section>
        )
      )}
      <footer>
        {!opening && !verdict && step > 0 && !vote?.runoff && (
          <GameBackButton label="Back" onClick={onBack} />
        )}
        <BetrayalsPlayButton
          label={advanceLabel}
          faceLabel={advanceLabel}
          disabled={
            opening || verdict ? Boolean(hold) : !line && candidates.length > 0 && !selected
          }
          onClick={opening || verdict ? () => onFinishFilm('played') : onAdvance}
        />
      </footer>
    </dialog>
  )
}
