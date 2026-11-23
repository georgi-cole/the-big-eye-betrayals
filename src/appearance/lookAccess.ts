import { SELECTABLE_LOOKS } from './catalog'
import { FREE_BETRAYALS_LOOK_IDS, IS_BETRAYALS_EDITION } from '../betrayals/betrayalsAppearance'

/** Cosmetic access applies to the published look order, not to asset filenames. */
export const FREE_APPEARANCE_LOOK_COUNT = 5
export const APPEARANCE_LOOK_PRICE_EYEROS = 30_000

export function isFreeAppearanceLook(lookId: string): boolean {
  if (IS_BETRAYALS_EDITION) return FREE_BETRAYALS_LOOK_IDS.includes(lookId)
  const index = SELECTABLE_LOOKS.findIndex((look) => look.id === lookId)
  return index >= 0 && index < FREE_APPEARANCE_LOOK_COUNT
}

export function isPaidAppearanceLook(lookId: string): boolean {
  if (IS_BETRAYALS_EDITION) {
    return SELECTABLE_LOOKS.some((look) => look.id === lookId) && !isFreeAppearanceLook(lookId)
  }
  const index = SELECTABLE_LOOKS.findIndex((look) => look.id === lookId)
  return index >= FREE_APPEARANCE_LOOK_COUNT
}

export function hasAppearanceLookAccess(
  lookId: string,
  profile: { unlockedAppearanceLookIds?: readonly string[] } | null | undefined,
  isVip: boolean
): boolean {
  if (!SELECTABLE_LOOKS.some((look) => look.id === lookId)) return false
  return (
    isVip ||
    isFreeAppearanceLook(lookId) ||
    Boolean(profile?.unlockedAppearanceLookIds?.includes(lookId))
  )
}
