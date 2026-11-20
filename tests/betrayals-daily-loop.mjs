import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  acknowledgeRole,
  advancePreparation,
  commandToken,
  startRun,
  viewFor,
} from '../src/betrayals/run.ts'
import { challengeContestantIds, resolveChallenge } from '../src/betrayals/challenges.ts'
import { resolveTable, revealTable, tableTargets } from '../src/betrayals/table.ts'
import { nightTargets, resolveNight, revealDawn } from '../src/betrayals/night.ts'
import { restoreRun, saveRun } from '../src/betrayals/persistence.ts'

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
  assert.equal(first.immunityId, champion)
  assert.equal(first.pot, 650)
  assert.equal(challengeContestantIds(first).length, 24)
  assert.ok(!challengeContestantIds(first).includes(champion))
  assert.strictEqual(resolveChallenge(first, originalToken, score(run, [champion])), first)
  assert.strictEqual(resolveChallenge(first, commandToken(first), score(first, []).slice(1)), first)
  const leaders = run.seats.slice(1, 3).map(({ id }) => id)
  const next = resolveChallenge(first, commandToken(first), score(first, leaders))
  assert.deepEqual(next.private.nightShieldIds, leaders)
  assert.equal(next.pot, 1300)
  assert.ok(tableTargets(next, champion).includes(leaders[0]))
  assert.ok(!tableTargets(next, leaders[0]).includes(champion))
})

test('locked Round Table result stays hidden until the reveal', () => {
  let run = afterOpening()
  run = resolveChallenge(run, commandToken(run), score(run, [run.seats[0].id]))
  run = resolveChallenge(run, commandToken(run), score(run, []))
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

test('single tied runoff resolves with a deterministic draw when every finalist is tied', () => {
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
  const receipt = resolveTable(tied, commandToken(tied), [])
  assert.equal(receipt.private.pendingTable.tiedByDraw, true)
  assert.deepEqual(receipt, resolveTable(tied, commandToken(tied), []))
  const revealed = revealTable(receipt, commandToken(receipt))
  assert.equal(
    revealed.seats.find(({ id }) => id === receipt.private.pendingTable.banishedId).exit
      .revealedRole,
    undefined
  )
})

test('private shield consumes the Night attempt and protection expires at Dawn', () => {
  let run = afterOpening()
  const loyals = run.seats.filter(({ id }) => !run.private.betrayers.includes(id))
  run = resolveChallenge(run, commandToken(run), score(run, [loyals[0].id]))
  run = resolveChallenge(run, commandToken(run), score(run, [loyals[1].id, loyals[2].id]))
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
