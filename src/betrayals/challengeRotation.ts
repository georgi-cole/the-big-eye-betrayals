import { simulateMinigameAiScore } from '../ai/competition'
import { simulateColorMatchAiRoundScore } from '../components/ColorMatchComp/colorMatchUtils'
import { getCompetitionProfile } from '../data/houseguests'
import type { ReactMinigameCompletion } from '../minigames/competitionResult'
import { getGame, supportsPlayerCount, type GameRegistryEntry } from '../minigames/registryBase'
import { isSocialChallengeGameKey, socialPreference } from '../minigames/socialChallenges/shared'
import { simulateSocialChallengeScores } from '../minigames/socialChallenges/simulation'
import {
  abyssStandings,
  simulateAbyss,
  startAbyss,
} from '../minigames/socialChallenges/abyss/abyssRules'
import { mulberry32, seededPickN } from '../store/rng'
import { challengeRelationships } from './challengeRelationships'
import { challengeContestantIds, type RankedScore } from './challenges'
import { CAST_SIZE, type Run } from './run'

const TURN_BASED_CAST_LIMIT = 8

export type ChallengeGame = GameRegistryEntry & {
  play: 'solo' | 'parallel' | 'simultaneous' | 'turn-based'
  publicResults: boolean
  potTarget: number | 'placement'
  maxCastSize?: number
  lowerScoreWins?: boolean
  potOffset?: number
}

function sharedGame(
  key: string,
  play: ChallengeGame['play'],
  potTarget: ChallengeGame['potTarget'],
  instructions?: string[],
  overrides?: Partial<
    Pick<
      ChallengeGame,
      'maxCastSize' | 'lowerScoreWins' | 'potOffset' | 'minPlayers' | 'maxPlayers' | 'publicResults'
    >
  >
): ChallengeGame {
  const game = getGame(key)
  if (!game) throw new Error(`Unknown Betrayals challenge: ${key}`)
  return {
    ...game,
    play,
    publicResults: play === 'simultaneous' || play === 'turn-based',
    potTarget,
    instructions: instructions ?? game.instructions,
    ...overrides,
  }
}

const rotation = [
  sharedGame('rockPaperScissors', 'turn-based', 'placement'),
  sharedGame('lastLight', 'simultaneous', 'placement'),
  sharedGame('riskWheelAbyss', 'parallel', 'placement', undefined, { publicResults: true }),
  sharedGame('gridOfLuck', 'turn-based', 1000, undefined, { maxCastSize: 6, maxPlayers: 6 }),
  sharedGame('glass_bridge_brutal', 'turn-based', 'placement', undefined, { maxCastSize: 7 }),
  sharedGame('riskWheel', 'turn-based', 1000),
  sharedGame('mysticChamber', 'turn-based', 1000),
  sharedGame('percentagePanic', 'turn-based', 900, undefined, { potOffset: 900 }),
  sharedGame('boxedOut', 'simultaneous', 2500),
  sharedGame('gatesOfTheEye', 'simultaneous', 3500),
  sharedGame('quickTap', 'solo', 300),
  sharedGame('colorMatch', 'solo', 100, [
    'Use the red, green, and blue sliders to match the target color.',
    'Submit your mix before time runs out. A timeout scores zero for that round.',
    'You can use up to two hints. Each hint takes 5% off your final average score.',
  ]),
  sharedGame('majorityRules', 'simultaneous', 6, [
    'Everyone locks in an answer at the same time. Pick what you think most people will choose.',
    'You get three hints, with one use per hint. A small, distinct minority is eliminated.',
    'When two players remain or twelve ballots have been played, the survivor with the most majority picks wins. Exact ties go to a draw.',
  ]),
  sharedGame('cardClash', 'parallel', 3900, [
    'Race on your own memory board across four rounds, from 8 to 20 tiles.',
    'Choose one of the three tools on offer before each round.',
    'Match cards quickly and with few mistakes. The highest total across all four boards wins.',
  ]),
  sharedGame('batteryLow', 'parallel', 100, [
    'Choose a reserve battery and keep it sealed while you open the rest of the rack.',
    'Accept the Bank’s offer to lock in your charge, or keep playing. You can counteroffer once.',
    'If you play to the end, your reserve battery decides your final charge. Highest charge wins.',
  ]),
  sharedGame('quickTapSeasons', 'solo', 360),
  sharedGame('timingBar', 'parallel', 100),
  sharedGame('estimationGame', 'solo', 100),
  sharedGame('holdWall', 'simultaneous', 'placement'),
  sharedGame('famousFigures', 'simultaneous', 600),
  sharedGame('pressurePlank', 'parallel', 120),
  sharedGame('logicLocks', 'parallel', 1000),
  sharedGame('tiltLabyrinth', 'parallel', 120_000, undefined, { lowerScoreWins: true }),
  sharedGame('threeDigitsQuiz', 'simultaneous', 5000),
  sharedGame('capitalization', 'parallel', 900, undefined, { publicResults: true }),
  sharedGame('dontGoOver', 'simultaneous', 'placement'),
  sharedGame('crystal_path_shattered', 'parallel', 'placement'),
  sharedGame('trapAuction', 'simultaneous', 'placement'),
  sharedGame(
    'chainOfGreed',
    'parallel',
    'placement',
    [
      'Solo Rush gives each contestant a private chain and one minute to build a bank.',
      'Call higher, equal, or lower. Risk your whole bank before a guess to double it on a hit or lose it on a miss.',
      'Survive the cut after each round. The final round ranks the survivors by their banks and immunity.',
    ],
    { maxPlayers: 16 }
  ),
  sharedGame('houseOfDarkness', 'parallel', 'placement'),
]

export function challengeGame(run: Run): ChallengeGame | undefined {
  const fieldSize = challengeContestantIds(run).length
  if (!fieldSize) return undefined
  const castSize = run.seats.filter(({ exit }) => !exit).length
  const eligible = rotation.filter(
    (game) =>
      supportsPlayerCount(game, fieldSize) &&
      castSize <= (game.maxCastSize ?? Infinity) &&
      (game.play !== 'turn-based' || (castSize <= TURN_BASED_CAST_LIMIT && fieldSize >= 2))
  )
  const history = run.challengeHistory ?? []
  if (!eligible.length) return undefined
  if (run.day === 1 && castSize === CAST_SIZE) {
    const opening =
      run.phase === 'immunity' ? 'holdWall' : run.phase === 'safety' ? 'quickTap' : undefined
    const game = eligible.find(({ key }) => key === opening && !history.includes(key))
    if (game) return game
  }

  const preferred = eligible.filter(({ publicResults }) =>
    run.phase === 'immunity' ? publicResults : run.phase !== 'safety' || !publicResults
  )
  const unplayedPreferred = preferred.filter(({ key }) => !history.includes(key))
  const unplayed = unplayedPreferred.length
    ? unplayedPreferred
    : eligible.filter(({ key }) => !history.includes(key))
  if (unplayed.length === 0) {
    return (preferred.length ? preferred : eligible).reduce((next, game) =>
      history.indexOf(game.key) < history.indexOf(next.key) ? game : next
    )
  }

  // Give games with a narrow late-season window a chance before the end vote.
  const castLimit = (game: ChallengeGame) =>
    Math.min(
      game.maxCastSize ?? Infinity,
      game.maxPlayers ?? Infinity,
      game.play === 'turn-based' ? TURN_BASED_CAST_LIMIT : Infinity
    )
  const tightestLimit = Math.min(...unplayed.map(castLimit))
  const candidates = unplayed.filter((game) => castLimit(game) === tightestLimit)
  return candidates[Math.floor(mulberry32(challengeSeed(run))() * candidates.length)]
}

export function challengeSeed(run: Run): number {
  return (run.publicSeed ^ Math.imul(run.day, 1193) ^ Math.imul(run.revision, 71)) >>> 0 || 1
}

export function challengePlayers(run: Run, game: ChallengeGame) {
  const field = challengeContestantIds(run)
  const seed = challengeSeed(run)
  const seats = new Map(run.seats.map((seat) => [seat.id, seat]))
  const blind = run.phase === 'safety' && !game.publicResults
  const order = blind ? seededPickN(mulberry32(seed), field, field.length) : field
  return order.map((contestantId, index) => {
    const seat = seats.get(contestantId)!
    const isHuman = contestantId === run.humanId
    const alias = blind && !isHuman ? index + 1 : null
    const competitionProfile = getCompetitionProfile(contestantId)
    const precomputedScore = isHuman
      ? 0
      : game.key === 'colorMatch'
        ? Array.from({ length: 5 }, (_, round) =>
            simulateColorMatchAiRoundScore(
              {
                id: contestantId,
                participantIndex: index,
                precomputedScore: competitionProfile.precision,
              },
              round + 1,
              seed
            )
          ).reduce((sum, points) => sum + points, 0) / 5
        : simulateMinigameAiScore({
            gameKey: game.key,
            seed,
            playerId: contestantId,
            participantIndex: index,
            profile: competitionProfile,
            timeLimitMs: game.lowerScoreWins ? 120_000 : game.timeLimitMs,
          })
    return {
      contestantId,
      id: alias === null ? contestantId : `safety-guest-${alias}`,
      name: alias === null ? seat.name : `Guest ${alias}`,
      avatar: alias === null ? seat.portrait : undefined,
      isHuman,
      competitionProfile,
      precomputedScore,
      previousPR: null,
    }
  })
}

export function scoreField(
  run: Run,
  game: ChallengeGame,
  human?: { score: number; tieBreak?: number; completion?: ReactMinigameCompletion }
): RankedScore[] {
  const players = challengePlayers(run, game)
  const completion = human?.completion
  if (!human && (isSocialChallengeGameKey(game.key) || game.key === 'riskWheelAbyss')) {
    const ids = players.filter(({ isHuman }) => !isHuman).map(({ id }) => id)
    const social = { relationships: challengeRelationships(run, ids) }
    const seed = challengeSeed(run)
    const simulated =
      game.key === 'riskWheelAbyss'
        ? Object.fromEntries(
            abyssStandings(
              simulateAbyss(startAbyss(ids, seed), (from, to) => socialPreference(social, from, to))
            ).map((id, index) => [id, (ids.length - index) * 100])
          )
        : simulateSocialChallengeScores(game.key, ids, seed, social)
    return players.map(({ contestantId, id, isHuman }) => {
      const score = simulated?.[id] ?? 0
      return {
        contestantId,
        score,
        potContribution: score / (players.length * 100),
        forfeited: isHuman,
      }
    })
  }
  const report = [completion?.authoritativeWinnerId, ...(completion?.authoritativeRankedIds ?? [])]
  const field = new Set(players.map(({ id }) => id))
  const placed = new Map(
    [...new Set(report)]
      .filter((id): id is string => typeof id === 'string' && field.has(id))
      .map((id, index) => [id, index + 1])
  )
  return players.map(({ id, contestantId, isHuman, precomputedScore }) => {
    const raw = completion?.rawResults?.[id]
    const placement =
      placed.get(id) ?? (id === completion?.authoritativeLastPlaceId ? players.length : undefined)
    const placementPoints = placement === undefined ? undefined : players.length + 1 - placement
    const score =
      typeof raw === 'number' && Number.isFinite(raw)
        ? raw
        : ((game.potTarget === 'placement' ? placementPoints : undefined) ??
          (isHuman ? (human?.score ?? 0) : precomputedScore))
    const fraction =
      game.potTarget === 'placement'
        ? placementPoints === undefined
          ? score / 100
          : placementPoints / players.length
        : game.lowerScoreWins
          ? 1 - score / game.potTarget
          : (score + (completion ? (game.potOffset ?? 0) : 0)) /
            (game.potOffset && !completion ? 100 : game.potTarget)
    return {
      contestantId,
      score,
      rankScore: game.lowerScoreWins ? -score : undefined,
      tieBreak: isHuman ? human?.tieBreak : undefined,
      placement,
      potContribution: Math.max(0, Math.min(1, fraction)),
      forfeited: isHuman && !human,
    }
  })
}
