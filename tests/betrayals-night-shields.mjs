import assert from 'node:assert/strict'
import test from 'node:test'
import {
  challengeContestantIds,
  resolveChallenge,
  safetyResultsFor,
} from '../src/betrayals/challenges.ts'
import { getIncomingInteractions, respondToIncomingInteraction } from '../src/betrayals/incoming.ts'
import { getConclaveView, nightTargets, resolveNight, revealDawn } from '../src/betrayals/night.ts'
import { nightShieldReads, shieldReplyFor } from '../src/betrayals/nightShields.ts'
import { restoreRun, saveRun } from '../src/betrayals/persistence.ts'
import { commandToken, startRun, viewFor } from '../src/betrayals/run.ts'
import { applySocialMove, getSocialView, rapport } from '../src/betrayals/social.ts'
import { socialWalletFor } from '../src/betrayals/socialResources.ts'
import { finishShieldConversations } from '../src/betrayals/shieldSocial.ts'
import { chooseTarget, resolutionPerspective } from '../src/betrayals/strategy.ts'
import { resolveTable, revealTable, tableTargets } from '../src/betrayals/table.ts'

const started = startRun(
  { id: 'human', name: 'Human' },
  Array.from({ length: 24 }, (_, i) => ({ id: `npc-${i}`, name: `Guest ${i}` })),
  { publicMode: false, realityMode: 'off' },
  { id: 'night-shields', roleSeed: 83, publicSeed: 391 }
)
const [human, winner, betrayer, ally, immune, outsider, teammate, thirdBetrayer] =
  started.seats.map(({ id }) => id)

function table(owners = [human, winner]) {
  return {
    ...started,
    phase: 'round-table',
    immunityId: immune,
    private: {
      ...started.private,
      betrayers: [betrayer, teammate, thirdBetrayer],
      nightShieldIds: owners,
    },
  }
}

function speak(run, actorId, recipientId, kind, suspectId) {
  return applySocialMove(run, commandToken(run), { actorId, recipientId, kind, suspectId })
}

function trust(actorId, recipientId) {
  return [
    { day: 1, actorId, recipientId, kind: 'alliance', accepted: true },
    { day: 1, actorId, recipientId, kind: 'rapport' },
  ]
}

function reload(run) {
  let value
  const storage = {
    getItem: () => value,
    setItem: (_key, data) => {
      value = data
    },
  }
  saveRun(storage, 'profile', run)
  const restored = restoreRun(storage, 'profile')
  assert.equal(restored.status, 'ready')
  return restored.run
}

function banish(run, targetId) {
  const ballots = run.seats.flatMap(({ id: voterId }) => {
    const targets = tableTargets(run, voterId)
    if (!targets.length) return []
    return [{ voterId, targetId: targets.includes(targetId) ? targetId : targets[0] }]
  })
  const locked = resolveTable(run, commandToken(run), ballots)
  assert.equal(locked.phase, 'table-reveal')
  assert.strictEqual(speak(locked, human, ally, 'shield-gift'), locked)
  return revealTable(locked, commandToken(locked))
}

test('shield transfers conserve both awards and allow stacking, passing on and returning a gift', () => {
  const run = table()
  assert.strictEqual(speak(run, human, human, 'shield-gift'), run)
  assert.strictEqual(speak(run, ally, human, 'shield-gift'), run)
  assert.strictEqual(speak(run, human, 'missing', 'shield-gift'), run)
  const out = {
    ...run,
    seats: run.seats.map((seat) =>
      seat.id === ally ? { ...seat, exit: { cause: 'banished', day: 1 } } : seat
    ),
  }
  assert.strictEqual(speak(out, human, ally, 'shield-gift'), out)

  const stacked = speak(run, human, winner, 'shield-gift')
  assert.equal(viewFor(stacked, human).nightShieldCount, 0)
  assert.equal(viewFor(stacked, winner).nightShieldCount, 2)
  assert.deepEqual(socialWalletFor(stacked, human), socialWalletFor(run, human))
  assert.equal(viewFor(reload(stacked), winner).nightShieldCount, 2)
  assert.strictEqual(
    applySocialMove(stacked, commandToken(run), {
      actorId: winner,
      recipientId: ally,
      kind: 'shield-gift',
    }),
    stacked
  )

  const returned = speak(stacked, winner, human, 'shield-gift')
  const roundTrip = speak(returned, human, winner, 'shield-gift')
  assert.equal(rapport(roundTrip.social, winner, human), rapport(stacked.social, winner, human))
  const toImmune = speak(roundTrip, winner, immune, 'shield-gift')
  assert.equal(viewFor(toImmune, immune).nightShieldCount, 1)
  assert.ok(!tableTargets(toImmune, winner).includes(immune))
  assert.equal(viewFor(speak(toImmune, immune, ally, 'shield-gift'), ally).nightShieldCount, 1)
})

test('handoffs stay private and the standings and teammate badges reflect who originally won', () => {
  const run = table([human, winner])
  run.private.betrayers = [winner, betrayer, teammate]
  run.private.safetyStandings = {
    day: 1,
    rows: [
      { contestantId: human, score: 12 },
      { contestantId: winner, score: 10 },
      { contestantId: ally, score: 8 },
    ],
  }
  const passed = speak(run, winner, ally, 'shield-gift')
  assert.deepEqual(viewFor(passed, betrayer), viewFor(run, betrayer))
  assert.deepEqual(viewFor(passed, outsider), viewFor(run, outsider))
  assert.deepEqual(viewFor(passed, null), viewFor(run, null))
  assert.deepEqual(safetyResultsFor(passed, betrayer), safetyResultsFor(run, betrayer))
  assert.equal(nightShieldReads(passed, betrayer).size, 0)
  assert.equal(getSocialView(passed, ally)[0].kind, 'shield-gift')
  assert.equal(getSocialView(passed, betrayer).length, 0)
  const onward = speak(passed, ally, outsider, 'shield-gift')
  assert.deepEqual(nightShieldReads(onward, winner), nightShieldReads(passed, winner))
})

test('public awards inform Night strategy without revealing later owners', () => {
  const run = table()
  run.private.safetyStandings = {
    day: 1,
    publicResults: true,
    rows: [
      { contestantId: human, score: 12 },
      { contestantId: winner, score: 10 },
      { contestantId: ally, score: 8 },
    ],
  }
  const passed = reload(speak(run, human, ally, 'shield-gift'))
  const question = (state) =>
    getIncomingInteractions(state).find(({ kind }) => kind === 'shield-question')
  assert.match(question(run).text, /\b(won|win)\b/)
  assert.deepEqual(question(passed), question(run))
  assert.deepEqual(viewFor(passed, outsider).knownNightShieldIds, [human, winner])
  assert.deepEqual(viewFor(passed, null), viewFor(run, null))
  assert.equal(viewFor(passed, human).nightShieldCount, 0)
  assert.equal(viewFor(passed, ally).nightShieldCount, 1)
  assert.deepEqual(safetyResultsFor(passed, null), safetyResultsFor(run, null))
  assert.deepEqual(nightShieldReads(passed, outsider), nightShieldReads(run, outsider))
  assert.ok(nightShieldReads(passed, outsider).get(human).protected > 0)
  assert.equal(nightShieldReads(passed, outsider).has(ally), false)
  assert.ok(
    nightShieldReads(passed, ally).get(human).protected <
      nightShieldReads(passed, outsider).get(human).protected
  )

  const night = { ...passed, phase: 'night' }
  assert.ok(nightTargets(night, betrayer).includes(human))
  const perspective = resolutionPerspective(night, betrayer, [human, ally])
  assert.equal(chooseTarget(perspective, 'night'), ally)
  assert.deepEqual(viewFor({ ...passed, day: 2 }, outsider).knownNightShieldIds, [])
  assert.equal(nightShieldReads({ ...passed, day: 2 }, outsider).size, 0)
})

test('contradictions strain trust, only firsthand reports can travel, and old claims expire', () => {
  const run = { ...table([winner, ally]), social: trust(human, betrayer) }
  const claimed = speak(run, human, betrayer, 'shield-claim')
  assert.equal(viewFor(claimed, human).hasNightShield, false)
  const tipped = speak(claimed, betrayer, teammate, 'shield-tip', human)
  assert.equal(tipped.social.at(-1).shieldReply, 'has')
  assert.ok(
    nightShieldReads(tipped, teammate).get(human).protected <
      nightShieldReads(tipped, betrayer).get(human).protected
  )
  assert.strictEqual(speak(tipped, teammate, outsider, 'shield-tip', human), tipped)
  assert.equal(nightShieldReads(tipped, outsider).size, 0)

  const contradicted = speak(tipped, human, betrayer, 'shield-deny')
  assert.equal(contradicted.social.at(-1).reaction, 'backfired')
  assert.equal(nightShieldReads(contradicted, betrayer).get(human).conflicting, true)
  assert.ok(rapport(contradicted.social, betrayer, human) < rapport(tipped.social, betrayer, human))
  assert.equal(nightShieldReads({ ...contradicted, day: 2 }, betrayer).size, 0)
})

test('more trust raises the chance of truthful answers for both holders and nonholders', () => {
  for (const held of [true, false]) {
    const base = table(held ? [betrayer, ally] : [winner, ally])
    const truth = held ? 'has' : 'none'
    let moreHonest = 0
    for (let publicSeed = 0; publicSeed < 160; publicSeed++) {
      const wary = { ...base, publicSeed }
      const close = { ...wary, social: trust(human, betrayer) }
      const waryReply = shieldReplyFor(wary, betrayer, human)
      const entry = speak(close, human, betrayer, 'ask-shield').social.at(-1)
      if (waryReply === truth) assert.equal(entry.shieldReply, truth)
      if (waryReply !== truth && entry.shieldReply === truth) moreHonest++
    }
    assert.ok(moreHonest > 20)
  }
})

test('a denial followed by a real handoff can surprise or unsettle the recipient', () => {
  const base = table()
  const reactions = new Set()
  for (let publicSeed = 0; publicSeed < 40; publicSeed++) {
    const run = { ...base, publicSeed }
    const denied = speak(run, human, ally, 'shield-deny')
    const received = speak(denied, human, ally, 'shield-gift')
    const expected = speak(speak(run, human, ally, 'shield-claim'), human, ally, 'shield-gift')
    const { reaction } = received.social.at(-1)
    reactions.add(reaction)
    assert.ok(viewFor(received, ally).hasNightShield)
    assert.equal(nightShieldReads(received, ally).has(human), false)
    assert.equal(expected.social.at(-1).reaction, undefined)
    if (reaction === 'backfired') {
      assert.ok(rapport(received.social, ally, human) < rapport(expected.social, ally, human))
    }
  }
  assert.deepEqual(reactions, new Set(['uncertain', 'backfired']))
})

test('loyal confidences can reach the Conclave as hearsay and change another Betrayer’s nomination', () => {
  const base = table([winner, ally])
  base.private.betrayers = [human, betrayer, teammate]
  const [subject, loyal] = [winner, ally]
  const name = (id) => base.seats.find((seat) => seat.id === id).name
  const notes = [...trust(loyal, betrayer), ...trust(subject, loyal)]
  let heard = 0
  let changed = 0
  for (let publicSeed = 0; publicSeed < 160; publicSeed++) {
    const run = { ...base, publicSeed, social: notes }
    const claim = speak(run, subject, loyal, 'shield-claim')
    const shared = finishShieldConversations(claim)
    const night = { ...shared, phase: 'night' }
    const view = getConclaveView(night, human)
    if (!view.shieldBriefing.some(({ argument }) => argument.includes('secondhand'))) continue
    heard++
    assert.equal(getConclaveView(night, loyal), null)
    assert.ok(view.shieldBriefing.every(({ speakerName }) => speakerName !== name(loyal)))
    const otherNominee = (v) =>
      v.proposals.find(({ speakerName }) => speakerName === name(teammate)).nomineeName
    if (otherNominee(view) !== otherNominee(getConclaveView({ ...run, phase: 'night' }, human)))
      changed++
  }
  assert.ok(heard > 0)
  assert.ok(changed > 0)
})

test('credible bluffs can change nominations, while real protection and hidden handoffs stay separate', () => {
  const base = { ...table([winner, ally]), social: trust(human, betrayer) }
  const bluff = speak(base, human, betrayer, 'shield-claim')
  const denial = speak(
    { ...base, private: { ...base.private, nightShieldIds: [human, ally] } },
    human,
    betrayer,
    'shield-deny'
  )
  const validIds = [human, outsider]
  const choose = (run, publicSeed) =>
    chooseTarget(
      resolutionPerspective({ ...run, publicSeed, phase: 'night' }, betrayer, validIds),
      'night'
    )
  let bluffsThatWorked = 0
  let denialsThatWorked = 0
  for (let seed = 0; seed < 32; seed++) {
    const selected = choose(base, seed)
    if (selected === human && choose(bluff, seed) === outsider) bluffsThatWorked++
    if (selected === outsider && choose(denial, seed) === human) denialsThatWorked++
    assert.equal(
      choose({ ...base, private: { ...base.private, nightShieldIds: [human, outsider] } }, seed),
      selected
    )
  }
  assert.ok(bluffsThatWorked > 0)
  assert.ok(denialsThatWorked > 0)

  for (const [run, blocked] of [
    [bluff, false],
    [denial, true],
  ]) {
    const night = { ...run, phase: 'night' }
    const attempt = resolveNight(
      night,
      commandToken(night),
      night.private.betrayers.map((voterId) => ({ voterId, targetId: human }))
    )
    assert.equal(attempt.private.pendingNight.blocked, blocked)
    const dawn = reload(revealDawn(attempt, commandToken(attempt)))
    assert.equal(dawn.lastDawn.eliminatedId, blocked ? null : human)
    assert.equal(dawn.private.lastShieldSave?.id, blocked ? human : undefined)
    assert.deepEqual(dawn.private.nightShieldIds, [])
    assert.equal(viewFor(dawn, human).hasNightShield, false)
  }
})

test('the actual receiver is protected at Night, and banishing a receiver discards their shields', () => {
  const run = table([human, ally])
  const gifted = speak(run, human, ally, 'shield-gift')
  assert.ok(tableTargets(gifted, human).includes(ally))
  const night = banish(gifted, human)
  assert.deepEqual(night.private.nightShieldIds, [ally, ally])
  assert.ok(!nightTargets(night, betrayer).includes(teammate))
  assert.ok(!nightTargets(night, betrayer).includes(immune))
  const protectedNight = resolveNight(
    night,
    commandToken(night),
    night.private.betrayers.map((voterId) => ({ voterId, targetId: ally }))
  )
  assert.equal(protectedNight.private.pendingNight.blocked, true)
  assert.equal(revealDawn(protectedNight, commandToken(protectedNight)).lastDawn.eliminatedId, null)
  const lost = banish(gifted, ally)
  assert.deepEqual(lost.private.nightShieldIds, [])
  assert.strictEqual(speak(lost, human, outsider, 'shield-deny'), lost)
  assert.strictEqual(
    speak({ ...gifted, runoffIds: [ally, outsider] }, ally, human, 'shield-gift').private,
    gifted.private
  )
})

test('a shield gift closes direct shield talk with that recipient for the day', () => {
  const run = table()
  const prompt = getIncomingInteractions(run).find(({ kind }) => kind === 'shield-question')
  const recipient = prompt.speaker.id
  const thirdGuest = run.seats.find(({ id }) => id !== human && id !== recipient).id
  const gifted = speak(run, human, recipient, 'shield-gift')
  for (const kind of ['shield-claim', 'shield-deny', 'ask-shield']) {
    assert.strictEqual(speak(gifted, human, recipient, kind), gifted)
    assert.notStrictEqual(speak(gifted, human, thirdGuest, kind), gifted)
  }
  const nextDay = { ...gifted, day: 2 }
  assert.notStrictEqual(speak(nextDay, human, recipient, 'shield-claim'), nextDay)
  assert.ok(!getIncomingInteractions(gifted).some(({ id }) => id === prompt.id))
  assert.strictEqual(
    respondToIncomingInteraction(gifted, commandToken(gifted), prompt.id, 'engage'),
    gifted
  )
})

test('Inbox questions are stable and replies, gifts and dismissal survive a reload', () => {
  const run = table([winner, ally])
  const question = (state) =>
    getIncomingInteractions(state).find(({ kind }) => kind === 'shield-question')
  const prompt = question(run)
  const gifted = speak(run, winner, human, 'shield-gift')
  assert.deepEqual(question(gifted), prompt)
  const receipt = getIncomingInteractions(gifted).find(({ kind }) => kind === 'shield-gift')
  assert.equal(receipt.speaker.id, winner)
  assert.equal(viewFor(gifted, human).hasNightShield, true)
  const passed = speak(gifted, human, ally, 'shield-gift')
  assert.equal(viewFor(passed, human).hasNightShield, false)
  const dismissed = respondToIncomingInteraction(
    passed,
    commandToken(passed),
    receipt.id,
    'dismiss'
  )
  assert.deepEqual(passed.private, dismissed.private)
  assert.equal(
    getIncomingInteractions(reload(dismissed)).find(({ id }) => id === receipt.id).response,
    'dismiss'
  )
  for (const [answer, claim] of [
    ['engage', 'has'],
    ['listen', 'none'],
    ['dismiss', 'private'],
  ]) {
    const replied = respondToIncomingInteraction(
      dismissed,
      commandToken(dismissed),
      prompt.id,
      answer
    )
    assert.equal(replied.social.at(-1).shieldReply, claim)
    assert.equal(question(reload(replied)).response, answer)
    assert.strictEqual(
      respondToIncomingInteraction(replied, commandToken(replied), prompt.id, answer),
      replied
    )
    assert.equal(question({ ...replied, phase: 'night' }), undefined)
  }
})

test('NPCs sometimes give or keep their awards, and can pass on a gift or a tip before voting', () => {
  const safety = {
    ...table([]),
    phase: 'safety',
    social: [...trust(winner, human), ...trust(immune, ally), ...trust(betrayer, teammate)],
  }
  const scores = challengeContestantIds(safety).map((contestantId) => ({
    contestantId,
    score: contestantId === winner ? 3 : contestantId === outsider ? 2 : 1,
    potContribution: 0.5,
  }))
  const choices = new Set()
  const late = new Set()
  for (let publicSeed = 0; publicSeed < 32; publicSeed++) {
    const challenge = { ...safety, publicSeed }
    const won = resolveChallenge(challenge, commandToken(challenge), scores)
    assert.equal(won.private.nightShieldIds.length, 2)
    assert.deepEqual(won, resolveChallenge(challenge, commandToken(challenge), scores))
    choices.add(viewFor(won, human).hasNightShield ? 'gifted' : 'kept')

    let round = { ...table(), publicSeed, social: safety.social }
    round = speak(round, human, immune, 'shield-gift')
    round = speak(round, human, betrayer, 'shield-claim')
    const night = banish(round, outsider)
    if (
      night.social.some(
        ({ kind, actorId, recipientId }) =>
          kind === 'shield-gift' && actorId === immune && recipientId === ally
      )
    )
      late.add('regift')
    if (
      night.social.some(
        ({ kind, actorId, recipientId, suspectId }) =>
          kind === 'shield-tip' &&
          actorId === betrayer &&
          recipientId === teammate &&
          suspectId === human
      )
    )
      late.add('tip')
  }
  assert.deepEqual(choices, new Set(['gifted', 'kept']))
  assert.deepEqual(late, new Set(['regift', 'tip']))
})
