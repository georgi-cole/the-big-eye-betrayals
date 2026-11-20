import { useEffect, useRef } from 'react'
import { BETRAYALS_PORTRAITS, getBetrayalsPortrait } from './betrayalsPreferences'
import type { BetrayalsUtilities } from './betrayalsPreferences'
import './betrayalsUtilities.css'

export function BetrayalsUtilityChips({
  utilities,
  showSettings = true,
}: {
  utilities: BetrayalsUtilities
  showSettings?: boolean
}) {
  const { preferences, openPanel, playEffect, toggleMusic } = utilities
  return (
    <div className="betrayals-utility-chips" role="group" aria-label="Game controls">
      <button
        type="button"
        aria-pressed={preferences.musicOn}
        aria-label="Music"
        className="betrayals-utility-chip"
        onClick={toggleMusic}
      >
        <span className="betrayals-utility-icon" aria-hidden="true">
          ♫
        </span>
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
          <span className="betrayals-utility-icon" aria-hidden="true">
            ⚙︎
          </span>
          <span className="betrayals-utility-chip__label">Settings</span>
        </button>
      )}
      <button
        type="button"
        aria-haspopup="dialog"
        className="betrayals-utility-chip"
        onClick={() => {
          playEffect('ui:navigate', 0.45)
          openPanel('store')
        }}
      >
        <span className="betrayals-utility-icon" aria-hidden="true">
          ◇
        </span>
        <span className="betrayals-utility-chip__label">Store</span>
      </button>
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

function Settings({ utilities }: { utilities: BetrayalsUtilities }) {
  const { preferences, toggleMusic, updatePreferences } = utilities
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
          name="Reduce motion"
          checked={preferences.reducedMotion}
          onToggle={() => updatePreferences({ reducedMotion: !preferences.reducedMotion })}
        />
      </div>
    </div>
  )
}

function Store({ utilities }: { utilities: BetrayalsUtilities }) {
  const { preferences, updatePreferences, playEffect } = utilities
  return (
    <div className="betrayals-store">
      <p>Choose a free portrait for your next season.</p>
      <div className="betrayals-store__portraits" role="group" aria-label="Season portraits">
        {BETRAYALS_PORTRAITS.map(({ id, name }) => (
          <button
            key={id}
            type="button"
            aria-label={name}
            aria-pressed={preferences.lookId === id}
            className="betrayals-store__portrait"
            onClick={() => {
              playEffect('ui:confirm', 0.45)
              updatePreferences({ lookId: id })
            }}
          >
            <img src={getBetrayalsPortrait(id)} alt="" width="256" height="256" />
            <strong>{name}</strong>
            <span>{preferences.lookId === id ? 'Equipped' : 'Equip'}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="betrayals-store__default"
        aria-label="Default portrait"
        aria-pressed={preferences.lookId === null}
        onClick={() => updatePreferences({ lookId: null })}
      >
        {preferences.lookId === null ? 'Default equipped' : 'Use default portrait'}
      </button>
    </div>
  )
}

function UtilityDialog({ utilities }: { utilities: BetrayalsUtilities }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { panel, preferences, closePanel } = utilities
  const title = panel === 'settings' ? 'Settings' : 'Store'

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
          <Settings utilities={utilities} />
        ) : (
          <Store utilities={utilities} />
        )}
      </div>
    </dialog>
  )
}

export function BetrayalsUtilityPanel({ utilities }: { utilities: BetrayalsUtilities }) {
  return utilities.panel ? <UtilityDialog utilities={utilities} /> : null
}
