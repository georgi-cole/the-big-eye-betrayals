export type BetrayalsPermanentProductKey = 'vip' | 'myPulse' | 'realityMode' | 'noAds'
export type BetrayalsCurrencyProductKey = 'eyeros10000' | 'eyeros35000' | 'eyeros100000'
export type BetrayalsProductKey = BetrayalsPermanentProductKey | BetrayalsCurrencyProductKey

export interface BetrayalsAccess {
  vip: boolean
  myPulse: boolean
  realityMode: boolean
  noAds: boolean
  premiumGames: boolean
  paidLooks: boolean
}

export type BetrayalsOwnership = Record<BetrayalsPermanentProductKey, boolean>

export interface BetrayalsProduct {
  key: BetrayalsProductKey
  productId: string
  title: string
  description: string
  benefits: readonly string[]
  kind: 'permanent' | 'consumable'
  /** Store setup guidance only. Checkout always uses the native localized price. */
  nominalPriceCents: number
  eyeros?: number
}

const id = (name: string, fallback: string) =>
  String(import.meta.env[name] ?? '').trim() || `com.georgicole.thebigeye.betrayals.${fallback}`

export const BETRAYALS_PRODUCTS: readonly BetrayalsProduct[] = [
  {
    key: 'vip',
    productId: id('VITE_BETRAYALS_VIP_PRODUCT_ID', 'vip'),
    title: 'Betrayals VIP',
    description: 'The complete castle experience. One permanent unlock.',
    kind: 'permanent',
    nominalPriceCents: 1499,
    benefits: [
      'My Pulse: follow your story through the castle',
      'Reality Mode: full guest profiles and advanced social actions',
      'Every premium challenge version',
      'The full current changing-room collection',
      'No automatic advertising breaks',
    ],
  },
  {
    key: 'myPulse',
    productId: id('VITE_BETRAYALS_PULSE_PRODUCT_ID', 'mypulse'),
    title: 'My Pulse',
    description: 'Your season story, saved evidence and investigation notes, brought together.',
    kind: 'permanent',
    nominalPriceCents: 299,
    benefits: [
      'Your personal season chronicle',
      'Relationships, turning points and current pressures',
      'Save evidence and keep your own investigation notes',
    ],
  },
  {
    key: 'realityMode',
    productId: id('VITE_BETRAYALS_REALITY_PRODUCT_ID', 'realitymode'),
    title: 'Reality Mode',
    description:
      'Full guest profiles and advanced ways to investigate, negotiate and influence the room.',
    kind: 'permanent',
    nominalPriceCents: 699,
    benefits: [
      'Full guest profiles and personality reads',
      'Advanced social and investigation actions',
    ],
  },
  {
    key: 'noAds',
    productId: id('VITE_BETRAYALS_NO_ADS_PRODUCT_ID', 'noads'),
    title: 'No Ads',
    description: 'Keep the atmosphere. Remove automatic advertising breaks.',
    kind: 'permanent',
    nominalPriceCents: 299,
    benefits: ['No automatic ads', 'Optional rewarded opportunities remain your choice'],
  },
  ...(
    [
      ['eyeros10000', 'eyeros10000', 10_000, 199],
      ['eyeros35000', 'eyeros35000', 35_000, 499],
      ['eyeros100000', 'eyeros100000', 100_000, 999],
    ] as const
  ).map(([key, suffix, eyeros, nominalPriceCents]) => ({
    key,
    productId: id(`VITE_BETRAYALS_${suffix.toUpperCase()}_PRODUCT_ID`, suffix),
    title: `${new Intl.NumberFormat('en-US').format(eyeros)} Eyeros`,
    description: 'Add Eyeros to this profile for looks and Night Shields.',
    benefits: ['Delivered to the selected profile', 'A repeatable purchase; separate from VIP'],
    kind: 'consumable' as const,
    nominalPriceCents,
    eyeros,
  })),
]

export function emptyBetrayalsOwnership(): BetrayalsOwnership {
  return { vip: false, myPulse: false, realityMode: false, noAds: false }
}

export function getBetrayalsAccess(owned: Partial<BetrayalsOwnership>): BetrayalsAccess {
  const vip = owned.vip === true
  return {
    vip,
    myPulse: vip || owned.myPulse === true,
    realityMode: vip || owned.realityMode === true,
    noAds: vip || owned.noAds === true,
    premiumGames: vip,
    paidLooks: vip,
  }
}

export function getBetrayalsProduct(key: BetrayalsProductKey): BetrayalsProduct {
  const product = BETRAYALS_PRODUCTS.find((entry) => entry.key === key)
  if (!product) throw new Error('This store item is unavailable.')
  return product
}

export function findBetrayalsProduct(productId: string): BetrayalsProduct | undefined {
  if (BETRAYALS_VIP_UPGRADE_TIERS.some((entry) => entry.productId === productId)) {
    return { ...getBetrayalsProduct('vip'), productId }
  }
  return BETRAYALS_PRODUCTS.find((entry) => entry.productId === productId)
}

export const BETRAYALS_VIP_UPGRADE_TIERS = [1249, 1049, 999, 749, 499].map((nominalPriceCents) => ({
  nominalPriceCents,
  productId: id(
    `VITE_BETRAYALS_VIP_UPGRADE_${nominalPriceCents}_PRODUCT_ID`,
    `vip.upgrade${nominalPriceCents}`
  ),
}))

/** Owned standalone products receive 75% nominal credit, mapped to configured store SKUs. */
export function resolveBetrayalsVipOffer(ownership: Partial<BetrayalsOwnership>) {
  const eligible = BETRAYALS_PRODUCTS.reduce(
    (sum, product) =>
      product.kind === 'permanent' &&
      product.key !== 'vip' &&
      ownership[product.key as BetrayalsPermanentProductKey]
        ? sum + product.nominalPriceCents
        : sum,
    0
  )
  const product = getBetrayalsProduct('vip')
  if (eligible === 0 || ownership.vip)
    return {
      productId: product.productId,
      nominalPriceCents: product.nominalPriceCents,
      creditCents: 0,
    }
  const creditCents = Math.round(eligible * 0.75)
  const target = Math.max(499, product.nominalPriceCents - creditCents)
  const tier = BETRAYALS_VIP_UPGRADE_TIERS.reduce((best, entry) =>
    Math.abs(entry.nominalPriceCents - target) < Math.abs(best.nominalPriceCents - target)
      ? entry
      : best
  )
  return { ...tier, creditCents }
}
