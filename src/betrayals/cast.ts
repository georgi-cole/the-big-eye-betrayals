import HOUSEGUESTS from '../data/houseguests'
import { RESERVE_HOUSEGUESTS } from '../data/reserveHouseguests'
import type { Contestant } from './run'

/** Reserve contestants can start in Betrayals without their original entrance mechanics. */
export const BETRAYALS_AI_POOL: Contestant[] = [...HOUSEGUESTS, ...RESERVE_HOUSEGUESTS].map(
  ({ id, name, avatar }) => ({
    id,
    name,
    portrait:
      import.meta.env.BASE_URL +
      (avatar ?? `assets/skins/${id === 'mimi' ? id : name}_avatar.webp`),
  })
)
