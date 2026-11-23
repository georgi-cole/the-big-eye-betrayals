import type { BetrayalsProductKey } from './commerce/catalog'

export type BetrayalsStoreSection = 'home' | 'vip' | 'features' | 'items' | 'wallet'

export function betrayalsStoreSectionForProduct(
  product?: BetrayalsProductKey
): BetrayalsStoreSection {
  if (product === 'vip') return 'vip'
  if (product?.startsWith('eyeros')) return 'wallet'
  return product ? 'features' : 'home'
}

const SHOP_RETURN_PATHS = new Set([
  '/store',
  '/store/home',
  '/store/vip',
  '/store/features',
  '/store/items',
  '/wallet',
])

/** Profile flows return only to known Betrayals destinations. */
export function betrayalsProfileReturnPath(from: unknown): string {
  return typeof from === 'string' && SHOP_RETURN_PATHS.has(from) ? from : '/'
}
