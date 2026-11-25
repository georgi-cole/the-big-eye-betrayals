import { useEffect, useEffectEvent, useId, useRef, useState } from 'react'
import GameBackButton from '../components/ui/GameBackButton/GameBackButton'
import type { CinematicCastMember } from './CinematicScene'
import { ConclaveFilm } from './ConclaveFilm'
import { conclaveCueVolume, conclaveOpeningBeats, conclaveRevealed } from './conclaveDirection'
import { PortraitGallery } from './PortraitGallery'
import { usePresentationReducedMotion } from '../services/presentation/usePresentationReducedMotion'
import type { ConclaveLine, ConclaveView } from './night'
import type { viewFor } from './run'
import './BetrayalsConclave.css'
import './ceremonyActions.css'

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
  vote,
  recruitmentTargets,
  showFilm = true,
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
  vote?: ConclaveView
  recruitmentTargets?: readonly string[]
  showFilm?: boolean
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
  const reducedMotion = usePresentationReducedMotion()
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
  const targetIds = recruitmentTargets ?? vote?.targetIds ?? []
  const candidates = view.seats.filter(({ id }) => targetIds.includes(id))
  const selected = candidates.find(({ id }) => id === selectedId)
  const cameraBeat = opening
    ? conclaveOpeningBeats(cast, opening === 'first')[openingStep]
    : undefined
  const hold = cameraBeat?.hold
  const cue = verdict ? 'conclave_seal' : cameraBeat?.cue
  const playCue = useEffectEvent((sound: string) =>
    playEffect?.('tv:ceremony_' + sound, conclaveCueVolume(sound))
  )
  useEffect(() => {
    if (!surfaceReady) return
    if (cue) playCue(cue)
    if (!hold) return
    const timer = window.setTimeout(() => setOpeningStep((index) => index + 1), hold)
    return () => window.clearTimeout(timer)
  }, [cue, hold, openingStep, surfaceReady])
  const revealed = conclaveRevealed(cast, cameraBeat?.visibleCount)
  const filmStage = opening ? 'opening' : verdict ? 'verdict' : line ? 'discussion' : 'ballot'
  const frame = verdict ? 'sealed' : (cameraBeat?.frame ?? (line ? 'portrait' : 'table'))
  function skip() {
    if (opening || verdict) onFinishFilm('skipped')
    else if (line) onSkip()
  }

  return (
    <dialog
      ref={dialog}
      className="betrayals-conclave-dialog"
      aria-labelledby={titleId}
      data-ballot={filmStage === 'ballot' || undefined}
      data-stage={filmStage}
      data-frame={frame}
      onCancel={(event) => {
        event.preventDefault()
        skip()
      }}
    >
      {showFilm && (
        <div className="betrayals-conclave-dialog__shot">
          <ConclaveFilm
            cast={cast}
            frame={frame}
            revealed={revealed}
            focusId={opening ? cameraBeat?.focusId : line?.speakerId}
            discussion={filmStage === 'discussion'}
            onSurfaceReady={() => setSurfaceReady(true)}
          />
        </div>
      )}
      <header className="betrayals-conclave-dialog__navigation">
        {!opening && !verdict && step > 0 && !vote?.runoff && (
          <GameBackButton label="Back" onClick={onBack} />
        )}
        <h1 id={titleId}>The Conclave</h1>
        {(opening || (line && !verdict)) && (
          <button
            type="button"
            className="betrayals-ceremony-action--secondary betrayals-conclave-dialog__skip"
            aria-label={opening ? 'Skip cinematic' : 'Skip to ballot'}
            onClick={skip}
          >
            Skip
          </button>
        )}
      </header>
      {opening || verdict ? (
        <div className="betrayals-conclave-dialog__ceremony" aria-live="polite">
          {verdict ? (
            <h2>Sealed</h2>
          ) : (
            cameraBeat?.focusId && cameraBeat.title && <h2>{cameraBeat.title}</h2>
          )}
          {verdict && <p>{verdict}</p>}
        </div>
      ) : line ? (
        <div className="betrayals-conclave-dialog__caption" aria-live="polite">
          <p>
            <strong>{line.speakerName}</strong>
          </p>
          <blockquote>{line.argument}</blockquote>
        </div>
      ) : (
        (vote || recruitmentTargets) && (
          <section
            className="betrayals-conclave-dialog__ballot"
            aria-label={
              recruitmentTargets ? 'Recruitment' : vote?.runoff ? 'Runoff ballot' : 'Night ballot'
            }
          >
            <h2>
              {recruitmentTargets
                ? 'Who will you recruit?'
                : vote?.runoff
                  ? 'Runoff ballot'
                  : 'Who do you nominate?'}
            </h2>
            {vote?.runoff && <p>First ballot · {vote.runoff}. Highest count decides the runoff.</p>}
            <PortraitGallery
              variant="conclave"
              guests={candidates}
              target={selected}
              reducedMotion={reducedMotion}
              onSelect={onSelect}
            />
            {selected && vote?.ownArgument && <p aria-live="polite">{vote.ownArgument}</p>}
          </section>
        )
      )}
      <footer>
        {opening || verdict ? (
          !hold && (
            <button
              type="button"
              className="betrayals-ceremony-action--primary"
              onClick={() => onFinishFilm('played')}
            >
              Continue
            </button>
          )
        ) : (
          <button
            type="button"
            className="betrayals-ceremony-action--primary"
            disabled={!line && candidates.length > 0 && !selected}
            onClick={onAdvance}
          >
            {line
              ? step + 1 < total
                ? 'Continue'
                : 'Open ballot'
              : recruitmentTargets
                ? 'Send invitation'
                : vote?.runoff
                  ? 'Lock runoff vote'
                  : 'Lock Night choice'}
          </button>
        )}
      </footer>
    </dialog>
  )
}
