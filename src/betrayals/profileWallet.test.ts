import { beforeEach, describe, expect, it, vi } from 'vitest'
import profilesReducer, { type ProfilesState } from '../store/profilesSlice'
import { createBetrayalsWallet } from './profileWallet'
import type { BetrayalsRewardEvent } from './economy'

const persistence = vi.hoisted(() => ({ save: vi.fn(), flush: vi.fn() }))
vi.mock('../store/profilesSlice', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../store/profilesSlice')>()),
  saveProfilesStateChecked: persistence.save,
}))
vi.mock('../store/durablePersistence', () => ({ flushDurablePersistence: persistence.flush }))

const shieldId = 'betrayals:season:night-shield:1'
const reward: BetrayalsRewardEvent = {
  id: 'betrayals:season:reward:day:1:social-action:1',
  code: 'social-action',
  day: 1,
  ordinal: 1,
  amount: 50,
  label: 'Castle conversation',
}

function setup(balance = 10_000) {
  let state: ProfilesState = {
    profiles: ['buyer', 'other'].map((id) => ({
      id,
      name: id,
      avatar: 'eye',
      createdAt: '2026-11-23',
      eyeoleans: balance,
    })),
    activeProfileId: 'other',
    isGuest: false,
  }
  const source: Parameters<typeof createBetrayalsWallet>[0] = {
    getState: () => ({ profiles: state }),
    dispatch: (action) => {
      state = profilesReducer(state, action)
    },
  }
  return {
    source,
    wallet: createBetrayalsWallet(source, 'buyer', balance),
    state: () => state,
    replace: (next: ProfilesState) => {
      state = next
    },
  }
}

describe('Betrayals wallet persistence boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    persistence.save.mockReturnValue(true)
    persistence.flush.mockResolvedValue(true)
  })

  it('exposes the bound profile’s existing transaction ledger without mixing another profile’s activity', () => {
    const { source, state, replace } = setup()
    const transactions = [
      {
        id: reward.id,
        amount: reward.amount,
        source: 'season_reward' as const,
        label: 'Castle conversation',
        createdAt: '2026-11-23T12:00:00Z',
      },
    ]
    replace({
      ...state(),
      profiles: state().profiles.map((profile) => ({
        ...profile,
        eyeoleanTransactions:
          profile.id === 'buyer'
            ? transactions
            : [{ ...transactions[0], id: 'other-profile-reward', label: 'Other profile reward' }],
      })),
    })
    const wallet = createBetrayalsWallet(source, 'buyer', 10_000)
    expect(wallet.transactions).toBe(transactions)
    expect(wallet.transactions).toHaveLength(1)
    expect(wallet.transactions?.[0].label).toBe('Castle conversation')
    expect(createBetrayalsWallet(source, 'missing', 0).transactions).toEqual([])
  })

  it('credits the bound profile after selection changes and deduplicates replayed season events', async () => {
    const { wallet, state } = setup()
    expect(await wallet.claimRewards([reward])).toBe(true)
    expect(await wallet.claimRewards([reward])).toBe(true)
    expect(state().activeProfileId).toBe('other')
    expect(state().profiles.map((profile) => profile.eyeoleans)).toEqual([10_050, 10_000])
    expect(persistence.save).toHaveBeenLastCalledWith(state())
    expect(persistence.flush).toHaveBeenCalledTimes(2)
  })

  it('returns paid for an existing debit without requiring the original balance again', async () => {
    const { wallet, state } = setup(3500)
    expect(await wallet.spend(shieldId, 3000, 'Night Shield')).toBe('paid')
    expect(state().profiles[0].eyeoleans).toBe(500)
    expect(await wallet.spend(shieldId, 3000, 'Night Shield')).toBe('paid')
    expect(state().profiles[0].eyeoleans).toBe(500)
    expect(state().profiles[0].betrayalsWalletTransactionIds).toEqual([shieldId])
  })

  it('uses the current profile balance rather than the render-time balance for insufficient funds', async () => {
    const { wallet, state, replace } = setup()
    replace({
      ...state(),
      profiles: state().profiles.map((profile) =>
        profile.id === 'buyer' ? { ...profile, eyeoleans: 2999 } : profile
      ),
    })
    expect(wallet.balance).toBe(10_000)
    expect(await wallet.spend(shieldId, 3000, 'Night Shield')).toBe('insufficient')
    expect(state().profiles[0].eyeoleans).toBe(2999)
    expect(persistence.save).not.toHaveBeenCalled()
  })

  it('keeps a failed local save retryable without charging the in-memory wallet twice', async () => {
    const { wallet, state } = setup()
    persistence.save.mockReturnValueOnce(false)
    expect(await wallet.spend(shieldId, 3000, 'Night Shield')).toBe('unavailable')
    expect(persistence.flush).not.toHaveBeenCalled()
    expect(state().profiles[0].eyeoleans).toBe(7000)
    expect(await wallet.spend(shieldId, 3000, 'Night Shield')).toBe('paid')
    expect(state().profiles[0].eyeoleans).toBe(7000)
    expect(persistence.save).toHaveBeenCalledTimes(2)
  })

  it('recovers a saved debit after the run flush fails without another payment', async () => {
    const { wallet, state, replace } = setup()
    persistence.flush.mockResolvedValueOnce(false)
    expect(await wallet.spend(shieldId, 3000, 'Night Shield')).toBe('unavailable')
    const saved = JSON.parse(JSON.stringify(state())) as ProfilesState
    replace(saved)
    expect(await wallet.spend(shieldId, 3000, 'Night Shield')).toBe('paid')
    expect(state().profiles[0].eyeoleans).toBe(7000)
  })

  it('replays unpaid persisted run rewards after a failed profile save without multiplying grants', async () => {
    const { wallet, state } = setup()
    persistence.save.mockReturnValueOnce(false)
    expect(await wallet.claimRewards([reward])).toBe(false)
    expect(await wallet.claimRewards([reward])).toBe(true)
    expect(state().profiles[0].eyeoleans).toBe(10_050)
  })

  it('does not transfer pending writes into another profile when the original profile was removed', async () => {
    const { wallet, state, replace } = setup()
    replace({ ...state(), profiles: state().profiles.filter(({ id }) => id !== 'buyer') })
    expect(await wallet.claimRewards([reward])).toBe(false)
    expect(await wallet.spend(shieldId, 3000, 'Night Shield')).toBe('unavailable')
    expect(state().profiles[0].eyeoleans).toBe(10_000)
    expect(persistence.save).not.toHaveBeenCalled()
  })
})
