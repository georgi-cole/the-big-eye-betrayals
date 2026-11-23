import { describe, expect, it } from 'vitest'
import { challengeContestantIds, resolveChallenge, type RankedScore } from './challenges'
import {
  BETRAYALS_REWARDED_SOCIAL_ACTIONS_PER_DAY,
  BETRAYALS_REWARD_AMOUNTS,
  PAID_NIGHT_SHIELD_PRICE,
  betrayalsRewardEvents,
  cancelPendingPaidNightShieldPurchase,
  confirmPaidNightShieldPurchase,
  hasPaidNightShield,
  paidNightShieldOffer,
  paidNightShieldTransactionId,
  pendingPaidNightShieldPurchase,
  preparePaidNightShieldPurchase,
  recordBetrayalsEconomy,
} from './economy'
import { resolveConclave, resolveNight, revealDawn } from './night'
import { applyGeneralSocialMove } from './generalSocial'
import { restoreRun, saveRun } from './persistence'
import { commandToken, eligibleBanishmentTargets, startRun, viewFor, type Run } from './run'
import { recordSeasonCheckpoints, rewindSeason } from './seasonRewards'
import { settleRun } from './settlement'

function start(): Run {
  const run = startRun(
    { id: 'human', name: 'Georgi' },
    Array.from({ length: 24 }, (_, index) => ({ id: `guest-${index}`, name: `Guest ${index}` })),
    { publicMode: false, realityMode: 'off' },
    { id: 'economy-season', publicSeed: 28, roleSeed: 42 }
  )
  return {
    ...run,
    private: { ...run.private, betrayers: run.seats.slice(1, 4).map(({ id }) => id) },
  }
}

function night(living = 6): Run {
  const run = start()
  return {
    ...run,
    phase: 'night',
    day: 2,
    seats: run.seats.map((seat, index) =>
      index < living ? seat : { ...seat, exit: { cause: 'banished', day: 1 } }
    ),
  }
}

function saveAndRestore(run: Run) {
  const data = new Map<string, string>()
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  }
  saveRun(storage, 'profile', run)
  return restoreRun(storage, 'profile')
}

function reload(run: Run): Run {
  const restored = saveAndRestore(run)
  if (restored.status !== 'ready') throw new Error('Expected a restorable season')
  return restored.run
}

function activate(run: Run): Run {
  const pending = preparePaidNightShieldPurchase(run, commandToken(run), PAID_NIGHT_SHIELD_PRICE)
  return confirmPaidNightShieldPurchase(pending, paidNightShieldTransactionId(run))
}

function ballots(run: Run, targetId = run.humanId) {
  return run.private.betrayers
    .filter((id) => run.seats.some((seat) => seat.id === id && !seat.exit))
    .map((voterId) => ({ voterId, targetId }))
}

function scores(run: Run, winnerId = run.humanId, forfeitHuman = false): RankedScore[] {
  return challengeContestantIds(run).map((contestantId) => ({
    contestantId,
    score: contestantId === winnerId ? 100 : 10,
    potContribution: 0.5,
    forfeited: contestantId === run.humanId && forfeitHuman,
  }))
}

describe('Betrayals earned Eyeros receipts', () => {
  it('counts a group conversation once and never rewards repeated alliance management', () => {
    const previous = { ...start(), phase: 'social' as const }
    const guests = previous.seats.slice(1, 4).map(({ id }) => id)
    const conversation = applyGeneralSocialMove(
      previous,
      commandToken(previous),
      'group-chat',
      guests
    )
    expect(conversation.social.filter(({ kind }) => kind === 'group-chat')).toHaveLength(3)
    const earned = recordBetrayalsEconomy(previous, conversation)
    expect(betrayalsRewardEvents(earned)).toHaveLength(1)
    expect(betrayalsRewardEvents(earned)[0].amount).toBe(BETRAYALS_REWARD_AMOUNTS.socialAction)
    const renamed = recordBetrayalsEconomy(earned, {
      ...earned,
      social: [
        ...earned.social,
        ...Array.from({ length: 4 }, (_, index) => ({
          day: earned.day,
          actorId: earned.humanId,
          recipientId: earned.humanId,
          kind: 'alliance-update' as const,
          allianceChange: 'rename' as const,
          alliance: {
            id: 'alliance',
            name: `Name ${index}`,
            leaderId: earned.humanId,
            memberIds: [earned.humanId, ...guests],
          },
        })),
      ],
    })
    expect(betrayalsRewardEvents(renamed)).toEqual(betrayalsRewardEvents(earned))
  })

  it('caps daily action receipts and keeps the same IDs after reload and alternate rewind choices', () => {
    const previous = { ...start(), phase: 'social' as const }
    const social = Array.from({ length: 8 }, (_, index) => ({
      day: previous.day,
      actorId: previous.humanId,
      recipientId: previous.seats[index + 1].id,
      kind: 'rapport' as const,
    }))
    const recorded = recordBetrayalsEconomy(previous, { ...previous, social })
    const rewards = betrayalsRewardEvents(recorded)
    expect(rewards).toHaveLength(BETRAYALS_REWARDED_SOCIAL_ACTIONS_PER_DAY)
    expect(rewards.reduce((sum, { amount }) => sum + amount, 0)).toBe(200)
    const restored = reload(recorded)
    expect(recordBetrayalsEconomy(restored, restored)).toBe(restored)
    const alternate = recordBetrayalsEconomy(restored, {
      ...previous,
      revision: restored.revision + 10,
      social: social.map((entry) => ({
        ...entry,
        kind: 'question',
        recipientId: previous.seats[20].id,
      })),
    })
    expect(betrayalsRewardEvents(alternate)).toEqual(rewards)
    expect(alternate.pot).toBe(previous.pot)
  })

  it('credits the actual competition result, independently of the next game key and revision', () => {
    const run = { ...start(), phase: 'immunity' as const }
    const won = resolveChallenge(run, commandToken(run), scores(run), 'quick-tap')
    expect(betrayalsRewardEvents(won).map(({ code, amount }) => [code, amount])).toEqual([
      ['immunity-played', BETRAYALS_REWARD_AMOUNTS.challengeParticipation],
      ['immunity-win', BETRAYALS_REWARD_AMOUNTS.immunityWin],
    ])
    const restored = reload(won)
    const replay = resolveChallenge(
      { ...run, economy: restored.economy, revision: 50 },
      { runId: run.id, phase: 'immunity', revision: 50 },
      scores(run),
      'different-game'
    )
    expect(betrayalsRewardEvents(replay)).toEqual(betrayalsRewardEvents(won))
  })

  it('does not pay forfeits, eliminated spectators, invalid results or an immunity winner sitting out Safety', () => {
    const run = { ...start(), phase: 'immunity' as const }
    const forfeited = resolveChallenge(run, commandToken(run), scores(run, run.humanId, true))
    expect(betrayalsRewardEvents(forfeited)).toEqual([])
    expect(resolveChallenge(run, commandToken(run), [])).toBe(run)
    const out = {
      ...run,
      seats: run.seats.map((seat) =>
        seat.id === run.humanId ? { ...seat, exit: { cause: 'banished' as const, day: 1 } } : seat
      ),
    }
    expect(betrayalsRewardEvents(resolveChallenge(out, commandToken(out), scores(out)))).toEqual([])
    const safety = { ...run, phase: 'safety' as const, immunityId: run.humanId }
    expect(
      betrayalsRewardEvents(resolveChallenge(safety, commandToken(safety), scores(safety)))
    ).toEqual([])
  })

  it('pays Safety awards only to winners, never to later shield recipients', () => {
    const run = { ...start(), phase: 'safety' as const }
    const won = resolveChallenge(run, commandToken(run), scores(run))
    expect(betrayalsRewardEvents(won).map(({ code }) => code)).toEqual([
      'safety-played',
      'safety-win',
    ])
    const lost = resolveChallenge(
      run,
      commandToken(run),
      scores(run).map((score) => ({
        ...score,
        score: score.contestantId === run.humanId ? -1 : score.score,
      }))
    )
    const gifted = recordBetrayalsEconomy(lost, {
      ...lost,
      private: { ...lost.private, nightShieldIds: [run.humanId] },
    })
    expect(betrayalsRewardEvents(gifted).map(({ code }) => code)).toEqual(['safety-played'])
  })

  it('pays survival only after the player survives the resolved night', () => {
    const run = night(7)
    const resolved = resolveNight(run, commandToken(run), ballots(run, run.seats[4].id))
    const dawn = recordBetrayalsEconomy(resolved, revealDawn(resolved, commandToken(resolved)))
    expect(betrayalsRewardEvents(dawn).map(({ code, day }) => [code, day])).toEqual([
      ['survived-night', 2],
    ])
    const murdered = resolveNight(run, commandToken(run), ballots(run))
    const out = recordBetrayalsEconomy(murdered, revealDawn(murdered, commandToken(murdered)))
    expect(betrayalsRewardEvents(out)).toEqual([])
  })

  it('gives a finalist and winner one season reward, including zero-pot winners', () => {
    const final: Run = { ...night(5), phase: 'final-challenge' }
    const finalist = recordBetrayalsEconomy(null, final)
    expect(betrayalsRewardEvents(finalist).map(({ code }) => code)).toEqual(['finalist'])
    const loyalWin = {
      ...finalist,
      seats: finalist.seats.map((seat) =>
        finalist.private.betrayers.includes(seat.id)
          ? { ...seat, exit: { cause: 'banished' as const, day: 2 } }
          : seat
      ),
    }
    const settled = recordBetrayalsEconomy(loyalWin, settleRun(loyalWin, 'last-betrayer'))
    expect(betrayalsRewardEvents(settled).map(({ code }) => code)).toEqual([
      'finalist',
      'season-completed',
      'season-winner',
    ])
    expect(recordBetrayalsEconomy(reload(settled), reload(settled)).economy).toEqual(
      settled.economy
    )
    const replayedResult = recordBetrayalsEconomy(settled, { ...settled, day: 4 })
    expect(betrayalsRewardEvents(replayedResult)).toEqual(betrayalsRewardEvents(settled))
  })
})

describe('purchased Night Shields', () => {
  it('uses the inclusive six-player boundary after banishment, not before it', () => {
    expect(paidNightShieldOffer(night(6), 3_000).available).toBe(true)
    expect(paidNightShieldOffer(night(5), 3_000).available).toBe(false)
    expect(paidNightShieldOffer({ ...night(6), phase: 'round-table' }, 3_000).available).toBe(false)
    expect(paidNightShieldOffer(night(6), 2_999).available).toBe(false)
    for (const balance of [NaN, Infinity, -1, 3_000.5]) {
      expect(paidNightShieldOffer(night(6), balance).available).toBe(false)
    }
  })

  it('cannot sell redundant protection to a Betrayer, eliminated player or protected player', () => {
    const run = night()
    const betrayer = {
      ...run,
      private: { ...run.private, betrayers: [run.humanId, ...run.private.betrayers.slice(1)] },
    }
    const eliminated = {
      ...run,
      seats: run.seats.map((seat) =>
        seat.id === run.humanId ? { ...seat, exit: { cause: 'night' as const, day: 1 } } : seat
      ),
    }
    const immunity = { ...run, immunityId: run.humanId }
    const earnedShield = { ...run, private: { ...run.private, nightShieldIds: [run.humanId] } }
    for (const unavailable of [
      betrayer,
      eliminated,
      immunity,
      earnedShield,
      settleRun(run, 'unanimous'),
    ]) {
      expect(paidNightShieldOffer(unavailable, 3_000).available).toBe(false)
      expect(preparePaidNightShieldPurchase(unavailable, commandToken(unavailable), 3_000)).toBe(
        unavailable
      )
    }
  })

  it('stages safely across reload, waits for debit confirmation, and rejects duplicate/stale commands', () => {
    const run = night()
    const pending = preparePaidNightShieldPurchase(run, commandToken(run), 3_000)
    const transactionId = paidNightShieldTransactionId(run)
    expect(pendingPaidNightShieldPurchase(pending)).toEqual({
      day: 2,
      transactionId,
      status: 'pending',
    })
    expect(hasPaidNightShield(pending, run.humanId)).toBe(false)
    expect(resolveNight(pending, commandToken(pending), ballots(pending))).toBe(pending)
    expect(resolveConclave(pending, commandToken(pending))).toBe(pending)
    expect(preparePaidNightShieldPurchase(pending, commandToken(pending), 3_000)).toBe(pending)
    expect(confirmPaidNightShieldPurchase(pending, 'wrong-purchase')).toBe(pending)
    const restored = reload(pending)
    const active = confirmPaidNightShieldPurchase(restored, transactionId)
    expect(hasPaidNightShield(active, run.humanId)).toBe(true)
    expect(confirmPaidNightShieldPurchase(active, transactionId)).toBe(active)
    expect(preparePaidNightShieldPurchase(active, commandToken(run), 3_000)).toBe(active)
    expect(cancelPendingPaidNightShieldPurchase(active, transactionId)).toBe(active)
    expect(viewFor(active, run.humanId)).toMatchObject({
      nightShieldCount: 0,
      hasNightShield: true,
      purchasedNightShieldActive: true,
    })
    expect(viewFor(active, run.private.betrayers[0]).knownNightShieldIds).not.toContain(run.humanId)
    expect(active.private.nightShieldIds).toEqual([])
  })

  it('can cancel an unpaid pending purchase without granting protection or retaining its receipt', () => {
    const run = night()
    const pending = preparePaidNightShieldPurchase(run, commandToken(run), 3_000)
    const cancelled = cancelPendingPaidNightShieldPurchase(
      pending,
      paidNightShieldTransactionId(run)
    )
    expect(pendingPaidNightShieldPurchase(cancelled)).toBeUndefined()
    expect(hasPaidNightShield(cancelled, run.humanId)).toBe(false)
    expect(paidNightShieldOffer(cancelled, 3_000).available).toBe(true)
  })

  it('blocks murder at six living players and expires at dawn', () => {
    const active = reload(activate(night(6)))
    const resolved = resolveNight(active, commandToken(active), ballots(active))
    expect(resolved.private.pendingNight).toMatchObject({ targetId: active.humanId, blocked: true })
    const dawn = revealDawn(resolved, commandToken(resolved))
    expect(dawn.seats.find(({ id }) => id === active.humanId)?.exit).toBeUndefined()
    expect(dawn.lastDawn?.eliminatedId).toBeNull()
    expect(dawn.private.lastShieldSave).toEqual({ day: 3, id: active.humanId })
    expect(hasPaidNightShield(dawn, active.humanId)).toBe(false)
    const nextNight = { ...dawn, phase: 'night' as const }
    expect(hasPaidNightShield(nextNight, active.humanId)).toBe(false)
    expect(paidNightShieldTransactionId(nextNight)).not.toBe(paidNightShieldTransactionId(active))
    expect(
      resolveNight(nextNight, commandToken(nextNight), ballots(nextNight)).private.pendingNight
        ?.blocked
    ).toBe(false)
  })

  it('never protects banishment or another guest, and rechecks the cast at resolution', () => {
    const active = activate(night(6))
    const other = active.seats[4].id
    expect(
      resolveNight(active, commandToken(active), ballots(active, other)).private.pendingNight
        ?.blocked
    ).toBe(false)
    const table: Run = { ...active, phase: 'round-table' }
    expect(eligibleBanishmentTargets(table, other)).toContain(active.humanId)
    expect(viewFor(table, active.humanId).hasNightShield).toBe(false)
    const reduced: Run = {
      ...active,
      seats: active.seats.map((seat) =>
        seat.id === other ? { ...seat, exit: { cause: 'banished', day: 2 } } : seat
      ),
    }
    expect(hasPaidNightShield(reduced, reduced.humanId)).toBe(false)
    expect(
      resolveNight(reduced, commandToken(reduced), ballots(reduced)).private.pendingNight?.blocked
    ).toBe(false)
  })

  it('retains paid receipts and earnings outside restored checkpoint snapshots', () => {
    const run = night(7)
    const checkpoint = recordSeasonCheckpoints(null, { ...run, phase: 'dawn' })
    const active = activate({ ...checkpoint, phase: 'night' })
    const nextDawn = { ...active, day: 3, phase: 'dawn' as const }
    const current = recordSeasonCheckpoints(active, nextDawn)
    expect(current.seasonRewards?.day?.economy).toBeUndefined()
    const eliminated: Run = {
      ...current,
      phase: 'night-resolved',
      private: { ...current.private, pendingNight: { targetId: run.humanId, blocked: false } },
    }
    const rewind = rewindSeason(eliminated)
    expect(rewind?.phase).toBe('dawn')
    expect(rewind?.economy).toEqual(active.economy)
    expect(rewind && hasPaidNightShield(rewind, run.humanId)).toBe(false)
  })
})

describe('economy save validation', () => {
  it('accepts legacy saves and rejects duplicate or altered financial records', () => {
    expect(saveAndRestore(start()).status).toBe('ready')
    const run = { ...start(), phase: 'immunity' as const }
    const earned = resolveChallenge(run, commandToken(run), scores(run))
    const rewards = [...betrayalsRewardEvents(earned)]
    expect(
      saveAndRestore({
        ...earned,
        economy: { rewards: [...rewards, rewards[0]], paidNightShields: [] },
      }).status
    ).toBe('incompatible')
    expect(
      saveAndRestore({
        ...earned,
        economy: { rewards: [{ ...rewards[0], amount: 1_000_000 }], paidNightShields: [] },
      }).status
    ).toBe('incompatible')
    const active = activate(night())
    const purchase = active.economy!.paidNightShields[0]
    expect(
      saveAndRestore({
        ...active,
        economy: { rewards: [], paidNightShields: [purchase, purchase] },
      }).status
    ).toBe('incompatible')
  })
})
