import assert from 'node:assert/strict'
import { test } from 'node:test'
import { castleRoleFor, recordClairvoyantResults } from '../src/betrayals/castleRoles.ts'
import { nightShieldReads } from '../src/betrayals/nightShields.ts'
import {
  aiGoodWitch,
  conclaveGuests,
  describeConclaveVerdict,
  getConclaveVerdict,
  getConclaveView,
  nightCastleRoleFor,
  nightTargets,
  resolveConclave,
  resolveNight,
  resolveNightCastleRole,
  revealDawn,
} from '../src/betrayals/night.ts'
import { restoreRun, saveRun } from '../src/betrayals/persistence.ts'
import { answerRecruitment, recruitmentFor } from '../src/betrayals/recruitment.ts'
import { commandToken, startRun, viewFor } from '../src/betrayals/run.ts'
import { revealableCastleRole } from '../src/betrayals/roleDisclosure.ts'
import { rankedTargets, resolutionPerspective } from '../src/betrayals/strategy.ts'

const cast = Array.from({ length: 24 }, (_, index) => ({
  id: `ai-${index}`,
  name: `Guest ${index}`,
}))

function ready(roleId, guestId) {
  return { roleId, guestId, status: 'ready' }
}

function night(humanRole = 'doctor', day = 3) {
  const run = startRun(
    { id: 'human', name: 'Player' },
    cast,
    { publicMode: false, realityMode: 'off', castleRoles: true },
    { id: 'castle-roles-night', roleSeed: 18, publicSeed: 712 }
  )
  return {
    ...run,
    day,
    dayFlow: { day, castleDay: true },
    phase: 'night',
    private: {
      ...run.private,
      betrayers: ['ai-0', 'ai-1', 'ai-2'],
      castleRoles: [
        ready('doctor', humanRole === 'doctor' ? 'human' : 'ai-3'),
        ready('extrasense', humanRole === 'extrasense' ? 'human' : 'ai-4'),
        ready('mayor', 'ai-5'),
      ],
    },
  }
}

function withSecret(run, secretId, lone = false) {
  const betrayers = [secretId, 'ai-1', 'ai-2']
  return {
    ...run,
    seats: run.seats.map((seat) =>
      lone && ['ai-1', 'ai-2'].includes(seat.id)
        ? { ...seat, exit: { cause: 'banished', day: 1, revealedRole: 'betrayer' } }
        : seat
    ),
    private: {
      ...run.private,
      betrayers,
      hiddenBetrayerIds: [secretId],
      castleRoles: [
        ready('secret-betrayer', secretId),
        ready('doctor', secretId === run.humanId ? 'ai-3' : run.humanId),
        ready('mayor', 'ai-5'),
      ],
    },
  }
}

function ballotsFor(run, targetId) {
  return run.private.betrayers
    .filter((voterId) => nightTargets(run, voterId).includes(targetId))
    .map((voterId) => ({ voterId, targetId }))
}

function reload(run) {
  const values = new Map()
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
  saveRun(storage, 'profile', run)
  const restored = restoreRun(storage, 'profile')
  assert.equal(restored.status, 'ready')
  return restored.run
}

function findOffer(run) {
  for (let seed = 0; seed < 128; seed++) {
    const attempt = { ...run, private: { ...run.private, recruitmentSeed: seed } }
    const invite = resolveConclave(attempt, commandToken(attempt))
    if (invite.private.humanRecruitmentOffered) return invite
  }
  assert.fail('The human should be eligible for a private offer.')
}

test('a Doctor ward stops a valid letter only on the night it was placed', () => {
  const run = night()
  const token = commandToken(run)
  const targetId = 'ai-6'
  assert.ok(nightCastleRoleFor(run, 'human')?.targetIds.includes('human'))
  assert.equal(nightCastleRoleFor(run, 'ai-0'), undefined)
  assert.equal(resolveNight(run, token, ballotsFor(run, targetId)), run)
  assert.equal(resolveNightCastleRole(run, token, 'missing'), run)

  const protectedRun = reload(resolveNightCastleRole(run, token, targetId))
  assert.equal(nightCastleRoleFor(protectedRun, 'human'), undefined)
  assert.equal(resolveNightCastleRole(protectedRun, token, 'ai-7'), protectedRun)
  const resolved = resolveNight(protectedRun, commandToken(protectedRun), ballotsFor(run, targetId))
  assert.equal(resolved.private.pendingNight.blocked, true)
  const dawn = revealDawn(resolved, commandToken(resolved))
  assert.equal(dawn.lastDawn?.eliminatedId, null)
  assert.equal(dawn.private.lastShieldSave, undefined)

  const next = { ...dawn, phase: 'night' }
  assert.ok(nightCastleRoleFor(next, 'human'))
  const skipped = resolveNightCastleRole(next, commandToken(next))
  const second = resolveNight(skipped, commandToken(skipped), ballotsFor(next, targetId))
  assert.equal(second.private.pendingNight.blocked, false)
  assert.equal(revealDawn(second, commandToken(second)).lastDawn?.eliminatedId, targetId)
})

test('the Doctor can ward again on another night, with self-protection once per season', () => {
  const run = night()
  const selfWard = resolveNightCastleRole(run, commandToken(run), run.humanId)
  const legacy = structuredClone(selfWard)
  delete legacy.private.castleRoles.find(({ roleId }) => roleId === 'doctor').selfWardUsed
  const tomorrow = reload({ ...legacy, day: 4, dayFlow: { day: 4, castleDay: true } })
  assert.ok(!nightCastleRoleFor(tomorrow, run.humanId)?.targetIds.includes(run.humanId))
  assert.equal(resolveNightCastleRole(tomorrow, commandToken(tomorrow), run.humanId), tomorrow)
  const warded = reload(resolveNightCastleRole(tomorrow, commandToken(tomorrow), 'ai-6'))
  assert.equal(castleRoleFor(warded, run.humanId)?.selfWardUsed, true)
  assert.equal(nightCastleRoleFor(warded, run.humanId), undefined)
  const next = { ...warded, day: 5, dayFlow: { day: 5, castleDay: true } }
  assert.ok(!nightCastleRoleFor(next, run.humanId)?.targetIds.includes(run.humanId))
  assert.equal(reload(resolveNightCastleRole(next, commandToken(next))).day, 5)
})

test('Extrasense pass survives reload and a later inspection spends that night’s use', () => {
  const run = night('extrasense')
  assert.ok(!nightCastleRoleFor(run, 'human')?.targetIds.includes('human'))
  assert.equal(resolveNightCastleRole(run, commandToken(run), 'human'), run)
  const passed = reload(resolveNightCastleRole(run, commandToken(run)))
  assert.equal(nightCastleRoleFor(passed, 'human'), undefined)
  assert.equal(castleRoleFor(passed, 'human')?.status, 'ready')

  const next = { ...passed, day: 4, dayFlow: { day: 4, castleDay: true } }
  const scanned = reload(resolveNightCastleRole(next, commandToken(next), 'ai-3'))
  assert.deepEqual(castleRoleFor(scanned, 'human')?.used, {
    roleId: 'extrasense',
    targetId: 'ai-3',
    day: 4,
    hasRole: true,
  })
  assert.equal(nightCastleRoleFor(scanned, 'human'), undefined)
  assert.equal(resolveNightCastleRole(scanned, commandToken(scanned), 'ai-2'), scanned)
})

function withNightPowers(witchId = 'ai-3', illusionistId = 'ai-4', cursedId = 'ai-5', day = 5) {
  const run = night('none', day)
  return {
    ...run,
    private: {
      ...run.private,
      castleRoles: [
        ready('good-witch', witchId),
        ready('illusionist', illusionistId),
        ready('cursed', cursedId),
      ],
    },
  }
}

function withoutPower(run, roleId) {
  return {
    ...run,
    private: {
      ...run.private,
      castleRoles: run.private.castleRoles.map((card) =>
        card.roleId === roleId
          ? { ...card, status: 'used', used: { roleId, day: run.day - 1 } }
          : card
      ),
    },
  }
}

function nightWhere(run, predicate) {
  for (let publicSeed = 0; publicSeed < 128; publicSeed++) {
    const attempt = { ...run, publicSeed }
    if (predicate(attempt)) return attempt
  }
  assert.fail('Could not find a Night matching the fixture')
}

test('the Good Witch saves the intended victim and leaves the Illusionist charge untouched', () => {
  const run = withNightPowers('human')
  const token = commandToken(run)
  assert.equal(nightCastleRoleFor(run, 'human')?.roleId, 'good-witch')
  assert.equal(resolveConclave(run, token), run)
  const cancelled = reload(resolveNightCastleRole(run, token, true))
  assert.deepEqual(cancelled.private.pendingNight, {
    targetId: null,
    blocked: false,
    castleEffect: { kind: 'good-witch' },
  })
  assert.equal(cancelled.private.conclaveVote, undefined)
  assert.equal(castleRoleFor(cancelled, 'human').used.day, run.day)
  assert.equal(castleRoleFor(cancelled, 'ai-4').status, 'ready')
  assert.equal(castleRoleFor(cancelled, 'ai-5').status, 'ready')
  const dawn = revealDawn(cancelled, commandToken(cancelled))
  assert.equal(dawn.lastDawn.eliminatedId, null)
  assert.equal(nightCastleRoleFor({ ...dawn, phase: 'night' }, 'human'), undefined)
})

test('an AI Good Witch cancels before a human Betrayer can open their ballot', () => {
  const scenario = withNightPowers()
  scenario.private.betrayers[0] = 'human'
  const run = nightWhere(scenario, aiGoodWitch)
  assert.equal(getConclaveView(run, 'human'), null)
  const cancelled = reload(resolveConclave(run, commandToken(run)))
  assert.equal(cancelled.private.pendingNight.castleEffect.kind, 'good-witch')
  assert.equal(cancelled.private.conclaveVote, undefined)
})

test('an Illusionist who arms into a cancelled murder or recruitment keeps the charge', () => {
  const run = nightWhere(withNightPowers('ai-3', 'human'), aiGoodWitch)
  const cancelled = reload(resolveNightCastleRole(run, commandToken(run), true))
  assert.equal(cancelled.private.pendingNight.castleEffect.kind, 'good-witch')
  assert.equal(castleRoleFor(cancelled, 'human').status, 'ready')

  for (const roleId of ['illusionist', 'good-witch']) {
    const recruiting =
      roleId === 'illusionist'
        ? withNightPowers('ai-3', 'human', 'ai-5', 4)
        : withNightPowers('human', 'ai-4', 'ai-5', 4)
    recruiting.seats = recruiting.seats.map((seat) =>
      ['ai-1', 'ai-2'].includes(seat.id)
        ? { ...seat, exit: { cause: 'banished', revealedRole: 'betrayer', day: 3 } }
        : seat
    )
    recruiting.private.recruitmentSeed = 100
    const next = reload(resolveNightCastleRole(recruiting, commandToken(recruiting), true))
    assert.equal(castleRoleFor(next, 'human').status, 'ready')
    assert.equal(nightCastleRoleFor(next, 'human'), undefined)
    assert.ok(next.private.pendingNight?.recruitedId || next.private.humanRecruitmentOffered)
  }
})

test('Cursed turns privately at dawn only after a deliberate, lethal letter', () => {
  const run = withoutPower(
    withoutPower(withNightPowers('ai-3', 'ai-4', 'human'), 'good-witch'),
    'illusionist'
  )
  const protectedRun = { ...run, private: { ...run.private, nightShieldIds: ['human'] } }
  const shielded = reload(
    resolveNight(protectedRun, commandToken(protectedRun), ballotsFor(protectedRun, 'human'))
  )
  assert.equal(shielded.private.pendingNight.castleEffect, undefined)
  assert.equal(viewFor(revealDawn(shielded, commandToken(shielded)), 'human').role, 'loyal')

  const hit = reload(resolveNight(run, commandToken(run), ballotsFor(run, 'human')))
  assert.equal(hit.private.pendingNight.castleEffect.kind, 'cursed')
  assert.equal(viewFor(hit, 'human').role, 'loyal')
  const dawn = reload(revealDawn(hit, commandToken(hit)))
  assert.equal(dawn.lastDawn.eliminatedId, null)
  assert.equal(dawn.private.lastShieldSave, undefined)
  assert.equal(viewFor(dawn, 'human').role, 'betrayer')
  assert.ok(viewFor(dawn, 'ai-0').teammateIds.includes('human'))
  assert.deepEqual(viewFor(dawn, 'ai-8').teammateIds, [])
  assert.equal(castleRoleFor(dawn, 'human').status, 'retired')
})

function redirectTo(run, original, recipient) {
  for (let seed = 0; seed < 256; seed++) {
    const attempt = { ...run, private: { ...run.private, recruitmentSeed: seed } }
    const resolved = resolveNight(attempt, commandToken(attempt), ballotsFor(attempt, original))
    if (
      resolved.private.pendingNight?.castleEffect?.kind === 'illusionist' &&
      resolved.private.pendingNight.targetId === recipient
    )
      return { attempt, resolved }
  }
  assert.fail(`No redirect from ${original} to ${recipient}`)
}

function withAiRedirect(run) {
  return nightWhere(run, (attempt) => {
    const resolved = resolveNight(attempt, commandToken(attempt), ballotsFor(attempt, 'ai-6'))
    return resolved.private.pendingNight?.castleEffect?.kind === 'illusionist'
  })
}

test('a redirected letter can hit a Betrayer and respects immunity and shields at the destination', () => {
  const run = withAiRedirect(withoutPower(withNightPowers(), 'good-witch'))
  const { attempt, resolved } = redirectTo(run, 'ai-6', 'ai-0')
  assert.equal(reload(resolved).private.pendingNight.blocked, false)
  assert.deepEqual(
    resolveNight(attempt, commandToken(attempt), ballotsFor(attempt, 'ai-6')),
    resolved
  )
  assert.equal(revealDawn(resolved, commandToken(resolved)).lastDawn.eliminatedId, 'ai-0')

  for (const protectedRun of [
    { ...attempt, immunityId: 'ai-0' },
    { ...attempt, private: { ...attempt.private, nightShieldIds: ['ai-0'] } },
  ]) {
    const safe = reload(
      resolveNight(protectedRun, commandToken(protectedRun), ballotsFor(protectedRun, 'ai-6'))
    )
    assert.equal(safe.private.pendingNight.targetId, 'ai-0')
    assert.equal(safe.private.pendingNight.blocked, true)
    assert.equal(revealDawn(safe, commandToken(safe)).lastDawn.eliminatedId, null)
  }
})

test('redirecting away from or onto Cursed leaves the conversion dormant', () => {
  const run = withAiRedirect(withoutPower(withNightPowers(), 'good-witch'))
  const away = redirectTo(run, 'ai-5', 'ai-6').resolved
  const onto = redirectTo(run, 'ai-6', 'ai-5').resolved
  assert.ok(!revealDawn(away, commandToken(away)).private.betrayers.includes('ai-5'))
  const dawn = revealDawn(onto, commandToken(onto))
  assert.equal(dawn.lastDawn.eliminatedId, 'ai-5')
  assert.ok(!dawn.private.betrayers.includes('ai-5'))
})

test('redirecting the letter to the last active Betrayer settles the season for the Loyals', () => {
  const run = withoutPower(withNightPowers(), 'good-witch')
  run.seats = run.seats.map((seat) =>
    ['ai-1', 'ai-2'].includes(seat.id)
      ? { ...seat, exit: { cause: 'banished', revealedRole: 'betrayer', day: 3 } }
      : seat
  )
  const resolved = redirectTo(withAiRedirect(run), 'ai-6', 'ai-0').resolved
  const dawn = reload(revealDawn(resolved, commandToken(resolved)))
  assert.equal(dawn.phase, 'settled')
  assert.equal(dawn.result.winningRole, 'loyal')
  assert.equal(dawn.result.reason, 'last-betrayer')
})

test('the Illusionist redirects a saved runoff and the Conclave verdict keeps the voted name', () => {
  const run = withoutPower(withNightPowers(), 'good-witch')
  run.private.betrayers[0] = 'human'
  run.private.conclaveVote = {
    nominations: [
      { voterId: 'human', targetId: 'ai-6' },
      { voterId: 'ai-1', targetId: 'ai-7' },
      { voterId: 'ai-2', targetId: 'ai-8' },
    ],
  }
  const draft = nightWhere(
    reload(run),
    (attempt) =>
      resolveConclave(attempt, commandToken(attempt), 'ai-6').private.pendingNight?.castleEffect
        ?.kind === 'illusionist'
  )
  const resolved = reload(resolveConclave(draft, commandToken(draft), 'ai-6'))
  const { targetId, castleEffect } = resolved.private.pendingNight
  assert.notEqual(targetId, castleEffect.originalTargetId)
  assert.equal(getConclaveVerdict(resolved, 'human').targetId, castleEffect.originalTargetId)
  assert.equal(castleRoleFor(resolved, 'ai-4').used.day, resolved.day)
})

test('the three night effects close when seven guests remain', () => {
  const run = withNightPowers('ai-3', 'ai-4', 'human')
  const survivors = new Set(['human', 'ai-0', 'ai-1', 'ai-2', 'ai-3', 'ai-4', 'ai-6'])
  run.seats = run.seats.map((seat) =>
    survivors.has(seat.id)
      ? seat
      : {
          ...seat,
          exit: { day: 3, cause: 'banished' },
        }
  )
  assert.equal(aiGoodWitch(run), undefined)
  const resolved = resolveNight(run, commandToken(run), ballotsFor(run, 'human'))
  assert.equal(resolved.private.pendingNight.castleEffect, undefined)
  assert.equal(revealDawn(resolved, commandToken(resolved)).lastDawn.eliminatedId, 'human')
  assert.equal(nightCastleRoleFor({ ...run, humanId: 'ai-3' }, 'ai-3'), undefined)
  assert.equal(nightCastleRoleFor({ ...run, humanId: 'ai-4' }, 'ai-4'), undefined)
})

test('AI night roles choose independently of the private Conclave target', () => {
  const run = night('none')
  const token = commandToken(run)
  const one = resolveNight(run, token, ballotsFor(run, 'ai-6'))
  const two = resolveNight(run, token, ballotsFor(run, 'ai-7'))
  for (const id of ['ai-3', 'ai-4']) {
    assert.equal(castleRoleFor(one, id)?.status, 'used')
    assert.deepEqual(castleRoleFor(one, id)?.used, castleRoleFor(two, id)?.used)
  }
  assert.equal(one.revision, run.revision + 1)
})

function informationNight(humanRole) {
  const run = night('none', 5)
  run.private.castleRoles = [
    ready('columbus', humanRole === 'columbus' ? 'human' : 'ai-3'),
    ready('clairvoyant', humanRole === 'clairvoyant' ? 'human' : 'ai-4'),
    ready('mayor', 'ai-5'),
  ]
  return run
}

test('Columbus requires five distinct other guests and keeps the saved answer private', () => {
  const run = informationNight('columbus')
  const token = commandToken(run)
  const group = ['ai-0', 'ai-6', 'ai-7', 'ai-8', 'ai-9']
  for (const bad of [
    group.slice(0, 4),
    [...group.slice(0, 4), group[0]],
    [...group.slice(0, 4), 'human'],
  ])
    assert.equal(resolveNightCastleRole(run, token, bad), run)
  const reading = reload(resolveNightCastleRole(run, token, group))
  assert.deepEqual(castleRoleFor(reading, 'human').used, {
    roleId: 'columbus',
    day: 5,
    guestIds: group,
    hasBetrayer: true,
  })
  assert.equal(nightCastleRoleFor(reading, 'human'), undefined)
  assert.ok(!JSON.stringify(viewFor(reading, 'ai-8')).includes('hasBetrayer'))
})

test('the Clairvoyant cannot disclose the role or spend it at Night', () => {
  const run = informationNight('clairvoyant')
  assert.equal(revealableCastleRole(run), undefined)
  assert.equal(resolveNightCastleRole(run, commandToken(run), true), run)
  assert.equal(nightCastleRoleFor(run, 'human'), undefined)
})

test('AI Columbus uses private evidence and AI Clairvoyant reads hidden challenge winners', () => {
  const run = recordClairvoyantResults(informationNight('none'), ['ai-7'], false)
  assert.ok(nightShieldReads(run, 'ai-4').has('ai-7'))
  assert.ok(!nightShieldReads(run, 'ai-8').has('ai-7'))
  const targets = run.seats.filter(({ id }) => id !== 'ai-3').map(({ id }) => id)
  const ranking = rankedTargets(resolutionPerspective(run, 'ai-3', targets), 'case')
  const resolved = resolveNight(run, commandToken(run), ballotsFor(run, 'ai-12'))
  const group = castleRoleFor(resolved, 'ai-3').used
  assert.deepEqual(group.guestIds, [ranking[0], ...ranking.slice(-4)])
  assert.deepEqual(castleRoleFor(resolved, 'ai-4').used.shieldIds, ['ai-7'])
  const dawn = revealDawn(resolved, commandToken(resolved))
  const noReadings = { ...dawn, private: { ...dawn.private, castleRoles: undefined } }
  const col = resolutionPerspective(dawn, 'ai-3', targets).evidence
  const baseline = resolutionPerspective(noReadings, 'ai-3', targets).evidence
  for (const id of group.guestIds) assert.ok(col.get(id) !== baseline.get(id))
})

test('a concealed AI Secret casts the deciding ballot without attending the Conclave', () => {
  const run = withSecret(night('doctor', 5), 'ai-0')
  assert.equal(getConclaveView(run, 'ai-0').sealed, true)
  assert.deepEqual(conclaveGuests(run, 'ai-0'), [])
  assert.ok(!conclaveGuests(run, 'ai-1').some(({ id }) => id === 'ai-0'))
  assert.ok(getConclaveView(run, 'ai-1').targetIds.includes('ai-0'))
  const passed = resolveNightCastleRole(run, commandToken(run))
  const ballots = ballotsFor(passed, 'ai-0')
  assert.deepEqual(
    ballots.map(({ voterId }) => voterId),
    ['ai-1', 'ai-2']
  )
  const resolved = reload(resolveNight(passed, commandToken(passed), ballots))
  const sealed = resolved.private.pendingNight.sealedBallot
  assert.equal(sealed.voterId, 'ai-0')
  assert.equal(sealed.shortlist.length, 2)
  assert.ok(!sealed.shortlist.some((id) => run.private.betrayers.includes(id)))
  assert.equal(resolved.private.pendingNight.targetId, sealed.targetId)
  assert.match(describeConclaveVerdict(resolved, 'ai-0'), /You chose/)
  assert.doesNotMatch(describeConclaveVerdict(resolved, 'ai-1'), /sealed|Guest 0/)
  assert.equal(getConclaveVerdict(resolved, 'human'), null)
  const dawn = revealDawn(resolved, commandToken(resolved))
  assert.equal(dawn.private.pendingNight, undefined)
})

test('a split Conclave preserves all three nominations and adds a fourth reserve', () => {
  const run = withSecret(night('doctor', 5), 'ai-0')
  run.private.betrayers.push('ai-6')
  const passed = resolveNightCastleRole(run, commandToken(run))
  const nominations = ['ai-1', 'ai-2', 'ai-6'].map((voterId, index) => ({
    voterId,
    targetId: `ai-${index + 12}`,
  }))
  const resolved = reload(resolveNight(passed, commandToken(passed), nominations))
  const ballot = resolved.private.pendingNight.sealedBallot
  assert.equal(ballot.shortlist.length, 4)
  assert.ok(nominations.every(({ targetId }) => ballot.shortlist.includes(targetId)))
})

test('the human Secret chooses a valid private target, with a stable shortlist and real shield protection', () => {
  for (const groupSize of [2, 3, 4]) {
    const run = withSecret(night('doctor', 3), 'human')
    run.private.betrayers =
      groupSize === 4 ? ['human', 'ai-0', 'ai-1', 'ai-2'] : ['human', 'ai-1', 'ai-2']
    if (groupSize === 2)
      run.seats.find(({ id }) => id === 'ai-2').exit = {
        cause: 'banished',
        day: 1,
        revealedRole: 'betrayer',
      }
    run.immunityId = 'ai-12'
    const vote = getConclaveView(reload(run), 'human')
    assert.ok(vote.sealed)
    assert.deepEqual(vote.discussion, [])
    assert.deepEqual(vote.proposals, [])
    assert.deepEqual(viewFor(run, 'human').teammateIds, [])
    assert.deepEqual(vote.targetIds, getConclaveView(run, 'human').targetIds)
    assert.ok(vote.targetIds.length >= 2 && vote.targetIds.length <= groupSize)
    assert.ok(!vote.targetIds.includes(run.immunityId))
    assert.ok(!vote.targetIds.some((id) => run.private.betrayers.includes(id)))
    for (const invalid of [undefined, run.immunityId, 'human'])
      assert.equal(resolveConclave(run, commandToken(run), invalid), run)
    const [target] = vote.targetIds
    run.private.nightShieldIds = [target]
    const decided = reload(resolveConclave(run, commandToken(run), target))
    assert.deepEqual(decided.private.pendingNight.sealedBallot, {
      voterId: 'human',
      targetId: target,
      shortlist: vote.targetIds,
    })
    assert.equal(decided.private.pendingNight.targetId, target)
    assert.equal(decided.private.pendingNight.blocked, true)
    assert.equal(revealDawn(decided, commandToken(decided)).lastDawn.eliminatedId, null)
  }
})

test('a concealed human Secret can recruit without exposing their identity', () => {
  const run = withSecret(night('doctor', 4), 'human', true)
  assert.equal(recruitmentFor(run, 'human')?.kind, 'choose')
  assert.ok(recruitmentFor(run, 'human')?.targetIds.includes('ai-3'))
  const resolved = reload(resolveConclave(run, commandToken(run), 'ai-3'))
  assert.deepEqual(resolved.private.hiddenBetrayerIds, ['human'])
  assert.equal(resolved.private.pendingNight?.targetId, null)
  assert.equal(castleRoleFor(resolved, 'ai-3')?.status, 'retired')
  assert.deepEqual(viewFor(resolved, 'ai-3').teammateIds, [])
  assert.equal(describeConclaveVerdict(resolved, 'ai-3'), 'You joined the Betrayers.')
  assert.equal(revealDawn(resolved, commandToken(resolved)).day, 5)
})

test('a lone concealed Secret after Night 4 still casts a Night ballot', () => {
  const run = withSecret(night('doctor', 5), 'ai-0', true)
  assert.equal(recruitmentFor(run, 'human'), undefined)
  assert.ok(getConclaveView(run, 'ai-0').sealed)
  const passed = resolveNightCastleRole(run, commandToken(run))
  const resolved = resolveConclave(passed, commandToken(passed))
  assert.equal(resolved.phase, 'night-resolved')
  assert.ok(resolved.private.pendingNight?.targetId)
  assert.equal(resolved.private.pendingNight.sealedBallot.voterId, 'ai-0')
  assert.equal(resolved.private.pendingNight?.recruitedId, undefined)
  const dawn = revealDawn(resolved, commandToken(resolved))
  assert.equal(dawn.day, 6)
  assert.equal(dawn.result, undefined)
  assert.equal(viewFor(dawn, 'ai-0').role, 'betrayer')
})

test('a Night role prompt does not reveal pending recruitment and only acceptance retires the card', () => {
  const run = withSecret(night('doctor', 4), 'ai-0', true)
  const twoBetrayers = {
    ...run,
    private: { ...run.private, betrayers: [...run.private.betrayers, 'ai-7'] },
  }
  assert.equal(nightCastleRoleFor(run, 'human')?.roleId, 'doctor')
  assert.deepEqual(nightCastleRoleFor(run, 'human'), nightCastleRoleFor(twoBetrayers, 'human'))
  assert.equal(recruitmentFor(run, 'human'), undefined)
  const passed = resolveNightCastleRole(run, commandToken(run))
  const offered = reload(findOffer(passed))
  assert.deepEqual(recruitmentFor(offered, 'human'), { kind: 'offer', shielded: false })
  assert.equal(nightCastleRoleFor(offered, 'human'), undefined)

  const accepted = reload(answerRecruitment(offered, commandToken(offered), true))
  assert.equal(castleRoleFor(accepted, 'human')?.status, 'retired')
  assert.deepEqual(viewFor(accepted, 'human').teammateIds, [])
  assert.equal(describeConclaveVerdict(accepted, 'human'), 'You joined the Betrayers.')

  const shielded = { ...offered, private: { ...offered.private, nightShieldIds: ['human'] } }
  const declined = answerRecruitment(shielded, commandToken(shielded), false)
  assert.equal(declined.private.pendingNight?.blocked, true)
  assert.notEqual(declined.private.pendingNight?.recruitedId, 'human')
  assert.equal(castleRoleFor(declined, 'human')?.status, 'ready')
  const dawn = revealDawn(declined, commandToken(declined))
  assert.equal(dawn.day, 5)
  assert.equal(dawn.lastDawn?.eliminatedId, null)
})

test('a Doctor ward does not shield an unshielded recruitment refusal', () => {
  const run = withSecret(night('doctor', 4), 'ai-0', true)
  const warded = resolveNightCastleRole(run, commandToken(run), 'human')
  const offered = findOffer(warded)
  assert.equal(castleRoleFor(offered, 'human')?.status, 'used')
  assert.deepEqual(recruitmentFor(offered, 'human'), { kind: 'offer', shielded: false })
  const declined = answerRecruitment(offered, commandToken(offered), false)
  assert.equal(declined.private.pendingNight?.blocked, false)
  assert.equal(revealDawn(declined, commandToken(declined)).lastDawn?.eliminatedId, 'human')
})
