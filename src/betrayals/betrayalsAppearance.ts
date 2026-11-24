import { appearanceFromAssetUrl, getAppearanceAsset, SELECTABLE_LOOKS } from '../appearance/catalog'

export const IS_BETRAYALS_EDITION = import.meta.env.VITE_BETRAYALS_EDITION === 'true'

const ORIGINAL_BETRAYALS_PORTRAITS = [
  { id: 'pc-005', name: 'The Envoy' },
  { id: 'pc-015', name: 'The Heiress' },
  { id: 'pc-025', name: 'The Insider' },
] as const

/** Retain all three launch looks; the expanded wardrobe has five free choices. */
export const FREE_BETRAYALS_LOOK_IDS: readonly string[] = [
  'pc-005',
  'pc-015',
  'pc-025',
  'pc-001',
  'pc-002',
]

export const BETRAYALS_LOOKS = [...SELECTABLE_LOOKS]
  .sort((left, right) => {
    const order = (id: string) => {
      const free = FREE_BETRAYALS_LOOK_IDS.indexOf(id)
      return free < 0
        ? FREE_BETRAYALS_LOOK_IDS.length + SELECTABLE_LOOKS.findIndex((look) => look.id === id)
        : free
    }
    return order(left.id) - order(right.id)
  })
  .map((look) => ({
    ...look,
    label: ORIGINAL_BETRAYALS_PORTRAITS.find(({ id }) => id === look.id)?.name ?? look.label,
  }))

export const BETRAYALS_PORTRAITS = BETRAYALS_LOOKS.map(({ id, label }) => ({ id, name: label }))

export type BetrayalsLookId = string

export function isBetrayalsLook(id: string): id is BetrayalsLookId {
  return BETRAYALS_PORTRAITS.some((look) => look.id === id)
}

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
