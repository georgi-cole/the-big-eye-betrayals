import assert from 'node:assert/strict'
import { test } from 'node:test'
import { advanceDayAftermath } from '../src/betrayals/dayAftermath.ts'
import {
  describeConclaveVerdict,
  getConclaveView,
  resolveConclave,
  resolveNight,
  revealDawn,
} from '../src/betrayals/night.ts'
import { restoreRun, saveRun } from '../src/betrayals/persistence.ts'
import { answerRecruitment, recruitmentFor } from '../src/betrayals/recruitment.ts'
import { commandToken, startRun, viewFor } from '../src/betrayals/run.ts'
import { revealTable } from '../src/betrayals/table.ts'

const cast = Array.from({ length: 24 }, (_, i) => ({ id: `ai-${i}`, name: `Guest ${i}` }))

function season(betrayers = ['ai-0', 'ai-1', 'ai-2', 'ai-3']) {
  const run = startRun(
    { id: 'human', name: 'Player' },
    cast,
    { publicMode: true, realityMode: 'off' },
    { id: 'recruitment-test', roleSeed: 18, publicSeed: 712 }
  )
  return { ...run, private: { ...run.private, betrayers } }
}

function activeBetrayers(run) {
  return run.seats.filter(({ id, exit }) => !exit && run.private.betrayers.includes(id))
}

function sendHome(run, ids) {
  return {
    ...run,
    seats: run.seats.map((seat) =>
      ids.includes(seat.id) ? { ...seat, exit: { day: 1, cause: 'banished' } } : seat
    ),
  }
}

function revealBanishment(run, banishedId, blind = false) {
  const locked = {
    ...run,
    phase: 'table-reveal',
    private: {
      ...run.private,
      pendingTable: { banishedId, blind, tally: { [banishedId]: 8 }, tiedByDraw: false },
    },
  }
  return revealTable(locked, commandToken(locked))
}

function reload(run) {
  const storage = new Map()
  const adapter = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  }
  saveRun(adapter, 'profile', run)
  const restored = restoreRun(adapter, 'profile')
  assert.equal(restored.status, 'ready')
  return restored.run
}

function soloNight() {
  return { ...sendHome(season(), ['ai-1', 'ai-2', 'ai-3']), phase: 'night', day: 4 }
}

function findOffer(run) {
  for (let seed = 0; seed < 128; seed++) {
    const attempt = { ...run, private: { ...run.private, recruitmentSeed: seed } }
    const invite = resolveConclave(attempt, commandToken(attempt))
    if (invite.private.humanRecruitmentOffered) return invite
  }
  assert.fail('The human should be eligible for a secret offer from an AI Betrayer.')
}

test('a solo human chooses any eligible Loyal after Cocktails', () => {
  const run = sendHome(season(['human', 'ai-0', 'ai-1', 'ai-2']), ['ai-0', 'ai-1'])
  const cocktail = revealBanishment(
    {
      ...run,
      day: 3,
      dayFlow: { day: 3, castleDay: true },
      immunityId: 'ai-5',
      publicShield: { id: 'ai-6', day: 3 },
      private: { ...run.private, nightShieldIds: ['ai-6'] },
    },
    'ai-2'
  )
  assert.equal(cocktail.phase, 'cocktail')
  assert.equal(recruitmentFor(cocktail, 'human'), undefined)
  const night = advanceDayAftermath(cocktail, commandToken(cocktail))
  const token = commandToken(night)
  const choice = recruitmentFor(night, 'human')
  assert.equal(choice?.kind, 'choose')
  assert.ok(choice.targetIds.length > 15)
  assert.ok(choice.targetIds.includes('ai-6'))
  assert.ok(!choice.targetIds.some((id) => ['human', 'ai-0', 'ai-1', 'ai-2', 'ai-5'].includes(id)))
  assert.equal(getConclaveView(night, 'human'), null)
  assert.equal(resolveConclave(night, token, 'ai-5'), night)
  assert.equal(resolveConclave(night, token), night)
  assert.equal(resolveNight(night, token, []), night)
  const resolved = reload(resolveConclave(night, token, 'ai-6'))
  assert.equal(resolved.private.betrayers.length, 5)
  assert.equal(resolved.private.pendingNight.recruitedId, 'ai-6')
  assert.equal(resolved.private.pendingNight.targetId, null)
  assert.deepEqual(viewFor(resolved, 'human').teammateIds, ['ai-6'])
  assert.equal(viewFor(resolved, null).seats.find(({ id }) => id === 'ai-6').finaleRole, undefined)
  assert.equal(resolveConclave(resolved, token, 'ai-7'), resolved)
  const dawn = revealDawn(resolved, commandToken(resolved))
  assert.deepEqual(dawn.lastDawn, { day: 4, eliminatedId: null })
})

test('the recruited human receives a private offer that survives a reload', () => {
  const night = soloNight()
  const offered = reload(findOffer(night))
  assert.equal(offered.phase, 'night')
  assert.deepEqual(recruitmentFor(offered, 'human'), { kind: 'offer', shielded: false })
  assert.equal(recruitmentFor(offered, 'ai-6'), undefined)
  assert.equal(recruitmentFor(offered, null), undefined)
  assert.equal(viewFor(offered, 'human').role, 'loyal')
  assert.deepEqual(viewFor(offered, 'human').teammateIds, [])
  assert.equal(resolveConclave(offered, commandToken(offered)), offered)

  const token = commandToken(offered)
  const result = reload(answerRecruitment(offered, token, true))
  assert.equal(viewFor(result, 'human').role, 'betrayer')
  assert.deepEqual(viewFor(result, 'human').teammateIds, ['ai-0'])
  assert.match(describeConclaveVerdict(result, 'human'), /Guest 0 is your teammate/)
  assert.equal(describeConclaveVerdict(result, 'ai-5'), undefined)
  assert.equal(answerRecruitment(result, token, false), result)
  assert.deepEqual(revealDawn(result, commandToken(result)).lastDawn, {
    day: 5,
    eliminatedId: null,
  })
})

test('declining recruits one AI backup and a Night Shield protects the human', () => {
  const offered = findOffer(soloNight())
  for (const shielded of [false, true]) {
    const run = {
      ...offered,
      private: { ...offered.private, nightShieldIds: shielded ? ['human'] : [] },
    }
    assert.deepEqual(recruitmentFor(run, 'human'), { kind: 'offer', shielded })
    const result = reload(answerRecruitment(run, commandToken(run), false))
    assert.equal(viewFor(result, 'human').role, 'loyal')
    assert.equal(describeConclaveVerdict(result, 'human'), undefined)
    assert.equal(result.private.pendingNight.targetId, 'human')
    assert.notEqual(result.private.pendingNight.recruitedId, 'human')
    assert.equal(result.private.betrayers.length, 5)
    assert.equal(result.private.pendingNight.blocked, shielded)
    const dawn = revealDawn(result, commandToken(result))
    const human = dawn.seats.find(({ id }) => id === 'human')
    assert.deepEqual(human.exit, shielded ? undefined : { day: 4, cause: 'night' })
    assert.deepEqual(dawn.lastDawn, { day: 5, eliminatedId: shielded ? null : 'human' })
    assert.equal(activeBetrayers(dawn).length, 2)
  }
})

test('ordinary and blind banishments follow their normal flow outside recruitment', () => {
  const run = season(['human', 'ai-0', 'ai-1'])
  for (const banishedId of ['ai-6', 'ai-0']) {
    const night = revealBanishment(run, banishedId)
    assert.equal(night.phase, 'night')
    assert.equal(recruitmentFor(night, 'human'), undefined)
    assert.ok(getConclaveView(night, 'human'))
  }

  const single = { ...sendHome(run, ['ai-0']), day: 5 }
  const night = revealBanishment(single, 'ai-1')
  assert.ok(getConclaveView(night, 'human'))
  const settled = revealBanishment(sendHome(single, ['ai-1']), 'human')
  assert.equal(settled.result.winningRole, 'loyal')

  const remaining = new Set(['human', 'ai-1', 'ai-5', 'ai-6', 'ai-7', 'ai-8'])
  const atSix = sendHome(
    single,
    single.seats.filter(({ id }) => !remaining.has(id)).map(({ id }) => id)
  )
  const finale = revealBanishment(atSix, 'ai-1')
  assert.equal(finale.phase, 'final-challenge')
  const blind = revealBanishment(finale, 'human', true)
  assert.equal(blind.phase, 'end-vote')
  assert.equal(blind.seats.find(({ id }) => id === 'human').exit.revealedRole, undefined)
})

test('successive correct banishments still reach Day 5 with three or four starting Betrayers', () => {
  for (const startingCount of [3, 4]) {
    let run = season(cast.slice(0, startingCount).map(({ id }) => id))
    for (let day = 1; day < 5; day++) {
      const [first] = activeBetrayers(run)
      const night = revealBanishment(run, first.id)
      assert.equal(night.phase, 'night')
      const resolved = resolveConclave(night, commandToken(night))
      const decision = resolved.private.humanRecruitmentOffered
        ? answerRecruitment(resolved, commandToken(resolved), false)
        : resolved
      run = reload(revealDawn(decision, commandToken(decision)))
      assert.equal(run.day, day + 1)
      assert.ok(activeBetrayers(run).length >= 2)
      assert.equal(run.result, undefined)
    }
  }
})

test('a human banished as a Betrayer has no private recruitment view or choice', () => {
  const run = sendHome(season(['ai-0', 'ai-1', 'human']), ['ai-1'])
  const before = revealBanishment({ ...run, day: 3 }, 'human')
  assert.equal(before.seats[0].exit.revealedRole, 'betrayer')
  const after = resolveConclave(before, commandToken(before))
  assert.ok(after.private.pendingNight.recruitedId)
  assert.equal(recruitmentFor(before, 'human'), undefined)
  assert.equal(describeConclaveVerdict(after, 'human'), undefined)
  const publicView = viewFor(after, null)
  assert.ok(!JSON.stringify(publicView).includes('recruitedId'))
  assert.deepEqual(publicView.teammateIds, [])
})

test('public suspicion barely changes AI picks and even the most suspected guests can join', () => {
  const night = soloNight()
  const lowest = 'ai-4'
  const highTally = Object.fromEntries(
    night.seats.filter(({ id }) => id !== lowest).map(({ id }) => [id, 10])
  )
  const pick = (seed, tally) => {
    const ready = {
      ...night,
      lastTable: { banishedId: 'ai-3', blind: false, tally, tiedByDraw: false },
      private: { ...night.private, recruitmentSeed: seed },
    }
    const result = resolveConclave(ready, commandToken(ready))
    return result.private.pendingNight?.recruitedId ?? 'human'
  }
  const samples = Array.from({ length: 512 }, (_, seed) => [pick(seed, {}), pick(seed, highTally)])
  assert.ok(samples.filter(([original, suspected]) => original !== suspected).length < 24)
  const withSuspicion = samples.map(([, id]) => id)
  assert.ok(withSuspicion.filter((id) => id === lowest).length < 50)
  assert.ok(withSuspicion.includes('ai-23'))
  assert.ok(new Set(withSuspicion).size > 15)
})
