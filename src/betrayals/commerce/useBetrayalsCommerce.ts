import { useEffect, useSyncExternalStore } from 'react'
import {
  getBetrayalsCommerceSnapshot,
  forceRefreshBetrayalsCommerce,
  purchaseBetrayalsProduct,
  refreshBetrayalsCommerce,
  restoreBetrayalsPurchases,
  subscribeBetrayalsCommerce,
} from './purchaseService'

/** Independent of Redux; the route binds the profile wallet once at its boundary. */
export function useBetrayalsCommerce(enabled = true) {
  const snapshot = useSyncExternalStore(
    subscribeBetrayalsCommerce,
    getBetrayalsCommerceSnapshot,
    getBetrayalsCommerceSnapshot
  )
  useEffect(() => {
    if (enabled) void refreshBetrayalsCommerce()
  }, [enabled])
  return {
    ...snapshot,
    purchase: purchaseBetrayalsProduct,
    restore: restoreBetrayalsPurchases,
    refresh: forceRefreshBetrayalsCommerce,
  }
}
