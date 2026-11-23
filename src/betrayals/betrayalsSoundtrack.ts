import { useEffect, useRef } from 'react'
import { SoundManager } from '../services/sound/SoundManager'
import type { PresentationCue, Run } from './run'

export type BetrayalsMusicScene =
  | 'intro-hub'
  | 'inside-castle'
  | 'round-table'
  | 'conclave'
  | 'murder'
  | 'loyals-win'
  | 'betrayers-win'

type SoundtrackDefinition = {
  source: string
  startAtSec: number
  loop: boolean
  volume: number
}

const soundtrackBase = `${import.meta.env.BASE_URL}assets/betrayals/music/`

export const BETRAYALS_SOUNDTRACKS: Readonly<Record<BetrayalsMusicScene, SoundtrackDefinition>> = {
  'intro-hub': {
    source: `${soundtrackBase}introhub-main-the-four-note-motif.mp3`,
    startAtSec: 0,
    loop: true,
    volume: 0.62,
  },
  'inside-castle': {
    source: `${soundtrackBase}inside-the-castle-quietly-suspenseful.mp3`,
    startAtSec: 0,
    loop: true,
    volume: 0.58,
  },
  'round-table': {
    source: `${soundtrackBase}the-round-table-candlelit-intrigue.mp3`,
    startAtSec: 0,
    loop: true,
    volume: 0.58,
  },
  conclave: {
    source: `${soundtrackBase}the-conclave-the-hollow-withdrawal.mp3`,
    startAtSec: 0,
    loop: true,
    volume: 0.58,
  },
  murder: {
    source: `${soundtrackBase}the-murder-the-castles-final-bell.mp3`,
    startAtSec: 210,
    loop: true,
    volume: 0.66,
  },
  'loyals-win': {
    source: `${soundtrackBase}loyals-win-the-final-chord.mp3`,
    startAtSec: 0,
    loop: false,
    volume: 0.72,
  },
  'betrayers-win': {
    source: `${soundtrackBase}the-betrayers-win-the-hollow-withdrawal.mp3`,
    startAtSec: 90,
    loop: false,
    volume: 0.72,
  },
}

export function resolveBetrayalsSoundtrackScene(
  run: Run | null,
  homeOpen: boolean,
  cue?: PresentationCue
): BetrayalsMusicScene {
  if (!run || homeOpen) return 'intro-hub'

  if (cue === 'departure') return 'round-table'
  if (run.phase === 'settled' || cue === 'finale') {
    return run.result?.winningRole === 'loyal' ? 'loyals-win' : 'betrayers-win'
  }

  if (cue === 'round-table') return 'round-table'
  if (cue === 'conclave-arrival' || cue === 'conclave-seal') return 'conclave'
  if (cue === 'death-letter' || (cue === 'awakening' && run.lastDawn?.eliminatedId)) {
    return 'murder'
  }

  if (
    run.phase === 'round-table' ||
    run.phase === 'final-banishment' ||
    run.phase === 'table-reveal'
  ) {
    return 'round-table'
  }

  // Everyone hears the same night cue so the soundtrack cannot reveal a hidden role.
  if (run.phase === 'night') return 'conclave'
  if (run.phase === 'night-resolved' && run.lastDawn?.eliminatedId) return 'murder'

  return 'inside-castle'
}

const MUSIC_OWNER = 'betrayals:scene-soundtrack'
const FADE_OUT_MS = 650
const FADE_IN_MS = 850

type ActiveSoundtrack = {
  audio: HTMLAudioElement
  scene: BetrayalsMusicScene
  baseVolume: number
  ready: boolean
  endedHandler: () => void
}

export class BetrayalsSoundtrackController {
  private active: ActiveSoundtrack | null = null
  private generation = 0
  private fadeFrame: number | null = null
  private finishFade: (() => void) | null = null
  private pendingSeekCleanup: (() => void) | null = null

  transition(scene: BetrayalsMusicScene | null): Promise<void> {
    const generation = ++this.generation
    this.cancelFade()
    this.cancelPendingSeek()
    return this.applyTransition(generation, scene)
  }

  resumeFromGesture(): void {
    const active = this.active
    if (!active?.ready || active.audio.ended || !active.audio.paused) return
    void this.playAndFade(active, this.generation)
  }

  dispose(): Promise<void> {
    return this.transition(null)
  }

  private async applyTransition(
    generation: number,
    scene: BetrayalsMusicScene | null
  ): Promise<void> {
    const previous = this.active
    if (previous) {
      await this.fade(previous, 0, FADE_OUT_MS, generation)
      if (generation !== this.generation) return
      this.release(previous, false)
    }

    if (generation !== this.generation) return
    if (!scene) {
      void SoundManager.syncMusic()
      return
    }

    const definition = BETRAYALS_SOUNDTRACKS[scene]
    const audio = new Audio(new URL(definition.source, document.baseURI).toString())
    audio.preload = 'auto'
    audio.loop = definition.loop && definition.startAtSec === 0
    audio.volume = 0

    const active: ActiveSoundtrack = {
      audio,
      scene,
      baseVolume: 0,
      ready: definition.startAtSec === 0,
      endedHandler: () => {},
    }
    active.endedHandler = () => {
      if (
        !definition.loop ||
        definition.startAtSec === 0 ||
        this.active !== active ||
        generation !== this.generation
      ) {
        return
      }
      audio.currentTime = definition.startAtSec
      void audio.play().catch(() => undefined)
    }

    this.active = active
    SoundManager.claimExternalMusic(MUSIC_OWNER, audio, 0)

    const seekReady = await this.seekToStart(active, definition.startAtSec, generation)
    if (!seekReady || generation !== this.generation) {
      if (generation === this.generation && this.active === active) this.release(active, true)
      return
    }
    active.ready = true
    audio.addEventListener('ended', active.endedHandler)
    await this.playAndFade(active, generation)
  }

  private async seekToStart(
    active: ActiveSoundtrack,
    startAtSec: number,
    generation: number
  ): Promise<boolean> {
    if (startAtSec === 0) return true
    if (active.audio.readyState >= 1) {
      try {
        active.audio.currentTime = startAtSec
        return true
      } catch {
        return false
      }
    }

    return new Promise((resolve) => {
      const finish = (ready: boolean) => {
        this.pendingSeekCleanup = null
        active.audio.removeEventListener('loadedmetadata', onMetadata)
        active.audio.removeEventListener('error', onError)
        if (!ready || generation !== this.generation) {
          resolve(false)
          return
        }
        try {
          active.audio.currentTime = startAtSec
          resolve(true)
        } catch {
          resolve(false)
        }
      }
      const onMetadata = () => finish(true)
      const onError = () => finish(false)
      this.pendingSeekCleanup = () => finish(false)
      active.audio.addEventListener('loadedmetadata', onMetadata, { once: true })
      active.audio.addEventListener('error', onError, { once: true })
      active.audio.load()
    })
  }

  private async playAndFade(active: ActiveSoundtrack, generation: number): Promise<void> {
    try {
      await active.audio.play()
    } catch (error) {
      if (
        generation === this.generation &&
        this.active === active &&
        (error as DOMException).name !== 'NotAllowedError'
      ) {
        this.release(active, true)
      }
      return
    }

    if (generation !== this.generation || this.active !== active) {
      active.audio.pause()
      return
    }

    await this.fade(active, BETRAYALS_SOUNDTRACKS[active.scene].volume, FADE_IN_MS, generation)
  }

  private fade(
    active: ActiveSoundtrack,
    targetVolume: number,
    durationMs: number,
    generation: number
  ): Promise<void> {
    if (durationMs <= 0 || active.baseVolume === targetVolume) {
      active.baseVolume = targetVolume
      SoundManager.setExternalMusicVolume(MUSIC_OWNER, active.audio, targetVolume)
      return Promise.resolve()
    }

    const startVolume = active.baseVolume
    const startedAt = performance.now()
    return new Promise((resolve) => {
      const step = (now: number) => {
        if (generation !== this.generation || this.active !== active) {
          this.fadeFrame = null
          this.finishFade = null
          resolve()
          return
        }
        const progress = Math.min(1, (now - startedAt) / durationMs)
        active.baseVolume = startVolume + (targetVolume - startVolume) * progress
        SoundManager.setExternalMusicVolume(MUSIC_OWNER, active.audio, active.baseVolume)
        if (progress >= 1) {
          this.fadeFrame = null
          this.finishFade = null
          resolve()
          return
        }
        this.fadeFrame = window.requestAnimationFrame(step)
      }
      this.finishFade = resolve
      this.fadeFrame = window.requestAnimationFrame(step)
    })
  }

  private release(active: ActiveSoundtrack, restore: boolean): void {
    active.audio.pause()
    active.audio.removeEventListener('ended', active.endedHandler)
    if (this.active === active) this.active = null
    SoundManager.releaseExternalMusic(MUSIC_OWNER, active.audio, restore)
  }

  private cancelFade(): void {
    if (this.fadeFrame !== null) window.cancelAnimationFrame(this.fadeFrame)
    this.fadeFrame = null
    const finish = this.finishFade
    this.finishFade = null
    finish?.()
  }

  private cancelPendingSeek(): void {
    const cleanup = this.pendingSeekCleanup
    this.pendingSeekCleanup = null
    cleanup?.()
  }
}

export function useBetrayalsSoundtrack(scene: BetrayalsMusicScene): void {
  const controllerRef = useRef<BetrayalsSoundtrackController | null>(null)

  useEffect(() => {
    const controller = new BetrayalsSoundtrackController()
    controllerRef.current = controller
    return () => {
      if (controllerRef.current === controller) controllerRef.current = null
      void controller.dispose()
    }
  }, [])

  useEffect(() => {
    void controllerRef.current?.transition(scene)
  }, [scene])

  useEffect(() => {
    const unlockAndResume = () => {
      SoundManager.unlockFromGesture()
      controllerRef.current?.resumeFromGesture()
    }
    document.addEventListener('pointerdown', unlockAndResume, true)
    document.addEventListener('keydown', unlockAndResume, true)
    return () => {
      document.removeEventListener('pointerdown', unlockAndResume, true)
      document.removeEventListener('keydown', unlockAndResume, true)
    }
  }, [])
}
