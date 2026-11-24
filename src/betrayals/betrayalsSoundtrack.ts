import { useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
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
  remoteSource: string
  fallbackSource: string
  startAtSec: number
  loop: boolean
  volume: number
}

const soundtrackBase = `${import.meta.env.BASE_URL}assets/betrayals/music/`
const streamedBase = `${soundtrackBase}streamed/`
const offlineBase = `${soundtrackBase}offline/`
const hostedStreamedBase = new URL(
  'assets/betrayals/music/streamed/',
  'https://georgi-cole.github.io/the-big-eye-betrayals/'
).toString()

function soundtrack(file: string, startAtSec: number, loop: boolean, volume: number) {
  return {
    source: `${streamedBase}${file}`,
    remoteSource: `${hostedStreamedBase}${file}`,
    fallbackSource: `${offlineBase}${file}`,
    startAtSec,
    loop,
    volume,
  }
}

export const BETRAYALS_SOUNDTRACKS: Readonly<Record<BetrayalsMusicScene, SoundtrackDefinition>> = {
  'intro-hub': soundtrack('introhub-main-the-four-note-motif.mp3', 0, true, 0.62),
  'inside-castle': soundtrack('inside-the-castle-quietly-suspenseful.mp3', 0, true, 0.58),
  'round-table': soundtrack('the-round-table-candlelit-intrigue.mp3', 0, true, 0.58),
  conclave: soundtrack('the-conclave-the-hollow-withdrawal.mp3', 0, true, 0.38),
  murder: soundtrack('the-murder-the-castles-final-bell.mp3', 210, true, 0.66),
  'loyals-win': soundtrack('loyals-win-the-final-chord.mp3', 0, false, 0.72),
  'betrayers-win': soundtrack('the-betrayers-win-the-hollow-withdrawal.mp3', 90, false, 0.72),
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
const STREAM_START_TIMEOUT_MS = 12_000

type ActiveSoundtrack = {
  audio: HTMLAudioElement
  scene: BetrayalsMusicScene
  baseVolume: number
  ready: boolean
  fallback: boolean
  endedHandler: () => void
  errorHandler: () => void
  startupTimer: number | null
  fallbackRequested: boolean
}

export class BetrayalsSoundtrackController {
  private active: ActiveSoundtrack | null = null
  private generation = 0
  private fadeFrame: number | null = null
  private finishFade: (() => void) | null = null
  private pendingSeekCleanup: (() => void) | null = null

  transition(scene: BetrayalsMusicScene | null, fallbackOnly = false): Promise<void> {
    const generation = ++this.generation
    this.cancelFade()
    this.cancelPendingSeek()
    return this.applyTransition(generation, scene, fallbackOnly)
  }

  resumeFromGesture(): void {
    const active = this.active
    if (!active?.ready || active.audio.ended || !active.audio.paused) return
    const generation = this.generation
    void this.playAndFade(active, generation).then((result) => {
      if (result === 'failed') void this.switchToFallback(active, generation)
    })
  }

  dispose(): Promise<void> {
    return this.transition(null)
  }

  private async applyTransition(
    generation: number,
    scene: BetrayalsMusicScene | null,
    fallbackOnly: boolean
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

    await this.startScene(scene, generation, fallbackOnly)
  }

  private async startScene(
    scene: BetrayalsMusicScene,
    generation: number,
    fallbackOnly: boolean
  ): Promise<void> {
    if (generation !== this.generation) return
    const definition = BETRAYALS_SOUNDTRACKS[scene]
    const remote = Capacitor.isNativePlatform()
    const useFallback =
      fallbackOnly || (remote && typeof navigator !== 'undefined' && navigator.onLine === false)
    const startAtSec = useFallback ? 0 : definition.startAtSec
    const source = useFallback
      ? definition.fallbackSource
      : remote
        ? definition.remoteSource
        : definition.source
    const audio = new Audio(new URL(source, document.baseURI).toString())
    audio.preload = 'metadata'
    audio.loop = definition.loop && startAtSec === 0
    audio.volume = 0

    const active: ActiveSoundtrack = {
      audio,
      scene,
      baseVolume: 0,
      ready: startAtSec === 0,
      fallback: useFallback,
      endedHandler: () => {},
      errorHandler: () => {},
      startupTimer: null,
      fallbackRequested: false,
    }
    active.endedHandler = () => {
      if (
        !definition.loop ||
        startAtSec === 0 ||
        this.active !== active ||
        generation !== this.generation
      ) {
        return
      }
      audio.currentTime = startAtSec
      void audio.play().catch(() => undefined)
    }
    active.errorHandler = () => {
      void this.switchToFallback(active, generation)
    }

    this.active = active
    SoundManager.claimExternalMusic(MUSIC_OWNER, audio, 0)
    if (!useFallback) {
      audio.addEventListener('error', active.errorHandler)
      if (remote) {
        active.startupTimer = window.setTimeout(active.errorHandler, STREAM_START_TIMEOUT_MS)
      }
    }

    const seekReady = await this.seekToStart(active, startAtSec, generation)
    if (!seekReady || generation !== this.generation) {
      if (generation !== this.generation || this.active !== active || active.fallbackRequested) {
        return
      }
      if (!useFallback) {
        this.release(active, true)
        await this.startScene(scene, generation, true)
        return
      }
      this.release(active, true)
      return
    }
    active.ready = true
    audio.addEventListener('ended', active.endedHandler)
    const playback = await this.playAndFade(active, generation)
    if (
      playback === 'failed' &&
      !useFallback &&
      !active.fallbackRequested &&
      generation === this.generation &&
      this.active === active
    ) {
      this.release(active, true)
      await this.startScene(scene, generation, true)
    }
  }

  private async switchToFallback(active: ActiveSoundtrack, generation: number): Promise<void> {
    if (
      active.fallback ||
      active.fallbackRequested ||
      this.active !== active ||
      generation !== this.generation
    ) {
      return
    }
    active.fallbackRequested = true
    this.cancelPendingSeek()
    await this.fade(active, 0, FADE_OUT_MS, generation)
    if (generation !== this.generation || this.active !== active) return
    this.release(active, false)
    await this.startScene(active.scene, generation, true)
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

  private async playAndFade(
    active: ActiveSoundtrack,
    generation: number
  ): Promise<'played' | 'blocked' | 'failed'> {
    try {
      await active.audio.play()
    } catch (error) {
      if (generation !== this.generation || this.active !== active) return 'failed'
      if ((error as DOMException).name === 'NotAllowedError') {
        this.clearStartupTimer(active)
        return 'blocked'
      }
      return 'failed'
    }

    if (generation !== this.generation || this.active !== active) {
      active.audio.pause()
      return 'failed'
    }

    this.clearStartupTimer(active)
    await this.fade(active, BETRAYALS_SOUNDTRACKS[active.scene].volume, FADE_IN_MS, generation)
    return 'played'
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
    this.clearStartupTimer(active)
    active.audio.pause()
    active.audio.removeEventListener('ended', active.endedHandler)
    active.audio.removeEventListener('error', active.errorHandler)
    if (this.active === active) this.active = null
    SoundManager.releaseExternalMusic(MUSIC_OWNER, active.audio, restore)
  }

  private clearStartupTimer(active: ActiveSoundtrack): void {
    if (active.startupTimer === null) return
    window.clearTimeout(active.startupTimer)
    active.startupTimer = null
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
