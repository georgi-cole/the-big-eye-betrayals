import { describe, expect, it } from 'vitest'
import reducer, {
  coerceStoredProfile,
  creditBetrayalsPurchase,
  recordBetrayalsRewards,
  spendBetrayalsEyeros,
  type ProfilesState,
} from '../../store/profilesSlice'

function initial(): ProfilesState {
  return {
    profiles: ['first', 'second'].map((id) => ({
      id,
      name: id,
      avatar: 'eye',
      createdAt: '2026-11-23',
      eyeoleans: 10_000,
    })),
    activeProfileId: 'second',
    isGuest: false,
  }
}

describe('Betrayals shared profile wallet', () => {
  it('targets the selected purchase profile and retains paid dedupe after display history is trimmed', () => {
    const grant = creditBetrayalsPurchase({
      profileId: 'first',
      transactionId: 'betrayals-store:ios:receipt',
      productId: 'pack',
      amount: 10_000,
      label: 'Eyeros',
    })
    let state = reducer(initial(), grant)
    state = {
      ...state,
      profiles: state.profiles.map((profile) => ({
        ...profile,
        processedEyeoleanTransactionIds: [],
        eyeoleanTransactions: [],
      })),
    }
    state = reducer(state, grant)
    expect(state.profiles.map((profile) => profile.eyeoleans)).toEqual([20_000, 10_000])
    expect(coerceStoredProfile(state.profiles[0])?.betrayalsPurchaseReceipts).toEqual(
      state.profiles[0].betrayalsPurchaseReceipts
    )
  })

  it('does not pay a replayed reward or charge a repeated shield purchase twice', () => {
    const reward = recordBetrayalsRewards({
      profileId: 'first',
      events: [{ id: 'betrayals:season:day:2', amount: 500, label: 'Day 2' }],
    })
    const shield = spendBetrayalsEyeros({
      profileId: 'first',
      transactionId: 'betrayals:season:night-shield:2',
      amount: 3000,
      label: 'Night Shield',
    })
    let state = reducer(reducer(initial(), reward), shield)
    state = {
      ...state,
      profiles: state.profiles.map((profile) => ({
        ...profile,
        processedEyeoleanTransactionIds: [],
        eyeoleanTransactions: [],
      })),
    }
    state = reducer(reducer(state, reward), shield)
    expect(state.profiles[0].eyeoleans).toBe(7500)
    expect(state.profiles[1].eyeoleans).toBe(10_000)
  })

  it('rejects insufficient funds, negative rewards and invalid or overflowing cash amounts', () => {
    const start = initial()
    expect(
      reducer(
        start,
        spendBetrayalsEyeros({
          profileId: 'first',
          transactionId: 'betrayals:too-much',
          amount: 20_000,
          label: 'Shield',
        })
      )
    ).toEqual(start)
    const state = reducer(
      start,
      recordBetrayalsRewards({
        profileId: 'first',
        events: [{ id: 'betrayals:negative', amount: -5, label: 'Bad' }],
      })
    )
    expect(state.profiles[0].eyeoleans).toBe(10_000)
    expect(
      reducer(
        start,
        creditBetrayalsPurchase({
          profileId: 'first',
          transactionId: 'betrayals-store:ios:overflow',
          productId: 'pack',
          amount: Number.MAX_SAFE_INTEGER,
          label: 'Eyeros',
        })
      )
    ).toEqual(start)
  })
})
