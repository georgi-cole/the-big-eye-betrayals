import { expect, it } from 'vitest'
import { revealDawn } from './night'
import { restoreRun, saveRun } from './persistence'
import { acknowledgeRole, commandToken, startRun, viewFor, type Run } from './run'
import { recordSeasonCheckpoints, rewindOffer, rewindSeason } from './seasonRewards'
import { settleRun } from './settlement'
import { advanceTableRound, resolveTable, revealTable } from './table'

function start() {
  return startRun(
    { id: 'human', name: 'Georgi' },
    Array.from({ length: 24 }, (_, index) => ({
      id: 'guest-' + index,
      name: 'Guest ' + index,
    })),
    { publicMode: false, realityMode: 'off' },
    { id: 'season-rewards', publicSeed: 28, roleSeed: 42 }
  )
}

function reload(run: Run) {
  const data = new Map<string, string>()
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  }
  saveRun(storage, 'human', run)
  const saved = restoreRun(storage, 'human')
  if (saved.status !== 'ready') throw new Error('Expected a valid saved season.')
  return saved.run
}

it('saves the first ballot checkpoint even when the player is banished in a runoff', () => {
  const run = start()
  const [human, rival, , fourth] = run.seats
  const table = recordSeasonCheckpoints(run, { ...run, phase: 'round-table', pot: 200 })
  const tied = resolveTable(
    table,
    commandToken(table),
    table.seats.map(({ id }, index) => ({
      voterId: id,
      targetId:
        index === 2 ? fourth.id : index === 1 || (index >= 3 && index < 14) ? human.id : rival.id,
    }))
  )
  expect(tied.runoffIds).toEqual([rival.id, human.id].sort())
  const runoff = advanceTableRound(tied, commandToken(tied))
  expect(runoff.tableRound).toBe(2)
  const finalBallot = resolveTable(
    runoff,
    commandToken(runoff),
    runoff.seats.map(({ id }) => ({
      voterId: id,
      targetId: id === human.id ? rival.id : human.id,
    }))
  )
  const eliminated = reload(revealTable(finalBallot, commandToken(finalBallot)))
  expect(rewindOffer(eliminated)?.type).toBe('table')
  const restored = rewindSeason(eliminated)
  expect(restored).toMatchObject({
    phase: 'round-table',
    pot: 200,
    revision: eliminated.revision + 1,
  })
  expect(restored?.tableRound).toBeUndefined()
  expect(restored?.lastTable).toBeUndefined()
  expect(restored?.seats.find(({ id }) => id === human.id)?.exit).toBeUndefined()
  expect(restored?.seats.map(({ id }) => id)).toEqual(table.seats.map(({ id }) => id))
})

it('rewinds a murder to the dawn before it happened, including after the announcement', () => {
  const run = start()
  const dawn = recordSeasonCheckpoints(run, acknowledgeRole(run, commandToken(run)))
  const night: Run = {
    ...dawn,
    phase: 'night-resolved',
    revision: dawn.revision + 4,
    pot: 900,
    private: { ...dawn.private, pendingNight: { targetId: run.humanId, blocked: false } },
  }
  expect(rewindOffer(night)?.type).toBe('day')
  const nextDawn = revealDawn(night, commandToken(night))
  const eliminated = reload(recordSeasonCheckpoints(night, nextDawn))
  expect(eliminated.day).toBe(dawn.day + 1)
  expect(rewindSeason(eliminated)).toMatchObject({ phase: 'dawn', day: dawn.day, pot: 0 })
  expect(rewindOffer({ ...eliminated, seasonRewards: undefined })).toBeUndefined()
})

it('reveals the full finale roster only after the reward has been earned', () => {
  const final = settleRun(start(), 'unanimous')
  expect(viewFor(final, null).seats.every(({ finaleRole }) => finaleRole === undefined)).toBe(true)
  const rewarded = { ...final, seasonRewards: { finaleRevealed: true } }
  expect(
    viewFor(reload(rewarded), null)
      .seats.filter(({ finaleRole }) => finaleRole === 'betrayer')
      .map(({ id }) => id)
      .sort()
  ).toEqual([...final.private.betrayers].sort())
})

it('cannot reveal the hidden roles and then return to a saved competition', () => {
  const run = start()
  const dawn = recordSeasonCheckpoints(run, acknowledgeRole(run, commandToken(run)))
  const eliminated: Run = {
    ...dawn,
    seats: dawn.seats.map((seat) =>
      seat.id === dawn.humanId ? { ...seat, exit: { cause: 'night', day: 1 } } : seat
    ),
  }
  const settled = settleRun(eliminated, 'unanimous')
  expect(rewindOffer(settled)).toBeDefined()
  const revealed = reload({
    ...settled,
    seasonRewards: { ...settled.seasonRewards, finaleRevealed: true },
  })
  expect(rewindOffer(revealed)).toBeUndefined()
  expect(rewindSeason(revealed)).toBeUndefined()
})
