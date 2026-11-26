import assert from 'node:assert/strict'
import { test } from 'node:test'
import { castleRoleFor } from '../src/betrayals/castleRoles.ts'
import { simulateCastleQa } from '../src/betrayals/castleQa.ts'
import { openDayFlow } from '../src/betrayals/dayFlow.ts'
import { startRun } from '../src/betrayals/run.ts'

const guests = Array.from({ length: 24 }, (_, index) => ({
  id: `ai-${index}`,
  name: `Guest ${index}`,
}))

function season(previewCastleRole, { castleRoles = true, publicMode = true } = {}) {
  return openDayFlow(
    startRun(
      { id: 'human', name: 'Tester' },
      guests,
      { castleRoles, publicMode, realityMode: 'off' },
      { id: 'qa-season', roleSeed: 23456, publicSeed: 34567, previewCastleRole }
    )
  )
}

const neutralAudience = ({ seats }) => Object.fromEntries(seats.map(({ id }) => [id, 50]))

test('a QA season can assign plain Loyal, plain Betrayer, and a named Castle Role', () => {
  const loyal = season('loyal')
  const betrayer = season('betrayer')
  const doctor = season('doctor')
  assert.equal(loyal.private.betrayers.includes(loyal.humanId), false)
  assert.equal(betrayer.private.betrayers.includes(betrayer.humanId), true)
  assert.equal(castleRoleFor(loyal, loyal.humanId), undefined)
  assert.equal(castleRoleFor(betrayer, betrayer.humanId), undefined)
  assert.equal(castleRoleFor(doctor, doctor.humanId)?.roleId, 'doctor')
})

test('QA simulation advances one phase or day and preserves the wallet ledger', () => {
  const initial = season('doctor')
  const nextPhase = simulateCastleQa(initial, 'phase', neutralAudience)
  assert.equal(nextPhase?.phase, 'dawn')
  assert.equal(nextPhase.day, initial.day)

  const nextDay = simulateCastleQa(nextPhase, 'day', neutralAudience)
  assert.equal(nextDay?.day, initial.day + 1)
  assert.equal(nextDay.phase, 'dawn')
  assert.deepEqual(nextDay.economy, initial.economy)
  assert.equal(initial.phase, 'role-reveal')
})

for (const [role, options] of [
  ['betrayer', {}],
  ['doctor', {}],
  [undefined, { castleRoles: false, publicMode: false }],
]) {
  test(`QA simulation reaches settlement for ${role ?? 'standard mode'}`, () => {
    const result = simulateCastleQa(season(role, options), 'season', neutralAudience)
    assert.equal(result?.phase, 'settled')
    assert.ok(result.result)
  })
}
