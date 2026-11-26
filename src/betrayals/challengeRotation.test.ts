import { expect, it } from 'vitest'
import majorityRules, {
  advanceIntro,
  advanceReveal,
  initMajorityRules,
  lockRound,
} from '../features/majorityRules/majorityRulesSlice'
import { BETRAYALS_AI_POOL } from './cast'
import { challengeGame, challengePlayers, scoreField } from './challengeRotation'
import { resolveChallenge, safetyResultsFor } from './challenges'
import { restoreRun, saveRun } from './persistence'
import { commandToken, startRun, viewFor, type Run } from './run'

function field(size: number, phase: Run['phase'] = 'immunity'): Run {
  const run = startRun(
    { id: 'human', name: 'Georgi' },
    BETRAYALS_AI_POOL,
    { publicMode: false, realityMode: 'off' },
    { id: 'challenge-test', publicSeed: 28, roleSeed: 42 }
  )
  return {
    ...run,
    phase,
    immunityId: phase === 'safety' ? run.seats[1].id : undefined,
    seats: run.seats.map((seat, index) =>
      index < size ? seat : { ...seat, exit: { day: 1, cause: 'night' } }
    ),
  }
}

function availableGames(run: Run) {
  const games = new Map<string, NonNullable<ReturnType<typeof challengeGame>>>()
  const history: string[] = []
  for (;;) {
    const game = challengeGame({ ...run, challengeHistory: history })
    if (!game || games.has(game.key)) return games
    games.set(game.key, game)
    history.push(game.key)
  }
}

it('rotates full-cast group and individual games before repeating', () => {
  let run = field(25)
  const played: string[] = []
  const available = availableGames(run)
  for (let round = 0; round < available.size; round += 1) {
    const game = challengeGame(run)!
    expect(game.play).not.toBe('turn-based')
    played.push(game.key)
    run = {
      ...resolveChallenge(run, commandToken(run), scoreField(run, game), game.key),
      phase: run.phase,
    }
  }
  expect(new Set(played).size).toBe(played.length)
  expect(played).toEqual(expect.arrayContaining(['majorityRules', 'cardClash', 'quickTapSeasons']))
  expect(challengeGame(run)?.key).toBe(played[0])
})

it('opens with a public Wall challenge and keeps fresh games in their preferred roles', () => {
  const immunity = field(25)
  const safety = field(25, 'safety')
  expect(challengeGame(immunity)?.key).toBe('holdWall')
  expect(challengeGame(safety)?.key).toBe('quickTap')
  for (const [run, publicResults] of [
    [immunity, true],
    [safety, false],
  ] as const) {
    const games = [...availableGames(run).values()]
    const firstFallback = games.findIndex((game) => game.publicResults !== publicResults)
    expect(firstFallback).toBeGreaterThan(0)
    expect(games.slice(firstFallback).every((game) => game.publicResults !== publicResults)).toBe(
      true
    )
  }
})

it('uses the surviving cast for the turn gate and the actual field for game capacity', () => {
  expect(availableGames(field(17)).has('boxedOut')).toBe(false)
  expect(availableGames(field(16)).has('boxedOut')).toBe(true)
  const nine = availableGames(field(9, 'safety'))
  expect(nine.has('boxedOut')).toBe(true)
  expect(nine.has('trapAuction')).toBe(true)
  expect([...nine.values()].every(({ play }) => play !== 'turn-based')).toBe(true)
  expect(availableGames(field(8, 'safety')).has('riskWheel')).toBe(true)
  expect(availableGames(field(8, 'safety')).has('glass_bridge_brutal')).toBe(false)
  expect(availableGames(field(8)).has('percentagePanic')).toBe(true)
  expect(availableGames(field(7)).has('glass_bridge_brutal')).toBe(true)
  expect(availableGames(field(7)).has('gridOfLuck')).toBe(false)
  expect(availableGames(field(6)).has('gridOfLuck')).toBe(true)
  expect(availableGames(field(5)).has('mysticChamber')).toBe(true)
})

it('can schedule all 30 games and includes the expanded no-wait pool for a full cast', () => {
  const large = availableGames(field(25))
  expect([...large.keys()]).toEqual(
    expect.arrayContaining([
      'timingBar',
      'estimationGame',
      'holdWall',
      'famousFigures',
      'pressurePlank',
      'logicLocks',
      'tiltLabyrinth',
      'threeDigitsQuiz',
      'capitalization',
      'dontGoOver',
      'crystal_path_shattered',
      'trapAuction',
      'houseOfDarkness',
    ])
  )
  expect(large.has('chainOfGreed')).toBe(false)
  const fullRotation = new Set(
    [25, 16, 8, 7, 6, 5].flatMap((count) => [...availableGames(field(count)).keys()])
  )
  expect(fullRotation.size).toBe(30)
  const chain = availableGames(field(16)).get('chainOfGreed')
  expect(chain?.play).toBe('parallel')
  expect(chain?.instructions.join(' ')).toContain('Solo Rush')
})

it('uses each new challenge’s supported field size', () => {
  expect(availableGames(field(5)).has('rockPaperScissors')).toBe(true)
  expect(availableGames(field(9)).has('rockPaperScissors')).toBe(false)
  expect(availableGames(field(4)).has('lastLight')).toBe(false)
  expect(availableGames(field(9, 'safety')).has('lastLight')).toBe(true)
  expect(availableGames(field(16)).has('riskWheelAbyss')).toBe(true)
  expect(availableGames(field(17)).has('riskWheelAbyss')).toBe(false)
})

it('preserves native times while ranking faster Tilt Labyrinth players higher', () => {
  const run = field(8, 'safety')
  const game = availableGames(run).get('tiltLabyrinth')!
  const players = challengePlayers(run, game)
  const human = players.find(({ isHuman }) => isHuman)!
  const times = Object.fromEntries(players.map(({ id }, index) => [id, 40_000 + index * 1000]))
  times[human.id] = 20_000
  const scores = scoreField(run, game, {
    score: times[human.id],
    completion: { rawResults: times },
  })
  const result = resolveChallenge(run, commandToken(run), scores, game.key)
  expect(result.private.safetyStandings?.rows[0]).toMatchObject({
    contestantId: human.contestantId,
    score: 20_000,
  })
})

it('maps anonymous Safety outcomes back to the right guests and honors game placement over points', () => {
  const run = field(12, 'safety')
  const game = availableGames(run).get('cardClash')!
  const players = challengePlayers(run, game)
  const human = players.find(({ isHuman }) => isHuman)!
  const opponent = players.find(({ isHuman }) => !isHuman)!
  expect(opponent.id).not.toBe(opponent.contestantId)
  expect(opponent.avatar).toBeUndefined()
  expect(opponent.name).toMatch(/^Guest \d+$/)
  const scores = scoreField(run, game, {
    score: 2000,
    completion: {
      authoritativeWinnerId: opponent.id,
      authoritativeRankedIds: [
        opponent.id,
        human.id,
        ...players.filter((p) => p !== opponent && p !== human).map(({ id }) => id),
      ],
      rawResults: { [opponent.id]: 1000, [human.id]: 2000 },
    },
  })
  const resolved = resolveChallenge(run, commandToken(run), scores, game.key)
  expect(resolved.private.nightShieldIds).toEqual([opponent.contestantId, human.contestantId])
  expect(resolved.private.safetyStandings?.rows.slice(0, 2).map(({ score }) => score)).toEqual([
    1000, 2000,
  ])
  const storage = new Map<string, string>()
  const adapter = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value)
    },
  }
  saveRun(adapter, 'test-profile', resolved)
  const restored = restoreRun(adapter, 'test-profile')
  expect(restored.status === 'ready' && restored.run.challengeHistory).toEqual([game.key])
})

it('shows a regular Loyal their own shield win and keeps the other private winner hidden', () => {
  const fieldRun = field(12, 'safety')
  const run = {
    ...fieldRun,
    private: {
      ...fieldRun.private,
      betrayers: fieldRun.private.betrayers.filter((id) => id !== fieldRun.humanId),
    },
  }
  const game = availableGames(run).get('cardClash')!
  const players = challengePlayers(run, game)
  const human = players.find(({ isHuman }) => isHuman)!
  const opponent = players.find(({ isHuman }) => !isHuman)!
  const ranked = [human, opponent, ...players.filter((p) => p !== human && p !== opponent)]
  const result = resolveChallenge(
    run,
    commandToken(run),
    scoreField(run, game, {
      score: 2000,
      completion: { authoritativeRankedIds: ranked.map(({ id }) => id) },
    }),
    game.key
  )
  expect(result.private.nightShieldIds).toEqual([human.contestantId, opponent.contestantId])
  expect(viewFor(result, run.humanId).knownNightShieldIds).toEqual([human.contestantId])
  expect(safetyResultsFor(result, run.humanId).slice(0, 2)).toMatchObject([
    { own: true, name: 'Georgi', shield: true },
    { own: false, name: null, shield: undefined },
  ])
})

it('uses real contestants and publishes named standings for a public Safety fallback', () => {
  const run = field(12, 'safety')
  const games = [...availableGames(run).values()]
  const wallIndex = games.findIndex(({ key }) => key === 'holdWall')
  const fallback = { ...run, challengeHistory: games.slice(0, wallIndex).map(({ key }) => key) }
  const game = challengeGame(fallback)!
  expect(game.key).toBe('holdWall')
  const players = challengePlayers(fallback, game)
  expect(players.every(({ id, contestantId }) => id === contestantId)).toBe(true)
  const rankedIds = players.map(({ id }) => id).reverse()
  const result = resolveChallenge(
    fallback,
    commandToken(fallback),
    scoreField(fallback, game, { score: 0, completion: { authoritativeRankedIds: rankedIds } }),
    game.key,
    game.publicResults
  )
  expect(viewFor(result, null).knownNightShieldIds).toEqual(rankedIds.slice(0, 2))
  expect(safetyResultsFor(result, null).map(({ name }) => name)).toEqual(
    players.map(({ name }) => name).reverse()
  )
})

it('settles Betrayals Majority Rules by ballots even with two players', () => {
  const config = {
    participantIds: ['a', 'b'],
    competitionType: 'LOH' as const,
    seed: 28,
    humanPlayerId: null,
  }
  const standard = majorityRules(undefined, initMajorityRules(config))
  expect(majorityRules(standard, advanceIntro()).phase).toMatch(/^final_duel_/)

  let parallel = majorityRules(
    undefined,
    initMajorityRules({ ...config, simultaneousFinish: true })
  )
  parallel = majorityRules(parallel, advanceIntro())
  expect(parallel.phase).toBe('question')
  parallel = majorityRules(parallel, lockRound())
  parallel = majorityRules(parallel, advanceReveal())
  expect(parallel.phase).toBe('winner')
  expect(parallel.activeIds[0]).toBe(parallel.winnerId)
  expect(parallel.finalDuel).toBeNull()
})

it('honors a reported last place when a game omits the middle placements', () => {
  const run = field(8, 'safety')
  const game = availableGames(run).get('riskWheel')!
  const [winner, last] = challengePlayers(run, game).filter(({ isHuman }) => !isHuman)
  const scores = scoreField(run, game, {
    score: 500,
    completion: {
      authoritativeWinnerId: winner.id,
      authoritativeLastPlaceId: last.id,
      rawResults: { [winner.id]: 100, [last.id]: 900 },
    },
  })
  const resolved = resolveChallenge(run, commandToken(run), scores, game.key)
  expect(resolved.private.nightShieldIds).toContain(winner.contestantId)
  expect(resolved.private.safetyStandings?.rows.at(-1)?.contestantId).toBe(last.contestantId)
})
