export const MORNING_MOVES = ['witness', 'verify', 'warn', 'approach'] as const
export const VOTE_MOVES = ['support', 'counter', 'conditional', 'decline'] as const
export const SAFETY_MOVES = ['promise', 'request', 'private', 'sit-out'] as const
export const SHIELD_MOVES = ['give', 'broker', 'trace', 'claim', 'quiet'] as const

export type DayFlow = {
  day: number
  castleDay?: true
  breakfast?: { guestId: string; reportId?: string }
  morning?: { kind: (typeof MORNING_MOVES)[number]; guestId: string; reportId?: string }
  provisional?: Record<string, string>
  witness?: { reportId: string; guestId: string; needsShield: boolean; ready?: boolean }
  plan?: {
    kind: (typeof VOTE_MOVES)[number]
    partnerId: string
    targetId?: string
    accepted: boolean
    redirectedTo?: string
  }
  safety?: {
    kind: (typeof SAFETY_MOVES)[number]
    guestId?: string
    accepted?: boolean
    result?: 'kept' | 'broken' | 'void'
  }
  shields?: {
    kind: (typeof SHIELD_MOVES)[number]
    guestId?: string
    donorId?: string
    voteTargetId?: string
    result?: 'gifted' | 'declined' | 'uncertain' | 'has' | 'none'
  }
  night?: { kind: 'meeting' | 'account'; guestId: string; reportId?: string }
  delivery?: { kind: 'meeting' | 'account'; guestId: string; reportId?: string }
  finale?: { guestId: string; stance: 'trust' | 'doubt' }
}
