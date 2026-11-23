import { appearanceFromAssetUrl } from '../appearance/catalog'
import { isBetrayalsLook } from './betrayalsAppearance'
import { BETRAYALS_AI_POOL } from './cast'

type CinematicIdentity = { id: string; portrait?: string; human?: boolean }

const assets = import.meta.env.BASE_URL + 'assets/'
const rosterPortraits = new Map(BETRAYALS_AI_POOL.map(({ id, portrait }) => [id, portrait]))

export function cinematicLookId({ id, portrait, human }: CinematicIdentity) {
  const look = appearanceFromAssetUrl(portrait)
  if (look?.kind === 'catalog' && isBetrayalsLook(look.lookId)) return look.lookId

  const rosterPortrait = rosterPortraits.get(id)
  if (!human && rosterPortrait && (!portrait || portrait === rosterPortrait)) return id
}

export function seatedCutout(id: string) {
  // The old Round Table artwork for Pax depicts a different contestant.
  if (id === 'pax') {
    return {
      src: assets + 'ceremonies/characters/pax/ceremony-front.webp',
      crop: [126, 32, 168, 175] as const,
    }
  }
  return { src: assets + 'betrayals/round-table/' + id + '.webp' }
}
