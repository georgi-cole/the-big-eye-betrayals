import {
  flushDurablePersistence,
  getDurableItem,
  initializeDurablePersistence,
  setDurableItem,
} from '../../store/durablePersistence'
import { emptyBetrayalsOwnership, type BetrayalsOwnership } from './catalog'

export const BETRAYALS_COMMERCE_KEY = 'big-eye:betrayals:commerce:v1'

export interface BetrayalsReceipt {
  platform: 'ios' | 'android'
  transactionId: string
  productId: string
  quantity: number
  profileId: string
  amount: number
  delivered: boolean
  finished: boolean
}

export interface BetrayalsCommerceLedger {
  version: 1
  ownership: BetrayalsOwnership
  verifiedAt: string | null
  receipts: Record<string, BetrayalsReceipt>
  /** Kept before checkout so a delayed payment goes to its original profile. */
  intents: Record<
    string,
    {
      profileId: string
      startedAt: string
      platform?: 'ios' | 'android'
      appAccountToken?: string
    }
  >
}

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function readBetrayalsCommerceLedger(): BetrayalsCommerceLedger {
  const raw = getDurableItem(BETRAYALS_COMMERCE_KEY)
  if (!raw) {
    return {
      version: 1,
      ownership: emptyBetrayalsOwnership(),
      verifiedAt: null,
      receipts: {},
      intents: {},
    }
  }
  try {
    const value = JSON.parse(raw) as BetrayalsCommerceLedger
    if (
      !object(value) ||
      value.version !== 1 ||
      !object(value.ownership) ||
      !object(value.receipts) ||
      !object(value.intents) ||
      Object.keys(emptyBetrayalsOwnership()).some(
        (key) => typeof value.ownership[key as keyof BetrayalsOwnership] !== 'boolean'
      ) ||
      (value.verifiedAt !== null && typeof value.verifiedAt !== 'string')
    )
      throw new Error('Invalid ledger')
    for (const [key, receipt] of Object.entries(value.receipts)) {
      if (
        !object(receipt) ||
        !['ios', 'android'].includes(receipt.platform) ||
        typeof receipt.transactionId !== 'string' ||
        !receipt.transactionId.trim() ||
        key !== `${receipt.platform}:${receipt.transactionId}` ||
        typeof receipt.productId !== 'string' ||
        !receipt.productId ||
        typeof receipt.profileId !== 'string' ||
        !receipt.profileId ||
        !Number.isSafeInteger(receipt.quantity) ||
        receipt.quantity < 1 ||
        !Number.isSafeInteger(receipt.amount) ||
        receipt.amount < 1 ||
        typeof receipt.delivered !== 'boolean' ||
        typeof receipt.finished !== 'boolean' ||
        (receipt.finished && !receipt.delivered)
      )
        throw new Error('Invalid receipt')
    }
    for (const [key, intent] of Object.entries(value.intents)) {
      if (
        !key ||
        !object(intent) ||
        typeof intent.profileId !== 'string' ||
        !intent.profileId ||
        typeof intent.startedAt !== 'string' ||
        (intent.platform !== undefined &&
          intent.platform !== 'ios' &&
          intent.platform !== 'android') ||
        (intent.appAccountToken !== undefined && intent.appAccountToken !== intent.profileId)
      )
        throw new Error('Invalid purchase intent')
    }
    return value
  } catch {
    throw new Error('Your purchase records could not be read. Restart before making a purchase.')
  }
}

let mutationQueue: Promise<unknown> = Promise.resolve()

export function mutateBetrayalsCommerceLedger<T>(
  change: (ledger: BetrayalsCommerceLedger) => T
): Promise<T> {
  const mutation = mutationQueue.then(async () => {
    await initializeDurablePersistence()
    const ledger = readBetrayalsCommerceLedger()
    const result = change(ledger)
    if (
      !setDurableItem(BETRAYALS_COMMERCE_KEY, JSON.stringify(ledger)) ||
      !(await flushDurablePersistence())
    )
      throw new Error('Your purchase could not be saved. Free some storage and try again.')
    return result
  })
  mutationQueue = mutation.catch(() => undefined)
  return mutation
}
