import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Run } from './run'
import {
  BETRAYALS_SOUNDTRACKS,
  BetrayalsSoundtrackController,
  resolveBetrayalsSoundtrackScene,
} from './betrayalsSoundtrack'

const soundManager = vi.hoisted(() => ({
  claimExternalMusic: vi.fn(),
  releaseExternalMusic: vi.fn(),
  setExternalMusicVolume: vi.fn(),
  syncMusic: vi.fn(),
  unlockFromGesture: vi.fn(),
}))

vi.mock('../services/sound/SoundManager', () => ({ SoundManager: soundManager }))

const run = (phase: Run['phase'], overrides: Partial<Run> = {}): Run =>
  ({ phase, ...overrides }) as Run

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Betrayals soundtrack routing', () => {
  it('uses the intro track on the entry hub and the castle loop through gameplay', () => {
    expect(resolveBetrayalsSoundtrackScene(null, false)).toBe('intro-hub')
    expect(resolveBetrayalsSoundtrackScene(run('social'), true)).toBe('intro-hub')
    expect(resolveBetrayalsSoundtrackScene(run('role-reveal'), false)).toBe('inside-castle')
    expect(resolveBetrayalsSoundtrackScene(run('immunity'), false)).toBe('inside-castle')
  })

  it('keeps Round Table music through ballots and their departure cue', () => {
    expect(resolveBetrayalsSoundtrackScene(run('round-table'), false)).toBe('round-table')
    expect(resolveBetrayalsSoundtrackScene(run('table-reveal'), false)).toBe('round-table')
    expect(resolveBetrayalsSoundtrackScene(run('night'), false, 'departure')).toBe('round-table')
  })

  it('uses the same Conclave bed for everyone during night', () => {
    expect(resolveBetrayalsSoundtrackScene(run('night'), false)).toBe('conclave')
    expect(resolveBetrayalsSoundtrackScene(run('night'), false, 'conclave-arrival')).toBe(
      'conclave'
    )
  })

  it('plays the murder cue for a death reveal', () => {
    const afterMurder = run('night-resolved', {
      lastDawn: { day: 2, eliminatedId: 'guest-2' },
    })
    expect(resolveBetrayalsSoundtrackScene(afterMurder, false)).toBe('murder')
    expect(resolveBetrayalsSoundtrackScene(afterMurder, false, 'awakening')).toBe('murder')
    expect(resolveBetrayalsSoundtrackScene(run('night-resolved'), false)).toBe('inside-castle')
  })

  it('selects a non-looping one-shot for the winning side', () => {
    expect(
      resolveBetrayalsSoundtrackScene(
        run('settled', { result: { winningRole: 'loyal' } as NonNullable<Run['result']> }),
        false
      )
    ).toBe('loyals-win')
    expect(
      resolveBetrayalsSoundtrackScene(
        run('settled', { result: { winningRole: 'betrayer' } as NonNullable<Run['result']> }),
        false
      )
    ).toBe('betrayers-win')
    expect(BETRAYALS_SOUNDTRACKS['loyals-win'].loop).toBe(false)
    expect(BETRAYALS_SOUNDTRACKS['betrayers-win'].loop).toBe(false)
  })

  it('waits until the finale reveal to start victory music', () => {
    const result = {
      winningRole: 'loyal',
    } as NonNullable<Run['result']>
    const settled = run('settled', { result, presentation: ['departure', 'finale'] })

    expect(resolveBetrayalsSoundtrackScene(settled, false, 'departure')).toBe('round-table')
    expect(resolveBetrayalsSoundtrackScene(settled, false, 'finale')).toBe('loyals-win')
    expect(resolveBetrayalsSoundtrackScene(settled, false)).toBe('loyals-win')
  })

  it('seeks the marked cues and loops the scene tracks', () => {
    expect(BETRAYALS_SOUNDTRACKS.murder.startAtSec).toBe(210)
    expect(BETRAYALS_SOUNDTRACKS['betrayers-win'].startAtSec).toBe(90)
    expect(BETRAYALS_SOUNDTRACKS['intro-hub'].startAtSec).toBe(0)
    expect(BETRAYALS_SOUNDTRACKS['inside-castle'].loop).toBe(true)
    expect(BETRAYALS_SOUNDTRACKS['round-table'].loop).toBe(true)
    expect(BETRAYALS_SOUNDTRACKS.conclave.loop).toBe(true)
    expect(BETRAYALS_SOUNDTRACKS.murder.loop).toBe(true)
  })

  it('fades between scenes and seeks before starting the murder passage', async () => {
    const audioElements: HTMLAudioElement[] = []
    vi.spyOn(performance, 'now').mockReturnValue(0)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      queueMicrotask(() => callback(1000))
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    vi.stubGlobal('Audio', function MockAudio(this: unknown, source: string) {
      const audio = document.createElement('audio')
      audio.src = source
      Object.defineProperty(audio, 'readyState', { value: 1 })
      vi.spyOn(audio, 'play').mockResolvedValue()
      vi.spyOn(audio, 'pause').mockImplementation(() => {})
      audioElements.push(audio)
      return audio
    })

    const controller = new BetrayalsSoundtrackController()
    await controller.transition('intro-hub')
    expect(audioElements[0].loop).toBe(true)

    await controller.transition('murder')
    expect(soundManager.setExternalMusicVolume).toHaveBeenCalledWith(
      'betrayals:scene-soundtrack',
      audioElements[0],
      0
    )
    expect(soundManager.releaseExternalMusic).toHaveBeenCalledWith(
      'betrayals:scene-soundtrack',
      audioElements[0],
      false
    )
    expect(audioElements[1].currentTime).toBe(210)
    expect(audioElements[1].loop).toBe(false)
    expect(audioElements[1].play).toHaveBeenCalledOnce()

    await controller.dispose()
    expect(soundManager.releaseExternalMusic).toHaveBeenLastCalledWith(
      'betrayals:scene-soundtrack',
      audioElements[1],
      false
    )
  })
})
