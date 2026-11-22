import { useRef, useState } from 'react'
import { getAdAvailabilityMessage } from '../services/ads/adAvailability'
import { useRewardedAd } from '../services/ads/useRewardedAd'
import './betrayals-reward-actions.css'

export type SeasonReward = 'rewind' | 'roles'

export function BetrayalsRewardActions({
  rewindTarget,
  showReveal,
  onClaim,
}: {
  rewindTarget?: 'day' | 'table'
  showReveal: boolean
  onClaim: (reward: SeasonReward) => Promise<boolean>
}) {
  const ad = useRewardedAd()
  const redeeming = useRef(false)
  const [active, setActive] = useState<SeasonReward>()
  const [notice, setNotice] = useState<string>()

  async function redeem(reward: SeasonReward) {
    if (redeeming.current) return
    redeeming.current = true
    setNotice(undefined)
    setActive(reward)
    try {
      const earned = await ad.request(
        reward === 'rewind' ? 'betrayals_rewind' : 'betrayals_reveal_roles'
      )
      if (!earned) {
        setNotice(getAdAvailabilityMessage() ?? 'The ad did not finish. You can try again.')
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

  return (
    <div className="betrayals-rewards" aria-busy={Boolean(active) || undefined}>
      {rewindTarget && (
        <button type="button" disabled={Boolean(active)} onClick={() => void redeem('rewind')}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 11a8 8 0 1 1 2 7M4 6v5h5m3-4v5l3 2" />
          </svg>
          <span>
            {active === 'rewind'
              ? 'Opening ad…'
              : rewindTarget === 'table'
                ? 'Rewind to Round Table'
                : 'Rewind to dawn'}
          </span>
          <small>Watch ad</small>
        </button>
      )}
      {showReveal && (
        <button type="button" disabled={Boolean(active)} onClick={() => void redeem('roles')}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6Z" />
            <circle cx="12" cy="12" r="2.5" />
          </svg>
          <span>{active === 'roles' ? 'Opening ad…' : 'Reveal the Betrayers'}</span>
          <small>Watch ad</small>
        </button>
      )}
      {notice && <p role="status">{notice}</p>}
    </div>
  )
}
