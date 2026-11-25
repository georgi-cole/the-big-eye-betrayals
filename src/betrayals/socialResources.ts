import type { SocialActionDefinition } from '../social/socialActions'
import {
  addEarnedEnergy,
  podiumEnergyForPlacement,
  SOCIAL_RESOURCE_CALIBRATION as calibration,
} from '../social/socialResourceCalibration.ts'
import {
  getSocialResourceEffect,
  type SocialResourceOutcome,
} from '../social/socialResourceEconomy.ts'
import type { RealityPreset, Run, SocialEntry } from './run.ts'

export type SocialResources = { energy: number; influence: number; info: number }
export type SocialWallet = SocialResources & { day: number; energySpent: number }

export const CASTLE_EXPLORATION_INFO = 25
export const EAVESDROP_INFO = 100
export const GROUP_CHAT_INFLUENCE_PER_GUEST = 2
export const SOCIAL_RECHARGE_ENERGY = calibration.rewardedRechargeEnergy

const shieldConversationCost = { energy: 1, influence: 0, info: 0 }
const actionEconomy: Record<
  SocialEntry['kind'],
  { resourceAction?: Pick<SocialActionDefinition, 'id' | 'kind'>; cost: SocialResources }
> = {
  rapport: {
    resourceAction: { id: 'rapport', kind: 'rapport' },
    cost: { energy: 1, influence: 0, info: 0 },
  },
  question: {
    resourceAction: { id: 'whisper', kind: 'intel_gain' },
    cost: { energy: 1, influence: 0, info: 0 },
  },
  alliance: {
    resourceAction: { id: 'proposeAlliance', kind: 'intel_spend' },
    cost: { energy: 2, influence: 0, info: 0 },
  },
  'end-pact': { cost: { energy: 0, influence: 0, info: 0 } },
  'vote-plan': {
    resourceAction: { id: 'rally_votes_against', kind: 'political_spend' },
    cost: { energy: 2, influence: 12, info: 50 },
  },
  'ask-about': {
    resourceAction: { id: 'ask_player_opinion', kind: 'intel_gain' },
    cost: { energy: 1, influence: 2, info: 0 },
  },
  'share-suspicion': {
    resourceAction: { id: 'share_suspicion', kind: 'intel_spend' },
    cost: { energy: 1, influence: 0, info: 25 },
  },
  'defend-guest': {
    resourceAction: { id: 'defend_guest', kind: 'political_spend' },
    cost: { energy: 1, influence: 5, info: 0 },
  },
  'mend-fences': {
    resourceAction: { id: 'mend_fences', kind: 'rapport' },
    cost: { energy: 1, influence: 0, info: 0 },
  },
  debrief: {
    resourceAction: { id: 'ask_player_opinion', kind: 'intel_gain' },
    cost: { energy: 1, influence: 0, info: 0 },
  },
  'ask-end': {
    resourceAction: { id: 'ask_loh_target', kind: 'intel_gain' },
    cost: { energy: 1, influence: 3, info: 0 },
  },
  'shield-gift': { cost: { energy: 0, influence: 0, info: 0 } },
  'shield-claim': { cost: shieldConversationCost },
  'shield-deny': { cost: shieldConversationCost },
  'ask-shield': { cost: shieldConversationCost },
  'shield-tip': { cost: shieldConversationCost },
  'shield-request': { cost: { energy: 0, influence: 0, info: 0 } },
  'shield-plans': { cost: { energy: 0, influence: 0, info: 0 } },
  'group-chat': { cost: { energy: 2, influence: 0, info: 0 } },
  'lay-low': { cost: { energy: 0, influence: 0, info: 0 } },
  'explore-castle': { cost: { energy: 1, influence: 0, info: 0 } },
  eavesdrop: { cost: { energy: 2, influence: 0, info: 0 } },
  'found-alliance': { cost: { energy: 2, influence: 0, info: 0 } },
  'consult-alliance': { cost: { energy: 1, influence: 0, info: 0 } },
  'alliance-update': { cost: { energy: 0, influence: 0, info: 0 } },
}

const calibrationMode = (reality: RealityPreset) => (reality === 'off' ? 'normal' : 'drama')

function startingSocialWallet(day: number, reality: RealityPreset): SocialWallet {
  return {
    day,
    energy: calibration[calibrationMode(reality)].dailyEnergy,
    energySpent: 0,
    influence: 0,
    info: 0,
  }
}

export function initializeSocialWallets(
  seats: readonly { id: string }[],
  day: number,
  reality: RealityPreset
): NonNullable<Run['socialWallets']> {
  return Object.fromEntries(seats.map(({ id }) => [id, startingSocialWallet(day, reality)]))
}

export function socialMoveCost(
  kind: SocialEntry['kind'],
  reality: RealityPreset,
  guestCount = 2
): SocialResources {
  const { cost } = actionEconomy[kind]
  if (kind === 'group-chat') return { ...cost, energy: guestCount }
  return reality !== 'off' && (kind === 'question' || kind === 'vote-plan')
    ? { ...cost, energy: cost.energy + 1 }
    : cost
}

export function missingSocialResource(
  resources: SocialResources,
  cost: SocialResources
): keyof SocialResources | undefined {
  const currencies = ['energy', 'influence', 'info'] as const
  return currencies.find((currency) => resources[currency] < cost[currency])
}

export function socialWalletFor(run: Run, id: string): SocialWallet {
  const mode = calibrationMode(run.options.realityMode)
  const allowance = calibration[mode].dailyEnergy
  const stored =
    run.socialWallets && Object.hasOwn(run.socialWallets, id) ? run.socialWallets[id] : undefined
  if (!stored) return startingSocialWallet(run.day, run.options.realityMode)
  if (stored.day === run.day) return stored
  return {
    ...stored,
    energy: addEarnedEnergy(stored.energy, (run.day - stored.day) * allowance, mode),
    day: run.day,
    energySpent: 0,
  }
}

export function recordSocialWallet(
  run: Run,
  id: string,
  changes: Partial<SocialResources>,
  energySpent = 0
): NonNullable<Run['socialWallets']> {
  const wallet = socialWalletFor(run, id)
  const energy = changes.energy ?? 0
  const mode = calibrationMode(run.options.realityMode)
  return {
    ...run.socialWallets,
    [id]: {
      ...wallet,
      energy: energy < 0 ? wallet.energy + energy : addEarnedEnergy(wallet.energy, energy, mode),
      influence: Math.max(0, wallet.influence + (changes.influence ?? 0)),
      info: Math.max(0, wallet.info + (changes.info ?? 0)),
      energySpent: wallet.energySpent + energySpent,
    },
  }
}

function socialMoveReward(
  kind: SocialEntry['kind'],
  outcome: SocialResourceOutcome,
  guestCount = 2
) {
  if (kind === 'group-chat')
    return { influence: guestCount * GROUP_CHAT_INFLUENCE_PER_GUEST, info: 0 }
  if (kind === 'explore-castle' || kind === 'eavesdrop') {
    return {
      influence: 0,
      info:
        kind === 'eavesdrop' && outcome === 'success' ? EAVESDROP_INFO : CASTLE_EXPLORATION_INFO,
    }
  }

  const { resourceAction, cost } = actionEconomy[kind]
  if (!resourceAction) return { influence: 0, info: 0 }
  const effect = getSocialResourceEffect(
    { ...resourceAction, title: resourceAction.id, category: 'strategic', baseCost: cost.energy },
    outcome
  )
  // The charged price is the one shown on the card. A poor result can forfeit a
  // reward or strain the relationship, but cannot add a hidden wallet charge.
  return {
    influence:
      kind === 'alliance' && outcome === 'success'
        ? calibration.relationships.allianceInfluence
        : Math.max(0, effect.influence),
    info: Math.max(0, effect.info),
  }
}

export function walletAfterSocialMove(
  run: Run,
  entry: SocialEntry,
  cost: SocialResources,
  guestCount?: number
) {
  const outcome =
    entry.reaction === 'backfired'
      ? 'backfire'
      : entry.accepted === false || entry.reaction === 'held-back' || entry.reaction === 'unmoved'
        ? 'failure'
        : 'success'
  const reward = socialMoveReward(entry.kind, outcome, guestCount)
  return recordSocialWallet(
    run,
    entry.actorId,
    {
      energy: -cost.energy,
      influence: reward.influence - cost.influence,
      info: reward.info - cost.info,
    },
    cost.energy
  )
}

export function canRechargeSocialEnergy(run: Run): boolean {
  return (
    !run.result &&
    run.phase !== 'settled' &&
    !run.presentation?.length &&
    !run.pendingAdBreak &&
    run.seats.some(({ id, exit }) => id === run.humanId && !exit) &&
    socialWalletFor(run, run.humanId).energy === 0
  )
}

/** Called after a completed ad, for the same season and in-game day as the offer. */
export function rechargeSocialEnergy(run: Run): Run {
  if (!canRechargeSocialEnergy(run)) return run
  return {
    ...run,
    revision: run.revision + 1,
    socialWallets: recordSocialWallet(run, run.humanId, { energy: SOCIAL_RECHARGE_ENERGY }),
  }
}

export function walletsAfterChallenge(
  run: Run,
  standings: readonly { contestantId: string; forfeited?: boolean }[]
): Run['socialWallets'] {
  const mode = calibrationMode(run.options.realityMode)
  let updated = run
  for (const [index, { contestantId, forfeited }] of standings.entries()) {
    const wallet = socialWalletFor(updated, contestantId)
    const secondWind =
      run.phase === 'immunity' && wallet.energySpent >= calibration[mode].secondWindSpendThreshold
        ? calibration[mode].activeSecondWind
        : 0
    const podium = forfeited ? 0 : podiumEnergyForPlacement(index + 1)
    const influence =
      !forfeited && index === 0
        ? run.phase === 'immunity'
          ? calibration.competition.lohInfluence
          : run.phase === 'safety'
            ? calibration.competition.posInfluence
            : calibration.competition.voxFinalImmunityInfluence
        : 0
    if (secondWind || podium || influence) {
      updated = {
        ...updated,
        socialWallets: recordSocialWallet(updated, contestantId, {
          energy: secondWind + podium,
          influence,
        }),
      }
    }
  }
  return updated.socialWallets
}
