import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BetrayalsStore, { type BetrayalsStoreSection } from './BetrayalsStore'
import { BETRAYALS_PRODUCTS, type BetrayalsProductKey } from './commerce/catalog'

const commerce = vi.hoisted(() => ({
  ready: true,
  vip: false,
  myPulse: false,
  realityMode: false,
  dramaMode: false,
  noAds: false,
  premiumGames: false,
  paidLooks: false,
  billingAvailable: true,
  products: {} as Partial<Record<BetrayalsProductKey, { productId: string; price: string }>>,
  loading: false,
  purchasing: null as BetrayalsProductKey | null,
  error: null as string | null,
  notice: null as string | null,
  vipUpgradeAvailable: false,
  purchase: vi.fn().mockResolvedValue(undefined),
  restore: vi.fn().mockResolvedValue(undefined),
  refresh: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./commerce/useBetrayalsCommerce', () => ({ useBetrayalsCommerce: () => commerce }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))

const prices: Record<BetrayalsProductKey, string> = {
  dramaMode: '$4.99',
  vip: '£12.49',
  myPulse: '£2.49',
  realityMode: '£5.99',
  noAds: '£2.49',
  eyeros10000: '£1.79',
  eyeros35000: '£4.49',
  eyeros100000: '£8.99',
}

describe('Betrayals Store journeys', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(commerce, {
      ready: true,
      vip: false,
      myPulse: false,
      realityMode: false,
      dramaMode: false,
      noAds: false,
      premiumGames: false,
      paidLooks: false,
      billingAvailable: true,
      loading: false,
      purchasing: null,
      error: null,
      notice: null,
      vipUpgradeAvailable: false,
      products: Object.fromEntries(
        BETRAYALS_PRODUCTS.map(({ key, productId }) => [key, { productId, price: prices[key] }])
      ),
    })
  })

  it('opens a compact overview with persistent category tabs instead of every purchase card', () => {
    const openLooks = vi.fn()
    render(
      <BetrayalsStore
        profileId="profile-a"
        profileName="Georgi"
        balance={4200}
        onOpenLooks={openLooks}
      />
    )

    expect(screen.getByRole('navigation', { name: 'Store categories' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Featured' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'VIP' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Feature unlocks' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Season items' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Explore VIP' })).toBeVisible()
    expect(screen.getByRole('button', { name: /Open wallet/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^Betrayals VIP —/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^My Pulse —/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Buy 10,000 Eyeros/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Night Shield' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /The changing room/ }))
    expect(openLooks).toHaveBeenCalledOnce()
    expect(commerce.purchase).not.toHaveBeenCalled()
  })

  it('opens VIP benefits from its tab and returns to the overview tab', () => {
    render(<BetrayalsStore profileId="profile-a" />)
    fireEvent.click(screen.getByRole('button', { name: 'Explore VIP' }))

    expect(screen.getByRole('button', { name: 'Betrayals VIP — £12.49' })).toBeEnabled()
    expect(screen.getByText('Every premium challenge version')).toBeVisible()
    expect(screen.getByText('Drama Mode: Castle Roles and private role reveals')).toBeVisible()
    expect(screen.queryByRole('button', { name: /^My Pulse —/ })).not.toBeInTheDocument()
    expect(commerce.purchase).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Featured' }))
    expect(screen.getByRole('button', { name: 'Explore VIP' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^Betrayals VIP —/ })).not.toBeInTheDocument()
  })

  it('keeps standalone checkout bound to its product, selected profile and native price', async () => {
    render(<BetrayalsStore profileId="profile-a" />)
    fireEvent.click(screen.getByRole('button', { name: 'Feature unlocks' }))

    const pulse = screen.getByRole('button', { name: 'My Pulse — £2.49' })
    expect(pulse).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Reality Mode — £5.99' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'No Ads — £2.49' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /^Buy 10,000 Eyeros/ })).not.toBeInTheDocument()
    expect(commerce.purchase).not.toHaveBeenCalled()

    await act(async () => fireEvent.click(pulse))
    expect(commerce.purchase).toHaveBeenCalledExactlyOnceWith('myPulse', 'profile-a')
  })

  it('offers Drama Mode as a standalone purchase', async () => {
    render(<BetrayalsStore profileId="profile-a" focusProduct="dramaMode" />)
    const checkout = screen.getByRole('button', { name: 'Drama Mode — $4.99' })
    expect(checkout).toBeEnabled()
    await act(async () => fireEvent.click(checkout))
    expect(commerce.purchase).toHaveBeenCalledExactlyOnceWith('dramaMode', 'profile-a')
  })

  it.each([
    ['vip', 'Betrayals VIP — £12.49'],
    ['myPulse', 'My Pulse — £2.49'],
    ['realityMode', 'Reality Mode — £5.99'],
    ['noAds', 'No Ads — £2.49'],
  ] as const)(
    'opens the %s destination directly and allows leaving its focused entry',
    (key, name) => {
      render(<BetrayalsStore profileId="profile-a" focusProduct={key} />)
      expect(screen.getByRole('button', { name })).toBeVisible()
      fireEvent.click(screen.getByRole('button', { name: 'Featured' }))
      expect(screen.getByRole('button', { name: 'Featured' })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
      expect(commerce.purchase).not.toHaveBeenCalled()
    }
  )

  it('enters a focused currency pack through top-up and does not reopen it after returning', () => {
    render(<BetrayalsStore profileId="profile-a" focusProduct="eyeros35000" />)
    expect(screen.getByRole('heading', { name: 'Top up Eyeros' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Buy 35,000 Eyeros — £4.49' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Back to wallet' }))
    expect(screen.getByRole('heading', { name: 'Wallet' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Back to store' }))
    fireEvent.click(screen.getByRole('button', { name: /Open wallet/ }))
    expect(screen.getByRole('heading', { name: 'Wallet' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Top up Eyeros' })).not.toBeInTheDocument()
    expect(commerce.purchase).not.toHaveBeenCalled()
  })

  it('opens the wallet before packs and returns through the wallet to the Store', () => {
    render(<BetrayalsStore profileId="profile-a" profileName="Georgi" balance={4200} />)
    fireEvent.click(screen.getByRole('button', { name: /Open wallet/ }))
    expect(screen.getByRole('heading', { name: 'Wallet' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^Buy 10,000 Eyeros/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Top up Eyeros' }))
    expect(screen.getByRole('heading', { name: 'Top up Eyeros' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Back to wallet' }))
    expect(screen.getByRole('heading', { name: 'Wallet' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Back to store' }))
    expect(screen.getByRole('button', { name: 'Explore VIP' })).toBeVisible()
    expect(commerce.purchase).not.toHaveBeenCalled()
  })

  it('honors a new focused pack request while Wallet is already open', () => {
    const view = render(<BetrayalsStore profileId="profile-a" initialSection="wallet" />)
    expect(screen.getByRole('heading', { name: 'Wallet' })).toBeVisible()
    view.rerender(
      <BetrayalsStore profileId="profile-a" initialSection="wallet" focusProduct="eyeros10000" />
    )
    expect(screen.getByRole('heading', { name: 'Top up Eyeros' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Buy 10,000 Eyeros — £1.79' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Back to wallet' }))
    expect(screen.getByRole('heading', { name: 'Wallet' })).toBeVisible()

    view.rerender(
      <BetrayalsStore profileId="profile-a" initialSection="wallet" focusProduct="eyeros35000" />
    )
    expect(screen.getByRole('heading', { name: 'Top up Eyeros' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Buy 35,000 Eyeros — £4.49' })).toBeEnabled()
    expect(commerce.purchase).not.toHaveBeenCalled()
  })

  it('passes profile selection from its Wallet destination to the host', () => {
    const openProfile = vi.fn()
    render(<BetrayalsStore initialSection="wallet" onOpenProfile={openProfile} />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose a profile' }))
    expect(openProfile).toHaveBeenCalledOnce()
    expect(commerce.purchase).not.toHaveBeenCalled()
  })

  it('keeps the current Night Shield offer and purchase callback inside Season items', async () => {
    const buyShield = vi.fn().mockResolvedValue(undefined)
    const openLooks = vi.fn()
    render(
      <BetrayalsStore
        profileId="profile-a"
        initialSection="items"
        shield={{ available: true, price: 3000, active: false }}
        onBuyShield={buyShield}
        onOpenLooks={openLooks}
      />
    )
    expect(screen.getByRole('heading', { name: 'Night Shield' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^My Pulse —/ })).not.toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '3,000 Eyeros' })))
    expect(buyShield).toHaveBeenCalledOnce()
    expect(commerce.purchase).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /The changing room/ }))
    expect(openLooks).toHaveBeenCalledOnce()
  })

  it('retains owned states and disables repeat permanent purchases', () => {
    Object.assign(commerce, {
      vip: true,
      myPulse: true,
      realityMode: true,
      noAds: true,
      premiumGames: true,
      paidLooks: true,
    })
    render(<BetrayalsStore profileId="profile-a" />)
    expect(screen.getByRole('button', { name: 'View VIP benefits' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Feature unlocks' }))
    for (const title of ['My Pulse', 'Reality Mode', 'No Ads']) {
      const button = screen.getByRole('button', { name: `${title} owned` })
      expect(button).toBeDisabled()
      fireEvent.click(button)
    }
    expect(commerce.purchase).not.toHaveBeenCalled()
  })

  it('lets the route control section changes without a focused product trapping navigation', () => {
    const changeSection = vi.fn<(section: BetrayalsStoreSection) => void>()
    const view = render(
      <BetrayalsStore section="home" focusProduct="myPulse" onSectionChange={changeSection} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Feature unlocks' }))
    expect(changeSection).toHaveBeenCalledExactlyOnceWith('features')
    expect(screen.queryByRole('button', { name: /^My Pulse —/ })).not.toBeInTheDocument()

    view.rerender(
      <BetrayalsStore section="features" focusProduct="myPulse" onSectionChange={changeSection} />
    )
    expect(screen.getByRole('button', { name: 'My Pulse — £2.49' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Featured' }))
    expect(changeSection).toHaveBeenLastCalledWith('home')
    expect(changeSection).toHaveBeenCalledTimes(2)
  })

  it('keeps unavailable native checkout disabled without a nominal-price fallback', () => {
    Object.assign(commerce, { products: {}, billingAvailable: false })
    render(<BetrayalsStore initialSection="vip" profileId="profile-a" />)
    const checkout = screen.getByRole('button', { name: /^Betrayals VIP —/ })
    expect(checkout).toBeDisabled()
    expect(screen.queryByText('€14.99')).not.toBeInTheDocument()
    fireEvent.click(checkout)
    expect(commerce.purchase).not.toHaveBeenCalled()
  })
})
