import assert from 'node:assert/strict'
import { test } from 'node:test'
import { commandToken, startRun } from '../src/betrayals/run.ts'
import {
  advanceTableRound,
  mayorChoiceFor,
  resolveMayorChoice,
  resolveTable,
  tableLeaderboard,
} from '../src/betrayals/table.ts'

const human = { id: 'human', name: 'Player' }
const guests = Array.from({ length: 24 }, (_, index) => ({
  id: `ai-${index}`,
  name: `Guest ${index}`,
}))

function table() {
  const run = startRun(
    human,
    guests,
    { publicMode: false, realityMode: 'off', castleRoles: true },
    { id: 'castle-roles-table', publicSeed: 1, roleSeed: 8, previewCastleRole: 'mayor' }
  )
  return {
    ...run,
    day: 8,
    phase: 'round-table',
    tableSway: null,
    seats: run.seats.map((seat) =>
      seat.id === human.id || Number(seat.id.slice(3)) < 7
        ? seat
        : { ...seat, exit: { cause: 'night', day: 7 } }
    ),
  }
}

const ballots = [
  ['human', 'ai-0'],
  ['ai-0', 'ai-1'],
  ['ai-1', 'ai-0'],
  ['ai-2', 'ai-1'],
  ['ai-3', 'ai-1'],
  ['ai-4', 'ai-0'],
  ['ai-5', 'ai-1'],
  ['ai-6', 'ai-2'],
].map(([voterId, targetId]) => ({ voterId, targetId }))

test('the Mayor changes the opening tally once and has one vote in the runoff', () => {
  const run = table()
  assert.equal(mayorChoiceFor(run, human.id), true)
  assert.equal(resolveTable(run, commandToken(run), ballots), run)
  const armed = resolveMayorChoice(run, commandToken(run), true)
  assert.equal(resolveMayorChoice(armed, commandToken(run), true), armed)

  const counted = resolveTable(armed, commandToken(armed), ballots)
  assert.deepEqual(counted.runoffIds, ['ai-0', 'ai-1'])
  assert.equal(counted.tableCount.ballots.find(({ voterId }) => voterId === human.id).weight, 2)
  assert.deepEqual(tableLeaderboard(counted.tableCount.ballots).rows.slice(0, 2), [
    { id: 'ai-0', votes: 4 },
    { id: 'ai-1', votes: 4 },
  ])

  const runoff = advanceTableRound(counted, commandToken(counted))
  const finished = resolveTable(
    runoff,
    commandToken(runoff),
    ballots.map((ballot) => (ballot.targetId === 'ai-2' ? { ...ballot, targetId: 'ai-1' } : ballot))
  )
  assert.equal(finished.phase, 'table-reveal')
  assert.equal(finished.private.pendingTable.banishedId, 'ai-1')
  assert.ok(finished.tableCount.ballots.every(({ weight }) => weight === undefined))
})

test('passing saves the charge and untrusted ballot weights cannot change the tally', () => {
  const run = table()
  const passed = resolveMayorChoice(run, commandToken(run), false)
  assert.equal(mayorChoiceFor(passed, human.id), false)
  assert.equal(mayorChoiceFor({ ...passed, day: run.day + 1 }, human.id), true)
  const counted = resolveTable(
    passed,
    commandToken(passed),
    ballots.map((ballot) => ({ ...ballot, weight: 2 }))
  )
  assert.deepEqual(counted.private.pendingTable.tally, { 'ai-0': 3, 'ai-1': 4, 'ai-2': 1 })
  assert.ok(counted.tableCount.ballots.every(({ weight }) => weight === undefined))
})
