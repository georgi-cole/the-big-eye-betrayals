import { useEffect, useRef, useState, type FormEvent } from 'react'
import { formatEyeoleans } from '../economy/eyeoleans'
import KolequantSplash from '../components/KolequantSplash/KolequantSplash'
import { usePresentationReducedMotion } from '../services/presentation/usePresentationReducedMotion'
import type { BetrayalsUtilities } from './betrayalsPreferences'
import {
  BetrayalsUtilityChips,
  BetrayalsUtilityPanel,
  UtilityIcon,
  type BetrayalsMilestones,
  type BetrayalsProfileControls,
} from './BetrayalsUtilities'
import { ObservatoryWindow } from './ObservatoryWindow'
import { useObservatorySky } from './observatoryWeather'
import type { BetrayalsProductKey } from './commerce/catalog'
import './betrayalsHome.css'

const observatory = import.meta.env.BASE_URL + 'assets/betrayals/observatory.jpg'
const splashSession = 'betrayals.observatoryOpening.v1'
let openingSeen = false

function hasSeenOpening() {
  try {
    return openingSeen || window.sessionStorage.getItem(splashSession) === 'true'
  } catch {
    return openingSeen
  }
}

type HomeProps = {
  utilities: BetrayalsUtilities
  profiles?: BetrayalsProfileControls
  market?: import('./BetrayalsStore').BetrayalsStoreProps
  onOpenStore?: () => void
  onOpenWallet?: () => void
  onUpgrade?: (product: BetrayalsProductKey) => void
  milestones?: BetrayalsMilestones
  name: string
  onNameChange: (name: string) => void
  season?: { day: number; phase: string; settled: boolean }
  onPlaySeason: () => void
  onReturnToSeason: () => void
  onResumeLegacy?: () => void
}

export function BetrayalsHome({
  utilities,
  profiles,
  market,
  onOpenStore,
  onOpenWallet,
  onUpgrade,
  milestones,
  name,
  onNameChange,
  season,
  onPlaySeason,
  onReturnToSeason,
  onResumeLegacy,
}: HomeProps) {
  const westLantern = useRef<HTMLSpanElement>(null)
  const eastLantern = useRef<HTMLSpanElement>(null)
  const [backdropReady, setBackdropReady] = useState(false)
  const [opening, setOpening] = useState(() => !!profiles && !hasSeenOpening())
  const systemReducedMotion = usePresentationReducedMotion()
  const reducedMotion = utilities.preferences.reducedMotion || systemReducedMotion
  const { current: windowSky, previous: previousSky } = useObservatorySky()
  const showSplash = opening && !reducedMotion

  function finishOpening() {
    openingSeen = true
    try {
      window.sessionStorage.setItem(splashSession, 'true')
    } catch {
      // Remember the opening for the lifetime of this page.
    }
    setOpening(false)
  }

  useEffect(() => {
    if (!opening) return
    const timeout = window.setTimeout(finishOpening, reducedMotion ? 0 : 6500)
    return () => window.clearTimeout(timeout)
  }, [opening, reducedMotion])

  const player = profiles?.player
  const setup = profiles && !player?.portrait ? profiles : undefined
  const continuing = season && !season.settled
  const actionLabel = setup
    ? player
      ? 'Choose your look'
      : 'Create profile'
    : continuing
      ? 'Continue season'
      : 'Start season'

  function selectPrimaryAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (setup) setup.openDressingRoom()
    else if (continuing) onReturnToSeason()
    else onPlaySeason()
  }

  return (
    <>
      {showSplash && (
        <KolequantSplash
          duration={3400}
          ready={backdropReady}
          progress={backdropReady ? 100 : 0}
          status="Opening the observatory"
          lanternTargets={[westLantern, eastLantern]}
          onFinish={finishOpening}
        />
      )}
      <main
        className="betrayals-layout betrayals-home"
        data-betrayals-motion={reducedMotion ? 'reduced' : undefined}
        inert={showSplash}
      >
        <div className="betrayals-home__scene" aria-hidden="true">
          <div className="betrayals-home__art">
            <img
              src={observatory}
              alt=""
              fetchPriority="high"
              width="941"
              height="1672"
              onLoad={() => setBackdropReady(true)}
              onError={() => setBackdropReady(true)}
            />
            <ObservatoryWindow
              view={windowSky}
              previous={previousSky}
              reducedMotion={reducedMotion}
            />
            <span
              ref={westLantern}
              className="betrayals-home__lantern betrayals-home__lantern--west"
            >
              <span className="betrayals-home__flame" />
            </span>
            <span
              ref={eastLantern}
              className="betrayals-home__lantern betrayals-home__lantern--east"
            >
              <span className="betrayals-home__flame" />
            </span>
          </div>
        </div>
        <header className="betrayals-home__navigation">
          <BetrayalsUtilityChips utilities={utilities} profiles={profiles} showStore={false} />
        </header>
        <div className="betrayals-home__entrance">
          <div className="betrayals-home__identity">
            <span className="betrayals-eye" aria-hidden="true" />
            <p>The Big Eye</p>
            <h1>Betrayals</h1>
          </div>
          <form className="betrayals-home__controls" onSubmit={selectPrimaryAction}>
            {!setup && continuing && (
              <p className="betrayals-home__progress">
                Day {season.day}
                <span aria-hidden="true">·</span>
                {season.phase}
              </p>
            )}
            {!profiles && !continuing && (
              <label className="betrayals-home__guest">
                Your name
                <input
                  value={name}
                  maxLength={24}
                  autoComplete="nickname"
                  onChange={(event) => onNameChange(event.target.value)}
                />
              </label>
            )}
            <button type="submit" className="betrayals-primary betrayals-home__play">
              {actionLabel}
            </button>
            <div className="betrayals-home__secondary">
              {(['achievements', 'store'] as const).map((panel) => (
                <button
                  key={panel}
                  type="button"
                  aria-haspopup="dialog"
                  onClick={() => {
                    utilities.playEffect('ui:navigate', 0.45)
                    if (panel === 'store' && onOpenStore) onOpenStore()
                    else utilities.openPanel(panel)
                  }}
                >
                  <UtilityIcon kind={panel} />
                  {panel === 'achievements' ? 'Achievements' : 'Store'}
                </button>
              ))}
            </div>
            {onOpenWallet && (
              <button
                type="button"
                className="betrayals-wallet-chip"
                aria-haspopup="dialog"
                aria-label={`Open Wallet, ${formatEyeoleans(market?.balance ?? 0)} Eyeros`}
                onClick={() => {
                  utilities.playEffect('ui:navigate', 0.45)
                  onOpenWallet()
                }}
              >
                Wallet <span aria-hidden="true">◈</span> {formatEyeoleans(market?.balance ?? 0)}
              </button>
            )}
            {setup ? (
              <button type="button" className="betrayals-home__link" onClick={setup.openAccount}>
                Account sign-in
              </button>
            ) : (
              <>
                {onResumeLegacy && (
                  <button type="button" className="betrayals-home__link" onClick={onResumeLegacy}>
                    Resume previous season
                  </button>
                )}
                {season?.settled && (
                  <button type="button" className="betrayals-home__link" onClick={onReturnToSeason}>
                    View season result
                  </button>
                )}
              </>
            )}
            <a
              className="betrayals-home__link betrayals-home__help"
              href="mailto:kolequant@gmail.com?subject=The%20Big%20Eye%3A%20Betrayals%20help%20and%20feedback"
            >
              Help &amp; Feedback
            </a>
          </form>
        </div>
        <BetrayalsUtilityPanel
          utilities={utilities}
          profiles={profiles}
          milestones={milestones}
          market={market}
          onUpgrade={onUpgrade}
        />
      </main>
    </>
  )
}
