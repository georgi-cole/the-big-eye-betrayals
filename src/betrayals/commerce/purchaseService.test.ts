import type { Transaction } from '@capgo/native-purchases'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DurableStorageBackend } from '../../store/durablePersistence'
import type { ProfilesState } from '../../store/profilesSlice'

const native = vi.hoisted(() => ({
  platform: 'android',
  configure: vi.fn(),
  isBillingSupported: vi.fn(),
  getProducts: vi.fn(),
  getPurchases: vi.fn(),
  getUnfinishedTransactions: vi.fn(),
  purchaseProduct: vi.fn(),
  consumePurchase: vi.fn(),
  finishTransaction: vi.fn(),
  acknowledgePurchase: vi.fn(),
  restorePurchases: vi.fn(),
  addListener: vi.fn(),
}))
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => native.platform !== 'web',
    getPlatform: () => native.platform,
  },
}))
vi.mock('@capgo/native-purchases', () => ({
  PURCHASE_TYPE: { INAPP: 'inapp' },
  NativePurchases: native,
}))
vi.mock('../../config/buildTarget', () => ({ IS_MOBILE_DEV_BUILD: false, IS_ADMIN_BUILD: false }))
vi.mock('../../safety/playerSafety', () => ({ assertAdultServicesAllowed: vi.fn() }))

const currencyId = 'com.georgicole.thebigeye.betrayals.eyeros10000'
const vipId = 'com.georgicole.thebigeye.betrayals.vip'
const ledgerKey = 'big-eye:betrayals:commerce:v1'

function transaction(id: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    transactionId: id,
    productIdentifier: currencyId,
    purchaseToken: `token-${id}`,
    purchaseState: 'PURCHASED',
    purchaseDate: '2026-11-23T12:00:00Z',
    quantity: 1,
    willCancel: null,
    ...overrides,
  }
}

async function setup(existing = new Map<string, string>(), profileIds = ['first', 'second']) {
  const apply = vi.fn<DurableStorageBackend['apply']>(async (changes) => {
    for (const { key, value } of changes) {
      if (value === null) existing.delete(key)
      else existing.set(key, value)
    }
  })
  const persistence = await import('../../store/durablePersistence')
  await persistence.initializeDurablePersistence({
    kind: 'sqlite',
    loadAll: async () => new Map(existing),
    apply,
  })
  const profiles = await import('../../store/profilesSlice')
  let state: ProfilesState = {
    profiles: profileIds.map((id) => ({
      id,
      name: id,
      avatar: 'eye',
      createdAt: '2026-11-23T00:00:00Z',
      eyeoleans: 100,
    })),
    activeProfileId: profileIds[0],
    isGuest: false,
  }
  const service = await import('./purchaseService')
  service.configureBetrayalsCommerceWallet({
    getProfiles: () => state,
    grant: (payload) => {
      state = profiles.default(state, profiles.creditBetrayalsPurchase(payload))
    },
  })
  return {
    service,
    existing,
    apply,
    getProfiles: () => state,
    switchProfile: () => {
      state = { ...state, activeProfileId: profileIds[1] }
    },
  }
}

describe('Betrayals native commerce', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    localStorage.clear()
    native.platform = 'android'
    native.configure.mockResolvedValue(undefined)
    native.isBillingSupported.mockResolvedValue({ isBillingSupported: true })
    native.getProducts.mockImplementation(
      async ({ productIdentifiers }: { productIdentifiers: string[] }) => ({
        products: productIdentifiers.map((identifier) => ({ identifier, priceString: '€1.99' })),
      })
    )
    native.getPurchases.mockResolvedValue({ purchases: [] })
    native.getUnfinishedTransactions.mockResolvedValue({ transactions: [] })
    native.consumePurchase.mockResolvedValue(undefined)
    native.finishTransaction.mockResolvedValue(undefined)
    native.acknowledgePurchase.mockResolvedValue(undefined)
    native.restorePurchases.mockResolvedValue(undefined)
    native.addListener.mockResolvedValue({ remove: vi.fn() })
  })

  it('loads older VIP receipts and restores standalone Drama Mode independently', async () => {
    const existing = new Map([
      [
        ledgerKey,
        JSON.stringify({
          version: 1,
          ownership: { vip: true, myPulse: false, realityMode: false, noAds: false },
          verifiedAt: '2026-11-23T12:00:00Z',
          intents: {},
          receipts: {},
        }),
      ],
    ])
    const { service } = await setup(existing)
    native.isBillingSupported.mockRejectedValueOnce(new Error('Store unavailable'))
    await service.refreshBetrayalsCommerce({ force: true })
    expect(service.getBetrayalsCommerceSnapshot()).toMatchObject({ vip: true, dramaMode: true })

    native.getPurchases.mockResolvedValue({
      purchases: [
        transaction('drama', {
          productIdentifier: 'com.georgicole.thebigeye.betrayals.dramamode',
          isAcknowledged: true,
        }),
      ],
    })
    await service.refreshBetrayalsCommerce({ force: true })
    expect(service.getBetrayalsCommerceSnapshot()).toMatchObject({
      vip: false,
      dramaMode: true,
      realityMode: false,
    })
  })

  it('saves the same profile wallet and receipt before consuming, even after a profile switch', async () => {
    const { service, existing, getProfiles, switchProfile } = await setup()
    native.purchaseProduct.mockImplementation(async () => {
      switchProfile()
      return transaction('order-1')
    })
    native.consumePurchase.mockImplementation(async () => {
      const saved = JSON.parse(localStorage.getItem('bbmobilenew:profiles:v1')!) as ProfilesState
      expect(saved.profiles[0].eyeoleans).toBe(10_100)
      expect(saved.profiles[1].eyeoleans).toBe(100)
      expect(
        saved.profiles[0].betrayalsPurchaseReceipts?.['betrayals-store:android:order-1']
      ).toEqual({ productId: currencyId, amount: 10_000 })
      expect(JSON.parse(existing.get(ledgerKey)!).receipts['android:order-1'].delivered).toBe(true)
    })
    expect(await service.purchaseBetrayalsProduct('eyeros10000', 'first')).toBe(true)
    expect(getProfiles().activeProfileId).toBe('second')
    native.getPurchases.mockResolvedValue({ purchases: [transaction('order-1')] })
    await service.refreshBetrayalsCommerce({ force: true })
    expect(getProfiles().profiles[0].eyeoleans).toBe(10_100)
    expect(native.consumePurchase).toHaveBeenCalledTimes(1)
  })

  it('never delivers or finishes pending, foreign, revoked or shared consumable transactions', async () => {
    const { service, getProfiles } = await setup()
    for (const invalid of [
      transaction('pending', { purchaseState: 'PENDING' }),
      transaction('foreign', { productIdentifier: 'com.georgicole.thebigeye.survivalrun' }),
      transaction('revoked', { revocationDate: '2026-11-23' }),
      transaction('family', { ownershipType: 'familyShared' }),
      transaction('missing-token', { purchaseToken: undefined }),
    ])
      expect(service.isCompletedBetrayalsTransaction(invalid, 'android')).toBe(false)
    native.purchaseProduct.mockResolvedValue(transaction('pending', { purchaseState: 'PENDING' }))
    expect(await service.purchaseBetrayalsProduct('eyeros10000', 'first')).toBe(false)
    expect(getProfiles().profiles[0].eyeoleans).toBe(100)
    expect(native.consumePurchase).not.toHaveBeenCalled()
    expect(native.finishTransaction).not.toHaveBeenCalled()
  })

  it('recovers after wallet save but receipt-commit failure without paying twice', async () => {
    const { service, existing, apply, getProfiles } = await setup()
    let failDeliveredCommit = true
    const commit = apply.getMockImplementation()!
    apply.mockImplementation(async (changes) => {
      if (
        failDeliveredCommit &&
        changes.some(
          ({ key, value }) =>
            key === ledgerKey && value && JSON.parse(value).receipts?.['android:recover']?.delivered
        )
      ) {
        failDeliveredCommit = false
        throw new Error('disk unavailable')
      }
      await commit(changes)
    })
    native.purchaseProduct.mockResolvedValue(transaction('recover'))
    expect(await service.purchaseBetrayalsProduct('eyeros10000', 'first')).toBe(false)
    expect(getProfiles().profiles[0].eyeoleans).toBe(10_100)
    expect(native.consumePurchase).not.toHaveBeenCalled()
    native.getPurchases.mockResolvedValue({ purchases: [transaction('recover')] })
    await service.refreshBetrayalsCommerce({ force: true })
    expect(getProfiles().profiles[0].eyeoleans).toBe(10_100)
    expect(native.consumePurchase).toHaveBeenCalledTimes(1)
    expect(JSON.parse(existing.get(ledgerKey)!).receipts['android:recover'].finished).toBe(true)
  })

  it('uses only unfinished iOS consumables during restore and restores upgrade VIP ownership', async () => {
    native.platform = 'ios'
    native.getPurchases.mockResolvedValue({
      purchases: [
        transaction('old-consumed'),
        transaction('vip-upgrade', { productIdentifier: `${vipId}.upgrade749` }),
      ],
    })
    const { service, getProfiles } = await setup()
    await service.restoreBetrayalsPurchases('first')
    expect(service.getBetrayalsCommerceSnapshot()).toMatchObject({
      vip: true,
      myPulse: true,
      realityMode: true,
      dramaMode: true,
      noAds: true,
      paidLooks: true,
      premiumGames: true,
    })
    expect(getProfiles().profiles[0].eyeoleans).toBe(100)
    expect(native.consumePurchase).not.toHaveBeenCalled()
    expect(native.finishTransaction).not.toHaveBeenCalled()
    expect(native.restorePurchases).toHaveBeenCalledOnce()
  })

  it('preserves cached ownership on store failure, then applies an authoritative refund', async () => {
    const { service } = await setup()
    native.getPurchases.mockResolvedValue({
      purchases: [transaction('vip-owned', { productIdentifier: vipId, isAcknowledged: true })],
    })
    await service.refreshBetrayalsCommerce({ force: true })
    expect(service.getBetrayalsCommerceSnapshot().vip).toBe(true)
    native.isBillingSupported.mockRejectedValueOnce(new Error('offline'))
    await service.refreshBetrayalsCommerce({ force: true })
    expect(service.getBetrayalsCommerceSnapshot().vip).toBe(true)
    native.getPurchases.mockResolvedValue({ purchases: [] })
    await service.refreshBetrayalsCommerce({ force: true })
    expect(service.getBetrayalsCommerceSnapshot().vip).toBe(false)
  })

  it('quotes the native upgrade SKU after standalone ownership and never invents a web purchase', async () => {
    const { service } = await setup()
    native.getPurchases.mockResolvedValue({
      purchases: [
        transaction('pulse-owned', {
          productIdentifier: 'com.georgicole.thebigeye.betrayals.mypulse',
          isAcknowledged: true,
        }),
      ],
    })
    await service.refreshBetrayalsCommerce({ force: true })
    expect(service.getBetrayalsCommerceSnapshot().products.vip?.productId).toBe(
      `${vipId}.upgrade1249`
    )
    expect(service.getBetrayalsCommerceSnapshot().vipUpgradeAvailable).toBe(true)
    native.platform = 'web'
    expect(await service.purchaseBetrayalsProduct('vip')).toBe(false)
    expect(native.purchaseProduct).not.toHaveBeenCalled()
    expect(service.getBetrayalsCommerceSnapshot().vip).toBe(false)
  })

  it('clears a cancelled checkout intent so the player can buy the same pack later', async () => {
    const { service, getProfiles } = await setup()
    native.purchaseProduct.mockRejectedValueOnce(new Error('User cancelled'))
    expect(await service.purchaseBetrayalsProduct('eyeros10000', 'first')).toBe(false)
    native.purchaseProduct.mockResolvedValueOnce(transaction('second-attempt'))
    expect(await service.purchaseBetrayalsProduct('eyeros10000', 'first')).toBe(true)
    expect(getProfiles().profiles[0].eyeoleans).toBe(10_100)
  })

  it('allows retry after a product is unavailable without clearing a genuinely pending payment', async () => {
    const { service, getProfiles } = await setup()
    native.purchaseProduct.mockRejectedValueOnce({
      code: 'ITEM_UNAVAILABLE',
      message: 'This product is unavailable',
    })
    expect(await service.purchaseBetrayalsProduct('eyeros10000', 'first')).toBe(false)
    native.purchaseProduct.mockResolvedValueOnce(transaction('retry-available'))
    expect(await service.purchaseBetrayalsProduct('eyeros10000', 'first')).toBe(true)
    expect(getProfiles().profiles[0].eyeoleans).toBe(10_100)
  })

  it('releases absent Android pending orders only on successful restore and keeps their native profile binding', async () => {
    const { service, existing, getProfiles } = await setup()
    native.purchaseProduct.mockRejectedValueOnce(new Error('Purchase is pending'))
    expect(await service.purchaseBetrayalsProduct('eyeros10000', 'first')).toBe(false)
    expect(native.purchaseProduct).toHaveBeenCalledWith(
      expect.objectContaining({ appAccountToken: 'first' })
    )

    native.getPurchases.mockResolvedValue({
      purchases: [transaction('waiting', { purchaseState: '2', appAccountToken: 'first' })],
    })
    await service.restoreBetrayalsPurchases('second')
    expect(JSON.parse(existing.get(ledgerKey)!).intents[currencyId].profileId).toBe('first')
    expect(await service.purchaseBetrayalsProduct('eyeros10000', 'second')).toBe(false)
    expect(native.purchaseProduct).toHaveBeenCalledTimes(1)

    native.getPurchases.mockRejectedValueOnce(new Error('Play is offline'))
    await service.restoreBetrayalsPurchases('second')
    expect(JSON.parse(existing.get(ledgerKey)!).intents[currencyId].profileId).toBe('first')

    native.getPurchases.mockResolvedValue({ purchases: [] })
    await service.refreshBetrayalsCommerce({ force: true })
    expect(JSON.parse(existing.get(ledgerKey)!).intents[currencyId].profileId).toBe('first')
    await service.restoreBetrayalsPurchases('second')
    expect(JSON.parse(existing.get(ledgerKey)!).intents[currencyId]).toBeUndefined()
    native.purchaseProduct.mockResolvedValueOnce(
      transaction('after-cancellation', { appAccountToken: 'second' })
    )
    expect(await service.purchaseBetrayalsProduct('eyeros10000', 'second')).toBe(true)
    expect(getProfiles().profiles.map((profile) => profile.eyeoleans)).toEqual([100, 10_100])

    // A different Play account can reveal its old order later. Its native binding wins.
    native.getPurchases.mockResolvedValue({
      purchases: [transaction('late-original', { appAccountToken: 'first' })],
    })
    await service.restoreBetrayalsPurchases('second')
    expect(getProfiles().profiles.map((profile) => profile.eyeoleans)).toEqual([10_100, 10_100])
  })

  it('never infers iOS Ask to Buy cancellation from absence or redirects its delayed delivery', async () => {
    native.platform = 'ios'
    const { service, existing, getProfiles, switchProfile } = await setup()
    native.purchaseProduct.mockRejectedValueOnce(new Error('Transaction pending'))
    expect(await service.purchaseBetrayalsProduct('eyeros10000', 'first')).toBe(false)
    switchProfile()
    await service.restoreBetrayalsPurchases('second')
    expect(JSON.parse(existing.get(ledgerKey)!).intents[currencyId].profileId).toBe('first')
    expect(service.getBetrayalsCommerceSnapshot().notice).toContain('cannot cancel')
    expect(await service.purchaseBetrayalsProduct('eyeros10000', 'second')).toBe(false)
    expect(native.purchaseProduct).toHaveBeenCalledTimes(1)

    native.getUnfinishedTransactions.mockResolvedValue({
      transactions: [transaction('approved-later')],
    })
    await service.restoreBetrayalsPurchases('second')
    expect(getProfiles().profiles.map((profile) => profile.eyeoleans)).toEqual([10_100, 100])
    expect(native.finishTransaction).toHaveBeenCalledWith({ transactionId: 'approved-later' })
  })

  it('does not redirect a native-bound payment when its original profile no longer exists', async () => {
    const { service, existing, getProfiles } = await setup()
    native.getPurchases.mockResolvedValue({
      purchases: [transaction('deleted-profile', { appAccountToken: 'deleted' })],
    })
    await service.restoreBetrayalsPurchases('second')
    expect(getProfiles().profiles.map((profile) => profile.eyeoleans)).toEqual([100, 100])
    expect(JSON.parse(existing.get(ledgerKey)!).receipts['android:deleted-profile'].profileId).toBe(
      'deleted'
    )
    expect(native.consumePurchase).not.toHaveBeenCalled()
  })

  it('matches uppercase StoreKit account UUIDs to the original lowercase local profile', async () => {
    native.platform = 'ios'
    const profileId = 'abcdef12-1234-4567-89ab-abcdef123456'
    const { service, getProfiles } = await setup(undefined, [profileId, 'second'])
    native.purchaseProduct.mockResolvedValueOnce(
      transaction('uppercase-storekit-token', { appAccountToken: profileId.toUpperCase() })
    )
    expect(await service.purchaseBetrayalsProduct('eyeros10000', profileId)).toBe(true)
    expect(getProfiles().profiles.map((profile) => profile.eyeoleans)).toEqual([10_100, 100])
    expect(native.finishTransaction).toHaveBeenCalledWith({
      transactionId: 'uppercase-storekit-token',
    })
  })

  it('applies the inherited adult-services check only to Eyeros with contextual guidance', async () => {
    const { service } = await setup()
    const { assertAdultServicesAllowed } = await import('../../safety/playerSafety')
    vi.mocked(assertAdultServicesAllowed).mockImplementationOnce(() => {
      throw new Error('Survival run purchases are restricted to adult players.')
    })
    native.purchaseProduct.mockResolvedValueOnce(
      transaction('permanent-without-adult-settings', { productIdentifier: vipId })
    )
    expect(await service.purchaseBetrayalsProduct('vip')).toBe(true)
    expect(assertAdultServicesAllowed).not.toHaveBeenCalled()
    expect(await service.purchaseBetrayalsProduct('eyeros10000', 'first')).toBe(false)
    expect(native.purchaseProduct).toHaveBeenCalledTimes(1)
    expect(service.getBetrayalsCommerceSnapshot().error).toContain('Eyeros purchases')
    expect(service.getBetrayalsCommerceSnapshot().error).toContain('Advertising privacy')
    expect(service.getBetrayalsCommerceSnapshot().error).not.toContain('Survival')
  })
})
