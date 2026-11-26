import { useEffect, useRef, useState } from 'react'
import { getPlayerSafety } from '../safety/playerSafety'
import { getAdAvailabilityMessage } from '../services/ads/adAvailability'
import { hasAdMobPrivacyOptions } from '../services/ads/admobBridge'
import { AdvertisingPrivacyControls } from '../services/ads/AdvertisingPrivacy'
import { useRewardedAd } from '../services/ads/useRewardedAd'
import './betrayals-reward-actions.css'

export type SeasonReward = 'rewind' | 'roles'

type RewindAction = {
  rewindTarget: 'day' | 'table'
  onLeave: () => Promise<string | undefined>
  motion?: 'reduced'
}

export function BetrayalsRewardActions({
  rewindTarget,
  onClaim,
  onLeave,
  motion,
}: { onClaim: (reward: SeasonReward) => Promise<boolean> } & (
  | RewindAction
  | { rewindTarget?: never; onLeave?: never; motion?: never }
)) {
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const ad = useRewardedAd()
  const redeeming = useRef(false)
  const [active, setActive] = useState<SeasonReward>()
  const [leaving, setLeaving] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [offerPrivacy, setOfferPrivacy] = useState(false)

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    element.showModal()
    return () => element.close()
  }, [])

  useEffect(() => {
    heading.current?.focus()
  }, [showPrivacy])

  async function redeem(reward: SeasonReward) {
    if (redeeming.current) return
    if (reward === 'rewind' && !getPlayerSafety()) {
      setShowPrivacy(true)
      return
    }
    redeeming.current = true
    setNotice(undefined)
    setOfferPrivacy(false)
    setActive(reward)
    try {
      const earned = await ad.request(
        reward === 'rewind' ? 'betrayals_rewind' : 'betrayals_reveal_roles'
      )
      if (!earned) {
        const unavailable = getAdAvailabilityMessage()
        setNotice(unavailable ?? 'The ad did not finish. You can try again.')
        setOfferPrivacy(
          reward === 'rewind' &&
            Boolean(unavailable) &&
            getPlayerSafety()?.ageBand === 'adult' &&
            hasAdMobPrivacyOptions()
        )
      } else if (!(await onClaim(reward))) {
        setNotice('The season has moved on. This reward is no longer available.')
      }
    } catch {
      setNotice('The reward could not be applied. Please try again.')
    } finally {
      redeeming.current = false
      setActive(undefined)
    }
  }

  if (rewindTarget) {
    const atTable = rewindTarget === 'table'
    const busy = Boolean(active || leaving)
    return (
      <dialog
        ref={dialog}
        className="betrayals-utility-dialog betrayals-leave"
        data-betrayals-motion={motion}
        aria-labelledby="betrayals-rewind-title"
        aria-describedby={showPrivacy ? undefined : 'betrayals-rewind-description'}
        onCancel={(event) => event.preventDefault()}
      >
        <div className="betrayals-utility-dialog__inner">
          <header className="betrayals-utility-dialog__header">
            <h2 ref={heading} id="betrayals-rewind-title" tabIndex={-1}>
              {showPrivacy ? 'Advertising privacy' : 'A second chance'}
            </h2>
          </header>
          {showPrivacy ? (
            <div className="betrayals-rewind__privacy player-safety player-safety--betrayals">
              <AdvertisingPrivacyControls betrayals insideReward />
              <button
                type="button"
                className="player-safety__secondary"
                onClick={() => {
                  const record = getPlayerSafety()
                  setNotice(record ? (getAdAvailabilityMessage() ?? undefined) : undefined)
                  setShowPrivacy(false)
                }}
              >
                Back to rewind
              </button>
            </div>
          ) : (
            <>
              <p id="betrayals-rewind-description">
                Watch an ad to return to {atTable ? 'the Round Table' : 'dawn'}. Leaving ends your
                stay in the castle.
              </p>
              {notice && <p role="alert">{notice}</p>}
              {offerPrivacy && (
                <button
                  type="button"
                  className="betrayals-inline-action betrayals-rewind__privacy-action"
                  onClick={() => setShowPrivacy(true)}
                  disabled={busy}
                >
                  Advertising privacy
                </button>
              )}
              <div
                className="betrayals-leave__actions betrayals-leave__actions--stacked"
                aria-busy={busy || undefined}
              >
                <button
                  type="button"
                  className="betrayals-primary"
                  disabled={busy}
                  onClick={() => void redeem('rewind')}
                >
                  {active ? 'Opening ad…' : atTable ? 'Rewind to Round Table' : 'Rewind to dawn'}
                </button>
                <button
                  type="button"
                  className="betrayals-inline-action"
                  disabled={busy}
                  onClick={async () => {
                    setLeaving(true)
                    setNotice(await onLeave())
                    setLeaving(false)
                  }}
                >
                  Leave the castle
                </button>
              </div>
            </>
          )}
        </div>
      </dialog>
    )
  }

  return (
    <div className="betrayals-rewards" aria-busy={Boolean(active) || undefined}>
      <button type="button" disabled={Boolean(active)} onClick={() => void redeem('roles')}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6Z" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
        <span>{active === 'roles' ? 'Opening ad…' : 'Reveal the Betrayers'}</span>
        <small>Watch ad</small>
      </button>
      {notice && <p role="status">{notice}</p>}
    </div>
  )
}
