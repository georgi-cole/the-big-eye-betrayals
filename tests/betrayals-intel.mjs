import assert from 'node:assert/strict'
import { test } from 'node:test'
import { askWitness, incidentPressure, leadForPlayer } from '../src/betrayals/intel.ts'
import { restoreRun, saveRun } from '../src/betrayals/persistence.ts'
import { commandToken, startRun } from '../src/betrayals/run.ts'
import { getSocialView, hasSocialStrain, settleVotePacts } from '../src/betrayals/social.ts'
import { socialWalletFor } from '../src/betrayals/socialResources.ts'
import {
  buildTableBallots,
  recordTableSway,
  resolveTable,
  revealTable,
  tableDiscussion,
} from '../src/betrayals/table.ts'

function scene() {
  const playable = ['ash', 'ivy', 'mimi', 'finn', 'nova', 'rae']
  const guests = [...playable, ...Array.from({ length: 18 }, (_, i) => 'out-' + i)].map((id) => ({
    id,
    name: id[0].toUpperCase() + id.slice(1),
  }))
  const initial = startRun(
    { id: 'human', name: 'Player' },
    guests,
    { publicMode: false, realityMode: 'tv' },
    { id: 'witness-replay', roleSeed: 1, publicSeed: 12 }
  )
  const pact = (actorId, recipientId, suspectId) => ({
    day: 8,
    actorId,
    recipientId,
    suspectId,
    kind: 'vote-plan',
    accepted: true,
  })
  return {
    ...initial,
    phase: 'round-table',
    day: 8,
    publicSeed: 7,
    seats: initial.seats.map((seat) =>
      playable.includes(seat.id) || seat.id === 'human'
        ? seat
        : { ...seat, exit: { cause: 'night', day: 7 } }
    ),
    private: { ...initial.private, betrayers: ['ash', 'out-0', 'out-1'] },
    witnessLead: {
      day: 8,
      suspectId: 'ash',
      pitchId: 'ivy',
      sourceId: 'mimi',
      witnessId: 'finn',
      relayId: 'nova',
    },
    lastTable: { banishedId: 'out-0', blind: false, tally: { ash: 2, ivy: 3 }, tiedByDraw: false },
    social: [pact('finn', 'nova', 'ivy'), pact('ivy', 'mimi', 'ash'), pact('ash', 'nova', 'ivy')],
  }
}

function reload(run) {
  const data = new Map()
  const storage = { setItem: (key, value) => data.set(key, value), getItem: (key) => data.get(key) }
  saveRun(storage, 'test', run)
  const restored = restoreRun(storage, 'test')
  assert.equal(restored.status, 'ready')
  return restored.run
}

function present(run, evidence) {
  return recordTableSway(run, commandToken(run), { targetId: 'ash', tone: 'careful', evidence })
}

test('corroboration and exposing a confidence settle the same close Round Table differently', () => {
  const initial = scene()
  assert.equal(present(initial, 'call-witness'), initial)
  const asked = reload(askWitness(initial, commandToken(initial)))
  assert.equal(leadForPlayer(asked).promised, true)
  assert.equal(socialWalletFor(asked, 'human').energy, socialWalletFor(initial, 'human').energy - 1)
  assert.equal(askWitness(asked, commandToken(initial)), asked)
  assert.equal(askWitness(asked, commandToken(asked)), asked)

  const confirmed = reload(present(asked, 'call-witness'))
  const exposed = reload(present(initial, 'name-source'))
  const a = buildTableBallots(confirmed, 'ash')
  const b = buildTableBallots(exposed, 'ash')
  assert.deepEqual(
    a.filter((ballot, index) => ballot.targetId !== b[index].targetId),
    [{ voterId: 'rae', targetId: 'ash' }]
  )
  assert.ok(a.some(({ voterId, targetId }) => voterId === 'finn' && targetId === 'ivy'))
  assert.ok(
    tableDiscussion(confirmed).some(
      ({ speakerId, argument }) => speakerId === 'finn' && argument.includes('I was there.')
    )
  )
  assert.ok(
    tableDiscussion(exposed).some(
      ({ speakerId, argument }) => speakerId === 'mimi' && argument.includes('in confidence')
    )
  )
  const counted = resolveTable(confirmed, commandToken(confirmed), a)
  assert.deepEqual(counted.private.pendingTable.tally, { ash: 4, ivy: 3 })
  assert.equal(revealTable(reload(counted), commandToken(counted)).lastTable.banishedId, 'ash')
  const alternate = resolveTable(exposed, commandToken(exposed), b)
  assert.deepEqual(alternate.private.pendingTable.tally, { ash: 3, ivy: 4 })
  assert.equal(revealTable(reload(alternate), commandToken(alternate)).lastTable.banishedId, 'ivy')
  assert.equal(hasSocialStrain(getSocialView(exposed, 'mimi'), 'mimi', 'human'), true)
  assert.equal(hasSocialStrain(getSocialView(exposed, 'rae'), 'rae', 'human'), false)
})

test('one pitch has one source chain and guesses cannot read private evidence or roles', () => {
  const initial = scene()
  assert.equal(incidentPressure(initial, 'rae').size, 0)
  assert.equal(incidentPressure(initial, 'nova').size, 1)
  assert.ok(
    incidentPressure(initial, 'mimi').get('ash') > incidentPressure(initial, 'nova').get('ash')
  )
  const swap = {
    ...initial,
    private: { ...initial.private, betrayers: ['finn', 'out-0', 'out-1'] },
  }
  assert.deepEqual(
    buildTableBallots(initial, 'ash').find(({ voterId }) => voterId === 'rae'),
    buildTableBallots(swap, 'ash').find(({ voterId }) => voterId === 'rae')
  )
  const shielded = { ...initial, publicShield: { id: 'ash', day: initial.day } }
  assert.equal(present(shielded, 'name-source'), shielded)
})

test('ballots settle visible promises, including a pivot and an invalidated target', () => {
  const run = scene()
  const ballots = buildTableBallots(run, 'ash')
  const changed = ballots.map((ballot) =>
    ballot.voterId === 'finn' ? { ...ballot, targetId: 'ash' } : ballot
  )
  const pact = settleVotePacts(run, changed)[0]
  assert.deepEqual(pact.pledgeResult, { actor: false, recipient: true })
  const shielded = { ...run, publicShield: { id: 'ivy', day: run.day } }
  assert.equal(settleVotePacts(shielded, changed)[0].pledgeResult, 'void')
})

test('verified evidence helps on an opening table while leaving room for competing votes', () => {
  const guests = Array.from({ length: 24 }, (_, index) => ({
    id: 'guest-' + index,
    name: 'Guest ' + index,
  }))
  const wins = { witness: 0, quiet: 0 }
  for (let seed = 1; seed <= 100; seed++) {
    const initial = startRun(
      { id: 'player', name: 'Player' },
      guests,
      { publicMode: false, realityMode: 'tv' },
      { id: 'opening-table', roleSeed: seed * 13, publicSeed: seed }
    )
    const [, suspect, pitch, source, witness, relay] = initial.seats
    const run = {
      ...initial,
      phase: 'round-table',
      witnessLead: {
        day: 1,
        suspectId: suspect.id,
        pitchId: pitch.id,
        sourceId: source.id,
        witnessId: witness.id,
        relayId: relay.id,
      },
    }
    const ready = askWitness(run, commandToken(run))
    const confirmed = recordTableSway(ready, commandToken(ready), {
      targetId: suspect.id,
      tone: 'careful',
      evidence: 'call-witness',
    })
    for (const [branch, scene] of Object.entries({ witness: confirmed, quiet: ready })) {
      const tally = new Map()
      for (const { targetId } of buildTableBallots(scene, suspect.id)) {
        tally.set(targetId, (tally.get(targetId) ?? 0) + 1)
      }
      const votes = tally.get(suspect.id)
      if ([...tally].every(([id, count]) => id === suspect.id || count < votes)) wins[branch]++
    }
  }
  assert.ok(wins.witness > wins.quiet)
  assert.ok(wins.witness < 85)
})
