import { appearanceFromAssetUrl, getAppearanceAsset, SELECTABLE_LOOKS } from '../appearance/catalog'

export const IS_BETRAYALS_EDITION = import.meta.env.VITE_BETRAYALS_EDITION === 'true'

export const BETRAYALS_PORTRAITS = [
  { id: 'pc-005', name: 'The Envoy' },
  { id: 'pc-015', name: 'The Heiress' },
  { id: 'pc-025', name: 'The Insider' },
] as const

export type BetrayalsLookId = (typeof BETRAYALS_PORTRAITS)[number]['id']

export function isBetrayalsLook(id: string): id is BetrayalsLookId {
  return BETRAYALS_PORTRAITS.some((look) => look.id === id)
}

export const BETRAYALS_LOOKS = SELECTABLE_LOOKS.flatMap((look) => {
  const portrait = BETRAYALS_PORTRAITS.find(({ id }) => id === look.id)
  return portrait ? [{ ...look, label: portrait.name }] : []
})

export const betrayalsWardrobe = 'assets/betrayals/changing-room.webp'
export const betrayalsProfileArt = 'assets/betrayals/observatory.jpg'

export function getBetrayalsPortrait(lookId: BetrayalsLookId | null): string | undefined {
  const asset = lookId && getAppearanceAsset({ kind: 'catalog', lookId, revision: 1 }, 'main')
  return asset ? import.meta.env.BASE_URL + asset : undefined
}

export function sadBetrayalsPortrait(portrait?: string): string | undefined {
  const catalog = getAppearanceAsset(appearanceFromAssetUrl(portrait), 'sad')
  if (catalog) return import.meta.env.BASE_URL + catalog
  return portrait?.replace(
    /(\/assets\/skins\/[^/?#]+)_avatar\.webp(?:[?#].*)?$/,
    '$1_sad_avatar.webp'
  )
}
