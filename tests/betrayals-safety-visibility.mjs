import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  challengeContestantIds,
  resolveChallenge,
  safetyResultsFor,
} from '../src/betrayals/challenges.ts'
import { restoreRun, saveRun } from '../src/betrayals/persistence.ts'
import { commandToken, startRun, viewFor } from '../src/betrayals/run.ts'

test('safety standings show rank and score while hiding contestant identities', () => {
  const started = startRun(
    { id: 'human', name: 'Player' },
    Array.from({ length: 24 }, (_, i) => ({ id: 'bot-' + i, name: 'Bot ' + i })),
    { publicMode: false, realityMode: 'off' },
    { id: 'safety-privacy', roleSeed: 11, publicSeed: 41 }
  )
  const [human, known, hidden, loyal, immunity, ally] = started.seats.map(({ id }) => id)
  const name = (id) => started.seats.find((seat) => seat.id === id).name
  const safety = {
    ...started,
    phase: 'safety',
    immunityId: immunity,
    private: {
      ...started.private,
      betrayers: [human, known, hidden, ally],
      hiddenBetrayerIds: [hidden],
    },
  }
  const points = { [hidden]: 92, [known]: 85, [human]: 68, [loyal]: 40 }
  const scores = challengeContestantIds(safety).map((contestantId) => ({
    contestantId,
    score: points[contestantId] ?? 1,
    potContribution: 0.5,
    forfeited: contestantId === ally,
  }))
  const resolved = resolveChallenge(safety, commandToken(safety), scores)
  const storage = new Map()
  const adapter = {
    getItem: (key) => storage.get(key),
    setItem: (key, value) => storage.set(key, value),
  }
  saveRun(adapter, 'edition-local', {
    ...resolved,
    presentation: ['safety-results', 'round-table'],
  })
  const restored = restoreRun(adapter, 'edition-local')
  assert.equal(restored.status, 'ready')
  const rows = safetyResultsFor(restored.run, human)
  assert.deepEqual(
    rows.map(({ place }) => place),
    Array.from({ length: scores.length }, (_, index) => index + 1)
  )
  assert.deepEqual(
    rows.slice(0, 4).map(({ score, name, shield }) => [score, name, shield]),
    [
      [92, null, true],
      [85, name(known), true],
      [68, name(human), false],
      [40, null, false],
    ]
  )
  assert.deepEqual(
    rows.filter(({ name }) => name !== null).map((row) => row.name),
    [name(known), name(human)]
  )
  assert.deepEqual(rows[0], {
    name: null,
    own: false,
    score: 92,
    place: 1,
    forfeited: false,
    shield: true,
  })
  assert.equal(rows[2].own, true)
  assert.equal(rows.at(-1).forfeited, true)
  assert.deepEqual(viewFor(restored.run, human).knownNightShieldIds, [known])

  const loyalRows = safetyResultsFor(restored.run, loyal)
  assert.deepEqual(
    loyalRows.filter(({ name }) => name !== null).map((row) => row.name),
    [name(loyal)]
  )
  assert.equal(safetyResultsFor(restored.run, hidden)[0].name, name(hidden))
  const spectatorRows = safetyResultsFor(restored.run, null)
  assert.ok(spectatorRows.every(({ name, own }) => name === null && !own))
  assert.deepEqual(
    spectatorRows.map(({ place, score, shield }) => [place, score, shield]),
    rows.map(({ place, score, shield }) => [place, score, shield])
  )
})
