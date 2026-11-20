import assert from 'node:assert/strict'
import test from 'node:test'
import { getIncomingInteractions, respondToIncomingInteraction } from '../src/betrayals/incoming.ts'
import { restoreRun, saveRun } from '../src/betrayals/persistence.ts'
import { commandToken, startRun } from '../src/betrayals/run.ts'
import { getSocialView } from '../src/betrayals/social.ts'
import { socialWalletFor } from '../src/betrayals/socialResources.ts'
import { recordTableSway } from '../src/betrayals/table.ts'

const human = { id: 'you', name: 'You' }
const cast = Array.from({ length: 24 }, (_, index) => ({
  id: 'guest-' + index,
  name: 'Guest ' + index,
}))

function season(phase = 'social', realityMode = 'off') {
  return {
    ...startRun(
      human,
      cast,
      { publicMode: false, realityMode },
      {
        id: 'incoming',
        publicSeed: 953,
        roleSeed: 813,
      }
    ),
    phase,
  }
}

test('an accepted confidence updates private rapport without using a move or allowing duplicate replies', () => {
  const run = season()
  const [encounter] = getIncomingInteractions(run)
  assert.equal(encounter.kind, 'confidence')
  const next = respondToIncomingInteraction(run, commandToken(run), encounter.id, 'engage')
  assert.deepEqual(getSocialView(next, run.humanId), [
    {
      day: 1,
      actorId: encounter.speaker.id,
      recipientId: run.humanId,
      kind: 'rapport',
    },
  ])
  assert.deepEqual(socialWalletFor(next, run.humanId), socialWalletFor(run, run.humanId))
  assert.deepEqual(getIncomingInteractions(next), [{ ...encounter, response: 'engage' }])
  assert.equal(respondToIncomingInteraction(next, commandToken(next), encounter.id, 'engage'), next)
  assert.equal(respondToIncomingInteraction(next, commandToken(run), encounter.id, 'dismiss'), next)
})

test('table approaches exclude protected targets and stop once debate closes', () => {
  const initial = season('round-table')
  const guess = getIncomingInteractions(initial)[0].target.id
  const run = { ...initial, immunityId: guess }
  const [encounter] = getIncomingInteractions(run)
  assert.equal(encounter.kind, 'vote-plan')
  assert.notEqual(encounter.target.id, guess)

  const listened = respondToIncomingInteraction(run, commandToken(run), encounter.id, 'listen')
  assert.equal(getSocialView(listened, run.humanId)[0].kind, 'question')
  const pledged = respondToIncomingInteraction(run, commandToken(run), encounter.id, 'engage')
  assert.equal(getSocialView(pledged, run.humanId)[0].accepted, true)

  const closed = recordTableSway(run, commandToken(run), null)
  assert.deepEqual(getIncomingInteractions(closed), [])
  assert.equal(
    respondToIncomingInteraction(closed, commandToken(closed), encounter.id, 'engage'),
    closed
  )
})

test('incoming encounters survive a save and never depend on undisclosed roles or Night Shields', () => {
  const run = season('social', 'tv')
  const encounters = getIncomingInteractions(run)
  const otherRoles = {
    ...run,
    private: {
      ...run.private,
      betrayers: run.seats.slice(1, 4).map(({ id }) => id),
      hiddenBetrayerIds: [run.seats[1].id],
      nightShieldIds: [run.seats[1].id],
    },
  }
  assert.deepEqual(getIncomingInteractions(otherRoles), encounters)
  assert.equal(encounters.length, 2)
  const next = respondToIncomingInteraction(run, commandToken(run), encounters[0].id, 'dismiss')
  assert.equal(next.social, run.social)
  const storage = {
    data: new Map(),
    getItem(key) {
      return this.data.get(key) ?? null
    },
    setItem(key, value) {
      this.data.set(key, value)
    },
  }
  saveRun(storage, 'profile', next)
  const restored = restoreRun(storage, 'profile')
  assert.equal(restored.status, 'ready')
  assert.deepEqual(getIncomingInteractions(restored.run), [
    { ...encounters[0], response: 'dismiss' },
    encounters[1],
  ])
})
