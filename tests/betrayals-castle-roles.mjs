import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CASTLE_ROLE_CATALOG,
  CASTLE_ROLE_PLAYTEST,
  castleRoleFor,
  castleRoleTrios,
  compatibleCastleRoleTrio,
  eligibleCastleRole,
  mayorUsesRemaining,
  passCastleRole,
  retireCastleRole,
  spendCastleRole,
} from '../src/betrayals/castleRoles.ts'
import { restoreRun, saveRun } from '../src/betrayals/persistence.ts'
import { getSocialView } from '../src/betrayals/perception.ts'
import { revealCastleRole } from '../src/betrayals/roleDisclosure.ts'
import { commandToken, knownTeammateIds, startRun } from '../src/betrayals/run.ts'
import {
  buildTableBallots,
  mayorChoiceFor,
  resolveMayorChoice,
  resolveTable,
} from '../src/betrayals/table.ts'

const cast = Array.from({ length: 24 }, (_, index) => ({
  id: `ai-${index}`,
  name: `Guest ${index}`,
}))

function start({ castleRoles = true, previewCastleRole, roleSeed = 18 } = {}) {
  return startRun(
    { id: 'human', name: 'Player' },
    cast,
    { publicMode: false, realityMode: 'off', ...(castleRoles ? { castleRoles } : {}) },
    { id: 'castle-roles-test', roleSeed, publicSeed: 712, previewCastleRole }
  )
}

function roundTrip(run) {
  const storage = new Map()
  const adapter = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  }
  saveRun(adapter, 'profile', run)
  return restoreRun(adapter, 'profile')
}

test('a role disclosure can stay private or reach another guest without becoming public', () => {
  const run = { ...start({ previewCastleRole: 'doctor' }), phase: 'social' }
  const recipient = run.seats[1].id
  const token = commandToken(run)
  assert.equal(revealCastleRole(run, token, recipient, false), run)
  assert.equal(revealCastleRole(run, token, run.humanId, true), run)
  const exclusive = { ...run, options: { ...run.options, castleRoles: false } }
  assert.equal(revealCastleRole(exclusive, commandToken(exclusive), recipient, true), exclusive)
  const withoutRole = { ...run, private: { ...run.private, castleRoles: undefined } }
  assert.equal(
    revealCastleRole(withoutRole, commandToken(withoutRole), recipient, true),
    withoutRole
  )
  const outcomes = new Set()
  for (let publicSeed = 0; publicSeed < 40; publicSeed += 1) {
    const before = { ...run, publicSeed }
    const after = revealCastleRole(before, commandToken(before), recipient, true)
    const saved = roundTrip(after)
    assert.equal(saved.status, 'ready')
    assert.deepEqual(saved.run.social, after.social)
    assert.equal(getSocialView(after, null).length, 0)
    assert.deepEqual(
      getSocialView(after, run.humanId).map(({ kind }) => kind),
      ['reveal-castle-role']
    )
    assert.equal(getSocialView(after, recipient)[0].disclosedRole, 'doctor')
    assert.equal(revealCastleRole(after, commandToken(after), recipient, true), after)
    assert.deepEqual(revealCastleRole(before, commandToken(before), recipient, true), after)
    const rumor = after.social.find(({ kind }) => kind === 'castle-role-rumor')
    outcomes.add(Boolean(rumor))
    if (rumor) {
      const outsider = run.seats.find(
        ({ id }) => ![run.humanId, recipient, rumor.recipientId].includes(id)
      )
      assert.equal(getSocialView(after, rumor.recipientId)[0].disclosedRole, 'doctor')
      assert.equal(getSocialView(after, outsider.id).length, 0)
    }
  }
  assert.equal(outcomes.size, 2)
})

test('a Secret Betrayer cannot reveal a role through Social', () => {
  const run = { ...start(), phase: 'social' }
  const forbidden = {
    ...run,
    private: {
      ...run.private,
      betrayers: [...run.private.betrayers, run.humanId],
      castleRoles: [{ guestId: run.humanId, roleId: 'secret-betrayer', status: 'ready' }],
    },
  }
  assert.equal(
    revealCastleRole(forbidden, commandToken(forbidden), run.seats[1].id, true),
    forbidden
  )
})

test('the full catalog allows 853 compatible trios and every role appears', () => {
  const trios = castleRoleTrios()
  assert.equal(trios.length, 853)
  assert.equal(new Set(trios.flat()).size, Object.keys(CASTLE_ROLE_CATALOG).length)
  assert.equal(compatibleCastleRoleTrio(['mayor', 'politician', 'doctor']), false)
  assert.equal(compatibleCastleRoleTrio(['secret-betrayer', 'bad-witch', 'mayor']), false)
  assert.equal(compatibleCastleRoleTrio(['introvert', 'extrasense', 'doctor']), false)
})

test('Drama Mode weights player roles while dealing compatible trios with the usual team size', () => {
  const plain = start({ castleRoles: false })
  const drama = start()
  assert.equal(plain.private.castleRoles, undefined)
  assert.deepEqual(drama, start())
  assert.equal(drama.private.recruitmentSeed, plain.private.recruitmentSeed)
  const totals = { special: 0, betrayer: 0, loyal: 0 }
  const playerRoles = new Set()
  const sampleSize = 5_000
  for (let roleSeed = 0; roleSeed < sampleSize; roleSeed++) {
    const run = start({ roleSeed })
    const cards = run.private.castleRoles
    const ordinary = start({ castleRoles: false, roleSeed })
    assert.equal(run.private.betrayers.length, ordinary.private.betrayers.length)
    assert.equal(new Set(run.private.betrayers).size, run.private.betrayers.length)
    assert.ok(compatibleCastleRoleTrio(cards.map(({ roleId }) => roleId)))
    assert.equal(new Set(cards.map(({ guestId }) => guestId)).size, 3)
    for (const { guestId, roleId } of cards)
      assert.equal(
        run.private.betrayers.includes(guestId),
        CASTLE_ROLE_CATALOG[roleId].faction === 'betrayer'
      )
    const playerRole = castleRoleFor(run, 'human')
    const outcome = playerRole
      ? 'special'
      : run.private.betrayers.includes('human')
        ? 'betrayer'
        : 'loyal'
    if (totals[outcome] === 0) assert.equal(roundTrip(run).status, 'ready')
    totals[outcome]++
    if (playerRole) playerRoles.add(playerRole.roleId)
  }
  assert.deepEqual(playerRoles, new Set(CASTLE_ROLE_PLAYTEST))
  for (const [outcome, odds] of Object.entries({ special: 0.85, betrayer: 0.1, loyal: 0.05 }))
    assert.ok(Math.abs(totals[outcome] / sampleSize - odds) < 0.015, JSON.stringify(totals))
  assert.equal(roundTrip(plain).status, 'ready')
})

test('the playtest override can give a human a role without changing the team size', () => {
  const roleSeed = Array.from({ length: 100 }, (_, seed) => seed).find((seed) =>
    start({ roleSeed: seed }).private.betrayers.includes('human')
  )
  assert.notEqual(roleSeed, undefined)
  const ordinary = start({ roleSeed })
  const preview = start({ roleSeed, previewCastleRole: 'doctor' })
  assert.equal(castleRoleFor(preview, 'human').roleId, 'doctor')
  assert.equal(preview.private.betrayers.includes('human'), false)
  assert.equal(preview.private.betrayers.length, ordinary.private.betrayers.length)
  assert.equal(roundTrip(preview).status, 'ready')
})

test('Extrasense can check once per night across saves and skip later nights', () => {
  const run = { ...start({ previewCastleRole: 'extrasense' }), phase: 'night' }
  const targetId = run.private.castleRoles.find(({ guestId }) => guestId !== 'human').guestId
  const passed = passCastleRole(run, 'human')
  const restored = roundTrip(passed)
  assert.equal(restored.status, 'ready')
  assert.equal(castleRoleFor(restored.run, 'human').passedDay, run.day)
  const choice = { roleId: 'extrasense', targetId }
  assert.equal(spendCastleRole(restored.run, 'human', choice), restored.run)

  const next = { ...restored.run, day: 2 }
  const spent = spendCastleRole(next, 'human', choice)
  assert.deepEqual(castleRoleFor(spent, 'human').used, { ...choice, day: 2, hasRole: true })
  assert.equal(spendCastleRole(spent, 'human', choice), spent)
  const nextNightPass = passCastleRole({ ...spent, day: 3 }, 'human')
  const reloaded = roundTrip(nextNightPass)
  assert.equal(reloaded.status, 'ready')
  assert.equal(spendCastleRole(reloaded.run, 'human', choice), reloaded.run)
  const fourthNight = spendCastleRole({ ...reloaded.run, day: 4 }, 'human', choice)
  assert.deepEqual(castleRoleFor(fourthNight, 'human').used, { ...choice, day: 4, hasRole: true })
  assert.equal(roundTrip(fourthNight).status, 'ready')
})

test('high-impact roles close below eight and information closes at the Final Five', () => {
  const source = Array.from({ length: 24 }, (_, roleSeed) =>
    start({ previewCastleRole: 'doctor', roleSeed })
  ).find((run) => run.private.castleRoles.some(({ roleId }) => roleId === 'extrasense'))
  assert.ok(source)
  const preserved = source.private.castleRoles.map(({ guestId }) => guestId)
  const living = [
    ...preserved,
    ...source.seats.filter(({ id }) => !preserved.includes(id)).map(({ id }) => id),
  ].slice(0, 7)
  const run = {
    ...source,
    phase: 'night',
    seats: source.seats.map((seat) =>
      living.includes(seat.id) ? seat : { ...seat, exit: { day: 1, cause: 'banished' } }
    ),
  }
  const extrasense = run.private.castleRoles.find(({ roleId }) => roleId === 'extrasense')
  assert.equal(eligibleCastleRole(run, 'human', 'doctor'), false)
  assert.equal(eligibleCastleRole(run, extrasense.guestId, 'extrasense'), true)
  assert.equal(
    eligibleCastleRole({ ...run, phase: 'final-challenge' }, extrasense.guestId, 'extrasense'),
    false
  )
})

test('a recruit retires their Loyal card and retains its spent history', () => {
  const run = { ...start({ previewCastleRole: 'doctor' }), phase: 'night' }
  const spent = spendCastleRole(run, 'human', { roleId: 'doctor', targetId: 'human' })
  const recruited = retireCastleRole(
    {
      ...spent,
      day: 2,
      private: { ...spent.private, betrayers: [...spent.private.betrayers, 'human'] },
    },
    'human'
  )
  assert.equal(castleRoleFor(recruited, 'human').status, 'retired')
  assert.deepEqual(castleRoleFor(recruited, 'human').used, castleRoleFor(spent, 'human').used)
  assert.equal(roundTrip(recruited).status, 'ready')
})

test('a concealed Secret Betrayer and their team receive no automatic identities about each other', () => {
  const run = start()
  const [secretId, teammateId] = run.private.betrayers
  run.private.castleRoles = [
    {
      roleId: 'doctor',
      guestId: run.seats.find(({ id }) => !run.private.betrayers.includes(id)).id,
      status: 'ready',
    },
    {
      roleId: 'mayor',
      guestId: run.seats.filter(({ id }) => !run.private.betrayers.includes(id))[1].id,
      status: 'ready',
    },
    { roleId: 'secret-betrayer', guestId: secretId, status: 'ready' },
  ]
  run.private.hiddenBetrayerIds = [secretId]
  assert.deepEqual(knownTeammateIds(run, secretId), [])
  assert.equal(knownTeammateIds(run, teammateId).includes(secretId), false)
  assert.equal(roundTrip(run).status, 'ready')
})

test('restore rejects duplicate cards and impossible use dates', () => {
  const original = { ...start({ previewCastleRole: 'doctor' }), phase: 'night' }
  const used = spendCastleRole(original, 'human', { roleId: 'doctor', targetId: 'human' })
  const invalidUse = structuredClone(used)
  invalidUse.private.castleRoles.find(({ roleId }) => roleId === 'doctor').used.day = 2
  assert.equal(roundTrip(invalidUse).status, 'incompatible')

  const duplicate = structuredClone(original)
  duplicate.private.castleRoles[1].guestId = duplicate.private.castleRoles[0].guestId
  assert.equal(roundTrip(duplicate).status, 'incompatible')
})

test('the first counted ballot may carry a valid saved Mayor weight', () => {
  const run = { ...start({ previewCastleRole: 'mayor' }), phase: 'round-table' }
  const spent = spendCastleRole(run, 'human', { roleId: 'mayor' })
  const tableCount = {
    round: 1,
    ballots: [{ voterId: 'human', targetId: 'ai-0', weight: 2 }],
    tiedIds: [],
  }
  const restored = roundTrip({ ...spent, tableCount })
  assert.equal(restored.status, 'ready')
  assert.equal(restored.run.tableCount.ballots[0].weight, 2)
  const invalidRunoff = { ...spent, tableCount: { ...tableCount, round: 2 } }
  assert.equal(roundTrip(invalidRunoff).status, 'incompatible')
})

test('a legacy Mayor has one use left and can cast it on Day 10', () => {
  const run = {
    ...start({ previewCastleRole: 'mayor' }),
    phase: 'round-table',
    tableSway: null,
  }
  const first = resolveMayorChoice(run, commandToken(run), true)
  assert.equal(castleRoleFor(first, 'human').mayorUses, 1)
  assert.equal(mayorChoiceFor(first, 'human'), false)
  delete castleRoleFor(first, 'human').mayorUses
  const legacy = roundTrip(first)
  assert.equal(legacy.status, 'ready')
  assert.equal(mayorUsesRemaining(castleRoleFor(legacy.run, 'human')), 1)

  const skipped = { ...legacy.run, day: 9 }
  const passed = resolveMayorChoice(skipped, commandToken(skipped), false)
  assert.equal(roundTrip(passed).status, 'ready')
  assert.equal(mayorChoiceFor(passed, 'human'), false)
  assert.equal(mayorUsesRemaining(castleRoleFor(passed, 'human')), 1)

  const lastDay = { ...passed, day: 10 }
  assert.equal(mayorChoiceFor(lastDay, 'human'), true)
  const second = resolveMayorChoice(lastDay, commandToken(lastDay), true)
  assert.equal(castleRoleFor(second, 'human').mayorUses, 2)
  assert.equal(mayorUsesRemaining(castleRoleFor(second, 'human')), 0)
  const voted = resolveTable(second, commandToken(second), buildTableBallots(second, 'ai-0'))
  assert.equal(voted.tableCount.ballots.find(({ voterId }) => voterId === 'human').weight, 2)
  assert.equal(roundTrip(voted).status, 'ready')

  assert.equal(mayorChoiceFor({ ...second, day: 11 }, 'human'), false)
  const freshButLate = { ...run, day: 11 }
  assert.equal(mayorChoiceFor(freshButLate, 'human'), false)
  assert.equal(resolveMayorChoice(freshButLate, commandToken(freshButLate), true), freshButLate)
})

test('a Mayor who spends two early uses cannot double a third ballot before the deadline', () => {
  const run = { ...start({ previewCastleRole: 'mayor' }), phase: 'round-table' }
  const choice = { roleId: 'mayor' }
  const first = spendCastleRole(run, 'human', choice)
  const second = spendCastleRole({ ...first, day: 2 }, 'human', choice)
  const thirdDay = { ...second, day: 3 }
  assert.equal(spendCastleRole(thirdDay, 'human', choice), thirdDay)
  castleRoleFor(thirdDay, 'human').mayorUses = 3
  assert.equal(roundTrip(thirdDay).status, 'incompatible')
})
