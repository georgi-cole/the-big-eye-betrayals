import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  acknowledgeRole,
  advancePreparation,
  commandToken,
  startRun,
} from '../src/betrayals/run.ts'
import {
  applySocialMove,
  getSocialView,
  hasAlliance,
  latestPact,
  remainingActions,
} from '../src/betrayals/social.ts'
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
  assert.equal(remainingActions(peerReply, actor), 2)

  const nextDay = { ...peerReply, day: peerReply.day + 1 }
  assert.notStrictEqual(exchange(nextDay, actor, peer, 'question', witness), nextDay)
  const voting = { ...peerReply, phase: 'round-table' }
  assert.strictEqual(exchange(voting, actor, peer, 'rapport'), voting)
})

test('alliances persist and each pair can replace one daily vote pact', () => {
  const original = createRun()
  const [actor, peer, first, second] = original.seats.map(({ id }) => id)
  const rapport = exchange(original, peer, actor, 'rapport')
  const allied = exchange(rapport, actor, peer, 'alliance')
  assert.ok(hasAlliance(allied.social, peer, actor))
  assert.strictEqual(exchange(allied, peer, actor, 'alliance'), allied)
  const agreed = exchange(allied, actor, peer, 'vote-plan', first)
  assert.strictEqual(exchange(agreed, peer, actor, 'vote-plan', first), agreed)
  const changed = exchange(agreed, peer, actor, 'vote-plan', second)
  assert.equal(latestPact(changed.social, actor, peer, changed.day).suspectId, second)
  assert.equal(latestPact(changed.social, actor, peer, changed.day + 1), undefined)
  assert.equal(remainingActions(changed, actor), 1)
  assert.equal(remainingActions(changed, peer), 1)
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
