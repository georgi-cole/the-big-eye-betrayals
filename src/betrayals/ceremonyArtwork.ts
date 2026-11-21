import { appearanceFromAssetUrl } from '../appearance/catalog'

export const ceremonyArt = import.meta.env.BASE_URL + 'assets/betrayals/'
export const tableShots = ['table-wide', 'table-left', 'table-right', 'table-close'] as const
export const hotelShots = ['hotel-knock', 'hotel-sleep', 'hotel-door', 'hotel-chair'] as const

type Guest = { id: string; portrait?: string; human?: boolean }

export function ceremonyCharacter({ id, portrait, human }: Guest) {
  if (!human && id !== 'human') return id
  const look = appearanceFromAssetUrl(portrait)
  return look?.kind === 'catalog' ? 'character-' + Number(look.lookId.slice(3)) : 'character-5'
}

function characterArt(guest: Guest, pose: 'royal-seated' | 'exit-back') {
  return (
    import.meta.env.BASE_URL +
    'assets/ceremonies/characters/' +
    ceremonyCharacter(guest) +
    '/ceremony-' +
    pose +
    '.webp'
  )
}

export const seatedArt = (guest: Guest) => characterArt(guest, 'royal-seated')
export const rearArt = (guest: Guest) => characterArt(guest, 'exit-back')
