import { useEffect, useState } from 'react'
import { isBetrayalsLook, type BetrayalsLookId } from './betrayalsAppearance'
import { SFX_SOUND_CATEGORIES } from '../services/sound/audioSettingsSync'
import { SoundManager } from '../services/sound/SoundManager'
import type { RealityPreset, RunOptions } from './run'

const STORAGE_KEY = 'betrayals.preferences.v1'

export { BETRAYALS_PORTRAITS, getBetrayalsPortrait } from './betrayalsAppearance'
type UtilityPanel = 'settings' | 'store' | 'achievements'

type Preferences = {
  musicOn: boolean
  musicVolume: number
  soundOn: boolean
  soundVolume: number
  reducedMotion: boolean
  lookId: BetrayalsLookId | null
  seasonPublicMode?: boolean
  seasonRealityMode?: RealityPreset
}

const DEFAULT_PREFERENCES: Preferences = {
  musicOn: false,
  musicVolume: 0.45,
  soundOn: true,
  soundVolume: 0.55,
  reducedMotion: false,
  lookId: null,
}

function validVolume(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback
}

export function isSeasonRealityMode(value: unknown): value is 'off' | 'casual' | 'tv' {
  return value === 'off' || value === 'casual' || value === 'tv'
}

function readPreferences(): Preferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const saved: Partial<Preferences> | null = raw ? JSON.parse(raw) : null
    if (!saved) return DEFAULT_PREFERENCES
    return {
      musicOn: saved.musicOn === true,
      musicVolume: validVolume(saved.musicVolume, DEFAULT_PREFERENCES.musicVolume),
      soundOn: saved.soundOn !== false,
      soundVolume: validVolume(saved.soundVolume, DEFAULT_PREFERENCES.soundVolume),
      reducedMotion: saved.reducedMotion === true,
      lookId: saved.lookId && isBetrayalsLook(saved.lookId) ? saved.lookId : null,
      seasonPublicMode:
        typeof saved.seasonPublicMode === 'boolean' ? saved.seasonPublicMode : undefined,
      seasonRealityMode: isSeasonRealityMode(saved.seasonRealityMode)
        ? saved.seasonRealityMode
        : undefined,
    }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export function useBetrayalsUtilities(lastSeason?: RunOptions) {
  const [preferences, setPreferences] = useState(readPreferences)
  const [panel, setPanel] = useState<UtilityPanel | null>(null)
  const { musicOn, musicVolume, soundOn, soundVolume } = preferences
  const seasonOptions: RunOptions = {
    publicMode: preferences.seasonPublicMode ?? lastSeason?.publicMode ?? false,
    realityMode:
      preferences.seasonRealityMode ??
      (isSeasonRealityMode(lastSeason?.realityMode) ? lastSeason.realityMode : 'off'),
  }

  useEffect(() => {
    void SoundManager.init()
    // Scene themes are owned by the Betrayals soundtrack controller.
    void SoundManager.setDesiredMusic('none', 'betrayals')

    function removeUnlockListeners() {
      document.removeEventListener('click', unlock, true)
      document.removeEventListener('keydown', unlock, true)
    }

    function unlock() {
      removeUnlockListeners()
      SoundManager.unlockFromGesture()
    }

    document.addEventListener('click', unlock, true)
    document.addEventListener('keydown', unlock, true)
    return removeUnlockListeners
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
    } catch {
      // Use the current session's preferences when browser storage is unavailable.
    }
  }, [preferences])

  useEffect(() => {
    SoundManager.setMusicVolume(musicVolume)
  }, [musicVolume])

  useEffect(() => {
    SoundManager.setMusicMuted(!musicOn)
  }, [musicOn])

  useEffect(() => {
    for (const category of SFX_SOUND_CATEGORIES) {
      SoundManager.setCategoryEnabled(category, soundOn)
      SoundManager.setCategoryVolume(category, soundVolume)
    }
  }, [soundOn, soundVolume])

  function updatePreferences(changes: Partial<Preferences>) {
    setPreferences((current) => ({ ...current, ...changes }))
  }

  function toggleMusic() {
    SoundManager.unlockFromGesture()
    setPreferences((current) => ({ ...current, musicOn: !current.musicOn }))
  }

  function playEffect(key: string, volume = 1) {
    if (soundOn) void SoundManager.play(key, { volume })
  }

  return {
    preferences,
    seasonOptions,
    panel,
    openPanel: setPanel,
    closePanel: () => setPanel(null),
    updatePreferences,
    toggleMusic,
    playEffect,
  }
}

export type BetrayalsUtilities = ReturnType<typeof useBetrayalsUtilities>
