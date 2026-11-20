import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getConclaveVerdict,
  getConclaveView,
  resolveConclave,
  resolveNight,
  revealDawn,
} from '../src/betrayals/night.ts'
import { commandToken, startRun } from '../src/betrayals/run.ts'

function atNight(publicSeed = 1320) {
  const run = startRun(
    { id: 'human', name: 'You' },
    Array.from({ length: 24 }, (_, index) => ({
      id: 'seat-' + index,
      name: 'Contestant ' + index,
      portrait: 'portrait-' + index,
    })),
    { publicMode: false, realityMode: 'off' },
    { id: 'night', roleSeed: 4, publicSeed }
  )
  run.phase = 'night'
  run.private.betrayers = run.seats.slice(0, 4).map(({ id }) => id)
  return run
}

test('a strict majority seals its nomination and a Night Shield still blocks it', () => {
  const run = atNight()
  const [saved, other] = run.seats.slice(4, 6).map(({ id }) => id)
  run.private.nightShieldIds = [saved]
  const ballots = run.private.betrayers.map((voterId, index) => ({
    voterId,
    targetId: index === 0 ? other : saved,
  }))
  const token = commandToken(run)
  const resolved = resolveNight(run, token, ballots)
  assert.deepEqual(getConclaveVerdict(resolved, run.humanId), { targetId: saved, byDraw: false })
  assert.equal(getConclaveVerdict(resolved, saved), null)
  assert.equal(getConclaveVerdict(resolved, null), null)
  assert.equal(resolveNight(resolved, token, ballots), resolved)
  const morning = revealDawn(resolved, commandToken(resolved))
  assert.equal(morning.lastDawn.eliminatedId, null)
})

test('a plurality without a majority draws from every unique nominee', () => {
  const outcomes = new Set()
  for (let publicSeed = 0; publicSeed < 30; publicSeed++) {
    const base = atNight()
    const run = { ...base, publicSeed }
    const [leader, other, third] = run.seats.slice(4, 7).map(({ id }) => id)
    const nominees = [leader, leader, other, third]
    const ballots = run.private.betrayers.map((voterId, index) => ({
      voterId,
      targetId: nominees[index],
    }))
    const resolved = resolveNight(run, commandToken(run), ballots)
    const verdict = getConclaveVerdict(resolved, run.humanId)
    assert.equal(verdict.byDraw, true)
    assert.ok(nominees.includes(verdict.targetId))
    outcomes.add(verdict.targetId)
  }
  assert.equal(outcomes.size, 3)
})

test('hidden and spectator projections preserve role confidentiality', () => {
  const run = atNight()
  const [, hidden] = run.seats
  const loyal = run.seats[4]
  run.private.hiddenBetrayerIds = [hidden.id]
  run.immunityId = run.seats[5].id
  assert.equal(getConclaveView(run, loyal.id), null)
  assert.equal(getConclaveView(run, null), null)
  const view = getConclaveView(run, run.humanId, loyal.id)
  assert.equal(view.proposals.length, 3)
  assert.ok(
    view.proposals.some(({ speakerName, portrait }) => speakerName === 'Hooded voice' && !portrait)
  )
  assert.ok(
    view.proposals.every(
      ({ speakerName, portrait }) => speakerName !== hidden.name && portrait !== hidden.portrait
    )
  )
  assert.ok(view.targetIds.includes(hidden.id))
  assert.ok(!view.targetIds.includes(run.immunityId))
  assert.ok(!view.targetIds.includes(run.seats[2].id))
  assert.ok(view.proposals.every(({ argument }) => argument.length > 0))
  assert.ok(view.ownArgument)

  const token = commandToken(run)
  assert.equal(resolveConclave(run, token), run)
  assert.equal(resolveConclave(run, token, run.immunityId), run)
  const result = resolveConclave(run, token, hidden.id)
  assert.equal(result.phase, 'night-resolved')
  assert.ok(!run.private.betrayers.includes(result.private.pendingNight.targetId))
  assert.deepEqual(result, resolveConclave(run, token, hidden.id))
})
