import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import profilesReducer, { createProfile, type ProfilesState } from '../../store/profilesSlice'
import Profile from './Profile'

const mockNavigate = vi.fn()
const mockEdition = vi.hoisted(() => ({ betrayals: false }))
vi.mock('../../betrayals/betrayalsAppearance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../betrayals/betrayalsAppearance')>()),
  get IS_BETRAYALS_EDITION() {
    return mockEdition.betrayals
  },
}))
vi.mock('../../services/backend/config', () => ({ isPlayerSignInConfigured: () => true }))
let mockProfiles: ProfilesState
let mockLocation: { pathname: string; state: { from: string; fromLookReveal?: boolean } }

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
}))
vi.mock('../../store/hooks', () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      profiles: mockProfiles,
      game: { week: 1, phase: 'season_start', status: 'idle', players: [], tvFeed: [] },
    }),
}))
vi.mock('../../components/ui/GameBackButton/GameBackButton', () => ({
  default: ({ onClick }: { onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      Back
    </button>
  ),
}))

describe('Profile return entrance', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockEdition.betrayals = false
    mockLocation = { pathname: '/profile', state: { from: '/' } }
    mockProfiles = profilesReducer(
      undefined,
      createProfile({
        name: 'Larisa',
        avatar: '👤',
        appearanceSelection: { kind: 'catalog', lookId: 'pc-001', revision: 1 },
      })
    )
  })

  it('consumes the reveal marker while preserving the entrance through the route replacement', () => {
    mockLocation.state.fromLookReveal = true
    const { container, rerender } = render(<Profile />)
    expect(mockNavigate).toHaveBeenCalledWith('/profile', {
      replace: true,
      state: { from: '/' },
      preventScrollReset: true,
    })
    expect(container.firstChild).toHaveClass('profile-screen--look-return')
    mockLocation = { pathname: '/profile', state: { from: '/' } }
    rerender(<Profile />)
    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(container.firstChild).toHaveClass('profile-screen--look-return')
  })

  it('leaves ordinary profile visits static', () => {
    const { container } = render(<Profile />)
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(container.firstChild).not.toHaveClass('profile-screen--look-return')
  })

  it.each(['/wallet', '/store', '/store/vip', '/store/features', '/store/items'])(
    'returns a Betrayals profile visit to its %s entry',
    (from) => {
      mockEdition.betrayals = true
      mockLocation.state.from = from
      render(<Profile />)
      fireEvent.click(screen.getByRole('button', { name: 'Back' }))
      expect(mockNavigate).toHaveBeenCalledWith(from, { replace: true })
    }
  )

  it('returns unknown Betrayals profile origins to Home', () => {
    mockEdition.betrayals = true
    mockLocation.state.from = '/store/not-a-section'
    render(<Profile />)
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
  })

  it('skips the empty profile screen and returns through the account entry', () => {
    mockProfiles = { profiles: [], activeProfileId: null, isGuest: false }
    const { container } = render(<Profile />)
    expect(container.firstChild).toBeNull()
    expect(mockNavigate).toHaveBeenCalledWith('/profile/account', {
      replace: true,
      state: { entryFrom: '/' },
    })
  })
})
