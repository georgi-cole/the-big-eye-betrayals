import {
  recordBetrayalsRewards,
  saveProfilesStateChecked,
  spendBetrayalsEyeros,
  type EyeoleanTransaction,
  type ProfilesState,
} from '../store/profilesSlice'
import { flushDurablePersistence } from '../store/durablePersistence'
import type { BetrayalsRewardEvent } from './economy'

export type BetrayalsWallet = {
  balance: number
  transactions?: readonly EyeoleanTransaction[]
  recordedTransactionIds?: readonly string[]
  claimRewards: (events: readonly BetrayalsRewardEvent[]) => Promise<boolean>
  spend: (
    transactionId: string,
    amount: number,
    label: string
  ) => Promise<'paid' | 'insufficient' | 'unavailable'>
}

type WalletStore = {
  getState: () => { profiles: ProfilesState }
  dispatch: (
    action: ReturnType<typeof recordBetrayalsRewards> | ReturnType<typeof spendBetrayalsEyeros>
  ) => unknown
}

/** Bind every asynchronous write to the profile that started it, including after navigation. */
export function createBetrayalsWallet(
  source: WalletStore,
  profileId: string,
  balance: number
): BetrayalsWallet {
  async function persist() {
    return saveProfilesStateChecked(source.getState().profiles) && (await flushDurablePersistence())
  }
  const profile = source.getState().profiles.profiles.find((entry) => entry.id === profileId)
  return {
    balance,
    transactions: profile?.eyeoleanTransactions ?? [],
    recordedTransactionIds: profile?.betrayalsWalletTransactionIds ?? [],
    async claimRewards(events) {
      if (!source.getState().profiles.profiles.some((profile) => profile.id === profileId))
        return false
      source.dispatch(recordBetrayalsRewards({ profileId, events: [...events] }))
      return persist()
    },
    async spend(transactionId, amount, label) {
      const before = source.getState().profiles.profiles.find((profile) => profile.id === profileId)
      if (!before) return 'unavailable'
      if (
        !before.betrayalsWalletTransactionIds?.includes(transactionId) &&
        (before.eyeoleans ?? 0) < amount
      )
        return 'insufficient'
      source.dispatch(spendBetrayalsEyeros({ profileId, transactionId, amount, label }))
      const after = source.getState().profiles.profiles.find((profile) => profile.id === profileId)
      if (!after?.betrayalsWalletTransactionIds?.includes(transactionId)) return 'unavailable'
      return (await persist()) ? 'paid' : 'unavailable'
    },
  }
}
