import assert from 'node:assert/strict'
import { test } from 'node:test'
import { composeConclaveConversation } from '../src/betrayals/conclaveConversation.ts'
import {
  describeConclaveVerdict,
  getConclaveVerdict,
  getConclaveView,
  resolveConclave,
  resolveNight,
  revealDawn,
} from '../src/betrayals/night.ts'
import { commandToken, startRun } from '../src/betrayals/run.ts'
import { restoreRun, saveRun } from '../src/betrayals/persistence.ts'

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

test('a repeated 2-1-1 runoff chooses the sole leader and eliminates them at dawn', () => {
  const run = atNight(0)
  const leader = 'seat-22'
  const first = resolveConclave(run, commandToken(run), leader)
  const tally = 'Contestant 22 2 · Contestant 19 1 · Contestant 10 1'
  assert.equal(first.phase, 'night')
  const runoff = getConclaveView(first, run.humanId)
  assert.equal(runoff.runoff, tally)
  assert.equal(runoff.targetIds.length, 3)
  assert.deepEqual(runoff.discussion, [])

  const final = resolveConclave(first, commandToken(first), leader)
  assert.equal(final.phase, 'night-resolved')
  assert.deepEqual(getConclaveVerdict(final, run.humanId), { targetId: leader, byDraw: false })
  assert.equal(
    describeConclaveVerdict(final, run.humanId),
    `Runoff: ${tally}. No votes changed. Contestant 22 was chosen with the most votes.`
  )
  const dawn = revealDawn(final, commandToken(final))
  assert.equal(dawn.lastDawn.eliminatedId, leader)
})

test('an even final ballot draws only among nominees tied for the lead', () => {
  const base = atNight()
  const nominees = base.seats.slice(4, 8).map(({ id }) => id)
  const outcomes = new Set()
  for (let publicSeed = 0; publicSeed < 30; publicSeed++) {
    const run = { ...base, publicSeed }
    const nominations = run.private.betrayers.map((voterId, index) => ({
      voterId,
      targetId: nominees[index],
    }))
    const runoff = nominations.map(({ voterId }, index) => ({
      voterId,
      targetId: nominees[index % 2],
    }))
    const resolved = resolveNight(run, commandToken(run), runoff, nominations)
    const verdict = getConclaveVerdict(resolved, run.humanId)
    assert.equal(verdict.byDraw, true)
    assert.ok(nominees.slice(0, 2).includes(verdict.targetId))
    outcomes.add(verdict.targetId)
  }
  assert.equal(outcomes.size, 2)
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
  assert.ok(
    view.discussion.some(
      ({ speakerId, speakerName, portrait }) =>
        speakerId === 'hooded-1' && speakerName === 'Hooded voice' && !portrait
    )
  )
  assert.ok(
    view.discussion.every(
      ({ speakerId, speakerName, portrait }) =>
        speakerId !== hidden.id && speakerName !== hidden.name && portrait !== hidden.portrait
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
  const first = resolveConclave(run, token, hidden.id)
  const runoffTargets = getConclaveView(first, run.humanId)?.targetIds
  const result = runoffTargets?.length
    ? resolveConclave(first, commandToken(first), runoffTargets[0])
    : first
  assert.equal(result.phase, 'night-resolved')
  assert.ok(!run.private.betrayers.includes(result.private.pendingNight.targetId))
  assert.deepEqual(first, resolveConclave(run, token, hidden.id))
})

test('the Conclave puts a reply beside the nomination and avoids repeating the same case', () => {
  const finn = { speakerId: 'finn', speakerName: 'Finn' }
  const ash = { speakerId: 'ash', speakerName: 'Ash' }
  const hooded = { speakerId: 'hooded-1', speakerName: 'Hooded voice' }
  const opening = {
    ...ash,
    nomineeId: 'ivy',
    nomineeName: 'Ivy',
    argument: 'She already voted for one of us.',
  }
  const other = {
    ...finn,
    nomineeId: 'aria',
    nomineeName: 'Aria',
    argument: 'She is building a case against us.',
  }
  const reply = { ...hooded, aboutId: 'ivy', argument: 'I heard she might have a shield.' }
  const lines = composeConclaveConversation([other, opening, { ...opening, ...finn }], [reply])
  assert.deepEqual(
    lines.map(({ speakerId }) => speakerId),
    [ash.speakerId, hooded.speakerId, finn.speakerId]
  )
  assert.match(lines[0].argument, /^Ivy\./)
  assert.equal(lines[1].argument, reply.argument)
  assert.match(lines[2].argument, /Aria/)
})

test('a 2–2 first ballot pauses for a saved runoff and the verdict states what decided it', () => {
  let foundDraw = false
  let foundMajority = false
  for (let seed = 0; seed < 100 && (!foundDraw || !foundMajority); seed++) {
    const run = atNight(seed)
    const proposals = getConclaveView(run, run.humanId).proposals
    const other = proposals.find(
      ({ nomineeName }) =>
        proposals.filter((proposal) => proposal.nomineeName === nomineeName).length === 1
    )
    if (!other || new Set(proposals.map(({ nomineeName }) => nomineeName)).size !== 2) continue
    const candidate = run.seats.find(({ name }) => name === other.nomineeName)
    const token = commandToken(run)
    const first = resolveConclave(run, token, candidate.id)
    assert.equal(first.phase, 'night')
    assert.equal(getConclaveVerdict(first, run.humanId), null)
    assert.equal(resolveConclave(first, token, candidate.id), first)
    const runoff = getConclaveView(first, run.humanId)
    assert.match(runoff.runoff, / 2 · .* 2$/)
    assert.equal(runoff.targetIds.length, 2)
    assert.equal(getConclaveView(first, candidate.id), null)
    const storage = new Map()
    const adapter = {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    }
    saveRun(adapter, 'fixture', first)
    const restored = restoreRun(adapter, 'fixture')
    assert.equal(restored.status, 'ready')
    const final = resolveConclave(restored.run, commandToken(restored.run), candidate.id)
    const verdict = getConclaveVerdict(final, run.humanId)
    assert.equal(final.phase, 'night-resolved')
    assert.ok(runoff.targetIds.includes(verdict.targetId))
    const text = describeConclaveVerdict(final, run.humanId)
    assert.match(text, /^Runoff: /)
    assert.match(text, verdict.byDraw ? /chosen by draw/ : /chosen by majority vote/)
    assert.equal(describeConclaveVerdict(final, candidate.id), undefined)
    foundDraw ||= verdict.byDraw
    foundMajority ||= !verdict.byDraw
    const dawn = revealDawn(final, commandToken(final))
    assert.equal(dawn.private.conclaveVote, undefined)
  }
  assert.ok(foundDraw)
  assert.ok(foundMajority)
})
