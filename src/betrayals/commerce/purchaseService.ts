import { Capacitor } from '@capacitor/core'
import { NativePurchases, PURCHASE_TYPE, type Transaction } from '@capgo/native-purchases'
import { IS_MOBILE_DEV_BUILD } from '../../config/buildTarget'
import { assertAdultServicesAllowed } from '../../safety/playerSafety'
import { initializeDurablePersistence } from '../../store/durablePersistence'
import { saveProfilesStateChecked, type ProfilesState } from '../../store/profilesSlice'
import { withNativeBilling } from '../../vip/nativeBillingQueue'
import { configureNativePurchaseLifecycle } from '../../vip/nativePurchaseLifecycle'
import {
  BETRAYALS_PRODUCTS,
  emptyBetrayalsOwnership,
  findBetrayalsProduct,
  getBetrayalsAccess,
  getBetrayalsProduct,
  resolveBetrayalsVipOffer,
  type BetrayalsAccess,
  type BetrayalsOwnership,
  type BetrayalsPermanentProductKey,
  type BetrayalsProductKey,
} from './catalog'
import { mutateBetrayalsCommerceLedger, readBetrayalsCommerceLedger } from './storage'

export interface BetrayalsNativeProduct {
  productId: string
  price: string
}

export interface BetrayalsCommerceSnapshot extends BetrayalsAccess {
  ready: boolean
  billingAvailable: boolean
  products: Partial<Record<BetrayalsProductKey, BetrayalsNativeProduct>>
  loading: boolean
  purchasing: BetrayalsProductKey | null
  error: string | null
  notice: string | null
  vipUpgradeAvailable: boolean
}

export interface BetrayalsPurchaseCredit {
  profileId: string
  transactionId: string
  productId: string
  amount: number
  label: string
}

export interface BetrayalsWalletBridge {
  getProfiles: () => ProfilesState
  grant: (credit: BetrayalsPurchaseCredit) => void
}

let wallet: BetrayalsWalletBridge | null = null
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
let snapshot: BetrayalsCommerceSnapshot = {
  ...getBetrayalsAccess(emptyBetrayalsOwnership()),
  ready: false,
  billingAvailable: false,
  products: {},
  loading: false,
  purchasing: null,
  error: null,
  notice: null,
  vipUpgradeAvailable: false,
}
const listeners = new Set<() => void>()
let initializing: Promise<void> | null = null
let refreshing: Promise<void> | null = null
let deliveryQueue: Promise<unknown> = Promise.resolve()
let lastSuccessfulRefresh = 0

export function configureBetrayalsCommerceWallet(bridge: BetrayalsWalletBridge): void {
  wallet = bridge
}

export function getBetrayalsCommerceSnapshot(): BetrayalsCommerceSnapshot {
  return snapshot
}

export function subscribeBetrayalsCommerce(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function publish(update: Partial<BetrayalsCommerceSnapshot>): void {
  snapshot = { ...snapshot, ...update }
  for (const listener of listeners) listener()
}

function message(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string')
    return error.message
  return 'The store could not be reached. Please try again.'
}

function platform(): 'ios' | 'android' | null {
  if (IS_MOBILE_DEV_BUILD || !Capacitor.isNativePlatform()) return null
  const current = Capacitor.getPlatform()
  return current === 'ios' || current === 'android' ? current : null
}

export function isCompletedBetrayalsTransaction(
  transaction: Transaction,
  target: 'ios' | 'android'
): boolean {
  const product = findBetrayalsProduct(transaction.productIdentifier)
  if (
    !product ||
    !transaction.transactionId?.trim() ||
    transaction.revocationDate ||
    transaction.subscriptionState === 'revoked' ||
    transaction.purchaseState === 'PENDING' ||
    transaction.purchaseState === '0' ||
    transaction.isActive === false ||
    (transaction.productType && transaction.productType !== PURCHASE_TYPE.INAPP) ||
    !Number.isSafeInteger(transaction.quantity ?? 1) ||
    (transaction.quantity ?? 1) < 1 ||
    (product.kind === 'consumable' && transaction.ownershipType === 'familyShared')
  )
    return false
  return (
    target === 'ios' ||
    ((transaction.purchaseState === '1' || transaction.purchaseState === 'PURCHASED') &&
      Boolean(transaction.purchaseToken?.trim()))
  )
}

function publishOwnership(): void {
  publish({ ...getBetrayalsAccess(readBetrayalsCommerceLedger().ownership), ready: true })
}

async function refreshProductPrices(ownership: BetrayalsOwnership): Promise<void> {
  const vipOffer = resolveBetrayalsVipOffer(ownership)
  const response = await withNativeBilling(
    () =>
      NativePurchases.getProducts({
        productIdentifiers: BETRAYALS_PRODUCTS.map((entry) =>
          entry.key === 'vip' ? vipOffer.productId : entry.productId
        ),
        productType: PURCHASE_TYPE.INAPP,
      }),
    { retryDisconnected: true }
  )
  const products: BetrayalsCommerceSnapshot['products'] = {}
  for (const definition of BETRAYALS_PRODUCTS) {
    const productId = definition.key === 'vip' ? vipOffer.productId : definition.productId
    const product = response.products.find(
      (entry) => entry.identifier === productId || entry.planIdentifier === productId
    )
    if (product?.priceString?.trim())
      products[definition.key] = { productId, price: product.priceString }
  }
  publish({ products, vipUpgradeAvailable: vipOffer.creditCents > 0 })
}

async function finishPermanent(transaction: Transaction, target: 'ios' | 'android'): Promise<void> {
  if (target === 'android') {
    if (!transaction.isAcknowledged)
      await withNativeBilling(() =>
        NativePurchases.acknowledgePurchase({ purchaseToken: transaction.purchaseToken! })
      )
  } else {
    await NativePurchases.finishTransaction({ transactionId: transaction.transactionId })
  }
}

function ensureProfile(profileId: string): void {
  if (
    !wallet ||
    !profileId ||
    !wallet.getProfiles().profiles.some((entry) => entry.id === profileId)
  )
    throw new Error('Select a saved profile before purchasing Eyeros.')
}

function deliverCurrency(
  transaction: Transaction,
  target: 'ios' | 'android',
  recoveryProfileId?: string
): Promise<void> {
  const delivery = deliveryQueue.then(async () => {
    if (!isCompletedBetrayalsTransaction(transaction, target))
      throw new Error('Your Eyeros will arrive after the store confirms payment.')
    const product = findBetrayalsProduct(transaction.productIdentifier)!
    if (product.kind !== 'consumable' || !product.eyeros) return
    const key = `${target}:${transaction.transactionId}`
    const ledger = readBetrayalsCommerceLedger()
    const existing = ledger.receipts[key]
    if (existing?.finished) return
    // A native binding remains authoritative after profile deletion or a store-account switch.
    // Do not redirect that payment to a more recent checkout's profile.
    const accountToken = transaction.appAccountToken?.trim()
    // StoreKit serializes UUIDs in uppercase; local crypto.randomUUID() IDs are lowercase.
    const linkedProfile = accountToken
      ? (wallet
          ?.getProfiles()
          .profiles.find(
            (entry) =>
              entry.id === accountToken ||
              (UUID_PATTERN.test(accountToken) &&
                entry.id.toLowerCase() === accountToken.toLowerCase())
          )?.id ?? (UUID_PATTERN.test(accountToken) ? accountToken.toLowerCase() : accountToken))
      : undefined
    const profileId =
      existing?.profileId ??
      linkedProfile ??
      ledger.intents[product.productId]?.profileId ??
      recoveryProfileId
    if (!profileId)
      throw new Error('Choose a profile and restore purchases to receive your pending Eyeros.')
    const amount = product.eyeros * (transaction.quantity ?? 1)
    if (!Number.isSafeInteger(amount) || amount <= 0)
      throw new Error('The store returned an invalid Eyeros quantity.')
    if (existing && (existing.amount !== amount || existing.productId !== product.productId))
      throw new Error('The store returned inconsistent purchase details.')
    // Receipt ownership is committed before the wallet can change or the player switches profiles.
    await mutateBetrayalsCommerceLedger((current) => {
      current.receipts[key] ??= {
        platform: target,
        transactionId: transaction.transactionId,
        productId: product.productId,
        quantity: transaction.quantity ?? 1,
        profileId,
        amount,
        delivered: false,
        finished: false,
      }
    })
    if (!readBetrayalsCommerceLedger().receipts[key].delivered) {
      ensureProfile(profileId)
      const receiptId = `betrayals-store:${key}`
      wallet!.grant({
        profileId,
        transactionId: receiptId,
        productId: product.productId,
        amount,
        label: product.title,
      })
      const state = wallet!.getProfiles()
      const receipt = state.profiles.find((entry) => entry.id === profileId)
        ?.betrayalsPurchaseReceipts?.[receiptId]
      if (
        receipt?.amount !== amount ||
        receipt.productId !== product.productId ||
        !saveProfilesStateChecked(state)
      )
        throw new Error(
          'Your payment is safe, but the wallet could not be saved. Restart to finish delivery.'
        )
      await mutateBetrayalsCommerceLedger((current) => {
        current.receipts[key].delivered = true
        if (current.intents[product.productId]?.profileId === profileId)
          delete current.intents[product.productId]
      })
    }
    // Never finish/consume until both the profile wallet and its receipt marker are durable.
    try {
      if (target === 'android') {
        await withNativeBilling(() =>
          NativePurchases.consumePurchase({ purchaseToken: transaction.purchaseToken! })
        )
      } else {
        await NativePurchases.finishTransaction({ transactionId: transaction.transactionId })
      }
      await mutateBetrayalsCommerceLedger((current) => {
        current.receipts[key].finished = true
      })
    } catch {
      publish({ notice: 'Your Eyeros are saved. Store confirmation will retry automatically.' })
    }
  })
  deliveryQueue = delivery.catch(() => undefined)
  return delivery
}

async function recoverTransactions(
  target: 'ios' | 'android',
  recoveryProfileId?: string,
  explicitRestore = false
): Promise<void> {
  const transactions =
    target === 'android'
      ? (
          await withNativeBilling(
            () => NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP }),
            { retryDisconnected: true }
          )
        ).purchases
      : (await NativePurchases.getUnfinishedTransactions()).transactions
  // Android returns both PURCHASED and PENDING orders and rejects failed queries. Only an
  // explicit, successful restore can release absent checkout locks. Keep native profile
  // bindings so a delayed order from another Play account still reaches its original wallet.
  // StoreKit omits Ask to Buy requests here, so absence must never clear an iOS intent.
  if (target === 'android' && explicitRestore && !snapshot.purchasing) {
    const storeProducts = new Set(transactions.map((entry) => entry.productIdentifier))
    const absent = Object.entries(readBetrayalsCommerceLedger().intents).filter(
      ([productId, intent]) =>
        intent.platform === 'android' &&
        intent.appAccountToken === intent.profileId &&
        !storeProducts.has(productId)
    )
    if (absent.length)
      await mutateBetrayalsCommerceLedger((ledger) => {
        for (const [productId, intent] of absent) {
          if (ledger.intents[productId]?.startedAt === intent.startedAt)
            delete ledger.intents[productId]
        }
      })
  }
  const pending = transactions.filter((entry) => findBetrayalsProduct(entry.productIdentifier))
  for (const transaction of pending) {
    if (!isCompletedBetrayalsTransaction(transaction, target)) continue
    try {
      if (findBetrayalsProduct(transaction.productIdentifier)?.kind === 'consumable') {
        await deliverCurrency(transaction, target, recoveryProfileId)
      } else {
        await finishPermanent(transaction, target)
      }
    } catch (error) {
      // A currency payment awaiting its profile must not block restoring permanent access.
      publish({ error: message(error) })
    }
  }
  const keys = new Set(pending.map((entry) => `${target}:${entry.transactionId}`))
  const unfinished = Object.entries(readBetrayalsCommerceLedger().receipts).filter(
    ([key, receipt]) =>
      receipt.platform === target && receipt.delivered && !receipt.finished && !keys.has(key)
  )
  if (unfinished.length)
    await mutateBetrayalsCommerceLedger((ledger) => {
      for (const [key] of unfinished) ledger.receipts[key].finished = true
    })
}

export function initializeBetrayalsCommerce(): Promise<void> {
  if (initializing) return initializing
  initializing = (async () => {
    await initializeDurablePersistence()
    publishOwnership()
    const target = platform()
    if (!target) return
    await configureNativePurchaseLifecycle()
    if (target === 'ios') {
      await NativePurchases.addListener('transactionUpdated', (transaction) => {
        const product = findBetrayalsProduct(transaction.productIdentifier)
        if (!product || !isCompletedBetrayalsTransaction(transaction, target)) return
        if (product.kind === 'consumable') {
          void deliverCurrency(transaction, target).catch((error) =>
            publish({ error: message(error) })
          )
        } else {
          void refreshBetrayalsCommerce({ force: true })
        }
      })
    }
    if (typeof document !== 'undefined')
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void refreshBetrayalsCommerce({ force: true })
      })
  })().catch((error) => {
    initializing = null
    throw error
  })
  return initializing
}

export function refreshBetrayalsCommerce(
  options: { restore?: boolean; profileId?: string; force?: boolean } = {}
): Promise<void> {
  if (refreshing) {
    if (options.restore) return refreshing.then(() => refreshBetrayalsCommerce(options))
    return refreshing
  }
  if (
    !options.restore &&
    !options.force &&
    snapshot.ready &&
    Date.now() - lastSuccessfulRefresh < 300_000
  )
    return Promise.resolve()
  publish({ loading: true, error: null })
  refreshing = (async () => {
    await initializeBetrayalsCommerce()
    const target = platform()
    if (!target || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      publish({ billingAvailable: false, products: {} })
      return
    }
    const supported = await withNativeBilling(() => NativePurchases.isBillingSupported())
    if (!supported.isBillingSupported) {
      publish({ billingAvailable: false, products: {} })
      return
    }
    if (options.restore && target === 'ios') await NativePurchases.restorePurchases()
    await recoverTransactions(
      target,
      options.restore ? options.profileId : undefined,
      options.restore
    )
    const { purchases } = await withNativeBilling(
      () =>
        NativePurchases.getPurchases({
          productType: PURCHASE_TYPE.INAPP,
          onlyCurrentEntitlements: true,
        }),
      { retryDisconnected: true }
    )
    const ownership = emptyBetrayalsOwnership()
    for (const transaction of purchases) {
      const product = findBetrayalsProduct(transaction.productIdentifier)
      if (product?.kind !== 'permanent' || !isCompletedBetrayalsTransaction(transaction, target))
        continue
      if (target === 'android' && transaction.isAcknowledged !== true) continue
      ownership[product.key as BetrayalsPermanentProductKey] = true
    }
    await mutateBetrayalsCommerceLedger((ledger) => {
      ledger.ownership = ownership
      ledger.verifiedAt = new Date().toISOString()
    })
    publishOwnership()
    await refreshProductPrices(ownership)
    lastSuccessfulRefresh = Date.now()
    publish({
      billingAvailable: true,
      ...(options.restore && !snapshot.error
        ? {
            notice: Object.keys(readBetrayalsCommerceLedger().intents).length
              ? target === 'ios'
                ? 'Purchases checked. An earlier Eyeros request is still unresolved; restore cannot cancel an App Store approval request. Keep the original profile for delivery.'
                : 'Purchases checked. An earlier Eyeros request is still unresolved. Check its status in the original Google Play account, then restore again.'
              : 'Purchase restore complete. Previously spent Eyeros are not restored.',
          }
        : {}),
    })
  })()
    .catch((error) => publish({ billingAvailable: false, products: {}, error: message(error) }))
    .finally(() => {
      refreshing = null
      publish({ loading: false, ready: true })
    })
  return refreshing
}

export async function purchaseBetrayalsProduct(
  key: BetrayalsProductKey,
  profileId?: string
): Promise<boolean> {
  if (snapshot.purchasing) return false
  publish({ purchasing: key, error: null, notice: null })
  let intentWritten = false
  const product = getBetrayalsProduct(key)
  try {
    if (product.kind === 'consumable') {
      try {
        assertAdultServicesAllowed()
      } catch {
        throw new Error(
          'Eyeros purchases are available to adult players. Check Advertising privacy to review your player settings.'
        )
      }
    }
    const target = platform()
    if (!target) throw new Error('Purchases are available in the iOS and Android app.')
    await refreshBetrayalsCommerce({ force: true })
    if (!snapshot.billingAvailable || !snapshot.products[key])
      throw new Error('This item is not available from the store yet. Please try again later.')
    if (product.kind === 'permanent' && snapshot[key as BetrayalsPermanentProductKey]) return true
    const billingProductId = snapshot.products[key]!.productId
    const appAccountToken =
      product.kind === 'consumable' &&
      profileId &&
      ((target === 'android' && profileId.length <= 64) || UUID_PATTERN.test(profileId))
        ? profileId
        : undefined
    if (product.kind === 'consumable') {
      ensureProfile(profileId ?? '')
      if (readBetrayalsCommerceLedger().intents[product.productId])
        throw new Error(
          target === 'android'
            ? 'An earlier payment for this pack is unresolved. If it was cancelled, use Restore purchases with the same Google Play account, then try again.'
            : 'An earlier payment for this pack is awaiting an App Store decision. Keep its original profile for delivery. Restore purchases cannot cancel an approval request.'
        )
      if (!saveProfilesStateChecked(wallet!.getProfiles()))
        throw new Error('Your profile could not be saved. Free some storage before purchasing.')
      await mutateBetrayalsCommerceLedger((ledger) => {
        ledger.intents[product.productId] = {
          profileId: profileId!,
          startedAt: new Date().toISOString(),
          platform: target,
          ...(appAccountToken ? { appAccountToken } : {}),
        }
      })
      intentWritten = true
    }
    const transaction = await withNativeBilling(() =>
      NativePurchases.purchaseProduct({
        productIdentifier: billingProductId,
        productType: PURCHASE_TYPE.INAPP,
        quantity: 1,
        isConsumable: false,
        autoAcknowledgePurchases: false,
        ...(appAccountToken ? { appAccountToken } : {}),
      })
    )
    if (
      transaction.productIdentifier !== billingProductId ||
      !isCompletedBetrayalsTransaction(transaction, target)
    )
      throw new Error('Your payment is pending. The item unlocks when the store confirms it.')
    if (product.kind === 'consumable') {
      await deliverCurrency(transaction, target)
    } else {
      await finishPermanent(transaction, target)
      await mutateBetrayalsCommerceLedger((ledger) => {
        ledger.ownership[key as BetrayalsPermanentProductKey] = true
        ledger.verifiedAt = new Date().toISOString()
      })
      publishOwnership()
      lastSuccessfulRefresh = 0
      await refreshProductPrices(readBetrayalsCommerceLedger().ownership).catch(() => {
        // Ownership is already granted. Never show the previous, undiscounted VIP quote.
        publish({ products: {}, billingAvailable: false })
      })
    }
    publish({
      notice:
        product.kind === 'consumable'
          ? `${product.title} added to your profile.`
          : `${product.title} is now unlocked.`,
    })
    return true
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    const cancelled =
      /cancelled|canceled|usercancel/i.test(message(error)) || code === 'USER_CANCELED'
    const checkoutNeverOpened =
      [
        'ITEM_UNAVAILABLE',
        'BILLING_UNAVAILABLE',
        'FEATURE_NOT_SUPPORTED',
        'DEVELOPER_ERROR',
      ].includes(code) ||
      /product not found|cannot find product|offer token not found|no one-time purchase offer details/i.test(
        message(error)
      )
    if ((cancelled || checkoutNeverOpened) && intentWritten)
      await mutateBetrayalsCommerceLedger((ledger) => {
        delete ledger.intents[product.productId]
      }).catch(() => undefined)
    publish({
      error: cancelled
        ? null
        : /pending/i.test(message(error))
          ? 'Your payment is pending. The item unlocks when the store confirms it.'
          : message(error),
    })
    return false
  } finally {
    publish({ purchasing: null })
  }
}

export function restoreBetrayalsPurchases(profileId?: string): Promise<void> {
  return refreshBetrayalsCommerce({ restore: true, profileId })
}

export function forceRefreshBetrayalsCommerce(): Promise<void> {
  return refreshBetrayalsCommerce({ force: true })
}
