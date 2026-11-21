import assert from 'node:assert/strict'
import { test } from 'node:test'
import { advanceDayBeat } from '../src/betrayals/daySocial.ts'
import { resolveChallenge } from '../src/betrayals/challenges.ts'
import { restoreRun, saveRun } from '../src/betrayals/persistence.ts'
import {
  acknowledgeRole,
  advancePreparation,
  commandToken,
  PHASES,
  startRun,
} from '../src/betrayals/run.ts'
import { intendsToEnd } from '../src/betrayals/settlement.ts'
import {
  applySocialMove,
  getSocialView,
  hasAlliance,
  hasSocialStrain,
  latestPact,
  rapport,
} from '../src/betrayals/social.ts'
import { recordSocialWallet, socialWalletFor } from '../src/betrayals/socialResources.ts'
import { chooseTarget } from '../src/betrayals/strategy.ts'

function createRun() {
  const run = startRun(
    { id: 'human', name: 'Human' },
    Array.from({ length: 24 }, (_, index) => ({ id: 'ai-' + index, name: 'Player ' + index })),
    { publicMode: false, realityMode: 'tv' },
    { id: 'social', roleSeed: 514, publicSeed: 319 }
  )
  const dawn = acknowledgeRole(run, commandToken(run))
  return advancePreparation(dawn, commandToken(dawn))
}

function exchange(run, actorId, recipientId, kind, suspectId) {
  return applySocialMove(run, commandToken(run), { actorId, recipientId, kind, suspectId })
}

test('private questions can be asked once per direction per day with current commands', () => {
  const original = createRun()
  const [actor, peer, suspect, witness] = original.seats.map(({ id }) => id)
  const token = commandToken(original)
  const first = exchange(original, actor, peer, 'question', suspect)
  assert.notStrictEqual(first, original)
  assert.strictEqual(exchange(first, actor, peer, 'question', witness), first)
  assert.strictEqual(
    applySocialMove(first, token, { actorId: actor, recipientId: witness, kind: 'rapport' }),
    first
  )
  const peerReply = exchange(first, peer, actor, 'question', witness)
  assert.equal(getSocialView(peerReply, actor).length, 2)
  assert.equal(getSocialView(peerReply, peer).length, 2)
  assert.deepEqual(getSocialView(peerReply, witness), [])
  assert.deepEqual(getSocialView(peerReply, null), [])
  assert.deepEqual(socialWalletFor(peerReply, actor), {
    day: 1,
    energy: 5,
    energySpent: 2,
    influence: 1,
    info: 100,
  })

  const nextDay = { ...peerReply, day: peerReply.day + 1 }
  assert.notStrictEqual(exchange(nextDay, actor, peer, 'question', witness), nextDay)
})

test('every live phase offers a check-in paid from the same Energy balance', () => {
  const original = createRun()
  const [actor, peer] = original.seats.map(({ id }) => id)
  for (const phase of PHASES.filter((phase) => phase !== 'settled')) {
    const changed = { ...original, phase }
    assert.notStrictEqual(exchange(changed, actor, peer, 'rapport'), changed, phase)
  }
  const finished = { ...original, phase: 'settled' }
  assert.strictEqual(exchange(finished, actor, peer, 'rapport'), finished)

  const morning = exchange({ ...original, phase: 'dawn' }, actor, peer, 'rapport')
  const afternoon = exchange({ ...morning, phase: 'safety' }, actor, peer, 'rapport')
  let evening = { ...afternoon, phase: 'night' }
  for (let step = 0; step < 5; step++) evening = exchange(evening, actor, peer, 'rapport')
  assert.equal(evening.social.length, 7)
  assert.equal(socialWalletFor(evening, actor).energy, 0)
  assert.equal(socialWalletFor(evening, actor).influence, 21)
  assert.strictEqual(exchange(evening, actor, peer, 'rapport'), evening)
  const nextDay = { ...evening, phase: 'dawn', day: evening.day + 1 }
  assert.equal(socialWalletFor(nextDay, actor).energy, 7)
  assert.notStrictEqual(exchange(nextDay, actor, peer, 'rapport'), nextDay)
  assert.equal(socialWalletFor({ ...morning, day: 2 }, actor).energy, 13)
  assert.equal(socialWalletFor({ ...morning, day: 7 }, actor).energy, 30)
  assert.equal(socialWalletFor({ ...original, day: 2 }, actor).energy, 14)
})

test('private vote plans close after voting and only target publicly eligible guests', () => {
  const original = createRun()
  const [actor, peer, immune, shielded, hiddenShield, other] = original.seats.map(({ id }) => id)
  const first = exchange(original, actor, peer, 'rapport')
  const table = {
    ...first,
    phase: 'round-table',
    immunityId: immune,
    publicShield: { id: shielded, day: first.day },
    private: { ...first.private, nightShieldIds: [hiddenShield] },
    socialWallets: recordSocialWallet(first, actor, { influence: 40, info: 100, energy: 3 }),
  }
  assert.strictEqual(exchange(first, actor, peer, 'vote-plan', other), first)
  assert.strictEqual(exchange(table, actor, peer, 'vote-plan', immune), table)
  assert.strictEqual(exchange(table, actor, peer, 'vote-plan', shielded), table)
  const planned = exchange(table, actor, peer, 'vote-plan', hiddenShield)
  assert.equal(latestPact(planned.social, actor, peer, table.day)?.suspectId, hiddenShield)
  assert.equal(socialWalletFor(planned, actor).influence, 23)
  assert.equal(socialWalletFor(planned, actor).info, 50)

  const runoff = { ...planned, runoffIds: [hiddenShield, other] }
  assert.strictEqual(exchange(runoff, actor, peer, 'vote-plan', other), runoff)
  const ballots = { round: 1, ballots: [{ voterId: actor, targetId: other }], tiedIds: [] }
  const counted = { ...planned, phase: 'table-reveal', tableCount: ballots }
  assert.strictEqual(exchange(counted, actor, peer, 'vote-plan', other), counted)
  const talked = exchange(counted, actor, peer, 'rapport')
  assert.strictEqual(talked.tableCount, ballots)
  assert.notStrictEqual(talked, counted)

  const night = { ...first, phase: 'night' }
  assert.strictEqual(exchange(night, actor, peer, 'question', other), night)
  assert.ok(hasAlliance(exchange(night, actor, peer, 'alliance').social, actor, peer))
  const finale = { ...first, phase: 'final-banishment' }
  assert.strictEqual(exchange(finale, actor, peer, 'vote-plan', other), finale)
  assert.notStrictEqual(exchange(finale, actor, peer, 'question', other), finale)
})

test('alliances persist and each pair can replace one daily vote pact', () => {
  const original = createRun()
  const [actor, peer, first, second] = original.seats.map(({ id }) => id)
  const rapport = exchange(original, peer, actor, 'rapport')
  const allied = exchange(rapport, actor, peer, 'alliance')
  assert.ok(hasAlliance(allied.social, peer, actor))
  assert.strictEqual(exchange(allied, peer, actor, 'alliance'), allied)
  const fundedActor = {
    ...allied,
    socialWallets: recordSocialWallet(allied, actor, { energy: 3, influence: 25, info: 100 }),
  }
  const funded = {
    ...fundedActor,
    socialWallets: recordSocialWallet(fundedActor, peer, { influence: 25, info: 50 }),
  }
  const agreed = exchange(funded, actor, peer, 'vote-plan', first)
  assert.strictEqual(exchange(agreed, peer, actor, 'vote-plan', first), agreed)
  const changed = exchange(agreed, peer, actor, 'vote-plan', second)
  assert.equal(latestPact(changed.social, actor, peer, changed.day).suspectId, second)
  assert.equal(latestPact(changed.social, actor, peer, changed.day + 1), undefined)
  assert.equal(socialWalletFor(changed, actor).energy, 5)
  assert.equal(socialWalletFor(changed, peer).energy, 3)
})

test('second wind and podium Energy are awarded once and saved with the balances', () => {
  const original = createRun()
  const [actor, peer] = original.seats.map(({ id }) => id)
  let run = { ...original, phase: 'immunity' }
  for (let index = 0; index < 4; index++) run = exchange(run, actor, peer, 'rapport')
  const field = run.seats.map(({ id }) => ({
    contestantId: id,
    score: id === actor ? 2 : 1,
    potContribution: 0,
  }))
  const token = commandToken(run)
  const next = resolveChallenge(run, token, field)
  assert.equal(next.phase, 'safety')
  assert.equal(socialWalletFor(next, actor).energy, 11)
  assert.equal(socialWalletFor(next, actor).influence, 27)
  assert.strictEqual(resolveChallenge(next, token, field), next)
  const storage = {
    value: null,
    getItem() {
      return this.value
    },
    setItem(_key, value) {
      this.value = value
    },
  }
  saveRun(storage, 'test', next)
  const restored = restoreRun(storage, 'test')
  assert.equal(restored.status, 'ready')
  assert.deepEqual(restored.run.socialWallets, next.socialWallets)
  saveRun(storage, 'test', { ...original, day: 8, socialWallets: undefined })
  const legacy = restoreRun(storage, 'test').run
  assert.equal(socialWalletFor(legacy, actor).energy, 7)
  assert.equal(socialWalletFor({ ...legacy, day: 9 }, actor).energy, 14)
})

test('asking about a guest gives a private opinion and spends Influence', () => {
  const original = createRun()
  const [actor, peer, subject, witness] = original.seats.map(({ id }) => id)
  let run = exchange(original, actor, peer, 'rapport')
  run = exchange(run, peer, subject, 'rapport')
  run = exchange(run, peer, subject, 'rapport')
  const read = exchange(run, actor, peer, 'ask-about', subject)
  assert.equal(getSocialView(read, actor).at(-1).reaction, 'trusts')
  assert.equal(getSocialView(read, actor).at(-1).suspectId, subject)
  assert.deepEqual(getSocialView(read, witness), [])
  assert.equal(socialWalletFor(read, actor).info, 50)
  assert.equal(socialWalletFor(read, actor).influence, 1)
  assert.strictEqual(exchange(read, actor, peer, 'ask-about', subject), read)
  assert.strictEqual(exchange(run, actor, peer, 'ask-about', peer), run)
})

test('accusing a close ally backfires and mending fences can restore trust', () => {
  const original = createRun()
  const [actor, peer, subject] = original.seats.map(({ id }) => id)
  let run = exchange(original, actor, peer, 'rapport')
  run = exchange(run, peer, subject, 'rapport')
  run = exchange(run, peer, subject, 'alliance')
  run = { ...run, socialWallets: recordSocialWallet(run, actor, { info: 50 }) }
  const accused = exchange(run, actor, peer, 'share-suspicion', subject)
  assert.equal(getSocialView(accused, actor).at(-1).reaction, 'backfired')
  assert.ok(rapport(accused.social, peer, actor) < rapport(run.social, peer, actor))
  assert.ok(hasSocialStrain(accused.social, actor, peer))
  assert.equal(socialWalletFor(accused, actor).info, 25)
  const patched = exchange({ ...accused, phase: 'night' }, actor, peer, 'mend-fences')
  assert.equal(getSocialView(patched, actor).at(-1).reaction, 'repaired')
  assert.ok(rapport(patched.social, actor, peer) > 0)
  assert.ok(!hasSocialStrain(patched.social, actor, peer))
  assert.strictEqual(exchange(patched, actor, peer, 'mend-fences'), patched)
})

test('suspicions and defenses affect the listener’s vote', () => {
  const original = createRun()
  const [actor, listener, subject, alternate, witness] = original.seats.map(({ id }) => id)
  const friendly = exchange(original, actor, listener, 'rapport')
  const funded = {
    ...friendly,
    socialWallets: recordSocialWallet(friendly, actor, { info: 100, influence: 10 }),
  }
  const shared = exchange(funded, actor, listener, 'share-suspicion', subject)
  assert.equal(shared.social.at(-1).reaction, 'landed')
  const defended = exchange(shared, actor, listener, 'defend-guest', subject)
  assert.equal(defended.social.at(-1).reaction, 'landed')
  const vote = (run, actorId, seed) =>
    chooseTarget(
      {
        actorId,
        role: 'loyal',
        teammates: [],
        day: run.day,
        phase: 'round-table',
        seed,
        ownConversations: getSocialView(run, actorId),
        publicTally: {},
        eligibleIds: [subject, alternate],
      },
      'table'
    )
  const seed = Array.from({ length: 40 }, (_, index) => index).find(
    (index) =>
      vote(funded, listener, index) === alternate &&
      vote(shared, listener, index) === subject &&
      vote(defended, listener, index) === alternate
  )
  assert.notEqual(seed, undefined)
  assert.equal(vote(shared, witness, seed), vote(funded, witness, seed))
})

test('a public vote can be debriefed and a trusted finalist shares their intent', () => {
  const original = createRun()
  const [actor, peer, banished] = original.seats.map(({ id }) => id)
  const night = {
    ...original,
    phase: 'night',
    lastTable: { banishedId: banished, tally: { [banished]: 3 }, blind: false, tiedByDraw: true },
  }
  const familiar = exchange(night, actor, peer, 'rapport')
  assert.equal(exchange(familiar, actor, peer, 'debrief').social.at(-1).reaction, 'wary')
  const sealed = { ...familiar, lastTable: { ...familiar.lastTable, blind: true } }
  assert.strictEqual(exchange(sealed, actor, peer, 'debrief'), sealed)
  const ending = { ...familiar, phase: 'end-vote' }
  assert.equal(exchange(ending, actor, peer, 'ask-end').social.at(-1).reaction, 'held-back')
  const trusted = exchange(ending, actor, peer, 'rapport')
  const answer = exchange(trusted, actor, peer, 'ask-end')
  assert.equal(answer.social.at(-1).reaction, intendsToEnd(trusted, peer) ? 'end' : 'banish')
})

test('only a voter’s latest private pact can influence a regular table ballot', () => {
  const common = {
    actorId: 'voter',
    role: 'loyal',
    teammates: [],
    day: 4,
    phase: 'round-table',
    seed: 12,
    eligibleIds: ['first', 'second'],
    publicTally: {},
  }
  const ballot = (ownConversations, changes = {}) =>
    chooseTarget({ ...common, ownConversations, ...changes }, 'table')
  const baseline = ballot([])
  const other = common.eligibleIds.find((id) => id !== baseline)
  const pact = { day: 4, actorId: 'voter', recipientId: 'ally', kind: 'vote-plan', accepted: true }
  const allied = { ...pact, kind: 'alliance' }
  assert.equal(ballot([{ ...pact, actorId: 'bystander', suspectId: other }, allied]), baseline)
  const promised = { ...pact, suspectId: other }
  assert.equal(ballot([allied, promised]), other)
  const replaced = { ...pact, suspectId: baseline }
  assert.equal(ballot([allied, promised, promised, replaced]), baseline)
  assert.equal(ballot([allied, promised], { phase: 'final-banishment' }), baseline)
  assert.equal(ballot([allied, promised], { day: 5 }), ballot([], { day: 5 }))
})

test('NPCs build trust, carry suspicions, and make private vote commitments', () => {
  const original = createRun()
  const actors = original.seats.filter(({ id }) => id !== original.humanId)
  const moves = new Set()
  for (let seed = 1; seed <= 24; seed++) {
    let run = { ...original, publicSeed: seed }
    for (const [index, { id }] of actors.entries()) {
      if (index % 3 === 0) continue
      const partner = actors[(index + 1) % actors.length].id
      run = exchange(run, id, partner, 'rapport')
      if (index % 3 === 1) run = exchange(run, id, partner, 'alliance')
      run = {
        ...run,
        socialWallets: recordSocialWallet(run, id, { influence: 60, info: 80 }),
      }
    }
    const advanced = advanceDayBeat(run)
    assert.equal(advanced.phase, 'immunity')
    assert.deepEqual(advanceDayBeat(run), advanced)
    assert.deepEqual(getSocialView(advanced, run.humanId), [])
    for (const move of advanced.social.slice(run.social.length)) {
      if (move.kind !== 'vote-plan' || move.accepted) moves.add(move.kind)
    }
  }
  for (const expected of ['rapport', 'question', 'share-suspicion', 'vote-plan']) {
    assert.ok(moves.has(expected), 'NPCs should choose ' + expected)
  }
})
