import type { PropsWithChildren } from 'react'
import { act, renderHook } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installSafetyFixture } from '../safety/__tests__/safetyFixture'
import * as persistence from '../store/durablePersistence'
import type { RootState } from '../store/store'
import type { BetrayalsAdBreakEvent } from './adBreakPolicy'
import { BETRAYALS_AD_BREAK_TIMEOUT_MS, useBetrayalsAdBreak } from './useBetrayalsAdBreak'

const invalidate = vi.hoisted(() => vi.fn())
vi.mock('../services/ads/admobBridge', () => ({ invalidateAdMobRequests: invalidate }))

const event: BetrayalsAdBreakEvent = {
  id: 'banishment:1',
  runId: 'run-a',
  day: 1,
  kind: 'banishment',
}

function Wrapper({ children }: PropsWithChildren) {
  const state = {
    ads: { hasNoAdsPack: false, dailyUsage: {}, automaticBreaks: {} },
    vip: { isActive: false, entitlements: {} },
  } as RootState
  const store = configureStore({ reducer: (current: RootState = state) => current })
  return <Provider store={store}>{children}</Provider>
}

describe('Betrayals interstitial lifecycle', () => {
  beforeEach(() => {
    localStorage.clear()
    installSafetyFixture(28)
    invalidate.mockClear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    delete window.GameAds
  })

  it('claims the event before native UI and waits until dismissal without duplicate requests', async () => {
    let dismiss!: (shown: boolean) => void
    const bridge = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          dismiss = resolve
        })
    )
    window.GameAds = { showInterstitial: bridge, showRewarded: vi.fn() }
    const hook = renderHook(() => useBetrayalsAdBreak({ runId: event.runId, noAds: false }), {
      wrapper: Wrapper,
    })
    let first!: Promise<boolean>
    let duplicate!: Promise<boolean>
    await act(async () => {
      first = hook.result.current.requestBreak(event)
      duplicate = hook.result.current.requestBreak(event)
    })
    expect(first).toBe(duplicate)
    expect(bridge).toHaveBeenCalledOnce()
    expect(bridge).toHaveBeenCalledWith('betrayals_banishment_break')
    expect(persistence.getDurableItem('big-eye:betrayals:ad-breaks:v1:run-a')).toContain(
      'banishment:1'
    )
    expect(hook.result.current.active).toBe(true)
    await act(async () => {
      dismiss(true)
      expect(await first).toBe(true)
    })
    expect(hook.result.current.active).toBe(false)
    await act(async () => {
      expect(await hook.result.current.requestBreak(event)).toBe(true)
    })
    expect(bridge).toHaveBeenCalledOnce()
  })

  it('does not replay an event when the screen is remounted', async () => {
    const bridge = vi.fn().mockResolvedValue(true)
    window.GameAds = { showInterstitial: bridge, showRewarded: vi.fn() }
    const first = renderHook(() => useBetrayalsAdBreak({ runId: event.runId, noAds: false }), {
      wrapper: Wrapper,
    })
    await act(async () => {
      await first.result.current.requestBreak(event)
    })
    first.unmount()
    const restored = renderHook(() => useBetrayalsAdBreak({ runId: event.runId, noAds: false }), {
      wrapper: Wrapper,
    })
    await act(async () => {
      expect(await restored.result.current.requestBreak(event)).toBe(true)
    })
    expect(bridge).toHaveBeenCalledOnce()
  })

  it.each([
    { noAds: true, enabled: true },
    { noAds: false, enabled: false },
  ])(
    'continues without an ad when No Ads is owned or the host is disabled (%j)',
    async (options) => {
      const bridge = vi.fn()
      window.GameAds = { showInterstitial: bridge, showRewarded: vi.fn() }
      const hook = renderHook(() => useBetrayalsAdBreak({ runId: event.runId, ...options }), {
        wrapper: Wrapper,
      })
      await act(async () => {
        expect(await hook.result.current.requestBreak(event)).toBe(true)
      })
      expect(bridge).not.toHaveBeenCalled()
      expect(hook.result.current.active).toBe(false)
    }
  )

  it('allows normal continuation with no ad bridge or no Redux provider', async () => {
    const hook = renderHook(() => useBetrayalsAdBreak({ runId: event.runId, noAds: false }))
    await act(async () => {
      expect(await hook.result.current.requestBreak(event)).toBe(true)
    })
    expect(hook.result.current.active).toBe(false)
  })

  it('fails open on unavailable ads without retrying the same slot', async () => {
    const bridge = vi.fn().mockRejectedValue(new Error('No fill'))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    window.GameAds = { showInterstitial: bridge, showRewarded: vi.fn() }
    const hook = renderHook(() => useBetrayalsAdBreak({ runId: event.runId, noAds: false }), {
      wrapper: Wrapper,
    })
    await act(async () => {
      expect(await hook.result.current.requestBreak(event)).toBe(true)
    })
    await act(async () => {
      expect(await hook.result.current.requestBreak(event)).toBe(true)
    })
    expect(bridge).toHaveBeenCalledOnce()
    expect(hook.result.current.active).toBe(false)
  })

  it('times out a stuck bridge, invalidates late native loading, and continues', async () => {
    vi.useFakeTimers()
    const bridge = vi.fn(() => new Promise<boolean>(() => undefined))
    window.GameAds = { showInterstitial: bridge, showRewarded: vi.fn() }
    const hook = renderHook(() => useBetrayalsAdBreak({ runId: event.runId, noAds: false }), {
      wrapper: Wrapper,
    })
    let completion!: Promise<boolean>
    await act(async () => {
      completion = hook.result.current.requestBreak(event)
    })
    expect(hook.result.current.active).toBe(true)
    await act(async () => {
      vi.advanceTimersByTime(BETRAYALS_AD_BREAK_TIMEOUT_MS)
      expect(await completion).toBe(true)
    })
    expect(hook.result.current.active).toBe(false)
    expect(invalidate).toHaveBeenCalledOnce()
  })

  it('never resumes an old run after a profile/run switch or unmount', async () => {
    let dismiss!: (shown: boolean) => void
    window.GameAds = {
      showInterstitial: vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            dismiss = resolve
          })
      ),
      showRewarded: vi.fn(),
    }
    const hook = renderHook(({ runId }) => useBetrayalsAdBreak({ runId, noAds: false }), {
      initialProps: { runId: event.runId },
      wrapper: Wrapper,
    })
    let completion!: Promise<boolean>
    await act(async () => {
      completion = hook.result.current.requestBreak(event)
    })
    hook.rerender({ runId: 'run-b' })
    expect(await completion).toBe(false)
    expect(hook.result.current.active).toBe(false)
    await act(async () => {
      dismiss(true)
    })
    expect(invalidate).toHaveBeenCalledOnce()
    await act(async () => {
      completion = hook.result.current.requestBreak({ ...event, runId: 'run-b' })
    })
    hook.unmount()
    expect(await completion).toBe(false)
    expect(invalidate).toHaveBeenCalledTimes(2)
  })

  it('cancels a pending native load if a restored VIP/No Ads entitlement arrives', async () => {
    window.GameAds = {
      showInterstitial: vi.fn(() => new Promise<boolean>(() => undefined)),
      showRewarded: vi.fn(),
    }
    const hook = renderHook(({ noAds }) => useBetrayalsAdBreak({ runId: event.runId, noAds }), {
      initialProps: { noAds: false },
      wrapper: Wrapper,
    })
    let completion!: Promise<boolean>
    await act(async () => {
      completion = hook.result.current.requestBreak(event)
    })
    hook.rerender({ noAds: true })
    expect(await completion).toBe(true)
    expect(hook.result.current.active).toBe(false)
    expect(invalidate).toHaveBeenCalledOnce()
  })

  it('skips the ad when its receipt cannot be durably saved', async () => {
    const bridge = vi.fn()
    window.GameAds = { showInterstitial: bridge, showRewarded: vi.fn() }
    vi.spyOn(persistence, 'flushDurablePersistence').mockResolvedValue(false)
    const hook = renderHook(() => useBetrayalsAdBreak({ runId: event.runId, noAds: false }), {
      wrapper: Wrapper,
    })
    await act(async () => {
      expect(await hook.result.current.requestBreak(event)).toBe(true)
    })
    expect(bridge).not.toHaveBeenCalled()
    expect(hook.result.current.active).toBe(false)
  })
})
