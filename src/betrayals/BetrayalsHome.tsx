import type { FormEvent } from 'react'
import type { BetrayalsUtilities } from './betrayalsPreferences'
import {
  BetrayalsUtilityChips,
  BetrayalsUtilityPanel,
  type BetrayalsProfileControls,
} from './BetrayalsUtilities'
import './betrayalsHome.css'

const observatory = import.meta.env.BASE_URL + 'assets/betrayals/observatory.jpg'

type HomeProps = {
  utilities: BetrayalsUtilities
  profiles?: BetrayalsProfileControls
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
  name,
  onNameChange,
  season,
  onPlaySeason,
  onReturnToSeason,
  onResumeLegacy,
}: HomeProps) {
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
    <main
      className="betrayals-layout betrayals-home"
      data-betrayals-motion={utilities.preferences.reducedMotion ? 'reduced' : undefined}
    >
      <div className="betrayals-home__scene" aria-hidden="true">
        <div className="betrayals-home__art">
          <img src={observatory} alt="" fetchPriority="high" width="941" height="1672" />
          <span className="betrayals-home__lantern betrayals-home__lantern--west">
            <span className="betrayals-home__flame" />
          </span>
          <span className="betrayals-home__lantern betrayals-home__lantern--east">
            <span className="betrayals-home__flame" />
          </span>
        </div>
      </div>
      <header className="betrayals-home__navigation">
        <BetrayalsUtilityChips utilities={utilities} profiles={profiles} />
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
        </form>
      </div>
      <BetrayalsUtilityPanel utilities={utilities} profiles={profiles} />
    </main>
  )
}
