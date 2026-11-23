import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import StoreProductIcon from '../components/StoreProductModal/StoreProductIcon'
import { formatEyeoleans } from '../economy/eyeoleans'
import {
  BETRAYALS_PRODUCTS,
  getBetrayalsProduct,
  type BetrayalsProductKey,
} from './commerce/catalog'
import { useBetrayalsCommerce } from './commerce/useBetrayalsCommerce'
import './BetrayalsStore.css'

export interface BetrayalsShieldOffer {
  available: boolean
  reason?: string
  price: number
  active: boolean
}

export interface BetrayalsStoreProps {
  profileId?: string
  balance?: number
  onOpenLooks?: () => void
  onOpenLegal?: () => void
  shield?: BetrayalsShieldOffer
  onBuyShield?: () => void | Promise<void>
  focusProduct?: BetrayalsProductKey
}

export default function BetrayalsStore({
  profileId,
  balance = 0,
  onOpenLooks,
  onOpenLegal,
  shield,
  onBuyShield,
  focusProduct,
}: BetrayalsStoreProps) {
  const commerce = useBetrayalsCommerce()
  const container = useRef<HTMLDivElement>(null)
  const [buyingShield, setBuyingShield] = useState(false)
  const [shieldError, setShieldError] = useState<string | null>(null)
  const vip = getBetrayalsProduct('vip')
  const busy = commerce.purchasing !== null

  useEffect(() => {
    if (focusProduct)
      container.current
        ?.querySelector<HTMLElement>(`[data-product="${focusProduct}"]`)
        ?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [focusProduct])

  function price(key: BetrayalsProductKey) {
    return (
      commerce.products[key]?.price ??
      (commerce.loading
        ? 'Checking price…'
        : Capacitor.isNativePlatform()
          ? 'Currently unavailable'
          : 'Available in the app')
    )
  }

  function buyButton(key: BetrayalsProductKey) {
    const product = getBetrayalsProduct(key)
    const owned =
      product.kind === 'permanent' &&
      (key === 'vip' ? commerce.vip : commerce[key as 'myPulse' | 'realityMode' | 'noAds'])
    const needsProfile = product.kind === 'consumable' && !profileId
    const disabled =
      busy || owned || !commerce.products[key] || !commerce.billingAvailable || needsProfile
    return (
      <button
        type="button"
        className={`betrayals-market__buy${owned ? ' is-owned' : ''}`}
        disabled={disabled}
        onClick={() => {
          void commerce.purchase(key, profileId)
        }}
        aria-label={owned ? `${product.title} owned` : `${product.title} — ${price(key)}`}
      >
        {owned
          ? commerce.vip && key !== 'vip'
            ? 'Included with VIP'
            : 'Owned'
          : commerce.purchasing === key
            ? 'Opening checkout…'
            : needsProfile
              ? 'Select a profile'
              : price(key)}
      </button>
    )
  }

  async function buyShield() {
    if (!shield?.available || !onBuyShield || buyingShield) return
    setBuyingShield(true)
    setShieldError(null)
    try {
      await onBuyShield()
    } catch (error) {
      setShieldError(error instanceof Error ? error.message : 'The shield could not be purchased.')
    } finally {
      setBuyingShield(false)
    }
  }

  return (
    <div className="betrayals-market" ref={container}>
      <div className="betrayals-market__wallet">
        <span>Your Eyeros</span>
        <strong>
          {formatEyeoleans(balance)} <span aria-hidden="true">◈</span>
        </strong>
      </div>

      <article className="betrayals-market__vip" data-product="vip">
        <div className="betrayals-market__vip-top">
          <StoreProductIcon name="vip" />
          <span className="betrayals-market__eyebrow">One-time purchase · Permanent access</span>
          <h3>
            Betrayals <em>VIP</em>
          </h3>
          <p>Make the castle your own.</p>
        </div>
        <ul>
          {vip.benefits.map((benefit) => (
            <li key={benefit}>{benefit}</li>
          ))}
        </ul>
        {buyButton('vip')}
        {commerce.vipUpgradeAvailable && (
          <small>Your standalone purchases reduce this VIP price.</small>
        )}
        <small>Eyeros packs and Night Shields are purchased separately.</small>
      </article>

      <section className="betrayals-market__section" aria-labelledby="betrayals-market-unlocks">
        <div className="betrayals-market__heading">
          <span className="betrayals-market__eyebrow">Choose your experience</span>
          <h3 id="betrayals-market-unlocks">Individual unlocks</h3>
        </div>
        {(['myPulse', 'realityMode', 'noAds'] as const).map((key) => {
          const product = getBetrayalsProduct(key)
          return (
            <article className="betrayals-market__unlock" data-product={key} key={key}>
              <StoreProductIcon
                name={
                  key === 'myPulse' ? 'publicMode' : key === 'realityMode' ? 'dramaMode' : 'noAds'
                }
              />
              <div>
                <h4>{product.title}</h4>
                <p>{product.description}</p>
                <small>Permanent · Included with VIP · Qualifies for an upgrade discount</small>
              </div>
              {buyButton(key)}
            </article>
          )
        })}
      </section>

      <section className="betrayals-market__section" aria-labelledby="betrayals-market-eyeros">
        <div className="betrayals-market__heading">
          <span className="betrayals-market__eyebrow">Your castle collection</span>
          <h3 id="betrayals-market-eyeros">Eyeros</h3>
          <p>Earn them in your season or add a pack to your profile.</p>
        </div>
        <div className="betrayals-market__packs">
          {BETRAYALS_PRODUCTS.filter((product) => product.kind === 'consumable').map((product) => (
            <article
              className="betrayals-market__pack"
              data-product={product.key}
              key={product.key}
            >
              <span className="betrayals-market__coin" aria-hidden="true">
                ◈
              </span>
              <h4>{formatEyeoleans(product.eyeros ?? 0)}</h4>
              <span>Eyeros</span>
              {buyButton(product.key)}
            </article>
          ))}
        </div>
        <p className="betrayals-market__fineprint">
          Packs belong to the profile selected at checkout. Eyeros are stored on this device;
          consumed packs are not restored after reinstalling or changing devices.
        </p>
      </section>

      <section className="betrayals-market__section" aria-labelledby="betrayals-market-spend">
        <div className="betrayals-market__heading">
          <h3 id="betrayals-market-spend">Spend your Eyeros</h3>
        </div>
        <article className="betrayals-market__shield">
          <StoreProductIcon name="survivalMode" />
          <div>
            <h4>Night Shield</h4>
            <p>Protect yourself from murder for one night. Banishment votes still count.</p>
            <small>
              Available with 6 or more guests alive, before tonight’s Conclave resolves.
            </small>
            {shield?.reason && <small>{shield.reason}</small>}
            {!shield && <small>Available during an eligible season, after banishment.</small>}
          </div>
          <button
            type="button"
            className="betrayals-market__buy"
            disabled={!shield?.available || !onBuyShield || buyingShield || busy}
            onClick={() => {
              void buyShield()
            }}
          >
            {shield?.active
              ? 'Protected tonight'
              : buyingShield
                ? 'Saving shield…'
                : shield
                  ? `${formatEyeoleans(shield.price)} Eyeros`
                  : 'Play a season'}
          </button>
        </article>
        {onOpenLooks && (
          <button type="button" className="betrayals-market__looks" onClick={onOpenLooks}>
            <span>
              <strong>The changing room</strong>
              <small>
                {commerce.paidLooks
                  ? 'Every look is yours with VIP'
                  : 'Discover looks to earn, collect and wear'}
              </small>
            </span>
            <span aria-hidden="true">›</span>
          </button>
        )}
      </section>

      {(commerce.error || commerce.notice || shieldError) && (
        <p
          className="betrayals-market__notice"
          role={commerce.error || shieldError ? 'alert' : 'status'}
        >
          {shieldError || commerce.error || commerce.notice}
        </p>
      )}
      <footer className="betrayals-market__footer">
        <button
          type="button"
          disabled={commerce.loading || busy}
          onClick={() => {
            void commerce.restore(profileId)
          }}
        >
          {commerce.loading ? 'Checking purchases…' : 'Restore purchases'}
        </button>
        <p>
          Permanent unlocks restore with your Apple or Google account. Optional rewarded ads remain
          available with No Ads and VIP.
        </p>
        {onOpenLegal && (
          <button type="button" onClick={onOpenLegal}>
            Advertising privacy
          </button>
        )}
        <div className="betrayals-market__legal-links">
          <a
            href={`${import.meta.env.BASE_URL}legal/privacy-policy.html`}
            target="_blank"
            rel="noreferrer"
          >
            Privacy policy
          </a>
          <a
            href={`${import.meta.env.BASE_URL}legal/terms-of-use.html`}
            target="_blank"
            rel="noreferrer"
          >
            Terms of use
          </a>
        </div>
      </footer>
    </div>
  )
}
