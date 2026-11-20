import assert from 'node:assert/strict'
import { test } from 'node:test'
import { acknowledgeRole, commandToken, startRun, viewFor } from '../src/betrayals/run.ts'
import { restoreRun, saveRun } from '../src/betrayals/persistence.ts'

const human = { id: 'human', name: 'Georgi' }
const actors = Array.from({ length: 29 }, (_, i) => ({ id: 'npc-' + i, name: 'Contestant ' + i }))
const options = { publicMode: true, realityMode: 'casual' }
const season = (seed) =>
  startRun(human, actors, options, {
    id: 'season-' + seed,
    roleSeed: seed,
    publicSeed: seed ^ 123456,
  })

test('25 distinct seats with a fair starting chance for every seat', () => {
  const bySeat = Array(25).fill(0)
  let three = 0
  for (let seed = 0; seed < 10_000; seed++) {
    const run = season(seed)
    assert.equal(run.seats.length, 25)
    assert.equal(new Set(run.seats.map(({ id }) => id)).size, 25)
    const roles = new Set(run.private.betrayers)
    assert.ok(roles.size === 3 || roles.size === 4)
    three += Number(roles.size === 3)
    run.seats.forEach(({ id }, i) => {
      bySeat[i] += Number(roles.has(id))
    })
  }
  assert.ok(three >= 4800 && three <= 5200, three)
  for (const count of bySeat) assert.ok(count >= 1260 && count <= 1540, count)
})

test('unknown and Loyal views expose no private cast roles', () => {
  const run = season(37)
  const ids = run.private.betrayers
  const loyal = run.seats.find(({ id }) => !ids.includes(id))
  const next = { ...run, private: { ...run.private, nightShieldIds: [loyal.id] } }
  const view = viewFor(next, loyal.id)
  assert.equal(view.role, 'loyal')
  assert.equal(view.hasNightShield, true)
  assert.deepEqual(view.teammateIds, [])
  assert.ok(view.seats.every((seat) => !Object.hasOwn(seat, 'role')))
  assert.equal(viewFor(next, null).hasNightShield, false)
  assert.equal(viewFor(next, null).role, null)
  assert.deepEqual(new Set(viewFor(next, ids[0]).teammateIds), new Set(ids.slice(1)))
})

test('reload restores the original role draw and rejects a stale acknowledgement', () => {
  const run = season(9)
  const state = new Map()
  const storage = {
    getItem: (key) => state.get(key) ?? null,
    setItem: (key, value) => state.set(key, value),
  }
  const token = commandToken(run)
  saveRun(storage, 'profile1', run)
  const restored = restoreRun(storage, 'profile1')
  assert.equal(restored.status, 'ready')
  assert.deepEqual(restored.run.private, run.private)
  assert.equal(restored.run.phase, 'role-reveal')
  const dawn = acknowledgeRole(restored.run, token)
  assert.equal(dawn.phase, 'dawn')
  assert.strictEqual(acknowledgeRole(dawn, token), dawn)
  assert.equal(restoreRun(storage, 'profile2').status, 'empty')
  saveRun(storage, 'profile1', { ...run, version: 100 })
  assert.equal(restoreRun(storage, 'profile1').status, 'incompatible')
})
