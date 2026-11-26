import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import GameBackButton from '../components/ui/GameBackButton/GameBackButton'
import type { CinematicCastMember } from './CinematicScene'
import { ConclaveFilm } from './ConclaveFilm'
import {
  conclaveCueVolume,
  conclaveOpeningBeats,
  conclaveRevealed,
  conclaveTableHold,
  sealedBallotOpening,
  sealedVoteHold,
} from './conclaveDirection'
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
          {vote.nominationBlocked && <p>A ward blocked your nomination. Choose another guest.</p>}
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
  subphase,
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
  onOpenQa,
  opening,
  verdict,
  sealedVerdict = false,
  ballotControl,
  doubleVote,
  playEffect,
  onFinishFilm,
}: {
  subphase?: string
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
  onOpenQa?: () => void
  opening?: 'first' | 'return' | 'sealed'
  verdict?: string
  sealedVerdict?: boolean
  ballotControl?: ReactNode
  doubleVote?: boolean
  playEffect?: (key: string, volume?: number) => void
  onFinishFilm: (completion: 'played' | 'skipped') => void
}) {
  const reducedMotion = usePresentationReducedMotion()
  const dialog = useRef<HTMLDialogElement>(null)
  const [openingStep, setOpeningStep] = useState(0)
  const [surfaceReady, setSurfaceReady] = useState(false)
  useLayoutEffect(() => {
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
  const sealed = vote?.sealed || sealedVerdict
  const cameraBeat =
    opening === 'sealed'
      ? sealedBallotOpening[openingStep]
      : opening
        ? conclaveOpeningBeats(cast, opening === 'first')[openingStep]
        : undefined
  const hold = cameraBeat?.hold
  const cue = verdict ? 'conclave_seal' : cameraBeat?.cue
  const playCue = useEffectEvent((sound: string) =>
    playEffect?.('tv:ceremony_' + sound, conclaveCueVolume(sound))
  )
  const finishOpening = useEffectEvent(onFinishFilm)
  useEffect(() => {
    if (opening && (reducedMotion || !showFilm)) {
      const timer = window.setTimeout(() => finishOpening('skipped'), 0)
      return () => window.clearTimeout(timer)
    }
    if (!surfaceReady) return
    if (cue) playCue(cue)
    if (!opening && !sealedVerdict) return
    const timer = window.setTimeout(
      () => {
        if (hold && (opening !== 'sealed' || openingStep + 1 < sealedBallotOpening.length))
          setOpeningStep((index) => index + 1)
        else finishOpening('played')
      },
      hold ?? (sealedVerdict ? sealedVoteHold : conclaveTableHold)
    )
    return () => window.clearTimeout(timer)
  }, [cue, hold, opening, openingStep, reducedMotion, sealedVerdict, showFilm, surfaceReady])
  const revealed = conclaveRevealed(cast, cameraBeat?.visibleCount)
  const filmStage = opening ? 'opening' : verdict ? 'verdict' : line ? 'discussion' : 'ballot'
  const frame = cameraBeat?.frame ?? (verdict || sealed ? 'sealed' : line ? 'portrait' : 'table')
  function skip() {
    if (opening || verdict) onFinishFilm('skipped')
    else if (line) onSkip()
  }

  return (
    <dialog
      ref={dialog}
      className="betrayals-conclave-dialog"
      aria-label={sealed ? 'The Sealed Ballot' : 'The Conclave'}
      data-sealed={sealed || undefined}
      data-motion={reducedMotion || !showFilm ? 'reduced' : undefined}
      data-ballot={filmStage === 'ballot' || undefined}
      data-stage={filmStage}
      data-frame={frame}
      onCancel={(event) => {
        event.preventDefault()
        skip()
      }}
    >
      {(showFilm || sealed) && (
        <div className="betrayals-conclave-dialog__shot">
          <ConclaveFilm
            cast={cast}
            frame={frame}
            revealed={revealed}
            focusId={opening ? cameraBeat?.focusId : line?.speakerId}
            discussion={filmStage === 'discussion'}
            reducedMotion={!showFilm}
            onSurfaceReady={() => setSurfaceReady(true)}
          />
        </div>
      )}
      <header className="betrayals-conclave-dialog__navigation">
        {!opening && !verdict && step > 0 && !vote?.runoff && (
          <GameBackButton label="Back" onClick={onBack} />
        )}
        <h1>
          {sealed
            ? 'The Sealed Ballot'
            : opening
              ? 'The Descent'
              : verdict
                ? 'The Wax Seal'
                : (subphase ?? 'The Conclave')}
        </h1>
        {(opening || sealedVerdict || (line && !verdict)) && (
          <button
            type="button"
            className="betrayals-ceremony-action--secondary betrayals-conclave-dialog__skip"
            aria-label={opening || sealedVerdict ? 'Skip cinematic' : 'Skip to ballot'}
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
            (sealed || cameraBeat?.focusId) && cameraBeat?.title && <h2>{cameraBeat.title}</h2>
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
              sealed
                ? 'Murder shortlist'
                : recruitmentTargets
                  ? 'Recruitment'
                  : vote?.runoff
                    ? 'Runoff ballot'
                    : 'Night ballot'
            }
          >
            <h2>
              {sealed
                ? 'Who receives the letter?'
                : recruitmentTargets
                  ? 'Who will you recruit?'
                  : vote?.runoff
                    ? 'Runoff ballot'
                    : 'Who do you nominate?'}
            </h2>
            {vote?.runoff && <p>First ballot · {vote.runoff}. Highest count decides the runoff.</p>}
            {vote?.nominationBlocked && (
              <p>A ward blocked your nomination. Choose another guest.</p>
            )}
            <PortraitGallery
              variant="conclave"
              guests={candidates}
              target={selected}
              reducedMotion={reducedMotion || !showFilm}
              onSelect={onSelect}
            />
            {selected && vote?.ownArgument && <p aria-live="polite">{vote.ownArgument}</p>}
            {ballotControl}
          </section>
        )
      )}
      <footer>
        {!opening &&
          !sealedVerdict &&
          (verdict ? (
            <button
              type="button"
              className="betrayals-ceremony-action--primary"
              onClick={() => onFinishFilm('played')}
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              className="betrayals-ceremony-action--primary"
              disabled={!line && candidates.length > 0 && !selected}
              onClick={onAdvance}
            >
              {sealed
                ? 'Cast sealed vote'
                : line
                  ? step + 1 < total
                    ? 'Continue'
                    : 'Open ballot'
                  : recruitmentTargets
                    ? 'Send invitation'
                    : vote?.runoff
                      ? 'Lock runoff vote'
                      : doubleVote
                        ? 'Lock double nomination'
                        : 'Lock Night choice'}
            </button>
          ))}
        {(import.meta.env.DEV || import.meta.env.MODE === 'betrayals-qa') &&
          !opening &&
          !verdict &&
          onOpenQa && (
            <button
              type="button"
              className="betrayals-ceremony-action--compact"
              aria-label="Open Castle QA"
              onClick={onOpenQa}
            >
              QA
            </button>
          )}
      </footer>
    </dialog>
  )
}
