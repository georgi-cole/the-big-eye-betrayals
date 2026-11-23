import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { ReactReduxContext } from 'react-redux'
import { invalidateAdMobRequests } from '../services/ads/admobBridge'
import { canShowAd, showInterstitial } from '../services/ads/adsService'
import {
  flushDurablePersistence,
  getDurableItem,
  setDurableItem,
} from '../store/durablePersistence'
import type { AppDispatch, RootState } from '../store/store'
import { betrayalsAdPlacement, type BetrayalsAdBreakEvent } from './adBreakPolicy'

export const BETRAYALS_AD_BREAK_TIMEOUT_MS = 45_000
const ledgerPrefix = 'big-eye:betrayals:ad-breaks:v1:'

type Options = { runId?: string; noAds: boolean; enabled?: boolean }
type PendingBreak = {
  key: string
  runId: string
  promise: Promise<boolean>
  finish: (resume: boolean, invalidate?: boolean) => void
}

function claimBreak(event: BetrayalsAdBreakEvent): 'claimed' | 'handled' | 'unavailable' {
  const storageKey = ledgerPrefix + event.runId
  const key = JSON.stringify([event.day, event.kind, event.id])
  let ids: string[] = []
  try {
    const saved: unknown = JSON.parse(getDurableItem(storageKey) ?? '[]')
    if (Array.isArray(saved)) ids = saved.filter((id): id is string => typeof id === 'string')
  } catch {
    // A damaged receipt must not prevent the season from continuing.
  }
  if (ids.includes(key)) return 'handled'
  return setDurableItem(storageKey, JSON.stringify([...ids, key])) ? 'claimed' : 'unavailable'
}

/**
 * Call only after the event's result/cinematics close. Resolves true when the
 * same mounted run may continue, including unavailable ads and owned No Ads;
 * false means a stale run, unmount, or another break is already in progress.
 * Nothing here changes game state or makes progression depend on ad success.
 */
export function useBetrayalsAdBreak({ runId, noAds, enabled = true }: Options) {
  const context = useContext(ReactReduxContext)
  const [active, setActive] = useState(false)
  const mounted = useRef(true)
  const options = useRef({ runId, noAds, enabled })
  const pending = useRef<PendingBreak | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      pending.current?.finish(false, true)
    }
  }, [])

  useEffect(() => {
    options.current = { runId, noAds, enabled }
    const task = pending.current
    if (task && (task.runId !== runId || noAds || !enabled)) {
      task.finish(task.runId === runId, true)
    }
  }, [runId, noAds, enabled])

  const requestBreak = useCallback(
    (event: BetrayalsAdBreakEvent): Promise<boolean> => {
      if (!mounted.current || !runId || event.runId !== runId || options.current.runId !== runId)
        return Promise.resolve(false)
      const key = JSON.stringify([event.runId, event.day, event.kind, event.id])
      if (pending.current) {
        return pending.current.key === key ? pending.current.promise : Promise.resolve(false)
      }

      let resolve!: (resume: boolean) => void
      const promise = new Promise<boolean>((done) => {
        resolve = done
      })
      const timer = setTimeout(() => task.finish(true, true), BETRAYALS_AD_BREAK_TIMEOUT_MS)
      const task: PendingBreak = {
        key,
        runId,
        promise,
        finish(resume, invalidate = false) {
          if (pending.current !== task) return
          pending.current = null
          clearTimeout(timer)
          if (invalidate) invalidateAdMobRequests()
          if (mounted.current) setActive(false)
          resolve(resume && mounted.current && options.current.runId === runId)
        },
      }
      pending.current = task

      // Claim before opening native UI, so reload/repeated callbacks cannot
      // replay the same break. Failure to persist skips the ad, never the game.
      const claim = claimBreak(event)
      if (claim !== 'claimed') {
        task.finish(true)
        return promise
      }

      if (
        !options.current.enabled ||
        options.current.noAds ||
        !context ||
        !window.GameAds?.showInterstitial
      ) {
        void flushDurablePersistence().catch(() => undefined)
        task.finish(true)
        return promise
      }

      const placement = betrayalsAdPlacement(event)
      if (!canShowAd(placement, context.store.getState() as RootState)) {
        void flushDurablePersistence().catch(() => undefined)
        task.finish(true)
        return promise
      }

      setActive(true)
      void (async () => {
        try {
          const saved = await flushDurablePersistence()
          if (pending.current !== task) return
          if (!saved || options.current.noAds || !options.current.enabled) {
            task.finish(true)
            return
          }
          const requested = showInterstitial(
            placement,
            context.store.getState() as RootState,
            context.store.dispatch as AppDispatch,
            { onDismissed: () => task.finish(true) }
          )
          if (!requested) task.finish(true)
        } catch {
          task.finish(true, true)
        }
      })()
      return promise
    },
    [context, runId]
  )

  return { active, requestBreak }
}
