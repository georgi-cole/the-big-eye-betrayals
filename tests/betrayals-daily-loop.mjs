import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  acknowledgeRole,
  advancePreparation,
  commandToken,
  eligibleBanishmentTargets,
  startRun,
  viewFor,
} from '../src/betrayals/run.ts'
import { challengeContestantIds, resolveChallenge } from '../src/betrayals/challenges.ts'
import { advanceDayAftermath } from '../src/betrayals/dayAftermath.ts'
import { getIncomingInteractions, respondToIncomingInteraction } from '../src/betrayals/incoming.ts'
import { nightShieldWindowOpen } from '../src/betrayals/nightShields.ts'
import { awardPublicShield } from '../src/betrayals/publicShield.ts'
import {
  advanceTableRound,
  buildTableBallots,
  recordTableSway,
  resolveTable,
  revealTable,
  tableArgumentPressure,
  tableDiscussion,
  tableLeaderboard,
  tableRoundNumber,
  tableTargets,
} from '../src/betrayals/table.ts'
import { nightTargets, resolveNight, revealDawn } from '../src/betrayals/night.ts'
import { restoreRun, saveRun } from '../src/betrayals/persistence.ts'
import { relationship, trackRecord } from '../src/betrayals/perception.ts'

function createRun() {
  return startRun(
    { id: 'human', name: 'Human' },
    Array.from({ length: 24 }, (_, i) => ({ id: 'ai-' + i, name: 'Player ' + i })),
    { publicMode: true, realityMode: 'tv' },
    { id: 'test-run', roleSeed: 71, publicSeed: 1142 }
  )
}

function afterOpening() {
  let run = createRun()
  run = { ...run, options: { ...run.options, publicMode: false } }
  run = acknowledgeRole(run, commandToken(run))
  run = advancePreparation(run, commandToken(run))
  return advancePreparation(run, commandToken(run))
}

function score(run, leaders) {
  return challengeContestantIds(run).map((contestantId) => ({
    contestantId,
    score: leaders.includes(contestantId) ? 99 - leaders.indexOf(contestantId) : 0,
    potContribution: 0.65,
  }))
}

function voteAll(run, targetId) {
  return run.seats.flatMap(({ id }) => {
    const targets = tableTargets(run, id)
    if (targets.length === 0) return []
    return [{ voterId: id, targetId: targets.includes(targetId) ? targetId : targets[0] }]
  })
}

function reload(run) {
  let serialized
  const storage = {
    getItem: () => serialized,
    setItem: (_key, value) => {
      serialized = value
    },
  }
  saveRun(storage, 'player', run)
  const restored = restoreRun(storage, 'player')
  assert.equal(restored.status, 'ready')
  return restored.run
}

test('daily awards protect distinct players and accept the recorded scores once', () => {
  const run = afterOpening()
  const champion = run.seats[0].id
  const originalToken = commandToken(run)
  const first = resolveChallenge(run, originalToken, score(run, [champion]))
  assert.equal(first.phase, 'after-immunity')
  assert.equal(first.immunityId, champion)
  assert.equal(first.pot, 650)
  assert.deepEqual(challengeContestantIds(first), [])
  assert.strictEqual(resolveChallenge(first, originalToken, score(run, [champion])), first)
  assert.strictEqual(resolveChallenge(first, commandToken(first), score(first, []).slice(1)), first)
  const safety = advanceDayAftermath(reload(first), commandToken(first))
  assert.equal(safety.phase, 'safety')
  assert.equal(challengeContestantIds(safety).length, 24)
  assert.ok(!challengeContestantIds(safety).includes(champion))
  const leaders = run.seats.slice(1, 3).map(({ id }) => id)
  const next = resolveChallenge(safety, commandToken(safety), score(safety, leaders))
  assert.equal(next.phase, 'shield-deals')
  assert.deepEqual(next.private.nightShieldIds, leaders)
  assert.equal(next.pot, 1300)
  assert.deepEqual(tableTargets(next, champion), [])
  const table = advanceDayAftermath(reload(next), commandToken(next))
  assert.ok(tableTargets(table, champion).includes(leaders[0]))
  assert.ok(!tableTargets(table, leaders[0]).includes(champion))
  assert.strictEqual(advanceDayAftermath(table, commandToken(next)), table)
})

test('an audience shield prompts a revised private promise that survives reload and settles at the ballot', () => {
  const base = afterOpening()
  const [human, partner, protectedGuest, winner] = base.seats
  const run = {
    ...base,
    options: { ...base.options, publicMode: true },
    social: [
      {
        day: base.day,
        actorId: human.id,
        recipientId: partner.id,
        kind: 'vote-plan',
        suspectId: protectedGuest.id,
        accepted: true,
      },
    ],
  }
  const aftermath = resolveChallenge(run, commandToken(run), score(run, [winner.id]))
  assert.strictEqual(advanceDayAftermath(aftermath, commandToken(aftermath)), aftermath)
  assert.deepEqual(getIncomingInteractions(aftermath), [])
  const announced = awardPublicShield(aftermath, commandToken(aftermath), {
    [protectedGuest.id]: 100,
  })
  assert.equal(announced.publicShield.id, protectedGuest.id)
  assert.strictEqual(awardPublicShield(announced, commandToken(announced), {}), announced)
  const restored = reload(announced)
  const [offer] = getIncomingInteractions(restored)
  assert.equal(offer.title, 'Change of Plan')
  assert.equal(offer.speaker.id, partner.id)
  assert.match(offer.text, new RegExp(protectedGuest.name))
  assert.ok(eligibleBanishmentTargets(restored, human.id).includes(offer.target.id))
  const answered = respondToIncomingInteraction(
    restored,
    commandToken(restored),
    offer.id,
    'engage'
  )
  assert.equal(getIncomingInteractions(reload(answered))[0].response, 'engage')
  assert.strictEqual(
    respondToIncomingInteraction(answered, commandToken(answered), offer.id, 'engage'),
    answered
  )
  const safety = advanceDayAftermath(answered, commandToken(answered))
  const deals = resolveChallenge(safety, commandToken(safety), score(safety, []))
  const table = advanceDayAftermath(deals, commandToken(deals))
  assert.ok(!tableTargets(table, human.id).includes(protectedGuest.id))
  const locked = resolveTable(table, commandToken(table), voteAll(table, offer.target.id))
  const closed = revealTable(locked, commandToken(locked))
  assert.deepEqual(
    closed.social.find(
      ({ kind, suspectId, actorId }) =>
        kind === 'vote-plan' && suspectId === offer.target.id && actorId === partner.id
    ).pledgeResult,
    { actor: true, recipient: true }
  )
})

test('a private ally request moves real protection and closes before the Round Table', () => {
  const base = afterOpening()
  const [human, ally, winner, second] = base.seats
  const run = {
    ...base,
    social: [
      { day: base.day, actorId: human.id, recipientId: ally.id, kind: 'alliance', accepted: true },
    ],
  }
  const aftermath = resolveChallenge(run, commandToken(run), score(run, [winner.id]))
  const safety = advanceDayAftermath(aftermath, commandToken(aftermath))
  const deals = reload(
    resolveChallenge(safety, commandToken(safety), score(safety, [human.id, second.id]))
  )
  const request = getIncomingInteractions(deals).find(({ kind }) => kind === 'shield-request')
  assert.equal(request.speaker.id, ally.id)
  assert.equal(viewFor(deals, null).knownNightShieldIds.length, 0)
  const gifted = reload(
    respondToIncomingInteraction(deals, commandToken(deals), request.id, 'engage')
  )
  assert.equal(viewFor(gifted, human.id).hasNightShield, false)
  assert.equal(viewFor(gifted, ally.id).hasNightShield, true)
  assert.equal(
    getIncomingInteractions(gifted).find(({ id }) => id === request.id).response,
    'engage'
  )
  const table = reload(advanceDayAftermath(gifted, commandToken(gifted)))
  assert.equal(nightShieldWindowOpen(table), false)
  assert.ok(tableTargets(table, human.id).includes(ally.id))
  assert.equal(viewFor(table, null).knownNightShieldIds.length, 0)
  assert.strictEqual(
    respondToIncomingInteraction(table, commandToken(table), request.id, 'engage'),
    table
  )
})

test('locked Round Table result stays hidden until the reveal', () => {
  let run = afterOpening()
  run = resolveChallenge(run, commandToken(run), score(run, [run.seats[0].id]))
  run = advanceDayAftermath(run, commandToken(run))
  run = resolveChallenge(run, commandToken(run), score(run, []))
  run = advanceDayAftermath(run, commandToken(run))
  const target = run.private.betrayers.find((id) => id !== run.immunityId)
  const ballotToken = commandToken(run)
  const ballots = voteAll(run, target)
  const committed = resolveTable(run, ballotToken, ballots)
  assert.equal(committed.phase, 'table-reveal')
  assert.ok(viewFor(committed, null).seats.every((seat) => !seat.exit))
  assert.strictEqual(resolveTable(committed, ballotToken, ballots), committed)
  const saved = reload(committed)
  const revealed = revealTable(saved, commandToken(saved))
  assert.equal(revealed.seats.find(({ id }) => id === target).exit.revealedRole, 'betrayer')
})

test('two revotes include every active voter and a third tie draws a finalist without revealing their role', () => {
  const base = createRun()
  const finalists = base.seats.slice(0, 3)
  const run = {
    ...base,
    phase: 'final-banishment',
    seats: [
      ...finalists,
      ...base.seats.slice(3).map((seat) => ({
        ...seat,
        exit: { cause: 'banished', day: 1 },
      })),
    ],
  }
  const ballots = finalists.map(({ id }, i) => ({
    voterId: id,
    targetId: finalists[(i + 1) % finalists.length].id,
  }))
  const tied = resolveTable(run, commandToken(run), ballots)
  assert.equal(tied.runoffIds.length, 3)
  assert.equal(tied.tableCount.round, 1)
  assert.strictEqual(resolveTable(tied, commandToken(tied), ballots), tied)
  const saved = reload(tied)
  const second = advanceTableRound(saved, commandToken(saved))
  assert.equal(tableRoundNumber(second), 2)
  assert.equal(second.tableCount, undefined)
  for (const { id } of finalists) {
    assert.deepEqual(
      tableTargets(second, id),
      finalists.map((seat) => seat.id).filter((target) => target !== id)
    )
  }
  const stillTied = resolveTable(second, commandToken(second), ballots)
  assert.equal(stillTied.tableCount.round, 2)
  assert.equal(stillTied.phase, 'final-banishment')
  const third = advanceTableRound(stillTied, commandToken(stillTied))
  assert.equal(tableRoundNumber(third), 3)
  const receipt = resolveTable(third, commandToken(third), ballots)
  assert.equal(receipt.private.pendingTable.tiedByDraw, true)
  assert.equal(receipt.tableCount.round, 3)
  assert.deepEqual(receipt, resolveTable(third, commandToken(third), ballots))
  const revealed = revealTable(receipt, commandToken(receipt))
  assert.equal(
    revealed.seats.find(({ id }) => id === receipt.private.pendingTable.banishedId).exit
      .revealedRole,
    undefined
  )
})

test('a revote accepts only the high tie and can return a sole leader before a draw', () => {
  const run = { ...createRun(), phase: 'round-table' }
  const [, first, second, third] = run.seats
  const ballots = run.seats.map(({ id }, index) => ({
    voterId: id,
    targetId: index === 24 ? third.id : index % 2 === 0 ? first.id : second.id,
  }))
  const tied = resolveTable(run, commandToken(run), ballots)
  const runoff = advanceTableRound(tied, commandToken(tied))
  assert.deepEqual(new Set(tableTargets(runoff, run.humanId)), new Set([first.id, second.id]))
  assert.deepEqual(tableTargets(runoff, first.id), [second.id])
  assert.strictEqual(resolveTable(runoff, commandToken(runoff), ballots), runoff)
  const receipt = resolveTable(runoff, commandToken(runoff), voteAll(runoff, first.id))
  assert.equal(receipt.private.pendingTable.banishedId, first.id)
  assert.equal(receipt.private.pendingTable.tiedByDraw, false)
  assert.equal(receipt.tableCount.round, 2)
})

test('a large tie never cuts through an equal group of leaders', () => {
  const ballots = Array.from({ length: 10 }, (_, index) => ({
    voterId: 'voter-' + index,
    targetId: 'nominee-' + index,
  }))
  assert.deepEqual(tableLeaderboard(ballots), {
    rows: [],
    hiddenTie: { size: 10, position: 1 },
  })
  ballots.push({ voterId: 'another-voter', targetId: 'nominee-0' })
  assert.deepEqual(tableLeaderboard(ballots), {
    rows: [{ id: 'nominee-0', votes: 2 }],
    hiddenTie: { size: 9, position: 2 },
  })
})

test('a credible public case can move votes onto the candidate', () => {
  const base = createRun()
  const run = {
    ...base,
    phase: 'round-table',
    options: { publicMode: false, realityMode: 'off' },
    immunityId: base.seats[1].id,
    social: base.seats.slice(3, 12).flatMap(({ id }) =>
      Array.from({ length: 3 }, () => ({
        day: 1,
        actorId: id,
        recipientId: base.humanId,
        kind: 'rapport',
      }))
    ),
  }
  const candidate = run.seats[2].id
  const speeches = tableDiscussion(run)
  assert.equal(speeches.length, 4)
  assert.ok(speeches.every(({ targetId }) => targetId !== run.immunityId))
  const baseline = buildTableBallots(run, candidate)
  assert.strictEqual(
    recordTableSway(run, commandToken(run), { targetId: run.immunityId, tone: 'forceful' }),
    run
  )
  const committed = recordTableSway(run, commandToken(run), {
    targetId: candidate,
    tone: 'forceful',
  })
  const afterSway = buildTableBallots(reload(committed), candidate)
  const count = (ballots, target) => ballots.filter(({ targetId }) => targetId === target).length
  assert.ok(count(afterSway, candidate) > count(baseline, candidate))
  assert.ok(count(afterSway, run.humanId) <= count(baseline, run.humanId))
  assert.strictEqual(recordTableSway(committed, commandToken(committed), null), committed)
})

test('private shield consumes the Night attempt and protection expires at Dawn', () => {
  let run = afterOpening()
  const loyals = run.seats.filter(({ id }) => !run.private.betrayers.includes(id))
  run = resolveChallenge(run, commandToken(run), score(run, [loyals[0].id]))
  run = advanceDayAftermath(run, commandToken(run))
  run = resolveChallenge(run, commandToken(run), score(run, [loyals[1].id, loyals[2].id]))
  run = advanceDayAftermath(run, commandToken(run))
  run = resolveTable(run, commandToken(run), voteAll(run, loyals[3].id))
  run = revealTable(run, commandToken(run))
  assert.equal(run.phase, 'night')
  assert.deepEqual(nightTargets(run, loyals[1].id), [])
  assert.ok(nightTargets(run, run.private.betrayers[0]).includes(loyals[1].id))
  assert.ok(!nightTargets(run, run.private.betrayers[0]).includes(loyals[0].id))
  const token = commandToken(run)
  const ballots = run.private.betrayers.map((voterId) => ({ voterId, targetId: loyals[1].id }))
  const result = resolveNight(run, token, ballots)
  assert.equal(result.private.pendingNight.blocked, true)
  assert.strictEqual(resolveNight(result, token, ballots), result)
  const saved = reload(result)
  const dawn = revealDawn(saved, commandToken(saved))
  assert.equal(dawn.day, 2)
  assert.equal(dawn.lastDawn.eliminatedId, null)
  assert.equal(dawn.immunityId, undefined)
  assert.equal(dawn.private.nightShieldIds.length, 0)
})

test('the regular ballot at six enters the finale after its public role reveal', () => {
  const base = afterOpening()
  const firstBetrayer = base.private.betrayers[0]
  const loyals = base.seats.filter(({ id }) => !base.private.betrayers.includes(id))
  const finalists = new Set([firstBetrayer, ...loyals.slice(0, 5).map(({ id }) => id)])
  const run = {
    ...base,
    phase: 'round-table',
    seats: base.seats.map((seat) =>
      finalists.has(seat.id) ? seat : { ...seat, exit: { cause: 'banished', day: 1 } }
    ),
  }
  const pending = resolveTable(run, commandToken(run), voteAll(run, loyals[0].id))
  const revealed = revealTable(pending, commandToken(pending))
  assert.equal(revealed.phase, 'final-challenge')
  assert.equal(revealed.seats.find(({ id }) => id === loyals[0].id).exit.revealedRole, 'loyal')
})

test('sway belongs to the argument, and repeating an unverified case cannot stack pressure', () => {
  const run = createRun()
  const [speaker, echo, listener, target] = run.seats
  const argument = {
    speakerId: speaker.id,
    targetId: target.id,
    tone: 'careful',
    basis: 'conversation',
  }
  const original = tableArgumentPressure(run, listener.id, [argument])
  assert.ok(original.get(target.id) > 0)
  assert.equal(original.has(speaker.id), false)

  const swapped = { ...run, humanId: echo.id }
  const repeated = { ...argument, speakerId: echo.id }
  assert.deepEqual(tableArgumentPressure(swapped, listener.id, [argument]), original)
  assert.deepEqual(tableArgumentPressure(swapped, listener.id, [argument, repeated]), original)

  const defense = { ...repeated, stance: 'defend' }
  assert.ok(
    tableArgumentPressure(run, listener.id, [argument, defense]).get(target.id) <
      original.get(target.id)
  )
})

test('Noa’s public reveal reviews the campaign and credits the alliance follower separately', () => {
  const base = createRun()
  const [follower, leader, observer] = base.seats
  const target = base.seats.slice(3).find(({ id }) => !base.private.betrayers.includes(id))
  const pact = {
    actorId: leader.id,
    recipientId: follower.id,
    suspectId: target.id,
    day: base.day,
    kind: 'vote-plan',
    accepted: true,
  }
  const statements = [
    { speakerId: leader.id, targetId: target.id, tone: 'forceful', basis: 'impression' },
    {
      speakerId: follower.id,
      targetId: target.id,
      tone: 'careful',
      basis: 'impression',
      stance: 'question',
    },
  ]
  const run = {
    ...base,
    phase: 'round-table',
    tableArguments: statements,
    tableSway: null,
    social: [pact],
  }
  const reveal = (round) => {
    const counted = resolveTable(round, commandToken(round), voteAll(round, target.id))
    return reload(revealTable(reload(counted), commandToken(counted)))
  }
  for (const participant of [follower, leader]) {
    const revealed = reveal({ ...run, humanId: participant.id })
    assert.equal(relationship(revealed.social, leader.id, follower.id).reliability, 0.08)
    assert.equal(trackRecord(revealed, follower.id), 0)
    assert.ok(trackRecord(revealed, leader.id) < 0)
    assert.ok(
      trackRecord({ ...revealed, day: revealed.day + 3 }, leader.id) >
        trackRecord(revealed, leader.id)
    )
    assert.deepEqual(
      revealed.caseReviews.map(({ speakerId }) => speakerId),
      [leader.id]
    )
    assert.equal(relationship(revealed.social, observer.id, follower.id).reliability, 0)
  }

  const careful = { ...run, tableArguments: [{ ...statements[0], tone: 'careful' }] }
  assert.equal(trackRecord(reveal(careful), leader.id), 0)

  const secret = reveal({ ...run, phase: 'final-banishment' })
  assert.equal(secret.seats.find(({ id }) => id === target.id).exit.revealedRole, undefined)
  assert.equal(trackRecord(secret, leader.id), 0)
})
