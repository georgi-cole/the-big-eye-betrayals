import type { RankedScore } from './challenges.ts'
import type { CommandToken, Run } from './run.ts'

export const BETRAYALS_REWARD_AMOUNTS = {
  socialAction: 50,
  challengeParticipation: 150,
  immunityWin: 500,
  safetyWin: 400,
  survivedNight: 400,
  finalChallengeWin: 1_000,
  finalist: 2_500,
  seasonCompleted: 1_000,
  seasonWinner: 10_000,
} as const

export const BETRAYALS_REWARDED_SOCIAL_ACTIONS_PER_DAY = 4
export const PAID_NIGHT_SHIELD_PRICE = 3_000
export const PAID_NIGHT_SHIELD_MIN_CAST = 6

const REWARD_RULES = {
  'social-action': { amount: BETRAYALS_REWARD_AMOUNTS.socialAction, label: 'Social action' },
  'immunity-played': {
    amount: BETRAYALS_REWARD_AMOUNTS.challengeParticipation,
    label: 'Immunity challenge completed',
  },
  'immunity-win': { amount: BETRAYALS_REWARD_AMOUNTS.immunityWin, label: 'Immunity won' },
  'safety-played': {
    amount: BETRAYALS_REWARD_AMOUNTS.challengeParticipation,
    label: 'Safety challenge completed',
  },
  'safety-win': { amount: BETRAYALS_REWARD_AMOUNTS.safetyWin, label: 'Safety shield won' },
  'final-challenge-played': {
    amount: BETRAYALS_REWARD_AMOUNTS.challengeParticipation,
    label: 'Final challenge completed',
  },
  'final-challenge-win': {
    amount: BETRAYALS_REWARD_AMOUNTS.finalChallengeWin,
    label: 'Final challenge won',
  },
  'survived-night': {
    amount: BETRAYALS_REWARD_AMOUNTS.survivedNight,
    label: 'Survived the night',
  },
  finalist: { amount: BETRAYALS_REWARD_AMOUNTS.finalist, label: 'Reached the Final Five' },
  'season-completed': {
    amount: BETRAYALS_REWARD_AMOUNTS.seasonCompleted,
    label: 'Reached the season result',
  },
  'season-winner': { amount: BETRAYALS_REWARD_AMOUNTS.seasonWinner, label: 'Season victory' },
} as const

export type BetrayalsRewardCode = keyof typeof REWARD_RULES
export type BetrayalsRewardEvent = {
  id: string
  code: BetrayalsRewardCode
  day: number
  ordinal: number
  amount: number
  label: string
}

export type PaidNightShieldPurchase = {
  day: number
  transactionId: string
  status: 'pending' | 'active'
}

export type BetrayalsEconomy = {
  /** These receipts are retained on rewind; the profile wallet applies their IDs only once. */
  rewards: BetrayalsRewardEvent[]
  /** A purchased shield covers its named night, never a different night after a rewind. */
  paidNightShields: PaidNightShieldPurchase[]
}

const SEASON_REWARDS = new Set<BetrayalsRewardCode>([
  'finalist',
  'season-completed',
  'season-winner',
])

function rewardId(runId: string, code: BetrayalsRewardCode, day: number, ordinal: number) {
  const scope = SEASON_REWARDS.has(code) ? code : `day:${day}:${code}:${ordinal}`
  return `betrayals:${runId}:reward:${scope}`
}

function humanAlive(run: Run) {
  return run.seats.some(({ id, exit }) => id === run.humanId && !exit)
}

function addReward(run: Run, code: BetrayalsRewardCode, day = run.day, ordinal = 1): Run {
  const id = rewardId(run.id, code, day, ordinal)
  if (run.economy?.rewards.some((reward) => reward.id === id)) return run
  return {
    ...run,
    economy: {
      paidNightShields: run.economy?.paidNightShields ?? [],
      rewards: [...(run.economy?.rewards ?? []), { id, code, day, ordinal, ...REWARD_RULES[code] }],
    },
  }
}

/** Read after saving the run; replaying this list into the profile wallet is safe. */
export function betrayalsRewardEvents(run: Run): readonly BetrayalsRewardEvent[] {
  return run.economy?.rewards ?? []
}

/**
 * Record meaningful daily milestones alongside the season save. IDs deliberately
 * omit revision, target and minigame key so reloads and alternate rewind choices
 * cannot multiply rewards. The profile ledger is the final credit authority.
 */
export function recordBetrayalsEconomy(previous: Run | null, next: Run): Run {
  const before = previous?.id === next.id ? previous : null
  let run = next
  if (before?.economy) {
    const currentIds = new Set(next.economy?.rewards.map(({ id }) => id))
    const retained = before.economy.rewards.filter(({ id }) => !currentIds.has(id))
    if (retained.length || !next.economy) {
      run = {
        ...next,
        economy: {
          rewards: [...retained, ...(next.economy?.rewards ?? [])],
          paidNightShields: next.economy?.paidNightShields ?? before.economy.paidNightShields,
        },
      }
    }
  }

  if (humanAlive(run)) {
    const actions = new Set(
      run.social
        .filter(
          ({ day, actorId, kind }) =>
            day === run.day && actorId === run.humanId && kind !== 'alliance-update'
        )
        .map(({ kind, recipientId }) =>
          kind === 'group-chat' || kind === 'consult-alliance' ? kind : `${kind}:${recipientId}`
        )
    )
    const count = Math.min(actions.size, BETRAYALS_REWARDED_SOCIAL_ACTIONS_PER_DAY)
    for (let ordinal = 1; ordinal <= count; ordinal += 1) {
      run = addReward(run, 'social-action', run.day, ordinal)
    }
    if (
      before &&
      humanAlive(before) &&
      before.phase === 'night-resolved' &&
      run.day === before.day + 1
    ) {
      run = addReward(run, 'survived-night', before.day)
    }
    if (run.phase === 'final-challenge' && run.seats.filter(({ exit }) => !exit).length === 5) {
      run = addReward(run, 'finalist')
    }
    if (run.phase === 'settled' && run.result) {
      const humanWon = Object.hasOwn(run.result.payouts, run.humanId)
      run = addReward(run, 'season-completed')
      if (humanWon) run = addReward(run, 'season-winner')
    }
  }
  return run
}

/** Called with the authoritative, already-ranked result, before it leaves the engine. */
export function recordBetrayalsChallengeRewards(
  previous: Run,
  next: Run,
  standings: readonly RankedScore[]
): Run {
  const own = standings.find(({ contestantId }) => contestantId === previous.humanId)
  if (next === previous || !humanAlive(previous) || !own || own.forfeited) return next
  let run = next
  if (previous.phase === 'immunity') {
    run = addReward(run, 'immunity-played', previous.day)
    if (standings[0]?.contestantId === previous.humanId) {
      run = addReward(run, 'immunity-win', previous.day)
    }
  } else if (previous.phase === 'safety') {
    run = addReward(run, 'safety-played', previous.day)
    if (standings.slice(0, 2).some(({ contestantId }) => contestantId === previous.humanId)) {
      run = addReward(run, 'safety-win', previous.day)
    }
  } else if (previous.phase === 'final-challenge') {
    run = addReward(run, 'final-challenge-played', previous.day)
    if (standings[0]?.contestantId === previous.humanId) {
      run = addReward(run, 'final-challenge-win', previous.day)
    }
  }
  return run
}

export function paidNightShieldTransactionId(run: Pick<Run, 'id' | 'day'>) {
  return `betrayals:${run.id}:night-shield:${run.day}`
}

function eligibleNight(run: Run) {
  return (
    !run.result &&
    humanAlive(run) &&
    !run.private.betrayers.includes(run.humanId) &&
    run.seats.filter(({ exit }) => !exit).length >= PAID_NIGHT_SHIELD_MIN_CAST &&
    run.seats.some(({ id, exit }) => !exit && run.private.betrayers.includes(id))
  )
}

export function hasPaidNightShield(run: Run, actorId: string | null): boolean {
  return Boolean(
    actorId === run.humanId &&
    (run.phase === 'night' || run.phase === 'night-resolved') &&
    eligibleNight(run) &&
    run.economy?.paidNightShields.some(({ day, status }) => day === run.day && status === 'active')
  )
}

export function pendingPaidNightShieldPurchase(run: Run): PaidNightShieldPurchase | undefined {
  return run.economy?.paidNightShields.find(
    ({ day, status }) => day === run.day && status === 'pending'
  )
}

export type PaidNightShieldOffer = {
  available: boolean
  price: number
  transactionId: string
  active: boolean
  pending: boolean
  reason?: string
}

export function paidNightShieldOffer(run: Run | null, balance: number): PaidNightShieldOffer {
  const offer: PaidNightShieldOffer = {
    available: false,
    price: PAID_NIGHT_SHIELD_PRICE,
    transactionId: run ? paidNightShieldTransactionId(run) : '',
    active: Boolean(run && hasPaidNightShield(run, run.humanId)),
    pending: Boolean(run && pendingPaidNightShieldPurchase(run)),
  }
  if (!run || run.result || !humanAlive(run)) {
    return { ...offer, reason: 'Available to living players during the night.' }
  }
  if (run.private.betrayers.includes(run.humanId)) {
    return { ...offer, reason: 'Betrayers cannot be murdered by the Conclave.' }
  }
  if (run.seats.filter(({ exit }) => !exit).length < PAID_NIGHT_SHIELD_MIN_CAST) {
    return { ...offer, reason: 'Night Shields are available while at least 6 players remain.' }
  }
  if (run.phase !== 'night') {
    return { ...offer, reason: 'Available after banishment, before tonight’s Conclave resolves.' }
  }
  if (offer.pending) return { ...offer, reason: 'Finishing your Night Shield purchase.' }
  if (offer.active) return { ...offer, reason: 'Your purchased Night Shield is active tonight.' }
  if (run.immunityId === run.humanId || run.private.nightShieldIds.includes(run.humanId)) {
    return { ...offer, reason: 'You already have protection from tonight’s murder.' }
  }
  if (!eligibleNight(run)) return { ...offer, reason: 'There is no murder to protect against.' }
  if (!Number.isSafeInteger(balance) || balance < PAID_NIGHT_SHIELD_PRICE) {
    return { ...offer, reason: 'You need 3,000 Eyeros for tonight’s Night Shield.' }
  }
  return { ...offer, available: true }
}

/** Stage and save first. A pending purchase provides no protection. */
export function preparePaidNightShieldPurchase(
  run: Run,
  token: CommandToken,
  balance: number
): Run {
  if (
    token.runId !== run.id ||
    token.revision !== run.revision ||
    token.phase !== run.phase ||
    !paidNightShieldOffer(run, balance).available
  ) {
    return run
  }
  return {
    ...run,
    revision: run.revision + 1,
    economy: {
      rewards: run.economy?.rewards ?? [],
      paidNightShields: [
        ...(run.economy?.paidNightShields ?? []),
        { day: run.day, transactionId: paidNightShieldTransactionId(run), status: 'pending' },
      ],
    },
  }
}

/** Confirm only after the matching profile debit has been durably written. */
export function confirmPaidNightShieldPurchase(run: Run, transactionId: string): Run {
  const pending = pendingPaidNightShieldPurchase(run)
  if (
    !pending ||
    pending.transactionId !== transactionId ||
    run.phase !== 'night' ||
    !eligibleNight(run)
  ) {
    return run
  }
  return {
    ...run,
    revision: run.revision + 1,
    economy: {
      rewards: run.economy?.rewards ?? [],
      paidNightShields: (run.economy?.paidNightShields ?? []).map((purchase) =>
        purchase.transactionId === transactionId ? { ...purchase, status: 'active' } : purchase
      ),
    },
  }
}

/** Use only after checking that the pending debit was not paid. */
export function cancelPendingPaidNightShieldPurchase(run: Run, transactionId: string): Run {
  const pending = pendingPaidNightShieldPurchase(run)
  if (!pending || pending.transactionId !== transactionId) return run
  return {
    ...run,
    revision: run.revision + 1,
    economy: {
      rewards: run.economy?.rewards ?? [],
      paidNightShields: (run.economy?.paidNightShields ?? []).filter(
        (purchase) => purchase.transactionId !== transactionId
      ),
    },
  }
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

/** Strictly validate financial records without rejecting legacy saves that have none. */
export function validBetrayalsEconomy(value: unknown, runId: string): boolean {
  if (value === undefined) return true
  const economy = object(value)
  if (!economy || !Array.isArray(economy.rewards) || !Array.isArray(economy.paidNightShields)) {
    return false
  }
  const validDay = (day: unknown): day is number =>
    typeof day === 'number' && Number.isSafeInteger(day) && day >= 1
  const rewardIds = new Set<string>()
  const purchaseIds = new Set<string>()
  return (
    economy.rewards.every((value: unknown) => {
      const reward = object(value)
      if (
        !reward ||
        typeof reward.code !== 'string' ||
        !Object.hasOwn(REWARD_RULES, reward.code) ||
        !validDay(reward.day) ||
        typeof reward.ordinal !== 'number' ||
        !Number.isSafeInteger(reward.ordinal) ||
        reward.ordinal < 1 ||
        reward.ordinal >
          (reward.code === 'social-action' ? BETRAYALS_REWARDED_SOCIAL_ACTIONS_PER_DAY : 1)
      ) {
        return false
      }
      const code = reward.code as BetrayalsRewardCode
      const id = rewardId(runId, code, reward.day, reward.ordinal)
      if (
        reward.id !== id ||
        rewardIds.has(id) ||
        reward.amount !== REWARD_RULES[code].amount ||
        reward.label !== REWARD_RULES[code].label
      ) {
        return false
      }
      rewardIds.add(id)
      return true
    }) &&
    economy.paidNightShields.every((value: unknown) => {
      const purchase = object(value)
      if (!purchase || !validDay(purchase.day)) return false
      const id = paidNightShieldTransactionId({ id: runId, day: purchase.day })
      if (
        purchase.transactionId !== id ||
        purchaseIds.has(id) ||
        (purchase.status !== 'pending' && purchase.status !== 'active')
      ) {
        return false
      }
      purchaseIds.add(id)
      return true
    })
  )
}
