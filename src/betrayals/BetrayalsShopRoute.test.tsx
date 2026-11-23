import { configureStore } from '@reduxjs/toolkit'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import profilesReducer, { selectActiveProfile, type ProfilesState } from '../store/profilesSlice'
import BetrayalsShopRoute from './BetrayalsShopRoute'

const commerce = vi.hoisted(() => ({
  ready: true,
  vip: false,
  myPulse: false,
  realityMode: false,
  noAds: false,
  premiumGames: false,
  paidLooks: false,
  billingAvailable: false,
  products: {},
  loading: false,
  purchasing: null,
  error: null,
  notice: null,
  vipUpgradeAvailable: false,
  purchase: vi.fn(),
  restore: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('./commerce/useBetrayalsCommerce', () => ({ useBetrayalsCommerce: () => commerce }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))

function setup(
  entry: string | { pathname: string; state: unknown },
  activeProfileId: string | null = 'georgi'
) {
  const profiles: ProfilesState = {
    profiles: [
      {
        id: 'georgi',
        name: 'Georgi',
        avatar: 'eye',
        createdAt: '2026-11-23T10:00:00Z',
        eyeoleans: 4250,
        eyeoleanTransactions: [
          {
            id: 'georgi-reward',
            label: 'Georgi season reward',
            amount: 50,
            source: 'season_reward',
            createdAt: '2026-11-23T12:00:00Z',
          },
        ],
      },
      {
        id: 'larisa',
        name: 'Larisa',
        avatar: 'eye',
        createdAt: '2026-11-23T10:00:00Z',
        eyeoleans: 9000,
        eyeoleanTransactions: [
          {
            id: 'larisa-shield',
            label: 'Larisa Night Shield',
            amount: -3000,
            source: 'store_purchase',
            createdAt: '2026-11-23T13:00:00Z',
          },
        ],
      },
    ],
    activeProfileId,
    isGuest: false,
  }
  const store = configureStore({
    reducer: { profiles: profilesReducer },
    preloadedState: { profiles },
  })
  const router = createMemoryRouter(
    [
      { path: '/', element: <p>Game Home</p> },
      { path: '/store', element: <BetrayalsShopRoute /> },
      { path: '/store/:section', element: <BetrayalsShopRoute /> },
      { path: '/wallet', element: <BetrayalsShopRoute /> },
      { path: '/profile', element: <p>Selected profile</p> },
      { path: '/profile-picker', element: <p>Choose your player</p> },
      { path: '/profile/dressing-room', element: <p>Changing room</p> },
    ],
    { initialEntries: [entry] }
  )
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  )
  return { router, store }
}

describe('Betrayals Store and Wallet routes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('opens Wallet directly with only the selected profile’s balance and activity', async () => {
    const { router, store } = setup('/wallet')
    expect(screen.getByRole('heading', { name: 'Wallet', level: 1 })).toBeVisible()
    expect(screen.getByLabelText('4,250 Eyeros available')).toBeVisible()
    expect(screen.getByText('Georgi season reward')).toBeVisible()
    expect(screen.queryByText('Larisa Night Shield')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Explore VIP' })).toBeNull()

    await act(async () => store.dispatch(selectActiveProfile('larisa')))
    expect(screen.getByLabelText('9,000 Eyeros available')).toBeVisible()
    expect(screen.getByText('Larisa Night Shield')).toBeVisible()
    expect(screen.queryByText('Georgi season reward')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open profile: Larisa' }))
    expect(router.state.location.pathname).toBe('/profile')
    expect(router.state.location.state).toEqual({ from: '/wallet' })
    expect(commerce.purchase).not.toHaveBeenCalled()
  })

  it('updates section deep links and restores the right section through browser Back', async () => {
    const { router } = setup('/store/features')
    expect(screen.getByRole('heading', { name: 'My Pulse' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Explore VIP' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Back to store' }))
    expect(router.state.location.pathname).toBe('/store')
    fireEvent.click(screen.getByRole('button', { name: 'Season items' }))
    expect(router.state.location.pathname).toBe('/store/items')
    expect(screen.getByRole('heading', { name: 'Night Shield' })).toBeVisible()
    await act(async () => router.navigate(-1))
    expect(router.state.location.pathname).toBe('/store')
    expect(screen.getByRole('button', { name: 'Explore VIP' })).toBeVisible()
    await act(async () => router.navigate(-1))
    expect(router.state.location.pathname).toBe('/store/features')
    expect(screen.getByRole('heading', { name: 'My Pulse' })).toBeVisible()
  })

  it('keeps top-ups disabled without a profile and routes profile selection back to Wallet', () => {
    const { router } = setup('/wallet', null)
    expect(screen.getByText('No profile selected')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Top up Eyeros' }))
    expect(screen.getByRole('button', { name: /^Buy 10,000 Eyeros/ })).toBeDisabled()
    expect(screen.queryByText('Georgi season reward')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Choose a profile' }))
    expect(router.state.location.pathname).toBe('/profile-picker')
    expect(router.state.location.state).toEqual({ from: '/wallet' })
    expect(commerce.purchase).not.toHaveBeenCalled()
  })

  it('preserves the wardrobe draft while browsing Store sections', () => {
    const returnState = { from: '/store/items', initialLookId: 'pc-006', createProfile: true }
    const { router } = setup({
      pathname: '/store/vip',
      state: { returnTo: '/profile/dressing-room', returnState },
    })
    expect(screen.getByRole('heading', { name: 'Betrayals VIP' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Back to store' }))
    fireEvent.click(screen.getByRole('button', { name: 'Feature unlocks' }))
    expect(router.state.location.pathname).toBe('/store/features')
    fireEvent.click(screen.getByRole('button', { name: 'Back to changing room' }))
    expect(router.state.location.pathname).toBe('/profile/dressing-room')
    expect(router.state.location.state).toEqual(returnState)
  })

  it('provides a working exit for a direct Wallet link and normalizes unknown Store sections', async () => {
    const { router } = setup('/wallet')
    fireEvent.click(screen.getByRole('button', { name: 'Back to game' }))
    expect(screen.getByText('Game Home')).toBeVisible()
    await act(async () => router.navigate('/store/unknown'))
    expect(router.state.location.pathname).toBe('/store')
    expect(screen.getByRole('button', { name: 'Explore VIP' })).toBeVisible()
  })
})
