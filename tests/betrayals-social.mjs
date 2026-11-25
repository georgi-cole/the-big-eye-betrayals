import assert from 'node:assert/strict'
import { test } from 'node:test'
import { advanceDayBeat } from '../src/betrayals/daySocial.ts'
import { resolveChallenge } from '../src/betrayals/challenges.ts'
import {
  applyCastleAllianceChange,
  applyGeneralSocialMove,
} from '../src/betrayals/generalSocial.ts'
import { castleAlliances } from '../src/betrayals/allianceRecords.ts'
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
import {
  CASTLE_EXPLORATION_INFO,
  EAVESDROP_INFO,
  rechargeSocialEnergy,
  recordSocialWallet,
  socialWalletFor,
} from '../src/betrayals/socialResources.ts'
import { chooseTarget } from '../src/betrayals/strategy.ts'
import { buildTableBallots, resolveTable } from '../src/betrayals/table.ts'

function createRun(realityMode = 'tv') {
  const run = startRun(
    { id: 'human', name: 'Human' },
    Array.from({ length: 24 }, (_, index) => ({ id: 'ai-' + index, name: 'Player ' + index })),
    { publicMode: false, realityMode },
    { id: 'social', roleSeed: 514, publicSeed: 319 }
  )
  const dawn = acknowledgeRole(run, commandToken(run))
  return advancePreparation(dawn, commandToken(dawn))
}

function exchange(run, actorId, recipientId, kind, suspectId) {
  return applySocialMove(run, commandToken(run), { actorId, recipientId, kind, suspectId })
}

test('the castle actions spend or conserve Energy, improve group rapport, and save with the run', () => {
  const run = createRun()
  const [actor, first, second, outsider] = run.seats.map(({ id }) => id)
  const token = commandToken(run)
  assert.strictEqual(applyGeneralSocialMove(run, token, 'group-chat', [first, first]), run)
  assert.strictEqual(applyGeneralSocialMove(run, token, 'group-chat', [first]), run)
  const group = applyGeneralSocialMove(run, token, 'group-chat', [first, second])
  assert.equal(socialWalletFor(group, actor).energy, socialWalletFor(run, actor).energy - 2)
  assert.equal(socialWalletFor(group, actor).influence, 4)
  assert.ok(rapport(group.social, actor, first) > 0 && rapport(group.social, second, actor) > 0)
  assert.equal(getSocialView(group, outsider).length, 0)
  assert.strictEqual(
    applyGeneralSocialMove(group, commandToken(group), 'group-chat', [first, outsider]),
    group
  )
  assert.strictEqual(applyGeneralSocialMove(group, token, 'lay-low'), group)
  const quiet = applyGeneralSocialMove(group, commandToken(group), 'lay-low')
  assert.deepEqual(socialWalletFor(quiet, actor), socialWalletFor(group, actor))
  const explored = applyGeneralSocialMove(quiet, commandToken(quiet), 'explore-castle')
  assert.equal(socialWalletFor(explored, actor).info, CASTLE_EXPLORATION_INFO)
  assert.equal(socialWalletFor(explored, actor).energy, socialWalletFor(quiet, actor).energy - 1)
  const sealed = { ...explored, phase: 'table-reveal' }
  assert.strictEqual(applyGeneralSocialMove(sealed, commandToken(sealed), 'lay-low'), sealed)
  let raw = ''
  const storage = {
    setItem: (_key, value) => {
      raw = value
    },
    getItem: () => raw,
  }
  saveRun(storage, 'test', explored)
  assert.deepEqual(restoreRun(storage, 'test'), { status: 'ready', run: JSON.parse(raw) })
})

test('trusted guests can agree to a personal pact during preparation', () => {
  const run = createRun()
  const [actor, peer] = run.seats.map(({ id }) => id)
  const bonded = exchange(run, actor, peer, 'rapport')
  const allied = exchange(bonded, actor, peer, 'alliance')
  assert.ok(hasAlliance(allied.social, actor, peer))
  const sealed = { ...bonded, phase: 'round-table' }
  assert.strictEqual(exchange(sealed, actor, peer, 'alliance'), sealed)
})

test('alliance groups require consent, keep advice private, and let the leader manage membership', () => {
  const run = createRun()
  const [actor, first, second, prospect, outsider] = run.seats.map(({ id }) => id)
  const startGroup = (state) =>
    applyGeneralSocialMove(state, commandToken(state), 'found-alliance', [first, second])
  const refused = startGroup(run)
  assert.deepEqual(refused.social.at(-1).declinedIds, [first, second])
  assert.equal(castleAlliances(refused.social).length, 0)
  assert.equal(getSocialView(refused, first).length, 0)
  let ready = [first, second, prospect].reduce(
    (state, guest) => exchange(state, actor, guest, 'rapport'),
    run
  )
  ready = exchange(ready, first, prospect, 'rapport')
  const group = startGroup(ready)
  const [{ id }] = castleAlliances(group.social)
  assert.ok(hasAlliance(getSocialView(group, second), first, second))
  assert.ok(!getSocialView(group, outsider).some((entry) => entry.alliance))
  const consult = (state) =>
    applyGeneralSocialMove(state, commandToken(state), 'consult-alliance', [], {
      allianceId: id,
      subjectId: outsider,
    })
  const advice = consult(group)
  assert.equal(advice.social.filter(({ kind }) => kind === 'consult-alliance').length, 2)
  assert.ok(!getSocialView(advice, outsider).length)
  const table = { ...group, phase: 'round-table' }
  assert.strictEqual(consult(table), table)
  assert.strictEqual(startGroup({ ...table }).social, table.social)
  const renamed = applyCastleAllianceChange(
    advice,
    commandToken(advice),
    id,
    'rename',
    'The Gallery'
  )
  assert.equal(castleAlliances(renamed.social)[0].name, 'The Gallery')
  const joined = applyCastleAllianceChange(renamed, commandToken(renamed), id, 'invite', prospect)
  assert.ok(hasAlliance(getSocialView(joined, prospect), prospect, second))
  const removed = applyCastleAllianceChange(joined, commandToken(joined), id, 'remove', second)
  assert.ok(!hasAlliance(getSocialView(removed, second), actor, second))
  assert.ok(hasAlliance(removed.social, actor, first))
  const dissolved = applyCastleAllianceChange(removed, commandToken(removed), id, 'dissolve')
  assert.equal(castleAlliances(getSocialView(dissolved, first)).length, 0)
})

test('Eavesdrop records uncertain intel and never exposes a private shield handoff', () => {
  const run = createRun()
  const [actor, first, second, subject] = run.seats.map(({ id }) => id)
  const sealed = { ...run, phase: 'round-table' }
  assert.strictEqual(applyGeneralSocialMove(sealed, commandToken(sealed), 'eavesdrop'), sealed)
  const onlyShield = {
    ...run,
    social: [{ day: run.day, actorId: first, recipientId: second, kind: 'shield-gift' }],
  }
  const quiet = applyGeneralSocialMove(onlyShield, commandToken(onlyShield), 'eavesdrop')
  assert.equal(quiet.social.at(-1).suspectId, undefined)
  const whisper = {
    day: run.day,
    actorId: first,
    recipientId: second,
    kind: 'question',
    suspectId: subject,
  }
  const outcomes = Array.from({ length: 20 }, (_, publicSeed) => {
    const pending = { ...run, publicSeed, social: [whisper] }
    return applyGeneralSocialMove(pending, commandToken(pending), 'eavesdrop')
  })
  assert.ok(
    outcomes.some(
      (outcome) =>
        outcome.social.at(-1).suspectId === subject &&
        socialWalletFor(outcome, actor).info === EAVESDROP_INFO
    )
  )
})

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

test('private vote plans close at the Round Table and only target publicly eligible guests', () => {
  const original = createRun()
  const [actor, peer, immune, shielded, hiddenShield, other] = original.seats.map(({ id }) => id)
  const first = exchange(original, actor, peer, 'rapport')
  const table = {
    ...first,
    phase: 'safety',
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
  assert.equal(socialWalletFor(planned, actor).influence, 31)
  assert.equal(socialWalletFor(planned, actor).info, 50)
  const atTable = { ...planned, phase: 'round-table' }
  assert.strictEqual(exchange(atTable, actor, peer, 'vote-plan', other), atTable)

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
  assert.strictEqual(exchange(night, actor, peer, 'alliance'), night)
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
  assert.equal(next.phase, 'after-immunity')
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

for (const preset of ['off', 'casual', 'tv', 'adult']) {
  test('the first day funds a vote plan outside the podium with the ' + preset + ' preset', () => {
    let run = createRun(preset)
    const [actor, peer, suspect] = run.seats.map(({ id }) => id)
    for (let step = 0; step < 4; step++) run = exchange(run, actor, peer, 'rapport')
    run = exchange(run, actor, peer, 'question', suspect)
    assert.equal(socialWalletFor(run, actor).influence, 13)
    assert.equal(socialWalletFor(run, actor).info, 100)
    const immunity = { ...run, phase: 'immunity' }
    const standings = immunity.seats.map(({ id }) => ({
      contestantId: id,
      score: id === actor ? 0 : 1,
      potContribution: 0,
    }))
    run = resolveChallenge(immunity, commandToken(immunity), standings)
    assert.equal(socialWalletFor(run, actor).energy, preset === 'off' ? 3 : 4)
    const planned = exchange(run, actor, peer, 'vote-plan', suspect)
    assert.equal(latestPact(planned.social, actor, peer, run.day)?.suspectId, suspect)
    assert.deepEqual(socialWalletFor(planned, actor), {
      day: 1,
      energy: 1,
      energySpent: preset === 'off' ? 7 : 9,
      influence: 1,
      info: 50,
    })
    const table = {
      ...planned,
      phase: 'round-table',
      socialWallets: recordSocialWallet(planned, actor, { energy: -1, influence: -1, info: -50 }),
    }
    const counted = resolveTable(table, commandToken(table), buildTableBallots(table, suspect))
    assert.notStrictEqual(counted, table)
    assert.deepEqual(socialWalletFor(counted, actor), socialWalletFor(table, actor))
  })
}

test('a held-back answer charges only the listed Energy and Influence', () => {
  const original = createRun()
  const [actor, peer, suspect] = original.seats.map(({ id }) => id)
  const funded = {
    ...original,
    socialWallets: recordSocialWallet(original, actor, { influence: 5 }),
  }
  const read = exchange(funded, actor, peer, 'ask-about', suspect)
  assert.equal(read.social.at(-1).reaction, 'held-back')
  assert.deepEqual(socialWalletFor(read, actor), {
    day: 1,
    energy: 6,
    energySpent: 1,
    influence: 3,
    info: 0,
  })
})

test('rewarded recharge adds exactly six Energy to the exhausted season wallet', () => {
  const original = createRun()
  const { humanId: actor } = original
  const ready = {
    ...original,
    socialWallets: recordSocialWallet(original, actor, { energy: -7, influence: 5, info: 25 }, 7),
  }
  const recharged = rechargeSocialEnergy(ready)
  assert.deepEqual(socialWalletFor(recharged, actor), {
    day: 1,
    energy: 6,
    energySpent: 7,
    influence: 5,
    info: 25,
  })
  assert.strictEqual(rechargeSocialEnergy(recharged), recharged)
  const finished = { ...ready, phase: 'settled' }
  assert.strictEqual(rechargeSocialEnergy(finished), finished)
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
