import { useEffect, useState } from 'react'
import { getAppearanceAsset } from '../appearance/catalog'
import { SFX_SOUND_CATEGORIES } from '../services/sound/audioSettingsSync'
import type { MusicTrack } from '../services/sound/musicTracks'
import { SoundManager } from '../services/sound/SoundManager'
import type { Phase } from './run'

const STORAGE_KEY = 'betrayals.preferences.v1'

export const BETRAYALS_PORTRAITS = [
  { id: 'pc-005', name: 'The Envoy' },
  { id: 'pc-015', name: 'The Heiress' },
  { id: 'pc-025', name: 'The Insider' },
] as const

type PortraitId = (typeof BETRAYALS_PORTRAITS)[number]['id']
type UtilityPanel = 'settings' | 'store'

type Preferences = {
  musicOn: boolean
  musicVolume: number
  soundOn: boolean
  soundVolume: number
  reducedMotion: boolean
  lookId: PortraitId | null
}

const DEFAULT_PREFERENCES: Preferences = {
  musicOn: false,
  musicVolume: 0.45,
  soundOn: true,
  soundVolume: 0.55,
  reducedMotion: false,
  lookId: null,
}

const PHASE_MUSIC = {
  'role-reveal': 'season_start',
  dawn: 'nominations',
  social: 'social',
  immunity: 'competition',
  safety: 'competition',
  'round-table': 'nominations',
  'table-reveal': 'nominations_horror',
  night: 'nominations_horror',
  'night-resolved': 'nominations_horror',
  'final-challenge': 'competition',
  'final-banishment': 'final_three_week',
  'end-vote': 'final_three_week',
  settled: 'final_modal',
} satisfies Record<Phase, MusicTrack>

function validVolume(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback
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
      lookId: BETRAYALS_PORTRAITS.find(({ id }) => id === saved.lookId)?.id ?? null,
    }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export function getBetrayalsPortrait(lookId: PortraitId | null): string | undefined {
  const asset = lookId && getAppearanceAsset({ kind: 'catalog', lookId, revision: 1 }, 'main')
  return asset ? import.meta.env.BASE_URL + asset : undefined
}

export function useBetrayalsUtilities(phase?: Phase, suspended = false) {
  const [preferences, setPreferences] = useState(readPreferences)
  const [panel, setPanel] = useState<UtilityPanel | null>(null)
  const track = phase ? PHASE_MUSIC[phase] : 'nominations'
  const { musicOn, musicVolume, soundOn, soundVolume } = preferences

  useEffect(() => {
    void SoundManager.init()

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
    return () => {
      removeUnlockListeners()
      SoundManager.stopAllMusic()
    }
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
    void SoundManager.setDesiredMusic(musicOn && !suspended ? track : 'none', 'betrayals')
  }, [musicOn, suspended, track])

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
    panel,
    openPanel: setPanel,
    closePanel: () => setPanel(null),
    updatePreferences,
    toggleMusic,
    playEffect,
  }
}

export type BetrayalsUtilities = ReturnType<typeof useBetrayalsUtilities>
