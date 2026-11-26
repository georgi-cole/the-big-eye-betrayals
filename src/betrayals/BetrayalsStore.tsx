import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Capacitor } from '@capacitor/core'
import StoreProductIcon from '../components/StoreProductModal/StoreProductIcon'
import { formatEyeoleans } from '../economy/eyeoleans'
import type { EyeoleanTransaction } from '../store/profilesSlice'
import {
  getBetrayalsProduct,
  type BetrayalsPermanentProductKey,
  type BetrayalsProductKey,
} from './commerce/catalog'
import { useBetrayalsCommerce } from './commerce/useBetrayalsCommerce'
import { betrayalsStoreSectionForProduct, type BetrayalsStoreSection } from './betrayalsNavigation'
import BetrayalsWallet from './BetrayalsWallet'
import './BetrayalsStore.css'

export type { BetrayalsStoreSection } from './betrayalsNavigation'

export interface BetrayalsShieldOffer {
  available: boolean
  reason?: string
  price: number
  active: boolean
}

export interface BetrayalsStoreProps {
  profileId?: string
  profileName?: string
  balance?: number
  transactions?: readonly EyeoleanTransaction[]
  onOpenProfile?: () => void
  onOpenLooks?: () => void
  onOpenLegal?: () => void
  shield?: BetrayalsShieldOffer
  onBuyShield?: () => void | Promise<void>
  focusProduct?: BetrayalsProductKey
  initialSection?: BetrayalsStoreSection
  section?: BetrayalsStoreSection
  onSectionChange?: (section: BetrayalsStoreSection) => void
}

const STORE_TABS = [
  { section: 'home', label: 'Featured', icon: 'publicMode', tone: 'featured' },
  { section: 'vip', label: 'VIP', icon: 'vip', tone: 'vip' },
  { section: 'features', label: 'Feature unlocks', icon: 'dramaMode', tone: 'features' },
  { section: 'items', label: 'Season items', icon: 'survivalMode', tone: 'season' },
] as const

const featureMarks = {
  myPulse: { tone: 'pulse', icon: 'publicMode' },
  realityMode: { tone: 'reality', icon: 'dramaMode' },
  dramaMode: { tone: 'reality', icon: 'dramaMode' },
  noAds: { tone: 'noAds', icon: 'noAds' },
} as const

type MarketMarkTone =
  | 'featured'
  | 'vip'
  | 'features'
  | 'season'
  | 'wallet'
  | 'wardrobe'
  | 'pulse'
  | 'reality'
  | 'noAds'

function MarketMark({
  tone,
  className,
  children,
}: {
  tone: MarketMarkTone
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={['betrayals-market__mark', `betrayals-market__mark--${tone}`, className]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    >
      {children}
    </span>
  )
}

function WalletMark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" focusable="false">
      <circle cx="24" cy="24" r="17" />
      <circle cx="24" cy="24" r="12.5" />
      <path d="m24 15 8 9-8 9-8-9 8-9Z" />
      <circle cx="24" cy="24" r="2" />
    </svg>
  )
}

function WardrobeMark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" focusable="false">
      <path d="M23.5 10a4.5 4.5 0 1 1 4.5 4.5V17l13 8.5H7L20 17v-2.5" />
      <path d="m11 27 2.5 14h21L37 27M17 27l1.3 14m12.4-14-1.4 14" />
    </svg>
  )
}

export default function BetrayalsStore({
  profileId,
  profileName,
  balance = 0,
  transactions,
  onOpenProfile,
  onOpenLooks,
  onOpenLegal,
  shield,
  onBuyShield,
  focusProduct,
  initialSection,
  section,
  onSectionChange,
}: BetrayalsStoreProps) {
  const commerce = useBetrayalsCommerce()
  const container = useRef<HTMLDivElement>(null)
  const previousSection = useRef(
    section ?? initialSection ?? betrayalsStoreSectionForProduct(focusProduct)
  )
  const [localSection, setLocalSection] = useState<BetrayalsStoreSection>(
    () => initialSection ?? betrayalsStoreSectionForProduct(focusProduct)
  )
  const [handledFocus, setHandledFocus] = useState(focusProduct)
  const [walletTopUp, setWalletTopUp] = useState(() => Boolean(focusProduct?.startsWith('eyeros')))
  const [buyingShield, setBuyingShield] = useState(false)
  const [shieldError, setShieldError] = useState<string | null>(null)
  const activeSection = section ?? localSection
  const vip = getBetrayalsProduct('vip')
  const busy = commerce.purchasing !== null

  // A contextual offer is an entry request. Keeping that request in props must
  // not reopen it after the player deliberately goes Back or opens Wallet.
  if (handledFocus !== focusProduct) {
    setHandledFocus(focusProduct)
    setWalletTopUp(Boolean(focusProduct?.startsWith('eyeros')))
    if (focusProduct) setLocalSection(betrayalsStoreSectionForProduct(focusProduct))
  }

  useEffect(() => {
    const sectionChanged = previousSection.current !== activeSection
    previousSection.current = activeSection
    const heading = container.current?.querySelector<HTMLElement>('h3')
    if (sectionChanged && heading) {
      heading.tabIndex = -1
      heading.focus({ preventScroll: true })
    }
    const dialog = container.current?.closest('dialog')
    if (dialog) dialog.scrollTo?.({ top: 0, behavior: 'instant' })
    else {
      const page = container.current?.closest('main') ?? container.current
      page?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
    }
    if (!focusProduct) return
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    container.current
      ?.querySelector<HTMLElement>(`[data-product="${focusProduct}"]`)
      ?.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' })
  }, [focusProduct, activeSection])

  function openSection(next: BetrayalsStoreSection) {
    setWalletTopUp(false)
    setShieldError(null)
    setLocalSection(next)
    onSectionChange?.(next)
  }

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

  function buyButton(key: BetrayalsPermanentProductKey) {
    const product = getBetrayalsProduct(key)
    const owned = commerce[key]
    return (
      <button
        type="button"
        className={`betrayals-market__buy${owned ? ' is-owned' : ''}`}
        disabled={busy || owned || !commerce.products[key] || !commerce.billingAvailable}
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
            : price(key)}
      </button>
    )
  }

  function looksLink() {
    return (
      onOpenLooks && (
        <button type="button" className="betrayals-market__looks" onClick={onOpenLooks}>
          <MarketMark tone="wardrobe" className="betrayals-market__looks-mark">
            <WardrobeMark />
          </MarketMark>
          <span>
            <strong>The changing room</strong>
            <small>
              {commerce.paidLooks
                ? 'Your VIP look collection'
                : 'Browse free looks and Eyeros unlocks'}
            </small>
          </span>
          <span aria-hidden="true">›</span>
        </button>
      )
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

  const feedback = (activeSection === 'items' && shieldError) || commerce.error || commerce.notice

  return (
    <div className="betrayals-market" data-store-section={activeSection} ref={container}>
      {activeSection !== 'wallet' && (
        <nav className="betrayals-market__tabs" aria-label="Store categories">
          {STORE_TABS.map((tab) => (
            <button
              type="button"
              key={tab.section}
              aria-pressed={activeSection === tab.section}
              className={activeSection === tab.section ? 'is-active' : undefined}
              onClick={() => openSection(tab.section)}
            >
              <MarketMark tone={tab.tone} className="betrayals-market__tab-mark">
                <StoreProductIcon name={tab.icon} />
              </MarketMark>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      )}
      {activeSection === 'home' && (
        <section className="betrayals-market__hub" aria-label="Store overview">
          <div className="betrayals-market__heading">
            <span className="betrayals-market__eyebrow">The castle collection</span>
            <h3>Make it yours</h3>
            <p>Choose an experience, prepare for the night or find your next look.</p>
          </div>
          <button
            type="button"
            className="betrayals-market__wallet-entry"
            aria-label={`Open wallet, ${formatEyeoleans(balance)} Eyeros`}
            onClick={() => openSection('wallet')}
          >
            <MarketMark tone="wallet" className="betrayals-market__wallet-mark">
              <WalletMark />
            </MarketMark>
            <span>
              <strong>Wallet</strong>
              <small>Balance &amp; top-ups</small>
            </span>
            <span className="betrayals-market__wallet-total">
              {formatEyeoleans(balance)}
              <small>Eyeros</small>
            </span>
            <span aria-hidden="true">›</span>
          </button>
          <article className="betrayals-market__vip-preview">
            <MarketMark tone="vip" className="betrayals-market__vip-mark">
              <StoreProductIcon name="vip" />
            </MarketMark>
            <div>
              <span className="betrayals-market__eyebrow">
                {commerce.vip ? 'VIP active' : 'One permanent unlock'}
              </span>
              <h3>
                Betrayals <em>VIP</em>
              </h3>
              <p>Full profiles, premium challenges, paid looks and an uninterrupted season.</p>
            </div>
            <button
              type="button"
              className="betrayals-market__explore"
              onClick={() => openSection('vip')}
            >
              {commerce.vip ? 'View VIP benefits' : 'Explore VIP'} <span aria-hidden="true">›</span>
            </button>
          </article>
          {looksLink()}
        </section>
      )}

      {activeSection === 'vip' && (
        <>
          <article className="betrayals-market__vip" data-product="vip">
            <div className="betrayals-market__vip-top">
              <MarketMark tone="vip" className="betrayals-market__vip-mark">
                <StoreProductIcon name="vip" />
              </MarketMark>
              <span className="betrayals-market__eyebrow">
                One-time purchase · Permanent access
              </span>
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
          <button
            type="button"
            className="betrayals-market__text-link"
            onClick={() => openSection('features')}
          >
            Explore individual unlocks <span aria-hidden="true">›</span>
          </button>
        </>
      )}

      {activeSection === 'features' && (
        <>
          <section className="betrayals-market__section" aria-labelledby="betrayals-market-unlocks">
            <div className="betrayals-market__heading">
              <span className="betrayals-market__eyebrow">Choose your experience</span>
              <h3 id="betrayals-market-unlocks">Feature unlocks</h3>
              <p>Permanent features, available individually or together with VIP.</p>
            </div>
            {(Object.keys(featureMarks) as (keyof typeof featureMarks)[]).map((key) => {
              const product = getBetrayalsProduct(key)
              return (
                <article
                  className={`betrayals-market__unlock${focusProduct === key ? ' is-targeted' : ''}`}
                  data-product={key}
                  key={key}
                >
                  <MarketMark
                    tone={featureMarks[key].tone}
                    className="betrayals-market__product-mark"
                  >
                    <StoreProductIcon name={featureMarks[key].icon} />
                  </MarketMark>
                  <div>
                    <h4>{product.title}</h4>
                    <p>{product.description}</p>
                    <small>Permanent · Included with VIP · Qualifies for an upgrade discount</small>
                  </div>
                  {buyButton(key)}
                </article>
              )
            })}
            <button
              type="button"
              className="betrayals-market__text-link"
              onClick={() => openSection('vip')}
            >
              See everything included with VIP <span aria-hidden="true">›</span>
            </button>
          </section>
        </>
      )}

      {activeSection === 'items' && (
        <>
          <section className="betrayals-market__section" aria-labelledby="betrayals-market-spend">
            <div className="betrayals-market__heading">
              <span className="betrayals-market__eyebrow">For your season</span>
              <h3 id="betrayals-market-spend">Season items</h3>
              <p>Use earned or purchased Eyeros for eligible items.</p>
            </div>
            <button
              type="button"
              className="betrayals-market__balance-link"
              onClick={() => openSection('wallet')}
            >
              <span>Wallet</span>
              <strong>◈ {formatEyeoleans(balance)} Eyeros</strong>
              <span aria-hidden="true">›</span>
            </button>
            <article className="betrayals-market__shield">
              <MarketMark tone="season" className="betrayals-market__product-mark">
                <StoreProductIcon name="survivalMode" />
              </MarketMark>
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
            {looksLink()}
          </section>
        </>
      )}

      {activeSection === 'wallet' && (
        <BetrayalsWallet
          key={handledFocus ?? 'wallet'}
          profileId={profileId}
          profileName={profileName}
          balance={balance}
          transactions={transactions}
          onOpenProfile={onOpenProfile}
          initialTopUp={walletTopUp}
          onBack={() => openSection('home')}
          backLabel="Back to store"
        />
      )}
      {activeSection !== 'wallet' && feedback && (
        <p
          className="betrayals-market__notice"
          role={commerce.error || shieldError ? 'alert' : 'status'}
        >
          {feedback}
        </p>
      )}
      <footer className="betrayals-market__footer">
        <details className="betrayals-market__support">
          <summary>Purchases &amp; support</summary>
          <div>
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
              Permanent unlocks restore with your Apple or Google account. Optional rewarded ads
              remain available with No Ads and VIP.
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
          </div>
        </details>
      </footer>
    </div>
  )
}
