import { useEffect, useRef } from 'react'
import { REALITY_MODE_PRESETS } from '../modes/realityMode'
import {
  BETRAYALS_PORTRAITS,
  getBetrayalsPortrait,
  isSeasonRealityMode,
} from './betrayalsPreferences'
import type { BetrayalsUtilities } from './betrayalsPreferences'
import { FREE_BETRAYALS_LOOK_IDS, type BetrayalsLookId } from './betrayalsAppearance'
import BetrayalsStore, { type BetrayalsStoreProps } from './BetrayalsStore'
import { BetrayalsPremiumButton } from './BetrayalsPremiumButton'
import { useBetrayalsCommerce } from './commerce/useBetrayalsCommerce'
import type { BetrayalsWallet } from './profileWallet'
import './betrayalsUtilities.css'

export type BetrayalsProfileControls = {
  player?: { id: string; name: string; portrait?: string }
  wallet?: BetrayalsWallet
  openProfile: () => void
  openDressingRoom: (initialLookId?: BetrayalsLookId) => void
  openAccount: () => void
  openAdvertisingPrivacy?: () => void
}

export type BetrayalsMilestones = { dayReached: number; won: boolean }

const utilityGlyphs = {
  achievements:
    'M5 3h6v3a3 3 0 0 1-6 0V3Zm0 1H3v2a2 2 0 0 0 2 2m6-4h2v2a2 2 0 0 1-2 2M8 9v4m-3 0h6',
  profile:
    'M10.5 5.2a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0m2 8v-.9c0-2.1-2-3.5-4.5-3.5s-4.5 1.4-4.5 3.5v.9',
  music:
    'M6 11.2V4.4l7-1.6v6.8m-7 1.6c0 1-1 1.8-2.2 1.8s-2-.6-2-1.5 1-1.7 2.2-1.7c.8 0 1.5.3 2 .7m7-.9c0 1-1 1.8-2.2 1.8s-2-.6-2-1.5 1-1.7 2.2-1.7c.8 0 1.5.3 2 .7',
  settings:
    'M8 1.8 10.1 4l3 .5.3 3L15 8l-1.6 1.5-.3 3-3 .5L8 15.2 5.9 13l-3-.5-.3-3L1 8l1.6-.5.3-3 3-.5L8 1.8Zm2.2 6.5a2.2 2.2 0 1 0-4.4 0 2.2 2.2 0 0 0 4.4 0Z',
  store: 'M8 1.8 14.2 8 8 14.2 1.8 8 8 1.8Zm0 2.7L11.5 8 8 11.5 4.5 8 8 4.5Z',
}

export function UtilityIcon({ kind }: { kind: keyof typeof utilityGlyphs }) {
  return (
    <svg className="betrayals-utility-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d={utilityGlyphs[kind]} />
    </svg>
  )
}

export function BetrayalsUtilityChips({
  utilities,
  showSettings = true,
  showStore = true,
  profiles,
}: {
  utilities: BetrayalsUtilities
  showSettings?: boolean
  showStore?: boolean
  profiles?: BetrayalsProfileControls
}) {
  const { preferences, openPanel, playEffect, toggleMusic } = utilities
  return (
    <div className="betrayals-utility-chips" role="group" aria-label="Game controls">
      {profiles?.player && (
        <button
          type="button"
          className="betrayals-utility-chip betrayals-utility-chip--profile"
          onClick={profiles.openProfile}
        >
          {profiles.player.portrait ? (
            <img src={profiles.player.portrait} alt="" />
          ) : (
            <UtilityIcon kind="profile" />
          )}
          Profile
        </button>
      )}
      <button
        type="button"
        aria-pressed={preferences.musicOn}
        aria-label="Music"
        className="betrayals-utility-chip"
        onClick={toggleMusic}
      >
        <UtilityIcon kind="music" />
        <span className="betrayals-utility-chip__label">Music</span>
        <span className="betrayals-utility-chip__lamp" aria-hidden="true" />
      </button>
      {showSettings && (
        <button
          type="button"
          aria-haspopup="dialog"
          className="betrayals-utility-chip"
          onClick={() => {
            playEffect('ui:navigate', 0.45)
            openPanel('settings')
          }}
        >
          <UtilityIcon kind="settings" />
          <span className="betrayals-utility-chip__label">Settings</span>
        </button>
      )}
      {showStore && (
        <button
          type="button"
          aria-haspopup="dialog"
          className="betrayals-utility-chip"
          onClick={() => {
            playEffect('ui:navigate', 0.45)
            openPanel('store')
          }}
        >
          <UtilityIcon kind="store" />
          <span className="betrayals-utility-chip__label">Store</span>
        </button>
      )}
    </div>
  )
}

function PreferenceSwitch({
  name,
  checked,
  onToggle,
}: {
  name: string
  checked: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="betrayals-preference-switch"
      onClick={onToggle}
    >
      {name}
      <span aria-hidden="true" />
    </button>
  )
}

function VolumeControl({
  name,
  value,
  disabled,
  onChange,
}: {
  name: string
  value: number
  disabled: boolean
  onChange: (volume: number) => void
}) {
  const percent = Math.round(value * 100)
  return (
    <label className="betrayals-preference-volume">
      <span>{name}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={percent}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber / 100)}
      />
      <span aria-hidden="true">{percent}%</span>
    </label>
  )
}

function Settings({
  utilities,
  openAdvertisingPrivacy,
}: {
  utilities: BetrayalsUtilities
  openAdvertisingPrivacy?: () => void
}) {
  const { preferences, seasonOptions, toggleMusic, updatePreferences } = utilities
  const commerce = useBetrayalsCommerce()
  return (
    <div className="betrayals-preferences">
      <div className="betrayals-preference-group">
        <PreferenceSwitch name="Music" checked={preferences.musicOn} onToggle={toggleMusic} />
        <VolumeControl
          name="Music volume"
          value={preferences.musicVolume}
          disabled={!preferences.musicOn}
          onChange={(musicVolume) => updatePreferences({ musicVolume })}
        />
      </div>
      <div className="betrayals-preference-group">
        <PreferenceSwitch
          name="Sound effects"
          checked={preferences.soundOn}
          onToggle={() => updatePreferences({ soundOn: !preferences.soundOn })}
        />
        <VolumeControl
          name="Effects volume"
          value={preferences.soundVolume}
          disabled={!preferences.soundOn}
          onChange={(soundVolume) => updatePreferences({ soundVolume })}
        />
      </div>
      <div className="betrayals-preference-group">
        <PreferenceSwitch
          name="Animations"
          checked={!preferences.reducedMotion}
          onToggle={() => updatePreferences({ reducedMotion: !preferences.reducedMotion })}
        />
        <small>Switch off for quick results and roster eliminations.</small>
      </div>
      <section className="betrayals-preference-group betrayals-preference-season">
        <h3>Next season</h3>
        <PreferenceSwitch
          name="Public Mode"
          checked={seasonOptions.publicMode}
          onToggle={() => updatePreferences({ seasonPublicMode: !seasonOptions.publicMode })}
        />
        <small>Let the audience award a Public Shield at the Round Table.</small>
        <label className="betrayals-preference-select">
          <span>Reality Mode</span>
          <select
            value={commerce.realityMode ? seasonOptions.realityMode : 'off'}
            disabled={!commerce.realityMode}
            onChange={({ currentTarget: { value } }) => {
              if (commerce.realityMode && isSeasonRealityMode(value))
                updatePreferences({ seasonRealityMode: value })
            }}
          >
            <option value="off">Off</option>
            {REALITY_MODE_PRESETS.filter(({ minimumAge }) => minimumAge === undefined).map(
              ({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              )
            )}
          </select>
        </label>
        {!commerce.realityMode && (
          <BetrayalsPremiumButton
            title="Unlock Reality Mode"
            detail="Full profiles, advanced actions and more intense social seasons."
            onClick={() => utilities.openPanel('store')}
          />
        )}
      </section>
      {openAdvertisingPrivacy && (
        <div className="betrayals-preference-group">
          <button
            type="button"
            className="betrayals-preference-privacy"
            onClick={openAdvertisingPrivacy}
          >
            Advertising privacy <span aria-hidden="true">{'\u203a'}</span>
          </button>
        </div>
      )}
    </div>
  )
}

function Store({
  utilities,
  profiles,
}: {
  utilities: BetrayalsUtilities
  profiles?: BetrayalsProfileControls
}) {
  const { preferences, updatePreferences, playEffect } = utilities
  return (
    <div className="betrayals-store">
      <p>Choose a free portrait for your next season.</p>
      <div className="betrayals-store__portraits" role="group" aria-label="Season portraits">
        {BETRAYALS_PORTRAITS.filter(({ id }) => FREE_BETRAYALS_LOOK_IDS.includes(id)).map(
          ({ id, name }) => {
            const portrait = getBetrayalsPortrait(id)
            const equipped = profiles
              ? profiles.player?.portrait === portrait
              : preferences.lookId === id
            return (
              <button
                key={id}
                type="button"
                aria-label={name}
                aria-pressed={equipped}
                className="betrayals-store__portrait"
                onClick={() => {
                  playEffect('ui:confirm', 0.45)
                  if (profiles) {
                    utilities.closePanel()
                    profiles.openDressingRoom(id)
                  } else updatePreferences({ lookId: id })
                }}
              >
                <img src={portrait} alt="" width="256" height="256" />
                <strong>{name}</strong>
                <span>{equipped ? 'Equipped' : profiles ? 'Preview' : 'Equip'}</span>
              </button>
            )
          }
        )}
      </div>
      {!profiles && (
        <button
          type="button"
          className="betrayals-store__default"
          aria-label="Default portrait"
          aria-pressed={preferences.lookId === null}
          onClick={() => updatePreferences({ lookId: null })}
        >
          {preferences.lookId === null ? 'Default equipped' : 'Use default portrait'}
        </button>
      )}
    </div>
  )
}

function Achievements({ milestones }: { milestones?: BetrayalsMilestones }) {
  const goals = [
    { label: 'Enter the castle', achieved: (milestones?.dayReached ?? 0) >= 1 },
    { label: 'Reach Day 2', achieved: (milestones?.dayReached ?? 0) >= 2 },
    { label: 'Win the season', achieved: milestones?.won ?? false },
  ]
  return (
    <section className="betrayals-achievements">
      <p>Milestones from your current or most recent season.</p>
      <ul>
        {goals.map(({ label, achieved }) => (
          <li key={label} data-achieved={achieved}>
            <span>{label}</span>
            <small>{achieved ? 'Unlocked' : 'Locked'}</small>
          </li>
        ))}
      </ul>
    </section>
  )
}

const panelTitles = { settings: 'Settings', store: 'Store', achievements: 'Achievements' }

function UtilityDialog({
  utilities,
  profiles,
  milestones,
  market,
}: {
  utilities: BetrayalsUtilities
  profiles?: BetrayalsProfileControls
  milestones?: BetrayalsMilestones
  market?: BetrayalsStoreProps
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { panel, preferences, closePanel } = utilities
  const title = panelTitles[panel ?? 'settings']

  useEffect(() => {
    const node = dialogRef.current
    if (!node) return
    if (typeof node.showModal === 'function') {
      node.showModal()
      return () => node.close()
    }
    node.setAttribute('open', '')
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="betrayals-utility-dialog"
      data-betrayals-motion={preferences.reducedMotion ? 'reduced' : undefined}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault()
        closePanel()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) closePanel()
      }}
    >
      <div className="betrayals-utility-dialog__inner">
        <header className="betrayals-utility-dialog__header">
          <h2>{title}</h2>
          <button
            type="button"
            className="betrayals-utility-dialog__close"
            aria-label={`Close ${title.toLowerCase()}`}
            onClick={closePanel}
          >
            ×
          </button>
        </header>
        {panel === 'settings' ? (
          <Settings
            utilities={utilities}
            openAdvertisingPrivacy={profiles?.openAdvertisingPrivacy}
          />
        ) : panel === 'store' ? (
          market ? (
            <BetrayalsStore {...market} />
          ) : (
            <Store utilities={utilities} profiles={profiles} />
          )
        ) : (
          <Achievements milestones={milestones} />
        )}
      </div>
    </dialog>
  )
}

export function BetrayalsUtilityPanel({
  utilities,
  profiles,
  milestones,
  market,
}: {
  utilities: BetrayalsUtilities
  profiles?: BetrayalsProfileControls
  milestones?: BetrayalsMilestones
  market?: BetrayalsStoreProps
}) {
  return utilities.panel ? (
    <UtilityDialog
      utilities={utilities}
      profiles={profiles}
      milestones={milestones}
      market={market}
    />
  ) : null
}
