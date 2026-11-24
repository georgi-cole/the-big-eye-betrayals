import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EyeoleanTransaction } from '../store/profilesSlice'
import type { BetrayalsProductKey } from './commerce/catalog'
import BetrayalsWallet from './BetrayalsWallet'

const platform = vi.hoisted(() => ({ native: true }))
const commerce = vi.hoisted(() => ({
  ready: true,
  billingAvailable: true,
  loading: false,
  purchasing: null as BetrayalsProductKey | null,
  products: {} as Partial<Record<BetrayalsProductKey, { productId: string; price: string }>>,
  error: null as string | null,
  notice: null as string | null,
  purchase: vi.fn(),
  restore: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => platform.native },
}))
vi.mock('./commerce/useBetrayalsCommerce', () => ({ useBetrayalsCommerce: () => commerce }))

describe('Betrayals Wallet', () => {
  afterEach(() => vi.restoreAllMocks())
  beforeEach(() => {
    vi.clearAllMocks()
    platform.native = true
    Object.assign(commerce, {
      ready: true,
      billingAvailable: true,
      loading: false,
      purchasing: null,
      error: null,
      notice: null,
      products: {
        eyeros10000: { productId: 'native-small', price: 'CA$2.79' },
        eyeros35000: { productId: 'native-medium', price: 'CA$6.99' },
        eyeros100000: { productId: 'native-large', price: 'CA$13.99' },
      },
    })
    commerce.purchase.mockResolvedValue(true)
    commerce.restore.mockResolvedValue(undefined)
    commerce.refresh.mockResolvedValue(undefined)
  })

  it('shows the real balance and latest five saved transactions without mutating the ledger', () => {
    const transactions: readonly EyeoleanTransaction[] = Object.freeze(
      Array.from({ length: 7 }, (_, index) =>
        Object.freeze({
          id: `event-${index + 1}`,
          label: `Season event ${index + 1}`,
          source: 'season_reward' as const,
          amount: index === 5 ? -3_000 : 500,
          createdAt: `2026-11-${String(index + 1).padStart(2, '0')}T12:00:00Z`,
        })
      )
    )
    render(
      <BetrayalsWallet
        profileId="saved-profile"
        profileName="Georgi"
        balance={12_345}
        transactions={transactions}
        onBack={vi.fn()}
      />
    )
    expect(screen.getByLabelText('12,345 Eyeros available')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Season event 7')
    expect(screen.queryByText('Season event 1')).not.toBeInTheDocument()
    expect(screen.getByText('−3,000')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Buy 10,000/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show more activity' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(7)
    expect(screen.getByRole('button', { name: 'Show less activity' })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Show less activity' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(transactions[0].id).toBe('event-1')
  })

  it('keeps top-up navigation inside the wallet and exits only from its overview', () => {
    const onBack = vi.fn()
    const onOpenProfile = vi.fn()
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => {})
    render(
      <BetrayalsWallet
        profileId="saved-profile"
        profileName="Georgi"
        balance={900}
        onBack={onBack}
        onOpenProfile={onOpenProfile}
      />
    )
    expect(scrollIntoView).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Open profile: Georgi' }))
    expect(onOpenProfile).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Top up Eyeros' }))
    expect(screen.getByRole('heading', { name: 'Top up Eyeros' })).toHaveFocus()
    expect(scrollIntoView).toHaveBeenLastCalledWith({
      behavior: 'instant',
      block: 'start',
      inline: 'nearest',
    })
    expect(screen.queryByRole('heading', { name: 'Recent activity' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to wallet' }))
    expect(screen.getByRole('heading', { name: 'Wallet' })).toHaveFocus()
    expect(scrollIntoView).toHaveBeenCalledTimes(2)
    expect(onBack).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Back to store' }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('uses native localized prices and sends checkout and restore to the selected profile', () => {
    render(
      <BetrayalsWallet
        profileId="saved-profile"
        profileName="Georgi"
        balance={1_500}
        initialTopUp
        onBack={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Buy 10,000 Eyeros — CA$2.79' }))
    expect(commerce.purchase).toHaveBeenCalledWith('eyeros10000', 'saved-profile')
    expect(screen.getByRole('button', { name: 'Buy 35,000 Eyeros — CA$6.99' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Buy 100,000 Eyeros — CA$13.99' })).toBeEnabled()
    expect(screen.queryByText('€1.99')).not.toBeInTheDocument()
    expect(screen.getByLabelText('1,500 Eyeros available')).toBeInTheDocument()
    expect(
      screen.getByText(/Consumed packs are not restored after clearing app data/)
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restore purchases' }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh prices' }))
    expect(commerce.restore).toHaveBeenCalledWith('saved-profile')
    expect(commerce.refresh).toHaveBeenCalledOnce()
  })

  it('resets the enclosing dialog or page so its outer navigation remains reachable', () => {
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => {})
    const scrollTo = vi.fn()
    const dialogView = render(
      <dialog open>
        <button type="button">Close wallet</button>
        <BetrayalsWallet profileId="saved-profile" balance={100} onBack={vi.fn()} />
      </dialog>
    )
    Object.defineProperty(screen.getByRole('dialog'), 'scrollTo', {
      value: scrollTo,
      configurable: true,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Top up Eyeros' }))
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' })
    expect(scrollIntoView).not.toHaveBeenCalled()
    dialogView.unmount()

    render(
      <main>
        <button type="button">Back to game</button>
        <BetrayalsWallet profileId="saved-profile" balance={100} onBack={vi.fn()} />
      </main>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Top up Eyeros' }))
    expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByRole('main'))
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'instant',
      block: 'start',
      inline: 'nearest',
    })
  })

  it('requires a real profile for top-up and offers an actionable profile selection', () => {
    const onOpenProfile = vi.fn()
    render(
      <BetrayalsWallet balance={0} initialTopUp onBack={vi.fn()} onOpenProfile={onOpenProfile} />
    )
    for (const button of screen.getAllByRole('button', { name: /^Buy / })) {
      expect(button).toBeDisabled()
      fireEvent.click(button)
    }
    expect(commerce.purchase).not.toHaveBeenCalled()
    expect(screen.getByLabelText('— Eyeros available')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Choose a profile' }))
    expect(onOpenProfile).toHaveBeenCalledOnce()
  })

  it('never substitutes nominal prices or opens checkout without native billing', () => {
    commerce.products = {}
    commerce.billingAvailable = false
    const view = render(
      <BetrayalsWallet profileId="saved-profile" balance={700} initialTopUp onBack={vi.fn()} />
    )
    expect(screen.getAllByRole('button', { name: /Currently unavailable/ })).toHaveLength(3)
    for (const button of screen.getAllByRole('button', { name: /^Buy / }))
      expect(button).toBeDisabled()

    platform.native = false
    view.rerender(
      <BetrayalsWallet profileId="saved-profile" balance={700} initialTopUp onBack={vi.fn()} />
    )
    expect(screen.getAllByRole('button', { name: /Available in the app/ })).toHaveLength(3)
    for (const button of screen.getAllByRole('button', { name: /^Buy / })) {
      expect(button).toBeDisabled()
      fireEvent.click(button)
    }
    expect(commerce.purchase).not.toHaveBeenCalled()
    expect(screen.queryByText('€1.99')).not.toBeInTheDocument()
  })

  it('locks every pack during checkout and reports pending payment without inventing a balance change', () => {
    commerce.purchasing = 'eyeros35000'
    const onBack = vi.fn()
    const view = render(
      <BetrayalsWallet
        profileId="saved-profile"
        balance={800}
        initialTopUp
        onBack={onBack}
        backLabel="Back to castle"
      />
    )
    for (const button of screen.getAllByRole('button', { name: /^Buy / }))
      expect(button).toBeDisabled()
    expect(screen.getByRole('button', { name: /Opening checkout/ })).toBeInTheDocument()
    commerce.purchasing = null
    commerce.error = 'Your payment is pending. The item unlocks when the store confirms it.'
    view.rerender(
      <BetrayalsWallet
        profileId="saved-profile"
        balance={800}
        initialTopUp
        onBack={onBack}
        backLabel="Back to castle"
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Your payment is pending')
    expect(screen.getByLabelText('800 Eyeros available')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to wallet' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to castle' }))
    expect(onBack).toHaveBeenCalledOnce()
  })
})
