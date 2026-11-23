import { createContext } from 'react'

/** Shared briefing/host access, frozen when the player accepts a competition's rules. */
export const BetrayalsChallengeAccessContext = createContext<boolean | undefined>(undefined)
