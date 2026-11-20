import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  challengeContestantIds,
  resolveChallenge,
  safetyResultsFor,
} from '../src/betrayals/challenges.ts'
import { restoreRun, saveRun } from '../src/betrayals/persistence.ts'
import { commandToken, startRun, viewFor } from '../src/betrayals/run.ts'

test('safety scores are masked in cast order and shields reveal only to known allies', () => {
  const started = startRun(
    { id: 'human', name: 'Player' },
    Array.from({ length: 24 }, (_, i) => ({ id: 'bot-' + i, name: 'Bot ' + i })),
    { publicMode: false, realityMode: 'off' },
    { id: 'safety-privacy', roleSeed: 11, publicSeed: 41 }
  )
  const [human, known, hidden, loyal, immunity] = started.seats.map(({ id }) => id)
  const safety = {
    ...started,
    phase: 'safety',
    immunityId: immunity,
    private: {
      ...started.private,
      betrayers: [human, known, hidden],
      hiddenBetrayerIds: [hidden],
    },
  }
  const points = { [hidden]: 92, [known]: 85, [human]: 68, [loyal]: 40 }
  const scores = challengeContestantIds(safety).map((contestantId) => ({
    contestantId,
    score: points[contestantId] ?? 1,
    potContribution: 0.5,
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
    rows.map(({ id }) => id),
    challengeContestantIds(safety)
  )
  assert.deepEqual(
    rows
      .filter(({ score }) => score !== null)
      .map(({ score, place, shield }) => [score, place, shield]),
    [[68, 3, false]]
  )
  assert.deepEqual(
    rows.filter(({ shield }) => shield === true).map(({ id }) => id),
    [known]
  )
  assert.equal(rows.find(({ id }) => id === hidden).shield, null)
  assert.deepEqual(viewFor(restored.run, human).knownNightShieldIds, [known])

  const loyalRows = safetyResultsFor(restored.run, loyal)
  assert.equal(loyalRows.find(({ id }) => id === loyal).score, 40)
  assert.ok(loyalRows.every(({ id, shield }) => shield === (id === loyal ? false : null)))
  assert.ok(safetyResultsFor(restored.run, hidden).find(({ id }) => id === hidden).shield)
  assert.ok(
    safetyResultsFor(restored.run, null).every(
      ({ place, score, shield }) => place === null && score === null && shield === null
    )
  )
})
