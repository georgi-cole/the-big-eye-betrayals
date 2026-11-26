import assert from 'node:assert/strict'
import { test } from 'node:test'
import { simulateCastleQa } from '../src/betrayals/castleQa.ts'
import {
  castleRoleFor,
  eligibleCastleRole,
  influenceUsesRemaining,
  introvertDay,
} from '../src/betrayals/castleRoles.ts'
import {
  dayCastleRole,
  resolveDayCastleRole,
  resolveDeparturePower,
  resolvePolitician,
} from '../src/betrayals/castleRoleEvents.ts'
import {
  challengeContestantIds,
  chooseFatiguedSafety,
  resolveChallenge,
  safetyResultsFor,
} from '../src/betrayals/challenges.ts'
import { getConclaveView, resolveConclave, revealDawn } from '../src/betrayals/night.ts'
import { restoreRun, saveRun } from '../src/betrayals/persistence.ts'
import { revealableCastleRole } from '../src/betrayals/roleDisclosure.ts'
import { recordSeasonCheckpoints, rewindSeason } from '../src/betrayals/seasonRewards.ts'
import { commandToken, startRun, viewFor } from '../src/betrayals/run.ts'
import { applySocialMove } from '../src/betrayals/social.ts'
import {
  buildTableBallots,
  revealTable,
  sleepRoundTable,
  tableTargets,
} from '../src/betrayals/table.ts'

const guests = Array.from({ length: 24 }, (_, index) => ({
  id: `ai-${index}`,
  name: `Guest ${index}`,
}))

function fixture(roleId, phase, day = 5) {
  const run = startRun(
    { id: 'human', name: 'Player' },
    guests,
    { publicMode: false, realityMode: 'off', castleRoles: true },
    { id: 'role-events', roleSeed: 18, publicSeed: 728, previewCastleRole: roleId }
  )
  const human = castleRoleFor(run, 'human')
  const companionIds = run.seats
    .filter(({ id }) => id !== 'human' && !run.private.betrayers.includes(id))
    .map(({ id }) => id)
  const companions =
    roleId === 'mayor' || roleId === 'politician' ? ['good-witch', 'doctor'] : ['mayor', 'doctor']
  run.private.castleRoles = [
    human,
    ...companions.map((id, index) => ({
      roleId: id,
      guestId: companionIds[index],
      status: 'ready',
    })),
  ]
  run.private.hiddenBetrayerIds = roleId === 'secret-betrayer' ? ['human'] : undefined
  return { ...run, phase, day, ...(phase === 'round-table' && { tableSway: null }) }
}

function reload(run) {
  let data
  const storage = {
    getItem: () => data,
    setItem: (_, value) => {
      data = value
    },
  }
  saveRun(storage, 'player', run)
  const reopened = restoreRun(storage, 'player')
  assert.equal(reopened.status, 'ready')
  return reopened.run
}

function score(run, publicResults = false) {
  const field = challengeContestantIds(run)
  return resolveChallenge(
    run,
    commandToken(run),
    field.map((contestantId, index) => ({
      contestantId,
      score: index,
      potContribution: 0,
    })),
    undefined,
    publicResults
  )
}

function narrowCast(run, size, keep = []) {
  const active = new Set(
    ['human', ...keep, ...run.seats.map(({ id }) => id)]
      .filter((id, i, all) => all.indexOf(id) === i)
      .slice(0, size)
  )
  return {
    ...run,
    seats: run.seats.map((seat) =>
      active.has(seat.id)
        ? seat
        : {
            ...seat,
            exit: { cause: 'banished', day: run.day - 1 },
          }
    ),
  }
}

test('Clairvoyant automatically spends three private readings and keeps public-result charges', () => {
  let run = fixture('clairvoyant', 'safety')
  assert.equal(castleRoleFor(score(run, true), 'human').used, undefined)
  for (let use = 1; use <= 4; use++) {
    const results = reload(score(run))
    const holder = castleRoleFor(results, 'human')
    assert.equal(holder.clairvoyantUses, Math.min(use, 3))
    const wasPrivate = use <= 3
    const winningRows = safetyResultsFor(results, 'human').filter(({ shield }) => shield)
    assert.equal(
      winningRows.every(({ name }) => Boolean(name)),
      wasPrivate
    )
    assert.ok(
      safetyResultsFor(results, null)
        .filter(({ shield }) => shield)
        .every(({ name }) => !name)
    )
    run = { ...results, day: run.day + 1, phase: 'safety' }
  }
  assert.equal(
    eligibleCastleRole(narrowCast(fixture('clairvoyant', 'dawn'), 5), 'human', 'clairvoyant'),
    false
  )
})

test('a Clairvoyant reading still counts after a rewind to before the Shield Trial', () => {
  const dawn = recordSeasonCheckpoints(null, fixture('clairvoyant', 'dawn'))
  const read = score({ ...dawn, phase: 'safety' })
  const rewind = rewindSeason({
    ...read,
    phase: 'night-resolved',
    private: { ...read.private, pendingNight: { targetId: 'human', blocked: false } },
  })
  assert.ok(rewind)
  assert.equal(castleRoleFor(reload(rewind), 'human').clairvoyantUses, 1)
  assert.equal(castleRoleFor(score({ ...rewind, phase: 'safety' }), 'human').clairvoyantUses, 2)
})

test('Secret Betrayer is sealed until dawn with seventeen guests', () => {
  const start = narrowCast(fixture('secret-betrayer', 'night-resolved'), 17)
  start.private.pendingNight = { targetId: null, blocked: false }
  assert.deepEqual(viewFor(start, 'human').teammateIds, [])
  const dawn = reload(revealDawn(start, commandToken(start)))
  assert.ok(viewFor(dawn, 'human').teammateIds.length)
  assert.equal(castleRoleFor(dawn, 'human').used.roleId, 'secret-betrayer')
})

test('Alpha can double two opening nominations on separate nights across saves', () => {
  const run = fixture('alpha-betrayer', 'night')
  const choice = getConclaveView(run, 'human')
  assert.ok(choice?.alphaAvailable)
  const result = reload(resolveConclave(run, commandToken(run), choice.targetIds[0], true))
  assert.equal(castleRoleFor(result, 'human').used.roleId, 'alpha-betrayer')
  assert.equal(
    result.private.conclaveVote.nominations.find(({ voterId }) => voterId === 'human').weight,
    2
  )
  assert.ok(result.private.conclaveVote.runoff?.every(({ weight }) => !weight) ?? true)
  assert.equal(influenceUsesRemaining(castleRoleFor(result, 'human')), 1)
  const nextNight = {
    ...result,
    day: result.day + 1,
    phase: 'night',
    private: { ...result.private, conclaveVote: undefined, pendingNight: undefined },
  }
  const second = reload(
    resolveConclave(nextNight, commandToken(nextNight), choice.targetIds[0], true)
  )
  assert.equal(
    second.private.conclaveVote.nominations.find(({ voterId }) => voterId === 'human').weight,
    2
  )
  assert.equal(influenceUsesRemaining(castleRoleFor(second, 'human')), 0)
  assert.equal(
    eligibleCastleRole({ ...second, day: second.day + 1 }, 'human', 'alpha-betrayer'),
    false
  )
})

test('Dark Angel blocks the bound Betrayer on their first attempt and keeps the retry in the ballot', () => {
  const run = fixture('dark-angel', 'night')
  const angel = run.private.castleRoles[0]
  const bound = angel.boundBetrayerId
  const guest = run.seats.find(({ id }) => id !== 'human' && !run.private.betrayers.includes(id)).id
  angel.guestId = guest
  run.private.castleRoles = run.private.castleRoles.map((card, i) =>
    i === 1 && card.guestId === guest ? { ...card, guestId: 'human' } : card
  )
  run.humanId = bound
  assert.ok(getConclaveView(run, bound).targetIds.includes(guest))
  const retry = reload(resolveConclave(run, commandToken(run), guest))
  assert.equal(retry.phase, 'night')
  assert.equal(castleRoleFor(retry, guest).used.roleId, 'dark-angel')
  assert.ok(!getConclaveView(retry, bound).targetIds.includes(guest))
  assert.equal(resolveConclave(retry, commandToken(retry), guest), retry)
  const newTarget = getConclaveView(retry, bound).targetIds[0]
  const continued = reload(resolveConclave(retry, commandToken(retry), newTarget))
  assert.equal(
    continued.private.conclaveVote.nominations.find(({ voterId }) => voterId === bound).targetId,
    newTarget
  )
  const tomorrow = {
    ...continued,
    day: continued.day + 1,
    phase: 'night',
    private: { ...continued.private, conclaveVote: undefined, pendingNight: undefined },
  }
  assert.ok(getConclaveView(tomorrow, bound).targetIds.includes(guest))
})

test('Bad Witch cancels an opening Table while leaving Night protection intact', () => {
  const run = fixture('bad-witch', 'round-table')
  run.private.nightShieldIds = ['human']
  const cancelled = reload(sleepRoundTable(run, commandToken(run)))
  assert.equal(cancelled.phase, 'night')
  assert.deepEqual(cancelled.private.nightShieldIds, ['human'])
  assert.equal(cancelled.private.pendingTable, undefined)
  assert.equal(castleRoleFor(cancelled, 'human').used.roleId, 'bad-witch')
})

test('Politician can direct two opening ballots on separate days across saves', () => {
  const run = fixture('politician', 'round-table')
  const [voter, target] = run.seats.slice(1)
  assert.equal(resolvePolitician(run, commandToken(run), 'human', target.id), run)
  assert.equal(resolvePolitician(run, commandToken(run), voter.id, voter.id), run)
  const protectedTable = { ...run, immunityId: target.id }
  assert.equal(
    resolvePolitician(protectedTable, commandToken(protectedTable), voter.id, target.id),
    protectedTable
  )
  const directed = reload(resolvePolitician(run, commandToken(run), voter.id, target.id))
  assert.deepEqual(tableTargets(directed, voter.id), [target.id])
  assert.equal(
    buildTableBallots(directed, target.id).find(({ voterId }) => voterId === voter.id).targetId,
    target.id
  )
  assert.ok(
    tableTargets({ ...directed, runoffIds: run.seats.slice(1, 4).map(({ id }) => id) }, voter.id)
      .length > 1
  )
  assert.equal(resolvePolitician(directed, commandToken(directed), voter.id, target.id), directed)
  const nextTable = { ...directed, day: directed.day + 1 }
  const second = reload(resolvePolitician(nextTable, commandToken(nextTable), voter.id, target.id))
  assert.equal(influenceUsesRemaining(castleRoleFor(second, 'human')), 0)
  const thirdTable = { ...second, day: second.day + 1 }
  assert.equal(
    resolvePolitician(thirdTable, commandToken(thirdTable), voter.id, target.id),
    thirdTable
  )
})

test('Change of Heart joins at the offered cast size and retires the former role', () => {
  const initial = fixture('change-of-heart', 'dawn')
  assert.equal(dayCastleRole(initial, 'human'), undefined)
  const offered = narrowCast(initial, 13, initial.private.betrayers)
  const accepted = reload(resolveDayCastleRole(offered, commandToken(offered), 'change-of-heart'))
  assert.equal(viewFor(accepted, 'human').role, 'betrayer')
  assert.equal(castleRoleFor(accepted, 'human').status, 'retired')
})

test('Medium revives a murder victim and remembers their last known vote', () => {
  const run = fixture('medium', 'dawn')
  const [guest, target] = run.seats.slice(1)
  guest.exit = { cause: 'night', day: 4 }
  run.lastTable = {
    banishedId: target.id,
    tiedByDraw: false,
    tally: { [target.id]: 1 },
    revealedBallots: [{ voterId: guest.id, targetId: target.id }],
  }
  const revived = reload(resolveDayCastleRole(run, commandToken(run), 'medium', guest.id))
  assert.equal(revived.seats.find(({ id }) => id === guest.id).exit, undefined)
  assert.equal(castleRoleFor(revived, 'human').used.rememberedVote, target.id)
})

test('Last Will and Kamikaze survive a reload between leaving and choosing a guest', () => {
  for (const role of ['last-will', 'kamikaze']) {
    const run = fixture(role, 'table-reveal')
    const protectedId = run.seats[1].id
    run.immunityId = protectedId
    run.private.pendingTable = {
      banishedId: 'human',
      blind: false,
      tally: { human: 24 },
      tiedByDraw: false,
    }
    const pending = reload(revealTable(run, commandToken(run)))
    assert.equal(pending.private.departurePower.roleId, role)
    const result = reload(resolveDeparturePower(pending, commandToken(pending), protectedId))
    assert.equal(result.private.departurePower, undefined)
    assert.equal(castleRoleFor(result, 'human').used.roleId, role)
    assert.ok(!result.seats.find(({ id }) => id === protectedId).exit)
    if (role === 'kamikaze') {
      assert.equal(castleRoleFor(result, 'human').used.blocked, true)
      const exposedId = run.seats[2].id
      const exposed = resolveDeparturePower(pending, commandToken(pending), exposedId)
      assert.equal(exposed.seats.find(({ id }) => id === exposedId).exit.cause, 'night')
    }
  }
})

test('Introvert cannot start a Social move on even days before Final Five', () => {
  const run = fixture('introvert', 'social', 2)
  const move = { actorId: 'human', recipientId: run.seats[1].id, kind: 'rapport' }
  assert.equal(applySocialMove(run, commandToken(run), move), run)
  assert.notEqual(applySocialMove(run, commandToken(run), move, true), run)
  const tomorrow = { ...run, day: 3 }
  assert.notEqual(applySocialMove(tomorrow, commandToken(tomorrow), move), tomorrow)
  const dayFour = { ...run, day: 4 }
  assert.equal(applySocialMove(dayFour, commandToken(dayFour), move), dayFour)
  assert.equal(introvertDay(narrowCast(dayFour, 5), 'human'), false)
})

test('The Fatigued can spend each day’s energy on either trial', () => {
  const immunity = fixture('fatigued', 'immunity', 2)
  const withImmunity = reload(score(immunity))
  assert.ok(!challengeContestantIds({ ...withImmunity, phase: 'safety' }).includes('human'))
  const saved = chooseFatiguedSafety(immunity)
  assert.ok(!challengeContestantIds(saved).includes('human'))
  assert.ok(challengeContestantIds({ ...reload(score(saved)), phase: 'safety' }).includes('human'))
  const dayThree = { ...withImmunity, phase: 'immunity', day: 3 }
  const savedAgain = reload(score(chooseFatiguedSafety(dayThree)))
  assert.ok(challengeContestantIds({ ...savedAgain, phase: 'safety' }).includes('human'))
  const afterSafety = reload(score({ ...savedAgain, phase: 'safety' }))
  assert.equal(castleRoleFor(afterSafety, 'human').used.day, 3)
  const dayFour = { ...afterSafety, phase: 'immunity', day: 4 }
  assert.ok(challengeContestantIds(dayFour).includes('human'))
  const skippedShields = { ...reload(score(dayFour)), phase: 'safety' }
  const forged = [...challengeContestantIds(skippedShields), 'human'].map((contestantId) => ({
    contestantId,
    score: 1,
    potContribution: 0,
  }))
  assert.equal(
    resolveChallenge(skippedShields, commandToken(skippedShields), forged),
    skippedShields
  )
  assert.ok(
    !challengeContestantIds({ ...reload(score(dayFour)), phase: 'safety' }).includes('human')
  )
})

test('Diva receives one truthful private answer each day', () => {
  const run = fixture('diva', 'social')
  const [guest] = run.seats.slice(1)
  run.private.nightShieldIds = [guest.id]
  assert.equal(revealableCastleRole(run), undefined)
  const told = reload(resolveDayCastleRole(run, commandToken(run), 'diva', guest.id))
  assert.equal(castleRoleFor(told, 'human').used.fact, 'shield')
  assert.deepEqual(viewFor(told, 'human').knownNightShieldIds, [])
  assert.equal(resolveDayCastleRole(told, commandToken(told), 'diva', guest.id), told)
  const tomorrow = { ...told, day: told.day + 1 }
  const heardAgain = reload(
    resolveDayCastleRole(tomorrow, commandToken(tomorrow), 'diva', guest.id)
  )
  assert.equal(castleRoleFor(heardAgain, 'human').used.day, tomorrow.day)
})

test('Castle QA advances complete days using the game rules and preserves the wallet', () => {
  const run = fixture('politician', 'role-reveal', 1)
  const noAudience = () => ({})
  const firstPhase = simulateCastleQa(run, 'phase', noAudience)
  assert.equal(firstPhase.day, 1)
  assert.equal(firstPhase.phase, 'dawn')
  const nextDay = reload(simulateCastleQa(run, 'day', noAudience))
  assert.equal(nextDay.day, 2)
  assert.equal(nextDay.phase, 'dawn')
  assert.deepEqual(nextDay.economy, run.economy)
  assert.ok(nextDay.seats.some(({ exit }) => exit))
  assert.ok(!castleRoleFor(nextDay, 'human').used)
  const followingDay = simulateCastleQa(nextDay, 'day', noAudience)
  assert.equal(followingDay.day, 3)
  assert.deepEqual(followingDay.economy, run.economy)
})
