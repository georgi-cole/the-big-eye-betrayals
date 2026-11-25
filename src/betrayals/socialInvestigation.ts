import type { SocialActionDefinition } from '../social/socialActions'
import { INVESTIGATION_ENERGY_COST } from './investigation'
import type { InvestigationAction } from './investigation'
import { isVoteClaim } from './investigationRecords'
import type { ObservationFocus, SharedReport } from './investigationRecords'
import type { GuestProfile, PlayerAccount } from './pulseView'

export type InvestigationControls = {
  profile: (id: string) => GuestProfile
  remaining: number
  open: boolean
  reason: (action: InvestigationAction) => string | undefined
  act: (action: InvestigationAction) => void
  openPulse: (guestId?: string) => void
}

export const investigationCost = { energy: INVESTIGATION_ENERGY_COST, influence: 0, info: 0 }

export const investigationMoves = {
  observe: {
    title: 'Observe',
    description: 'Watch this guest for a specific kind of clue.',
    icon: '👁️',
  },
  ask: {
    title: 'Ask around',
    description: 'Ask another guest what they know about this person.',
    icon: '💬',
  },
  watch: {
    title: 'Ask to watch',
    description: 'Ask a guest to look out for this person tomorrow.',
    icon: '🔎',
  },
  source: {
    title: 'Trace the source',
    description: 'Ask where a secondhand account came from.',
    icon: '🧭',
  },
  confront: {
    title: 'Hear their side',
    description: 'Ask this guest privately about a specific account.',
    icon: '🗣️',
  },
  witness: {
    title: 'Ask to testify',
    description: 'Ask a firsthand witness to speak at the Table.',
    icon: '⚖️',
  },
  share: {
    title: 'Discuss an account',
    description: 'Share or dispute what you heard with another guest.',
    icon: '📜',
  },
  review: {
    title: 'Review accounts',
    description: 'Read and save what you have learned about this guest.',
    icon: '📖',
  },
} satisfies Record<string, Pick<SocialActionDefinition, 'title' | 'description' | 'icon'>>

export type InvestigationMove = keyof typeof investigationMoves
export const investigationMoveIds = Object.keys(investigationMoves) as InvestigationMove[]

export function isInvestigationMove(id: string): id is InvestigationMove {
  return Object.hasOwn(investigationMoves, id)
}

export function accountsForMove(
  move: InvestigationMove,
  accounts: readonly PlayerAccount[],
  day: number
) {
  switch (move) {
    case 'observe':
    case 'watch':
      return []
    case 'ask':
      return accounts.filter(({ claim }) => claim && claim.day >= day - 2)
    case 'source':
      return accounts.filter(
        ({ access, sourceId, speakerId, day: reportDay }) =>
          access === 'hearsay' && !sourceId && speakerId && reportDay >= day - 2
      )
    case 'confront':
    case 'witness':
      return accounts.filter(
        ({ claim, access }) =>
          isVoteClaim(claim) &&
          !claim.denies &&
          claim.day >= day - 2 &&
          (move === 'confront' ? access !== 'statement' : access === 'firsthand')
      )
    case 'share':
      return accounts.filter(({ claim }) => claim?.behavior)
    case 'review':
      return accounts
  }
}

export type InvestigationInput = {
  focus?: ObservationFocus
  speakerId?: string
  referenceId?: string
  mode?: SharedReport['mode']
}

export function investigationCommand(
  move: InvestigationMove,
  guestId: string,
  { focus = 'actions', speakerId, referenceId, mode }: InvestigationInput,
  account?: PlayerAccount
): InvestigationAction | undefined {
  switch (move) {
    case 'review':
      return
    case 'observe':
      return { kind: move, guestId, focus }
    case 'ask':
      return speakerId ? { kind: move, guestId, speakerId, referenceId } : undefined
    case 'watch':
      return speakerId ? { kind: move, guestId, speakerId } : undefined
    case 'share':
      return account && speakerId && mode
        ? { kind: move, reportId: account.id, speakerId, mode }
        : undefined
    default:
      return account ? { kind: move, reportId: account.id } : undefined
  }
}
