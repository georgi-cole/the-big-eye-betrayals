import { useEffect, useRef, useState, type FormEvent } from 'react'
import HousematesBioCinematic from '../components/HousematesBioCinematic/HousematesBioCinematic'
import KolequantSplash from '../components/KolequantSplash/KolequantSplash'
import { usePresentationReducedMotion } from '../services/presentation/usePresentationReducedMotion'
import type { BetrayalsUtilities } from './betrayalsPreferences'
import {
  BetrayalsUtilityChips,
  BetrayalsUtilityPanel,
  UtilityIcon,
  type BetrayalsProfileControls,
} from './BetrayalsUtilities'
import type { BetrayalsMilestones } from './BetrayalsAchievements'
import { ObservatoryWindow } from './ObservatoryWindow'
import { useObservatorySky } from './observatoryWeather'
import type { BetrayalsProductKey } from './commerce/catalog'
import { CASTLE_ROLE_CATALOG, CASTLE_ROLE_PLAYTEST, type CastleRolePreview } from './castleRoles'
import { IS_BETRAYALS_QA_BUILD } from './qaBuild'
import './betrayalsHome.css'
import './ceremonyActions.css'

export type CastleRolesPreview = 'off' | 'standard' | 'random' | CastleRolePreview

const castleRolesPreviewOptions: readonly (readonly [CastleRolesPreview, string])[] = [
  ['off', IS_BETRAYALS_QA_BUILD ? 'Use season settings' : 'Off'],
  ...(IS_BETRAYALS_QA_BUILD
    ? ([
        ['standard', 'Standard season'],
        ['loyal', 'Play as Loyal'],
        ['betrayer', 'Play as Betrayer'],
      ] as const)
    : []),
  ['random', 'Random Castle Roles deal'],
  ...CASTLE_ROLE_PLAYTEST.map((id) => [id, `Play as ${CASTLE_ROLE_CATALOG[id].title}`] as const),
]

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
  onUpgrade?: (product: BetrayalsProductKey) => void
  milestones?: BetrayalsMilestones
  name: string
  onNameChange: (name: string) => void
  castleRolesPreview?: { value: CastleRolesPreview; onChange: (value: CastleRolesPreview) => void }
  seasonState?: 'active' | 'settled'
  onPlaySeason: () => void
  onReturnToSeason: () => void
  onResumeLegacy?: () => void
}

export function BetrayalsHome({
  utilities,
  profiles,
  market,
  onOpenStore,
  onUpgrade,
  milestones,
  name,
  onNameChange,
  castleRolesPreview,
  seasonState,
  onPlaySeason,
  onReturnToSeason,
  onResumeLegacy,
}: HomeProps) {
  const westLantern = useRef<HTMLSpanElement>(null)
  const eastLantern = useRef<HTMLSpanElement>(null)
  const [backdropReady, setBackdropReady] = useState(false)
  const [playersOpen, setPlayersOpen] = useState(false)
  const [shareNotice, setShareNotice] = useState('')
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
  const continuing = seasonState === 'active'
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

  async function shareGame() {
    const data = {
      title: 'The Big Eye: Betrayals',
      text: 'Enter the castle. Decide whom to trust.',
      url: window.location.href,
    }
    try {
      if (navigator.share) {
        await navigator.share(data)
        setShareNotice('Share sheet opened.')
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(data.url)
        setShareNotice('Link copied.')
      } else {
        setShareNotice('Sharing is unavailable in this browser.')
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setShareNotice('The link could not be shared.')
    }
  }

  return (
    <>
      {showSplash && (
        <KolequantSplash
          duration={3400}
          ready={backdropReady}
          progress={backdropReady ? 100 : 0}
          status="Lighting the castle lanterns…"
          lanternTargets={[westLantern, eastLantern]}
          onFinish={finishOpening}
        />
      )}
      {playersOpen && (
        <HousematesBioCinematic variant="betrayals" onComplete={() => setPlayersOpen(false)} />
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
        {player && profiles && (
          <button
            type="button"
            className="betrayals-home__compass"
            aria-label="Profile"
            title="Profile"
            onClick={profiles.openProfile}
          >
            <span className="betrayals-home__compass-dial" aria-hidden="true">
              {player.portrait ? (
                <img src={player.portrait} alt="" />
              ) : (
                <UtilityIcon kind="profile" />
              )}
            </span>
          </button>
        )}
        <div className="betrayals-home__entrance">
          <div className="betrayals-home__identity">
            <div className="betrayals-home__brand">
              <span className="betrayals-eye" aria-hidden="true" />
              <p>The Big Eye</p>
            </div>
            <h1>Betrayals</h1>
            {IS_BETRAYALS_QA_BUILD && <p className="betrayals-home__qa-label">QA build</p>}
          </div>
          <form className="betrayals-home__controls" onSubmit={selectPrimaryAction}>
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
            {castleRolesPreview && !setup && !continuing && (
              <label className="betrayals-home__guest">
                {IS_BETRAYALS_QA_BUILD ? 'QA starting role' : 'Castle Roles playtest'}
                <select
                  value={castleRolesPreview.value}
                  onChange={(event) => {
                    const option = castleRolesPreviewOptions.find(
                      ([value]) => value === event.currentTarget.value
                    )
                    if (option) castleRolesPreview.onChange(option[0])
                  }}
                >
                  {castleRolesPreviewOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="submit" className="betrayals-ceremony-action--primary">
              {actionLabel}
            </button>
            <div className="betrayals-home__secondary">
              {(['rules', 'store'] as const).map((panel) => (
                <button
                  key={panel}
                  type="button"
                  className="betrayals-ceremony-action--secondary"
                  aria-haspopup="dialog"
                  onClick={() => {
                    utilities.playEffect('ui:navigate', 0.45)
                    if (panel === 'store' && onOpenStore) onOpenStore()
                    else utilities.openPanel(panel)
                  }}
                >
                  <UtilityIcon kind={panel} />
                  {panel === 'rules' ? 'Rules' : 'Store'}
                </button>
              ))}
            </div>
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
                {seasonState === 'settled' && (
                  <button type="button" className="betrayals-home__link" onClick={onReturnToSeason}>
                    View season result
                  </button>
                )}
              </>
            )}
            <div className="betrayals-home__shortcuts">
              <BetrayalsUtilityChips
                utilities={utilities}
                showStore={false}
                showAchievements
                onOpenPlayers={() => setPlayersOpen(true)}
                onShare={() => void shareGame()}
              />
              <span className="betrayals-home__share-status" role="status" aria-live="polite">
                {shareNotice}
              </span>
            </div>
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
