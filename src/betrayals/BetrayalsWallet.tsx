import { useEffect, useId, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import GameBackButton from '../components/ui/GameBackButton/GameBackButton'
import { formatEyeoleans } from '../economy/eyeoleans'
import type { EyeoleanTransaction } from '../store/profilesSlice'
import { BETRAYALS_PRODUCTS, type BetrayalsCurrencyProductKey } from './commerce/catalog'
import { useBetrayalsCommerce } from './commerce/useBetrayalsCommerce'
import { IS_BETRAYALS_QA_BUILD } from './qaBuild'
import './BetrayalsWallet.css'

export interface BetrayalsWalletProps {
  profileId?: string
  profileName?: string
  balance: number
  transactions?: readonly EyeoleanTransaction[]
  onOpenProfile?: () => void
  onBack: () => void
  backLabel?: string
  initialTopUp?: boolean
}

const activitySources: Record<EyeoleanTransaction['source'], string> = {
  season_reward: 'Season reward',
  forecast_reward: 'Forecast reward',
  store_purchase: 'Purchase',
  purchase_credit: 'Top-up',
  adjustment: 'Adjustment',
}

const activityDate = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function ActivityDate({ createdAt }: { createdAt: string }) {
  const timestamp = Date.parse(createdAt)
  return Number.isFinite(timestamp) ? (
    <time dateTime={createdAt}>{activityDate.format(timestamp)}</time>
  ) : null
}

export default function BetrayalsWallet({
  profileId,
  profileName,
  balance,
  transactions = [],
  onOpenProfile,
  onBack,
  backLabel = 'Back to store',
  initialTopUp = false,
}: BetrayalsWalletProps) {
  const commerce = useBetrayalsCommerce()
  const [topUp, setTopUp] = useState(initialTopUp)
  const [expandedActivity, setExpandedActivity] = useState(false)
  const header = useRef<HTMLElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const previousView = useRef(topUp)
  const titleId = useId()
  const activityId = useId()
  const native = Capacitor.isNativePlatform()
  const busy = commerce.purchasing !== null
  const playerName = profileName?.trim() || 'Your profile'
  const activity = profileId
    ? [...transactions].reverse().sort((a, b) => {
        const left = Date.parse(a.createdAt)
        const right = Date.parse(b.createdAt)
        return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0)
      })
    : []
  const shownActivity = expandedActivity ? activity : activity.slice(0, 5)
  const displayedBalance = profileId ? formatEyeoleans(balance) : '—'

  useEffect(() => {
    // Store handles initial entry; only reset Wallet's own internal view changes.
    if (previousView.current === topUp) return
    previousView.current = topUp
    title.current?.focus({ preventScroll: true })
    const dialog = header.current?.closest('dialog')
    if (dialog) {
      if (typeof dialog.scrollTo === 'function') dialog.scrollTo({ top: 0, behavior: 'instant' })
      else dialog.scrollTop = 0
    } else {
      ;(header.current?.closest('main') ?? header.current)?.scrollIntoView?.({
        behavior: 'instant',
        block: 'start',
        inline: 'nearest',
      })
    }
  }, [topUp])

  const profileNeeded = !profileId && (
    <div className="betrayals-wallet__profile-needed">
      <strong>A wallet for your profile</strong>
      <p>Choose or create a profile to see your balance and receive Eyeros.</p>
      {onOpenProfile ? (
        <button type="button" className="betrayals-wallet__text-button" onClick={onOpenProfile}>
          Choose a profile <span aria-hidden="true">›</span>
        </button>
      ) : (
        <p>Open Profile to choose your player, then return here.</p>
      )}
    </div>
  )

  function packPrice(key: BetrayalsCurrencyProductKey) {
    if (IS_BETRAYALS_QA_BUILD) return 'Simulate top-up'
    return (
      commerce.products[key]?.price ??
      (commerce.loading
        ? 'Checking price…'
        : native
          ? 'Currently unavailable'
          : 'Available in the app')
    )
  }

  return (
    <section className="betrayals-wallet" aria-labelledby={titleId}>
      <header className="betrayals-wallet__header" ref={header}>
        <GameBackButton
          className="betrayals-wallet__back"
          onClick={() => (topUp ? setTopUp(false) : onBack())}
          label={topUp ? 'Back to wallet' : backLabel}
        />
        <span className="betrayals-wallet__eyebrow">Your castle currency</span>
        <h3 id={titleId} ref={title} tabIndex={-1}>
          {topUp ? 'Top up Eyeros' : 'Wallet'}
        </h3>
        <p>
          {topUp
            ? 'Choose a pack for your next look or Night Shield.'
            : 'Your balance and the story of where it goes.'}
        </p>
      </header>

      {topUp ? (
        <>
          <div className="betrayals-wallet__balance-line">
            <div>
              <span>Available balance</span>
              <small>{profileId ? playerName : 'No profile selected'}</small>
            </div>
            <strong aria-label={`${displayedBalance} Eyeros available`}>
              <span aria-hidden="true">◈</span> {displayedBalance}
            </strong>
          </div>
          {profileNeeded}
          <div className="betrayals-wallet__packs" aria-label="Eyeros packs">
            {BETRAYALS_PRODUCTS.filter((product) => product.kind === 'consumable').map(
              (product) => {
                const key = product.key as BetrayalsCurrencyProductKey
                const price = packPrice(key)
                const available = Boolean(
                  profileId &&
                  !busy &&
                  (IS_BETRAYALS_QA_BUILD ||
                    (native &&
                      commerce.ready &&
                      commerce.billingAvailable &&
                      commerce.products[key] &&
                      !commerce.loading))
                )
                const label =
                  commerce.purchasing === key
                    ? 'Opening checkout…'
                    : !profileId
                      ? 'Choose a profile'
                      : price
                return (
                  <article className="betrayals-wallet__pack" key={key} data-product={key}>
                    <span className="betrayals-wallet__coin" aria-hidden="true">
                      ◈
                    </span>
                    <div className="betrayals-wallet__pack-value">
                      <h4>{formatEyeoleans(product.eyeros ?? 0)}</h4>
                      <span>Eyeros</span>
                    </div>
                    <button
                      type="button"
                      className="betrayals-wallet__pack-buy"
                      disabled={!available}
                      aria-label={`Buy ${product.title} — ${label}`}
                      onClick={() => {
                        void commerce.purchase(key, profileId)
                      }}
                    >
                      {label}
                    </button>
                  </article>
                )
              }
            )}
          </div>
          <p className="betrayals-wallet__delivery">
            {profileId
              ? `Packs are delivered to ${playerName}.`
              : 'Choose a profile before buying.'}{' '}
            Eyeros packs are separate from VIP.
          </p>
          <footer className="betrayals-wallet__footer">
            <p>
              Eyeros are stored on this device. Consumed packs are not restored after clearing app
              data, reinstalling or changing devices.
            </p>
            <div>
              <button
                type="button"
                className="betrayals-wallet__text-button"
                disabled={!native || !profileId || commerce.loading || busy}
                onClick={() => {
                  void commerce.restore(profileId)
                }}
              >
                Restore purchases
              </button>
              <button
                type="button"
                className="betrayals-wallet__text-button"
                disabled={!native || commerce.loading || busy}
                onClick={() => {
                  void commerce.refresh()
                }}
              >
                {commerce.loading ? 'Checking prices…' : 'Refresh prices'}
              </button>
            </div>
          </footer>
        </>
      ) : (
        <>
          <article className="betrayals-wallet__balance-card">
            <div className="betrayals-wallet__balance-heading">
              <span>Available balance</span>
              {profileId && onOpenProfile ? (
                <button
                  type="button"
                  onClick={onOpenProfile}
                  aria-label={`Open profile: ${playerName}`}
                >
                  {playerName} <span aria-hidden="true">›</span>
                </button>
              ) : (
                <span>{profileId ? playerName : 'No profile selected'}</span>
              )}
            </div>
            <div
              className="betrayals-wallet__balance-amount"
              aria-label={`${displayedBalance} Eyeros available`}
            >
              <span className="betrayals-wallet__coin" aria-hidden="true">
                ◈
              </span>
              <strong>{displayedBalance}</strong>
            </div>
            <span className="betrayals-wallet__currency">Eyeros</span>
            <p>Earn them through your season. Spend them on looks and Night Shields.</p>
            <button
              type="button"
              className="betrayals-wallet__top-up"
              onClick={() => setTopUp(true)}
            >
              <span aria-hidden="true">＋</span> Top up Eyeros
            </button>
          </article>
          {profileNeeded}
          {profileId && (
            <section className="betrayals-wallet__activity" aria-labelledby={`${activityId}-title`}>
              <div className="betrayals-wallet__activity-heading">
                <h4 id={`${activityId}-title`}>Recent activity</h4>
                {activity.length > 5 && !expandedActivity && <span>Latest 5 entries</span>}
              </div>
              {activity.length ? (
                <ol id={activityId} className="betrayals-wallet__transactions">
                  {shownActivity.map((transaction) => (
                    <li key={transaction.id}>
                      <span
                        className={`betrayals-wallet__activity-mark${transaction.amount < 0 ? ' is-spend' : ''}`}
                        aria-hidden="true"
                      >
                        {transaction.amount < 0 ? '−' : '+'}
                      </span>
                      <div className="betrayals-wallet__transaction-detail">
                        <strong>{transaction.label}</strong>
                        <div>
                          <span>{activitySources[transaction.source]}</span>
                          <ActivityDate createdAt={transaction.createdAt} />
                        </div>
                      </div>
                      <span
                        className={`betrayals-wallet__transaction-amount${transaction.amount < 0 ? ' is-spend' : ''}`}
                      >
                        {transaction.amount < 0 ? '−' : transaction.amount > 0 ? '+' : ''}
                        {formatEyeoleans(Math.abs(transaction.amount))}
                        <span className="betrayals-wallet__sr-only"> Eyeros</span>
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="betrayals-wallet__empty">
                  No activity yet. Your earned Eyeros, top-ups and purchases will appear here.
                </p>
              )}
              {activity.length > 5 && (
                <button
                  type="button"
                  className="betrayals-wallet__more"
                  aria-expanded={expandedActivity}
                  aria-controls={activityId}
                  onClick={() => setExpandedActivity((expanded) => !expanded)}
                >
                  {expandedActivity ? 'Show less activity' : 'Show more activity'}
                </button>
              )}
            </section>
          )}
        </>
      )}

      {(commerce.error || commerce.notice) && (
        <p className="betrayals-wallet__notice" role={commerce.error ? 'alert' : 'status'}>
          {commerce.error || commerce.notice}
        </p>
      )}
    </section>
  )
}
